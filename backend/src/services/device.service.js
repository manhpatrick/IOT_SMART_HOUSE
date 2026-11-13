import { Device, User } from '../../../database/models/index.js';
import { toPublic } from '../../../database/models/base.js';
import { fail } from '../utils/errors.js';
import { homeIds, scopedHome, homeRole } from './home.service.js';
import { Home } from '../../../database/models/index.js';

export const deviceFilter = async user => user.role === 'admin' ? {} : { $or: [
  { home_id: { $in: await homeIds(user) } },
  { home_id: null, $or: [{ owner_id: user.id }, { viewer_ids: user.id }] },
] };
export async function canRead(user, device) {
  if (user.role === 'admin') return true;
  if (!device.home_id) return device.owner_id === user.id || device.viewer_ids?.includes(user.id);
  const home = await Home.findById(device.home_id).lean();
  return !!home && !!await homeRole(user, home);
}
export async function canWrite(user, device) {
  if (user.role === 'admin') return true;
  if (user.role !== 'operator') return false;
  if (!device.home_id) return device.owner_id === user.id;
  const home = await Home.findById(device.home_id).lean();
  return !!home && await homeRole(user, home) === 'operator';
}

export async function scopedDevice(req, write = false) {
  const device = await req.app.locals.iot.device(req.params.id);
  if (!await canRead(req.user, device) || (write && !await canWrite(req.user, device))) throw fail(403, 'Bạn không được cấp quyền cho thiết bị này.');
  return device;
}

export async function devicesFor(user, iot, homeId = null) {
  if (homeId) await scopedHome(user, homeId);
  const ids = await Device.find({ $and: [await deviceFilter(user), ...(homeId ? [{ home_id: homeId }] : [])] }).distinct('_id');
  return Promise.all(ids.sort().map(id => iot.device(id)));
}

export async function scopedRows(Model, user, limit = 100) {
  const ids = await Device.find(await deviceFilter(user)).distinct('_id');
  const [rows, devices] = await Promise.all([
    Model.find({ device_id: { $in: ids } }).sort({ created_at: -1, _id: -1 }).limit(limit).lean(),
    Device.find({ _id: { $in: ids } }).select('name').lean(),
  ]);
  const names = new Map(devices.map(d => [d._id, d.name]));
  return rows.map(row => ({ ...toPublic(row), device_name: names.get(row.device_id) || row.device_id }));
}

export async function validateAssignments(input) {
  if (input.owner_id && !await User.exists({ _id: input.owner_id, role: { $in: ['admin', 'operator'] }, status: 'active' })) throw fail(400, 'Chủ sở hữu phải là Admin/Operator đang hoạt động.');
  const ids = [...new Set(input.viewer_ids || [])];
  if (ids.length && await User.countDocuments({ _id: { $in: ids }, status: 'active' }) !== ids.length) throw fail(400, 'Người được chia sẻ không tồn tại hoặc bị khóa.');
}
