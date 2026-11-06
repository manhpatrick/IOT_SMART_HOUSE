import mongoose from 'mongoose';
import { Device, User, Alert, Command, AuditLog } from '../../models/index.js';
import { toPublic } from '../../models/base.js';
import { workspaceSchema } from '../validation/schemas.js';
import { Setting } from '../../models/index.js';
import { devicesFor, scopedRows, deviceFilter, canWrite } from '../services/device.service.js';
import { audit } from '../services/audit.service.js';
import { fail } from '../utils/errors.js';

export async function getOverview(req, res) {
  const { iot, config } = req.app.locals;
  const [devices, alerts, commands, users, activity] = await Promise.all([
    devicesFor(req.user, iot), scopedRows(Alert, req.user), scopedRows(Command, req.user, 6),
    req.user.role === 'admin' ? User.countDocuments() : null,
    req.user.role === 'admin' ? AuditLog.find().sort({ created_at: -1, _id: -1 }).limit(6).lean() : [],
  ]);
  const openAlerts = await Alert.countDocuments({ device_id: { $in: devices.map(d => d.id) }, status: 'open' });
  res.json({ devices, alerts, commands, broker: iot.brokerState, demo: config.demo, workspace: await iot.workspace(),
    counts: { devices: devices.length, online: devices.filter(d => d.connection === 'online').length, alerts: openAlerts, users },
    activity: activity.map(toPublic),
  });
}

export async function getCommands(req, res) { res.json(await scopedRows(Command, req.user)); }
export async function getAlerts(req, res) { res.json(await scopedRows(Alert, req.user)); }

export async function acknowledgeAlert(req, res) {
  const alert = await Alert.findById(req.params.id).lean();
  if (!alert) throw fail(404, 'Không tìm thấy cảnh báo.');
  const device = await req.app.locals.iot.device(alert.device_id);
  if (!canWrite(req.user, device)) throw fail(403, 'Bạn không được xử lý cảnh báo này.');
  await Alert.updateOne({ _id: alert._id, status: 'open' }, { $set: { status: 'acknowledged', acknowledged_at: new Date(), acknowledged_by: req.user.id } });
  await audit(req.user, 'alert.acknowledged', alert._id);
  req.app.locals.notify('alert'); res.json({ ok: true });
}

export async function getAudit(req, res) { res.json((await AuditLog.find().sort({ created_at: -1, _id: -1 }).limit(200).lean()).map(toPublic)); }

export async function getSettings(req, res) {
  const { iot, config } = req.app.locals;
  res.json({ workspace: await iot.workspace(), broker: iot.brokerState, demo: config.demo,
    database: { provider: config.mongoUri.startsWith('mongodb+srv:') ? 'MongoDB Atlas' : 'MongoDB', connected: mongoose.connection.readyState === 1, name: mongoose.connection.name } });
}

export async function updateSettings(req, res) {
  const input = workspaceSchema.parse(req.body);
  await Setting.updateOne({ _id: 'workspace' }, { $set: { value: input } });
  await audit(req.user, 'settings.updated', 'workspace'); req.app.locals.notify('settings'); res.json(input);
}
