import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from '../../models/index.js';
import { toPublic } from '../../models/base.js';
import { userSchema } from '../validation/schemas.js';
import { fail } from '../utils/errors.js';
import { createLock } from '../utils/asyncLock.js';
import { audit } from '../services/audit.service.js';
import { revokeSessions } from '../services/session.service.js';

const withUserLock = createLock();

export async function getUsers(req, res) {
  res.json((await User.find().sort({ created_at: 1, _id: 1 }).lean()).map(toPublic));
}

export async function createUser(req, res) {
  const input = userSchema.parse(req.body);
  if (await User.exists({ email: input.email })) throw fail(409, 'Email đã được sử dụng.');
  const { password, ...fields } = input;
  const user = await User.create({ ...fields, password_hash: await bcrypt.hash(password, 12) });
  await audit(req.user, 'user.created', user._id, user.email);
  req.app.locals.notify('user');
  res.status(201).json(toPublic(user));
}

export async function updateUser(req, res) {
  const input = userSchema.omit({ password: true }).extend({ password: z.string().min(10).max(128).optional() }).parse(req.body);
  const user = await withUserLock('admin-state', async () => {
    const existing = await User.findById(req.params.id).lean();
    if (!existing) throw fail(404, 'Không tìm thấy tài khoản.');
    if (existing._id === req.user.id && (input.role !== 'admin' || input.status !== 'active')) throw fail(409, 'Bạn không thể tự khóa hoặc hạ quyền tài khoản đang dùng.');
    if (existing.role === 'admin' && existing.status === 'active' && (input.role !== 'admin' || input.status !== 'active') && await User.countDocuments({ role: 'admin', status: 'active' }) <= 1) throw fail(409, 'Hệ thống cần ít nhất một Admin hoạt động.');
    if (await User.exists({ email: input.email, _id: { $ne: existing._id } })) throw fail(409, 'Email đã được sử dụng.');
    const { password, ...changes } = input;
    if (password) changes.password_hash = await bcrypt.hash(password, 12);
    return User.findByIdAndUpdate(existing._id, { $set: changes }, { returnDocument: 'after', runValidators: true }).lean();
  });
  await revokeSessions(user._id, req.sessionID);
  await audit(req.user, 'user.updated', user._id, `${user.role} / ${user.status}`);
  req.app.locals.notify('user');
  res.json(toPublic(user));
}
