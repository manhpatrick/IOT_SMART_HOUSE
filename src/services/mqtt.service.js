import mqtt from 'mqtt';
import { randomUUID } from 'node:crypto';
import { fail } from '../utils/errors.js';
import { audit } from './audit.service.js';

export function createBroker({ demo, options, notify, onTelemetry, onAck, onStatus }) {
  const state = { mode: demo ? 'demo' : 'mqtt', connected: demo, error: null };
  let client, pending, queue = Promise.resolve(), closing = false;
  const prefix = options.prefix || 'smartroom';
  if (!/^[a-zA-Z0-9_-]+$/.test(prefix)) throw fail(400, 'MQTT_TOPIC_PREFIX phải là một cấp topic, không có dấu /.');

  function control(command) {
    const task = queue.then(() => new Promise((resolve, reject) => {
      if (closing || !client?.connected || !options.dynamicSecurity) return reject(fail(503, 'Cần MQTT kết nối và Dynamic Security để cấp/thu hồi quyền tại broker.'));
      const timer = setTimeout(() => { pending = null; reject(fail(504, 'Broker chưa xác nhận thay đổi quyền.')); }, 5000);
      pending = {
        command: command.command,
        resolve(data) { clearTimeout(timer); pending = null; resolve(data); },
        reject(error) { clearTimeout(timer); pending = null; reject(error); },
      };
      client.publish('$CONTROL/dynamic-security/v1', JSON.stringify({ commands: [command] }), { qos: 1 }, error => {
        if (error) pending?.reject(fail(503, 'Không gửi được yêu cầu cấp quyền.'));
      });
    }));
    queue = task.catch(() => {});
    return task;
  }

  if (!demo && options.url) {
    client = mqtt.connect(options.url, { username: options.username, password: options.password, clientId: `nodo-backend-${randomUUID()}`, reconnectPeriod: 3000, connectTimeout: 8000, rejectUnauthorized: true });
    client.on('connect', async () => {
      try {
        await client.subscribeAsync([`${prefix}/+/telemetry`, `${prefix}/+/status`, `${prefix}/+/ack`, ...(options.dynamicSecurity ? ['$CONTROL/dynamic-security/v1/response'] : [])], { qos: 1 });
        state.connected = true; state.error = null; notify('broker');
      } catch { state.error = 'Không đăng ký được các topic MQTT.'; }
    });
    client.on('offline', () => { state.connected = false; notify('broker'); });
    client.on('error', () => { state.error = 'Lỗi kết nối broker; kiểm tra URL, TLS và tài khoản.'; });
    client.on('message', async (topic, buffer) => {
      try {
        if (closing || buffer.length > 16384) return;
        const data = JSON.parse(buffer.toString());
        if (topic === '$CONTROL/dynamic-security/v1/response') {
          const response = data.responses?.find(r => r.command === pending?.command);
          if (response) response.error ? pending.reject(fail(502, `Broker từ chối: ${response.error}`)) : pending.resolve(response.data);
          return;
        }
        const [, id, kind] = topic.split('/');
        if (kind === 'telemetry') await onTelemetry(id, data);
        if (kind === 'ack') await onAck(id, data);
        if (kind === 'status') await onStatus(id, data);
        notify('telemetry');
      } catch {
        // Never persist the raw payload or credentials in audit logs.
        await audit(null, 'mqtt.rejected', topic.slice(0, 160), 'Từ chối bản tin không hợp lệ hoặc thiết bị không được hoạt động.').catch(() => {});
      }
    });
  }

  return {
    state,
    async send(command) {
      if (demo) return;
      if (!client?.connected) throw fail(503, 'Chưa kết nối được MQTT broker.');
      await client.publishAsync(`${prefix}/${command.device_id}/${command.kind === 'config' ? 'config' : 'command'}`, JSON.stringify({
        commandId: command._id, deviceId: command.device_id, kind: command.kind, payload: command.payload,
        timestamp: command.created_at, expiresAt: command.expires_at,
      }), { qos: 1, retain: false });
    },
    async provision(id, password) {
      if (demo) return;
      const rolename = `nodo-${id}`;
      await control({ command: 'createRole', rolename });
      for (const suffix of ['telemetry', 'status', 'ack']) await control({ command: 'addRoleACL', rolename, acltype: 'publishClientSend', topic: `${prefix}/${id}/${suffix}`, allow: true, priority: 10 });
      for (const suffix of ['command', 'config']) {
        for (const acltype of ['subscribeLiteral', 'publishClientReceive']) await control({ command: 'addRoleACL', rolename, acltype, topic: `${prefix}/${id}/${suffix}`, allow: true, priority: 10 });
      }
      await control({ command: 'createClient', username: id, clientid: id, password, roles: [{ rolename, priority: 10 }] });
    },
    async setEnabled(username, enabled) {
      if (demo || !username) return;
      await control({ command: enabled ? 'enableClient' : 'disableClient', username });
    },
    async close() {
      closing = true; pending?.reject(fail(503, 'Server dừng.'));
      if (client) await client.endAsync(true);
    },
  };
}
