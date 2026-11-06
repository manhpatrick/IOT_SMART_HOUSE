import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../src/app.js';
import { startTestDatabase } from './helpers/mongodb.js';

let application, database, config, base;
async function listen() {
  await new Promise(resolve => application.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${application.server.address().port}`;
}
before(async () => {
  const result = await startTestDatabase('nodo_api_test');
  database = result.database; config = result.config;
  application = await createApplication(config);
  await listen();
});
after(async () => { if (application) await application.close(); if (database) await database.stop(); });
async function login(role = 'admin') {
  const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${role}@nodo.local`, password: { admin: 'Admin@12345', operator: 'Operator@12345', viewer: 'Viewer@12345' }[role] }) });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie').split(';')[0], ...(await response.json()) };
}
async function request(auth, path, method = 'GET', body, csrf = true) {
  const response = await fetch(base + '/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Cookie: auth.cookie, ...(csrf ? { 'X-CSRF-Token': auth.csrfToken } : {}) } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

test('MongoDB is connected, TTL index exists, and protected routes require login', async () => {
  assert.equal(application.connection.readyState, 1);
  assert.deepEqual((await request(null, '/health')).body, { ok: true, database: 'mongodb' });
  assert.ok((await application.connection.collection('sessions').indexes()).some(i => i.expireAfterSeconds === 0));
  assert.equal((await request(null, '/devices')).status, 401);
  assert.equal((await request(null, '/auth/login', 'POST', { email: 'admin@nodo.local', password: 'incorrect' })).status, 401);
});
test('admin session is persisted in MongoDB, hides password hashes, and enforces CSRF', async () => {
  const auth = await login();
  assert.ok(!('password_hash' in auth.user));
  assert.ok(await application.connection.collection('sessions').findOne({ 'session.userId': auth.user.id }));
  assert.equal((await request(auth, '/settings', 'PATCH', { name: 'Bad' }, false)).status, 403);
  assert.equal((await request(auth, '/users')).body.length, 3);
});
test('object-based MongoDB selector injection is rejected at the API boundary', async () => {
  assert.equal((await request(null, '/auth/login', 'POST', { email: { $ne: null }, password: 'x' })).status, 400);
  const auth = await login();
  assert.equal((await request(auth, '/devices', 'POST', { id: { $ne: null }, name: 'Bad', profile: 'climate', location: 'Lab' })).status, 400);
});
test('viewer only reads granted devices and cannot control, acknowledge or manage users', async () => {
  const auth = await login('viewer');
  assert.equal((await request(auth, '/devices')).body.length, 2);
  assert.equal((await request(auth, '/devices/node-01/commands', 'POST', { actuator: 'fan', value: true })).status, 403);
  assert.equal((await request(auth, '/users')).status, 403);
  const alerts = (await request(auth, '/alerts')).body;
  assert.equal((await request(auth, `/alerts/${alerts[0].id}/acknowledge`, 'PATCH')).status, 403);
});
test('onboarding preserves ownership boundaries and decommission is terminal', async () => {
  const admin = await login(), operator = await login('operator'), viewer = await login('viewer');
  assert.equal((await request(admin, '/devices', 'POST', { id: 'test-node', name: 'Node kiểm thử', profile: 'climate', location: 'Lab', owner_id: null })).status, 201);
  assert.equal((await request(operator, '/devices/test-node')).status, 403);
  assert.equal((await request(viewer, '/telemetry?deviceId=test-node')).status, 403);
  assert.equal((await request(admin, '/devices/test-node/lifecycle', 'POST', { state: 'active' })).status, 409);
  const provision = await request(admin, '/devices/test-node/lifecycle', 'POST', { state: 'provisioned' });
  assert.equal(provision.status, 200); assert.ok(provision.body.credentials.password.length >= 24);
  assert.ok(!JSON.stringify((await request(admin, '/devices/test-node')).body).includes(provision.body.credentials.password));
  assert.equal((await request(admin, '/devices/test-node/lifecycle', 'POST', { state: 'active' })).status, 200);
  assert.equal((await request(admin, '/devices/test-node/lifecycle', 'POST', { state: 'decommissioned' })).status, 200);
  assert.equal((await request(admin, '/devices/test-node/lifecycle', 'POST', { state: 'active' })).status, 409);
});
test('telemetry validates ranges and identity; MongoDB unique index deduplicates packets', async () => {
  const payload = { deviceId: 'node-01', bootId: 'test-boot', seq: 1, timestamp: new Date().toISOString(), readings: { temperature: 29, humidity: 65 }, state: { fan: false, mode: 'AUTO' } };
  assert.deepEqual(await application.iot.ingest('node-01', payload), { accepted: true });
  assert.deepEqual(await application.iot.ingest('node-01', payload), { duplicate: true });
  assert.equal(await application.models.Telemetry.countDocuments({ device_id: 'node-01', boot_id: 'test-boot', seq: 1 }), 1);
  await assert.rejects(application.iot.ingest('node-01', { ...payload, deviceId: 'node-02' }));
  await assert.rejects(application.iot.ingest('node-01', { ...payload, readings: { temperature: 999, humidity: 65 } }));
  await assert.rejects(application.iot.ingest('test-node', { ...payload, deviceId: 'test-node' }));
});
test('config waits for the correct node ACK, then manual actuator command applies', async () => {
  const auth = await login();
  const result = await request(auth, '/devices/node-01/config', 'PATCH', { mode: 'MANUAL', fanOn: 30, fanOff: 28, temperatureAlert: 35 });
  assert.equal(result.status, 202);
  assert.equal((await application.iot.device('node-01')).config.mode, 'AUTO');
  await application.iot.acknowledge('node-02', { commandId: result.body.id, status: 'applied' });
  assert.equal((await application.iot.device('node-01')).config.mode, 'AUTO');
  await application.iot.acknowledge('node-01', { commandId: result.body.id, status: 'applied', state: { mode: 'MANUAL' } });
  assert.equal((await application.iot.device('node-01')).config.mode, 'MANUAL');
  const cmd = await request(auth, '/devices/node-01/commands', 'POST', { actuator: 'fan', value: true });
  assert.equal(cmd.status, 202);
  await application.iot.acknowledge('node-01', { commandId: cmd.body.id, status: 'applied', state: { fan: true, mode: 'MANUAL' } });
  assert.equal((await application.iot.device('node-01')).reported_state.fan, true);
});
test('concurrent command requests yield one pending command and one conflict', async () => {
  const auth = await login();
  const results = await Promise.all([true, false].map(value => request(auth, '/devices/node-01/commands', 'POST', { actuator: 'fan', value })));
  assert.deepEqual(results.map(r => r.status).sort(), [202, 409]);
  const accepted = results.find(r => r.status === 202);
  await application.iot.acknowledge('node-01', { commandId: accepted.body.id, status: 'applied' });
});
test('unsupported actuators and invalid thresholds are rejected', async () => {
  const auth = await login();
  assert.equal((await request(auth, '/devices/node-01/commands', 'POST', { actuator: 'light', value: true })).status, 400);
  assert.equal((await request(auth, '/devices/node-01/config', 'PATCH', { mode: 'AUTO', fanOn: 25, fanOff: 30, temperatureAlert: 35 })).status, 400);
});
test('offline nodes reject commands and late ACK does not apply an expired command', async () => {
  const auth = await login(); await application.iot.pause('node-01', true);
  assert.equal((await request(auth, '/devices/node-01/commands', 'POST', { actuator: 'fan', value: false })).status, 409);
  await application.iot.pause('node-01', false);
  const cmd = await request(auth, '/devices/node-01/commands', 'POST', { actuator: 'fan', value: false }); assert.equal(cmd.status, 202);
  await application.models.Command.updateOne({ _id: cmd.body.id }, { $set: { expires_at: new Date(Date.now() - 1000) } });
  await application.iot.acknowledge('node-01', { commandId: cmd.body.id, status: 'applied' });
  assert.equal((await application.models.Command.findById(cmd.body.id)).status, 'pending');
  await new Promise(resolve => setTimeout(resolve, 1300));
  assert.equal((await application.models.Command.findById(cmd.body.id)).status, 'timeout');
});
test('user disable revokes MongoDB sessions; admin cannot disable itself', async () => {
  const admin = await login(), viewer = await login('viewer');
  const user = (await request(admin, '/users')).body.find(u => u.role === 'viewer');
  assert.equal((await request(admin, '/users/' + user.id, 'PATCH', { name: user.name, email: user.email, role: 'viewer', status: 'disabled' })).status, 200);
  assert.equal((await request(viewer, '/devices')).status, 401);
  assert.equal((await request(admin, '/users/' + admin.user.id, 'PATCH', { name: admin.user.name, email: admin.user.email, role: 'admin', status: 'disabled' })).status, 409);
});
test('device lock rejects ingestion and cancels the pending command', async () => {
  const auth = await login();
  const cmd = await request(auth, '/devices/node-01/commands', 'POST', { actuator: 'fan', value: true }); assert.equal(cmd.status, 202);
  assert.equal((await request(auth, '/devices/node-01/lifecycle', 'POST', { state: 'locked' })).status, 200);
  assert.equal((await application.models.Command.findById(cmd.body.id)).status, 'cancelled');
  await assert.rejects(application.iot.ingest('node-01', { deviceId: 'node-01', bootId: 'blocked', seq: 1, timestamp: new Date().toISOString(), readings: { temperature: 29, humidity: 65 } }));
});
test('audit logs omit password material and logout revokes the session', async () => {
  const auth = await login(); const logs = (await request(auth, '/audit')).body;
  assert.ok(logs.some(l => l.action === 'device.lifecycle'));
  assert.ok(!JSON.stringify(logs).includes('Admin@12345'));
  assert.equal((await request(auth, '/auth/logout', 'POST')).status, 200);
  assert.equal((await request(auth, '/devices')).status, 401);
});
test('MongoDB records and authenticated sessions survive application restart', async () => {
  const auth = await login(), count = await application.models.Telemetry.countDocuments();
  await application.close();
  application = await createApplication(config); await listen();
  assert.equal((await request(auth, '/devices')).status, 200);
  assert.equal((await application.iot.device('node-01')).lifecycle, 'locked');
  assert.equal(await application.models.Telemetry.countDocuments(), count);
});
