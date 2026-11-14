import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Device, User, Telemetry, Command, Alert, DeviceEvent, Setting, Home, Room } from '../../../database/models/index.js';
import { toPublic } from '../../../database/models/base.js';
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

export function createIoT({ demo, notify, mqttOptions = {}, onReading=()=>{} }) {
  const withDeviceLock = createLock(), withAlertLock = createLock();
  const paused = new Set(), bootId = randomUUID();
  let seq = 0, tickCount = 0, tickPromise = null, closing = false;
  const workspace = async () => (await Setting.findById('workspace').lean()).value;

  async function device(id) {
    const d = await Device.findById(id).lean();
    if (!d) throw fail(404, 'Không tìm thấy thiết bị.');
    const [settings, owner, latest, pending, home, room] = await Promise.all([
      workspace(), d.owner_id ? User.findById(d.owner_id).select('name').lean() : null,
      Telemetry.findOne({ device_id: id }).sort({ recorded_at: -1, _id: -1 }).lean(),
      Command.findOne({ device_id: id, status: 'pending' }).select('kind expires_at ack_received_at').lean(),
      d.home_id ? Home.findById(d.home_id).select('name').lean() : null,
      d.room_id ? Room.findById(d.room_id).select('name').lean() : null,
    ]);
    const age = latest ? Math.max(0, Date.now() - new Date(latest.recorded_at).getTime()) : null;
    return { ...toPublic(d), reported_state: d.reported_state || {}, owner_name: owner?.name || null,
      home_name: home?.name || null, room_name: room?.name || null,
      connection: !broker.state.connected && !demo ? 'unknown' : d.lifecycle === 'active' && d.last_seen && Date.now() - new Date(d.last_seen).getTime() < settings.offlineSeconds * 1000 ? 'online' : 'offline',
      data_status: !latest ? 'missing' : age > (settings.dataStaleSeconds || 60) * 1000 ? 'stale' : 'fresh',
      data_age_seconds: age === null ? null : Math.floor(age / 1000),
      latest: toPublic(latest), pendingConfig: pending?.kind === 'config', pendingCommand: toPublic(pending), allowedTransitions: transitions[d.lifecycle],
    };
  }

  const alert = (id, kind, severity, message) => withAlertLock(`${id}:${kind}`, async () => {
    if (await Alert.exists({ device_id: id, kind, status: { $in: ['open', 'acknowledged'] } })) return;
    await Alert.create({ device_id: id, kind, severity, message });
    notify('alert');
  });
  const resolveAlert = async (id, kind) => {
    const result = await Alert.updateMany({ device_id: id, kind, status: { $in: ['open', 'acknowledged'] } }, { $set: { status: 'resolved', resolved_at: new Date() } });
    if (result.modifiedCount) notify('alert');
  };

  const ingest = (id, input) => withDeviceLock(id, async () => {
    const data = telemetrySchema.parse(input), d = await device(id);
    if (data.deviceId !== id) throw fail(400, 'deviceId không khớp topic.');
    if (d.lifecycle !== 'active') throw fail(403, 'Thiết bị chưa hoạt động hoặc đã bị thu hồi.');
    if (Date.parse(data.timestamp) > Date.now() + 120_000 || Date.parse(data.timestamp) < Date.now() - 7 * 86400_000) throw fail(400, 'Timestamp ngoài khoảng cho phép.');
    if (d.profile === 'climate' && (data.readings.temperature === undefined || data.readings.humidity === undefined || data.readings.lightPercent !== undefined)) throw fail(400, 'Node môi trường chỉ gửi temperature và humidity.');
    if (d.profile === 'lighting' && (data.readings.lightPercent === undefined || data.readings.temperature !== undefined || data.readings.humidity !== undefined || data.readings.gasRaw !== undefined)) throw fail(400, 'Node ánh sáng chỉ gửi lightPercent.');
    const r = data.readings;
    try {
      await Telemetry.create({ device_id: id, source:demo?'demo':'hardware', boot_id: data.bootId, seq: data.seq, recorded_at: new Date(data.timestamp), temperature: r.temperature ?? null, humidity: r.humidity ?? null, light_percent: r.lightPercent ?? null, gas_raw: r.gasRaw ?? null });
    } catch (error) { if (error.code === 11000) return { duplicate: true }; throw error; }
    const newer = !d.latest || Date.parse(data.timestamp) >= Date.parse(d.latest.recorded_at);
    await Device.updateOne({ _id: id, lifecycle: 'active' }, { $set: { last_seen: new Date(), ...(newer && data.state ? { reported_state: { ...d.reported_state, ...data.state } } : {}) } });
    await resolveAlert(id, 'offline');
    const fresh = newer && Date.now() - Date.parse(data.timestamp) <= ((await workspace()).dataStaleSeconds || 60) * 1000;
    if (fresh) {
      if (r.gasRaw !== undefined) {
        const active = r.gasRaw >= (d.config.gasThreshold ?? 1200) || (!!d.gas_alarm_active && r.gasRaw > (d.config.gasClearThreshold ?? 1000));
        await Device.updateOne({_id:id},{$set:{gas_alarm_active:active,gas_raw:r.gasRaw,gas_recorded_at:new Date(data.timestamp)}});
        if(active) await alert(id,'gas','critical',`Gas ADC ${r.gasRaw} vượt/duy trì ngưỡng cảnh báo ${d.config.gasThreshold??1200}; kết thúc khi ≤ ${d.config.gasClearThreshold??1000}. Kiểm tra môi trường và cảm biến.`);
        else await resolveAlert(id,'gas');
      }
      await resolveAlert(id, 'stale');
      if (r.temperature >= d.config.temperatureAlert) await alert(id, 'temperature', 'warning', `Nhiệt độ ${r.temperature}°C vượt ngưỡng ${d.config.temperatureAlert}°C.`);
      else if (r.temperature !== undefined) await resolveAlert(id, 'temperature');
    }
    onReading(id);
    return { accepted: true };
  });

  const acknowledge = (id, input) => withDeviceLock(id, async () => {
    const data = ackSchema.parse(input), d = await device(id);
    if (d.lifecycle !== 'active') return;
    let cmd = await Command.findOne({ _id: data.commandId, device_id: id, status: 'pending' }).lean();
    if (!cmd) return;
    // Durable ACK receipt: a DB failure after receipt can be recovered after restart.
    // Never mark applied before the corresponding device configuration is saved.
    if (!cmd.ack_received_at) {
      cmd = await Command.findOneAndUpdate({ _id: cmd._id, status: 'pending', expires_at: { $gt: new Date() }, ack_received_at: null }, { $set: { ack_received_at: new Date(), ack_payload: data } }, { returnDocument: 'after' }).lean();
      if (!cmd) return;
    }
    const receipt = cmd.ack_payload;
    if(cmd.source==='gas_rule'&&receipt.status==='applied'&&receipt.state?.buzzer!==cmd.payload.value){
      await Command.updateOne({_id:cmd._id,status:'pending'},{$set:{status:'failed',result:'ACK báo động gas thiếu/sai trạng thái buzzer.',completed_at:new Date()}});
      notify('command');return;
    }
    if (receipt.status === 'applied' && d.last_command_id !== cmd._id) {
      const changes = {};
      if (cmd.kind === 'config') changes.config = cmd.payload;
      if (receipt.state) changes.reported_state = { ...d.reported_state, ...receipt.state };
      if(cmd.source==='gas_rule'&&cmd.payload.value===false)changes.gas_buzzer_owned=false;
      await Device.updateOne({ _id: id, lifecycle: 'active' }, { $set: { ...changes, last_command_id: cmd._id } });
    }
    await Command.updateOne({ _id: cmd._id, status: 'pending' }, { $set: { status: receipt.status, result: receipt.message || (receipt.status === 'applied' ? 'Node xác nhận đã áp dụng' : 'Node báo lỗi'), completed_at: new Date() } });
    await audit(null, 'command.' + receipt.status, cmd._id, d.id, d.home_id);
    notify('command');
  });

  const receiveStatus = (id, data) => withDeviceLock(id, async () => {
      const status = z.object({ online: z.boolean(), firmware: z.string().max(40).optional(), fault: z.string().max(200).nullable().optional() }).strict().parse(data);
      const d = await Device.findOne({ _id: id, lifecycle: 'active' }).lean();
      if (!d) throw fail(403, 'Thiết bị không hoạt động.');
      await Device.updateOne({ _id: id, lifecycle: 'active' }, { $set: { last_seen: status.online ? new Date() : new Date(0), ...(Object.hasOwn(status, 'fault') ? { fault: status.fault } : {}), ...(status.firmware ? { firmware: status.firmware } : {}) } });
      if (status.fault) await alert(id, 'fault', 'critical', `Thiết bị báo lỗi: ${status.fault}`);
      if (status.fault === null) await resolveAlert(id, 'fault');
      if (status.online) await resolveAlert(id, 'offline');
      notify('device');
    });
  const broker = createBroker({ demo, options: mqttOptions, notify, onTelemetry: ingest, onAck: acknowledge, onStatus: receiveStatus });

  const sendCommand = (original, actor, kind, payload, source='user') => withDeviceLock(original.id, async () => {
    const d = await device(original.id);
    if (d.lifecycle !== 'active' || d.connection !== 'online') throw fail(409, 'Thiết bị phải đang hoạt động và online để nhận lệnh.');
    if(kind==='actuator'&&payload.actuator==='buzzer'&&payload.value===false&&d.gas_alarm_active)throw fail(409,'Gas còn cảnh báo; chưa cho phép tắt còi.');
    if(source==='gas_rule'&&(kind!=='actuator'||payload.actuator!=='buzzer'))throw fail(400,'Quy tắc gas chỉ điều khiển còi.');
    if(source==='gas_rule'&&(!d.gas_recorded_at||Date.now()-Date.parse(d.gas_recorded_at)>((await workspace()).dataStaleSeconds||60)*1000||payload.value!==!!d.gas_alarm_active))throw fail(409,'Trạng thái gas đã thay đổi hoặc dữ liệu cũ.');
    if(source==='gas_rule'&&payload.value===false&&(d.fault||d.data_status!=='fresh'||!(d.latest?.temperature<d.config.temperatureAlert)))throw fail(409,'Chưa đủ điều kiện giải phóng còi gas.');
    if (kind === 'actuator' && d.config.mode !== 'MANUAL' && source!=='gas_rule') throw fail(409, 'Chuyển sang chế độ Thủ công trước khi điều khiển trực tiếp.');
    if (!broker.state.connected) throw fail(503, 'Chưa kết nối được MQTT broker.');
    let command;
    try { command = await Command.create({ device_id: d.id, home_id: d.home_id, actor_id: actor?.id??null, source, kind, payload, expires_at: new Date(Date.now() + 15_000) }); }
    catch (error) { if (error.code === 11000) throw fail(409, 'Thiết bị đang chờ xác nhận lệnh trước đó.'); throw error; }
    try { await broker.send(command.toObject()); }
    catch {
      await Command.updateOne({ _id: command._id, status: 'pending' }, { $set: { status: 'failed', result: 'Không gửi được đến broker', completed_at: new Date() } });
      throw fail(503, 'Gửi lệnh MQTT thất bại.');
    }
    if(source==='gas_rule'&&payload.value)await Device.updateOne({_id:d.id},{$set:{gas_buzzer_owned:true}});
    await audit(actor, source==='gas_rule'?'device.gas_alarm':`device.${kind}`, d.id, JSON.stringify(payload), d.home_id); notify('command');
    return toPublic(command);
  });

  async function enforceGasAlarm(id) {
    const d=await device(id);
    if(d.lifecycle!=='active'||d.connection!=='online'||!broker.state.connected||d.pendingCommand||!d.gas_recorded_at)return;
    if(Date.now()-Date.parse(d.gas_recorded_at) > ((await workspace()).dataStaleSeconds||60)*1000)return;
    let desired;
    if(d.gas_alarm_active && d.reported_state.buzzer!==true)desired=true;
    else if(!d.gas_alarm_active && d.gas_buzzer_owned && d.data_status==='fresh' && !d.fault && d.latest?.temperature<d.config.temperatureAlert){
      if(d.reported_state.buzzer===false){await Device.updateOne({_id:id},{$set:{gas_buzzer_owned:false}});return;}
      desired=false;
    }
    if(desired===undefined)return;
    // Avoid flooding a node that is offline in practice or cannot understand the command.
    if(await Command.exists({device_id:id,source:'gas_rule','payload.value':desired,created_at:{$gt:new Date(Date.now()-30000)}}))return;
    try{await sendCommand(d,null,'actuator',{actuator:'buzzer',value:desired},'gas_rule');}
    catch(error){if(![409,503].includes(error.status))throw error;}
  }

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
    await audit(actor, 'device.lifecycle', d.id, `${d.lifecycle} → ${target}`, d.home_id); notify('device');
    return { device: await device(d.id), credentials };
  });

  async function tick() {
    tickCount++;
    for (const cmd of await Command.find({ status: 'pending', ack_received_at: { $ne: null } }).lean()) await acknowledge(cmd.device_id, cmd.ack_payload);
    const expired = await Command.updateMany({ status: 'pending', ack_received_at: null, expires_at: { $lte: new Date() } }, { $set: { status: 'timeout', result: 'Node không xác nhận trong 15 giây; trạng thái thực tế cần kiểm tra lại.', completed_at: new Date() } });
    if (expired.modifiedCount) notify('command');
    for(const gasDevice of await Device.find({profile:'climate',lifecycle:'active',$or:[{gas_alarm_active:true},{gas_buzzer_owned:true}]}).select('_id').lean())await enforceGasAlarm(gasDevice._id);
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
        if(d.profile==='climate'&&d.gas_raw!==null&&d.gas_raw!==undefined)readings.gasRaw=d.gas_raw;
        const state = { ...d.reported_state, mode: d.config.mode };
        if (d.config.mode === 'AUTO') {
          if (d.profile === 'climate') {
            if (readings.temperature >= d.config.fanOn) state.fan = true;
            if (readings.temperature <= d.config.fanOff) state.fan = false;
            state.buzzer = readings.temperature >= d.config.temperatureAlert || !!d.gas_alarm_active;
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
      if (broker.state.connected) await alert(d._id, 'offline', 'critical', 'Thiết bị mất kết nối. Kiểm tra nguồn điện, Wi-Fi và MQTT.');
    }
    if (tickCount % 10 === 0) for (const row of await Device.find({ lifecycle: 'active', last_seen: { $gte: cutoff } }).select('_id').lean()) {
      const d = await device(row._id);
      if (d.data_status !== 'fresh') await alert(d.id, 'stale', 'warning', 'Node có heartbeat nhưng chưa có dữ liệu cảm biến mới. Kiểm tra cảm biến.');
    }
    if (tickCount % 60 === 0) await Telemetry.deleteMany({ recorded_at: { $lt: new Date(Date.now() - settings.retentionDays * 86400_000) } });
    if (tickCount % 4 === 0) notify('telemetry');
  }

  const timer = setInterval(() => {
    if (closing || tickPromise) return;
    tickPromise = tick().catch(() => { console.warn('Không hoàn tất chu kỳ IoT; kiểm tra trạng thái MongoDB.'); }).finally(() => { tickPromise = null; });
  }, 1000);

  return { device, ingest, acknowledge, receiveStatus, sendCommand, transition, workspace, brokerState: broker.state,
    async pause(id, offline) {
      if (offline) paused.add(id); else paused.delete(id);
      const settings = await workspace();
      await Device.updateOne({ _id: id }, { $set: { last_seen: offline ? new Date(Date.now() - (settings.offlineSeconds + 1) * 1000) : new Date() } });
      notify('device');
    },
    async close() { closing = true; clearInterval(timer); if (tickPromise) await tickPromise; await broker.close(); },
  };
}
