import { z } from 'zod';
import { Home, HomeMember, Room, User, Device, Invitation, AuditLog } from '../../../database/models/index.js';
import { toPublic } from '../../../database/models/base.js';
import { scopedHome, homeIds, homeRole, validateRoom, digest, newToken, withHomeLock as lock } from '../services/home.service.js';
import { devicesFor } from '../services/device.service.js';
import { audit } from '../services/audit.service.js';
import { fail } from '../utils/errors.js';
const homeSchema = z.object({ name: z.string().trim().min(2).max(80), address: z.string().trim().max(200).default('') }).strict();
const roomSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict();
const emailSchema = z.object({ email: z.email().trim().toLowerCase().max(120) }).strict();
const context = req => scopedHome(req.user, req.params.homeId, true);

export async function listHomes(req, res) {
  const [homes, devices] = await Promise.all([Home.find({ _id: { $in: await homeIds(req.user) } }).sort({ created_at: 1 }).lean(), devicesFor(req.user, req.app.locals.iot)]);
  res.json(await Promise.all(homes.map(async home => {
    const nodes = devices.filter(d => d.home_id === home._id);
    return { ...toPublic(home), access_role: await homeRole(req.user, home), counts: { devices: nodes.length, online: nodes.filter(d => d.connection === 'online').length, stale: nodes.filter(d => d.data_status !== 'fresh').length, faults: nodes.filter(d => d.fault).length } };
  })));
}
export async function createHome(req, res) {
  if (req.user.role === 'viewer') throw fail(403, 'Viewer không được tạo nhà.');
  const input = homeSchema.extend({ owner_id: z.string().optional() }).parse(req.body);
  const ownerId = req.user.role === 'admin' ? input.owner_id || req.user.id : req.user.id;
  if (!await User.exists({ _id: ownerId, role: { $in: ['operator', 'admin'] }, status: 'active' })) throw fail(400, 'Chủ nhà phải là operator đang hoạt động.');
  const home = await Home.create({ ...input, owner_id: ownerId });
  await HomeMember.updateOne({ home_id: home._id, user_id: ownerId }, { $set: { role: 'operator' } }, { upsert: true });
  await audit(req.user, 'home.created', home._id, home.name, home._id);
  req.app.locals.notify('home'); res.status(201).json(toPublic(home));
}
export async function getHome(req, res) {
  const home = await scopedHome(req.user, req.params.homeId), id = home._id;
  const [rooms, devices, members, logs] = await Promise.all([
    Room.find({ home_id: id }).sort({ name: 1 }).lean(), devicesFor(req.user, req.app.locals.iot, id),
    HomeMember.find({ home_id: id }).lean(),
    AuditLog.find({ home_id: id }).sort({ created_at: -1, _id: -1 }).limit(80).lean(),
  ]);
  const users = await User.find({ _id: { $in: members.map(m => m.user_id) } }).select('name email status').lean();
  res.json({ ...toPublic(home), rooms: rooms.map(toPublic), devices,
    members: members.map(m => ({ ...toPublic(m), name: users.find(u => u._id === m.user_id)?.name || 'Tài khoản đã xóa', email: users.find(u => u._id === m.user_id)?.email, owner: home.owner_id === m.user_id })),
    audit: home.access_role === 'viewer' ? [] : logs.map(toPublic) });
}
export async function updateHome(req, res) {
  const home = await context(req), input = homeSchema.parse(req.body);
  await Home.updateOne({ _id: home._id }, { $set: input });
  await audit(req.user, 'home.updated', home._id, JSON.stringify(input), home._id); req.app.locals.notify('home'); res.json({ ok: true });
}
export async function createRoom(req, res) {
  const home = await context(req), input = roomSchema.parse(req.body);
  const room = await Room.create({ ...input, home_id: home._id });
  await audit(req.user, 'room.created', room._id, room.name, home._id); req.app.locals.notify('home'); res.status(201).json(toPublic(room));
}
export async function updateRoom(req, res) {
  const home = await context(req), input = roomSchema.parse(req.body);
  const room = await Room.findOneAndUpdate({ _id: req.params.roomId, home_id: home._id }, { $set: input }, { returnDocument: 'after', runValidators: true });
  if (!room) throw fail(404, 'Không tìm thấy phòng trong nhà.');
  await Device.updateMany({ home_id: home._id, room_id: room._id }, { $set: { location: room.name } });
  await audit(req.user, 'room.updated', room._id, room.name, home._id); req.app.locals.notify('home'); res.json(toPublic(room));
}
export async function deleteRoom(req, res) {
  const home = await context(req);
  return lock(home._id, async () => {
  if (await Device.exists({ home_id: home._id, room_id: req.params.roomId })) throw fail(409, 'Chuyển thiết bị sang phòng khác trước khi xóa phòng.');
  const result = await Room.deleteOne({ _id: req.params.roomId, home_id: home._id });
  if (!result.deletedCount) throw fail(404, 'Không tìm thấy phòng.');
  await audit(req.user, 'room.deleted', req.params.roomId, '', home._id); req.app.locals.notify('home'); res.json({ ok: true });
  });
}
export async function updateNode(req, res) {
  const home = await context(req);
  return lock(home._id, async () => {
  const input = z.object({ name: z.string().trim().min(2).max(80), room_id: z.string().nullable() }).strict().parse(req.body);
  await validateRoom(home._id, input.room_id);
  const room = input.room_id && await Room.findById(input.room_id).lean();
  const d = await Device.findOneAndUpdate({ _id: req.params.deviceId, home_id: home._id }, { $set: { ...input, location: room?.name || 'Chưa xếp phòng' } }, { returnDocument: 'after', runValidators: true });
  if (!d) throw fail(404, 'Thiết bị không thuộc nhà này.');
  await audit(req.user, 'device.moved', d._id, JSON.stringify(input), home._id); req.app.locals.notify('home'); res.json(toPublic(d));
  });
}
export async function claimNode(req, res) {
  const home = await context(req);
  return lock(home._id, async () => {
  const input = z.object({ deviceId: z.string().max(40), code: z.string().min(20).max(100), room_id: z.string().nullable() }).strict().parse(req.body);
  await validateRoom(home._id, input.room_id);
  const room = input.room_id && await Room.findById(input.room_id).lean();
  const d = await Device.findOneAndUpdate({ _id: input.deviceId, home_id: null, owner_id: null, lifecycle: { $in: ['provisioned', 'active'] }, claim_hash: digest(input.code), claim_expires_at: { $gt: new Date() } },
    { $set: { home_id: home._id, room_id: input.room_id, owner_id: home.owner_id, location: room?.name || 'Chưa xếp phòng', viewer_ids: [], claim_hash: null, claim_expires_at: null } }, { returnDocument: 'after' });
  if (!d) throw fail(409, 'Mã nhận thiết bị sai/hết hạn, thiết bị chưa được cấp kết nối hoặc đã thuộc một nhà khác.');
  await audit(req.user, 'device.claimed', d._id, d.name, home._id); req.app.locals.notify('home'); res.json(toPublic(d));
  });
}
export async function invite(req, res) {
  const home = await context(req), input = emailSchema.parse(req.body), token = newToken();
  if (input.email === req.user.email) throw fail(409, 'Bạn đã là thành viên của nhà này.');
  const result = await lock(home._id, async () => {
    const existing = await User.findOne({ email: input.email }).lean();
    if (existing && (home.owner_id === existing._id || await HomeMember.exists({ home_id: home._id, user_id: existing._id }))) throw fail(409, 'Người này đã là thành viên.');
    await Invitation.updateMany({ home_id: home._id, email: input.email, status: 'pending' }, { $set: { status: 'revoked' } });
    return Invitation.create({ home_id: home._id, email: input.email, token_hash: digest(token), invited_by: req.user.id, expires_at: new Date(Date.now() + 48 * 3600_000) });
  });
  await audit(req.user, 'member.invited', result._id, input.email, home._id); req.app.locals.notify('home');
  res.status(201).json({ ...toPublic(result), token });
}
export async function invitations(req, res) {
  const home = await context(req);
  res.json((await Invitation.find({ home_id: home._id }).sort({ created_at: -1 }).limit(100).lean()).map(toPublic));
}
export async function revokeInvite(req, res) {
  const home = await context(req);
  await lock(home._id, () => Invitation.updateOne({ _id: req.params.invitationId, home_id: home._id, status: 'pending' }, { $set: { status: 'revoked' } }));
  await audit(req.user, 'member.invite_revoked', req.params.invitationId, '', home._id); req.app.locals.notify('home'); res.json({ ok: true });
}
export async function acceptInvite(req, res) {
  const { token } = z.object({ token: z.string().min(20).max(100) }).strict().parse(req.body);
  const invitation = await Invitation.findOne({ token_hash: digest(token), email: req.user.email, status: 'pending', expires_at: { $gt: new Date() } }).lean();
  if (!invitation) throw fail(409, 'Lời mời sai, hết hạn, đã dùng hoặc không dành cho email của bạn.');
  await lock(invitation.home_id, async () => {
    const valid = await Invitation.findOne({ _id: invitation._id, status: 'pending', expires_at: { $gt: new Date() } }).lean();
    if (!valid || !await Home.exists({ _id: valid.home_id })) throw fail(409, 'Lời mời không còn hiệu lực.');
    await HomeMember.updateOne({ home_id: valid.home_id, user_id: req.user.id }, { $setOnInsert: { role: 'viewer' } }, { upsert: true });
    await Invitation.updateOne({ _id: valid._id }, { $set: { status: 'accepted', accepted_by: req.user.id } });
  });
  await audit(req.user, 'member.joined', req.user.id, '', invitation.home_id); req.app.locals.notify('home'); res.json({ home_id: invitation.home_id });
}
export async function removeMember(req, res) {
  const home = await context(req);
  if (req.params.userId === home.owner_id) throw fail(409, 'Không thể xóa chủ nhà.');
  const user = await User.findById(req.params.userId).lean();
  await lock(home._id, async () => {
    await HomeMember.deleteOne({ home_id: home._id, user_id: req.params.userId });
    if (user) await Invitation.updateMany({ home_id: home._id, email: user.email, status: 'pending' }, { $set: { status: 'revoked' } });
  });
  await audit(req.user, 'member.removed', req.params.userId, '', home._id); req.app.locals.notify('home'); res.json({ ok: true });
}
