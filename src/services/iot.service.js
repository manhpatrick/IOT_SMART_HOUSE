import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Device, User, Telemetry, Command, Alert, DeviceEvent, Setting } from '../../models/index.js';
import { toPublic } from '../../models/base.js';
import { telemetrySchema, ackSchema } from '../validation/schemas.js';
import { fail } from '../utils/errors.js';
import { createLock } from '../utils/asyncLock.js';
import { audit } from './audit.service.js';
import { createBroker } from './mqtt.service.js';

const transitions = {
  registered: ['provisioned', 'decommissioned'], provisioned: ['active', 'locked', 'decommissioned'],
  active: ['maintenance', 'locked', 'decommissioned'], maintenance: ['active', 'locked', 'decommissioned'],
  locked: ['active', 'decommissioned'], decommissioned: [],
};

export function createIoT({ demo, notify, mqttOptions = {} }) {
  const withDeviceLock = createLock(), withAlertLock = createLock();
  const paused = new Set(), bootId = randomUUID();
  let seq = 0, tickCount = 0, tickPromise = null, closing = false;
  const workspace = async () => (await Setting.findById('workspace').lean()).value;

  async function device(id) {
    const d = await Device.findById(id).lean();
    if (!d) throw fail(404, 'Không tìm thấy thiết bị.');
    const [settings, owner, latest, pendingConfig] = await Promise.all([
      workspace(), d.owner_id ? User.findById(d.owner_id).select('name').lean() : null,
      Telemetry.findOne({ device_id: id }).sort({ recorded_at: -1, _id: -1 }).lean(),
      Command.exists({ device_id: id, kind: 'config', status: 'pending' }),
    ]);
    return { ...toPublic(d), reported_state: d.reported_state || {}, owner_name: owner?.name || null,
      connection: d.lifecycle === 'active' && d.last_seen && Date.now() - new Date(d.last_seen).getTime() < settings.offlineSeconds * 1000 ? 'online' : 'offline',
      latest: toPublic(latest), pendingConfig: !!pendingConfig, allowedTransitions: transitions[d.lifecycle],
    };
  }

  const alert = (id, kind, severity, message) => withAlertLock(`${id}:${kind}`, async () => {
    if (await Alert.exists({ device_id: id, kind, $or: [{ status: 'open' }, { created_at: { $gt: new Date(Date.now() - 300_000) } }] })) return;
    await Alert.create({ device_id: id, kind, severity, message });
    notify('alert');
  });

  const ingest = (id, input) => withDeviceLock(id, async () => {
    const data = telemetrySchema.parse(input), d = await device(id);
    if (data.deviceId !== id) throw fail(400, 'deviceId không khớp topic.');
    if (d.lifecycle !== 'active') throw fail(403, 'Thiết bị chưa hoạt động hoặc đã bị thu hồi.');
    if (Date.parse(data.timestamp) > Date.now() + 120_000 || Date.parse(data.timestamp) < Date.now() - 7 * 86400_000) throw fail(400, 'Timestamp ngoài khoảng cho phép.');
    if (d.profile === 'climate' && (data.readings.temperature === undefined || data.readings.humidity === undefined || data.readings.lightPercent !== undefined)) throw fail(400, 'Node môi trường chỉ gửi temperature và humidity.');
    if (d.profile === 'lighting' && (data.readings.lightPercent === undefined || data.readings.temperature !== undefined || data.readings.humidity !== undefined)) throw fail(400, 'Node ánh sáng chỉ gửi lightPercent.');
    const r = data.readings;
    try {
      await Telemetry.create({ device_id: id, boot_id: data.bootId, seq: data.seq, recorded_at: new Date(data.timestamp), temperature: r.temperature ?? null, humidity: r.humidity ?? null, light_percent: r.lightPercent ?? null });
    } catch (error) { if (error.code === 11000) return { duplicate: true }; throw error; }
    await Device.updateOne({ _id: id, lifecycle: 'active' }, { $set: { last_seen: new Date(), reported_state: data.state || d.reported_state, fault: null } });
    if (r.temperature >= d.config.temperatureAlert) await alert(id, 'temperature', 'warning', `Nhiệt độ ${r.temperature}°C vượt ngưỡng ${d.config.temperatureAlert}°C.`);
    return { accepted: true };
  });

  const acknowledge = (id, input) => withDeviceLock(id, async () => {
    const data = ackSchema.parse(input), d = await device(id);
    if (d.lifecycle !== 'active') return;
    const cmd = await Command.findOneAndUpdate({ _id: data.commandId, device_id: id, status: 'pending', expires_at: { $gt: new Date() } }, { $set: { status: data.status, result: data.message || (data.status === 'applied' ? 'Node xác nhận đã áp dụng' : 'Node báo lỗi'), completed_at: new Date() } }, { returnDocument: 'after' }).lean();
    if (!cmd) return;
    if (data.status === 'applied') {
      const changes = {};
      if (cmd.kind === 'config') changes.config = cmd.payload;
      if (data.state) changes.reported_state = { ...d.reported_state, ...data.state };
      if (Object.keys(changes).length) await Device.updateOne({ _id: id, lifecycle: 'active' }, { $set: changes });
    }
    notify('command');
  });

  const broker = createBroker({ demo, options: mqttOptions, notify, onTelemetry: ingest, onAck: acknowledge,
    onStatus: (id, data) => withDeviceLock(id, async () => {
      const status = z.object({ online: z.boolean(), firmware: z.string().max(40).optional(), fault: z.string().max(200).nullable().optional() }).strict().parse(data);
      await Device.updateOne({ _id: id, lifecycle: 'active' }, { $set: { last_seen: status.online ? new Date() : new Date(0), fault: status.fault ?? null, ...(status.firmware ? { firmware: status.firmware } : {}) } });
    }),
  });

  const sendCommand = (original, actor, kind, payload) => withDeviceLock(original.id, async () => {
    const d = await device(original.id);
    if (d.lifecycle !== 'active' || d.connection !== 'online') throw fail(409, 'Thiết bị phải đang hoạt động và online để nhận lệnh.');
    if (kind === 'actuator' && d.config.mode !== 'MANUAL') throw fail(409, 'Chuyển sang chế độ Thủ công trước khi điều khiển trực tiếp.');
    if (!broker.state.connected) throw fail(503, 'Chưa kết nối được MQTT broker.');
    let command;
    try { command = await Command.create({ device_id: d.id, actor_id: actor.id, kind, payload, expires_at: new Date(Date.now() + 15_000) }); }
    catch (error) { if (error.code === 11000) throw fail(409, 'Thiết bị đang chờ xác nhận lệnh trước đó.'); throw error; }
    try { await broker.send(command.toObject()); }
    catch {
      await Command.updateOne({ _id: command._id, status: 'pending' }, { $set: { status: 'failed', result: 'Không gửi được đến broker', completed_at: new Date() } });
      throw fail(503, 'Gửi lệnh MQTT thất bại.');
    }
    await audit(actor, `device.${kind}`, d.id, JSON.stringify(payload)); notify('command');
    return toPublic(command);
  });

  const transition = (original, target, actor) => withDeviceLock(original.id, async () => {
    const d = await device(original.id);
    if (!transitions[d.lifecycle].includes(target)) throw fail(409, 'Chuyển trạng thái vòng đời không hợp lệ.');
    let credentials;
    if (target === 'provisioned') {
      const password = randomBytes(24).toString('base64url');
      await broker.provision(d.id, password);
      credentials = { username: d.id, clientId: d.id, password, simulated: demo };
    } else await broker.setEnabled(d.mqtt_username, target === 'active');
    const changed = await Device.findOneAndUpdate({ _id: d.id, lifecycle: d.lifecycle }, { $set: { lifecycle: target, mqtt_username: d.mqtt_username || (target === 'provisioned' ? d.id : null), last_seen: null } }, { returnDocument: 'after', runValidators: true });
    if (!changed) throw fail(409, 'Vòng đời vừa thay đổi. Vui lòng tải lại thiết bị.');
    await Command.updateMany({ device_id: d.id, status: 'pending' }, { $set: { status: 'cancelled', result: 'Vòng đời thiết bị thay đổi', completed_at: new Date() } });
    await DeviceEvent.create({ device_id: d.id, from_state: d.lifecycle, to_state: target, actor_name: actor.name });
    await audit(actor, 'device.lifecycle', d.id, `${d.lifecycle} → ${target}`); notify('device');
    return { device: await device(d.id), credentials };
  });

  async function tick() {
    tickCount++;
    const expired = await Command.updateMany({ status: 'pending', expires_at: { $lte: new Date() } }, { $set: { status: 'timeout', result: 'Node không xác nhận trong 15 giây', completed_at: new Date() } });
    if (expired.modifiedCount) notify('command');
    if (demo) {
      for (const cmd of await Command.find({ status: 'pending', created_at: { $lt: new Date(Date.now() - 700) } }).lean()) {
        const d = await device(cmd.device_id);
        if (paused.has(d.id) || d.lifecycle !== 'active') continue;
        const state = { ...d.reported_state };
        if (cmd.kind === 'actuator') state[cmd.payload.actuator] = cmd.payload.value;
        else state.mode = cmd.payload.mode;
        await acknowledge(d.id, { commandId: cmd._id, status: 'applied', state });
      }
      if (tickCount % 4 === 0) for (const row of await Device.find({ lifecycle: 'active' }).select('_id').lean()) {
        const d = await device(row._id); if (paused.has(d.id)) continue;
        const phase = Date.now() / 95_000;
        const readings = d.profile === 'climate' ? { temperature: +(28.6 + 1.8 * Math.sin(phase)).toFixed(1), humidity: +(64 + 4 * Math.cos(phase)).toFixed(1) } : { lightPercent: Math.round(35 + 20 * Math.sin(phase / 2)) };
        const state = { ...d.reported_state, mode: d.config.mode };
        if (d.config.mode === 'AUTO') {
          if (d.profile === 'climate') {
            if (readings.temperature >= d.config.fanOn) state.fan = true;
            if (readings.temperature <= d.config.fanOff) state.fan = false;
            state.buzzer = readings.temperature >= d.config.temperatureAlert;
          } else {
            if (readings.lightPercent <= d.config.lightOn) state.light = true;
            if (readings.lightPercent >= d.config.lightOff) state.light = false;
          }
        }
        try { await ingest(d.id, { deviceId: d.id, bootId, seq: seq++, timestamp: new Date().toISOString(), readings, state }); }
        catch (error) { if (error.status !== 403) throw error; }
      }
    }
    const settings = await workspace(), cutoff = new Date(Date.now() - settings.offlineSeconds * 1000);
    for (const d of await Device.find({ lifecycle: 'active', $or: [{ last_seen: { $lt: cutoff } }, { last_seen: null, updated_at: { $lt: cutoff } }] }).select('_id').lean()) {
      await alert(d._id, 'offline', 'critical', 'Thiết bị mất kết nối. Kiểm tra nguồn điện, Wi-Fi và MQTT.');
    }
    if (tickCount % 60 === 0) await Telemetry.deleteMany({ recorded_at: { $lt: new Date(Date.now() - settings.retentionDays * 86400_000) } });
    if (tickCount % 4 === 0) notify('telemetry');
  }

  const timer = setInterval(() => {
    if (closing || tickPromise) return;
    tickPromise = tick().catch(() => { console.warn('Không hoàn tất chu kỳ IoT; kiểm tra trạng thái MongoDB.'); }).finally(() => { tickPromise = null; });
  }, 1000);

  return { device, ingest, acknowledge, sendCommand, transition, workspace, brokerState: broker.state,
    async pause(id, offline) {
      if (offline) paused.add(id); else paused.delete(id);
      const settings = await workspace();
      await Device.updateOne({ _id: id }, { $set: { last_seen: offline ? new Date(Date.now() - (settings.offlineSeconds + 1) * 1000) : new Date() } });
      notify('device');
    },
    async close() { closing = true; clearInterval(timer); if (tickPromise) await tickPromise; await broker.close(); },
  };
}
