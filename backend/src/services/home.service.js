import { createHash, randomBytes } from 'node:crypto';
import { Home, HomeMember, Room, Device } from '../../../database/models/index.js';
import { fail } from '../utils/errors.js';
import { createLock } from '../utils/asyncLock.js';
export const withHomeLock = createLock();
export const digest = value => createHash('sha256').update(value).digest('hex');
export const newToken = () => randomBytes(24).toString('base64url');

export async function homeRole(user, home) {
  if (user.role === 'admin') return 'admin';
  if (home.owner_id === user.id) return user.role === 'operator' ? 'operator' : 'viewer';
  return (await HomeMember.findOne({ home_id: home._id || home.id, user_id: user.id }).lean())?.role || null;
}
export async function scopedHome(user, id, write = false) {
  const home = await Home.findById(id).lean();
  if (!home) throw fail(404, 'Không tìm thấy nhà.');
  const role = await homeRole(user, home);
  if (!role || (write && (user.role === 'viewer' || !['admin', 'operator'].includes(role)))) throw fail(403, 'Bạn không có quyền thực hiện thao tác trong nhà này.');
  return { ...home, access_role: role };
}
export async function homeIds(user) {
  if (user.role === 'admin') return Home.distinct('_id');
  const [owned, member] = await Promise.all([Home.find({ owner_id: user.id }).distinct('_id'), HomeMember.find({ user_id: user.id }).distinct('home_id')]);
  return [...new Set([...owned, ...member])];
}
export async function validateRoom(homeId, roomId) {
  if (!homeId && roomId) throw fail(400, 'Cần chọn nhà trước khi chọn phòng.');
  if (homeId && !await Home.exists({ _id: homeId })) throw fail(400, 'Nhà không tồn tại.');
  if (roomId && !await Room.exists({ _id: roomId, home_id: homeId })) throw fail(400, 'Phòng không thuộc nhà được chọn.');
}

// Additive and repeatable: existing IDs, sensor history, passwords and commands stay intact.
export async function migrateLegacyHomes() {
  for (const d of await Device.find({ home_id: null, owner_id: { $ne: null } }).lean()) {
    const homeId = `home-${d.owner_id}`, roomId = `room-${digest(homeId + ':' + d.location).slice(0, 24)}`;
    await Home.updateOne({ _id: homeId }, { $setOnInsert: { name: 'Nhà của tôi', owner_id: d.owner_id } }, { upsert: true });
    await Room.updateOne({ _id: roomId }, { $setOnInsert: { home_id: homeId, name: d.location || 'Phòng chung' } }, { upsert: true });
    await HomeMember.updateOne({ home_id: homeId, user_id: d.owner_id }, { $setOnInsert: { role: 'operator' } }, { upsert: true });
    for (const userId of d.viewer_ids || []) {
      if (userId !== d.owner_id) await HomeMember.updateOne({ home_id: homeId, user_id: userId }, { $setOnInsert: { role: 'viewer' } }, { upsert: true });
    }
    await Device.updateOne({ _id: d._id, home_id: null }, { $set: { home_id: homeId, room_id: roomId } });
  }
}
