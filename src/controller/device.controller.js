import { z } from 'zod';
import { Device, DeviceEvent } from '../../models/index.js';
import { toPublic } from '../../models/base.js';
import { deviceSchema, configSchema } from '../validation/schemas.js';
import { defaults } from '../utils/defaults.js';
import { fail } from '../utils/errors.js';
import { audit } from '../services/audit.service.js';
import { devicesFor, scopedDevice, validateAssignments } from '../services/device.service.js';

export async function getDevices(req, res) { res.json(await devicesFor(req.user, req.app.locals.iot)); }

export async function getDevice(req, res) {
  const device = await scopedDevice(req);
  const events = (await DeviceEvent.find({ device_id: device.id }).sort({ created_at: 1, _id: 1 }).lean()).map(toPublic);
  res.json({ ...device, events });
}

export async function createDevice(req, res) {
  const input = deviceSchema.parse(req.body);
  await validateAssignments(input);
  const { id, ...fields } = input;
  if (await Device.exists({ _id: id })) throw fail(409, 'Mã thiết bị đã tồn tại.');
  await Device.create({ _id: id, ...fields, viewer_ids: [...new Set(fields.viewer_ids)], config: defaults(input.profile) });
  await DeviceEvent.create({ device_id: id, to_state: 'registered', actor_name: req.user.name });
  await audit(req.user, 'device.created', id, input.name);
  req.app.locals.notify('device');
  res.status(201).json(await req.app.locals.iot.device(id));
}

export async function updateDevice(req, res) {
  const device = await scopedDevice(req, true);
  const input = deviceSchema.omit({ id: true, profile: true }).parse(req.body);
  await validateAssignments(input);
  if (device.lifecycle === 'decommissioned') throw fail(409, 'Thiết bị đã ngừng sử dụng.');
  await Device.updateOne({ _id: device.id }, { $set: { ...input, viewer_ids: [...new Set(input.viewer_ids)] } }, { runValidators: true });
  await audit(req.user, 'device.updated', device.id);
  req.app.locals.notify('device');
  res.json(await req.app.locals.iot.device(device.id));
}

export async function changeLifecycle(req, res) {
  const device = await scopedDevice(req, true);
  const input = z.object({ state: z.enum(['provisioned', 'active', 'maintenance', 'locked', 'decommissioned']) }).strict().parse(req.body);
  res.json(await req.app.locals.iot.transition(device, input.state, req.user));
}

export async function sendCommand(req, res) {
  const device = await scopedDevice(req, true);
  const input = z.object({ actuator: z.enum(['fan', 'light', 'buzzer']), value: z.boolean() }).strict().parse(req.body);
  if ((device.profile === 'climate' && input.actuator === 'light') || (device.profile === 'lighting' && input.actuator !== 'light')) throw fail(400, 'Thiết bị không hỗ trợ đầu ra này.');
  res.status(202).json(await req.app.locals.iot.sendCommand(device, req.user, 'actuator', input));
}

export async function updateConfig(req, res) {
  const device = await scopedDevice(req, true), input = configSchema(device.profile).parse(req.body);
  res.status(202).json(await req.app.locals.iot.sendCommand(device, req.user, 'config', input));
}

export async function demoConnection(req, res) {
  if (!req.app.locals.config.demo) throw fail(404, 'Chỉ khả dụng ở chế độ giả lập.');
  const device = await scopedDevice(req, true), input = z.object({ offline: z.boolean() }).strict().parse(req.body);
  await req.app.locals.iot.pause(device.id, input.offline);
  await audit(req.user, 'demo.connection', device.id, input.offline ? 'offline' : 'online');
  res.json({ ok: true });
}
