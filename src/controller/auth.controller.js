import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { User } from '../../models/index.js';
import { toPublic } from '../../models/base.js';
import { fail } from '../utils/errors.js';
import { audit } from '../services/audit.service.js';
import { revokeSessions } from '../services/session.service.js';

export async function login(req, res) {
  const input = z.object({ email: z.email().trim().toLowerCase(), password: z.string().max(128) }).strict().parse(req.body);
  const user = await User.findOne({ email: input.email }).select('+password_hash').lean();
  const matches = await bcrypt.compare(input.password, user?.password_hash || '$2b$12$W8z.Ffx1Y2WOnmAfZDXFruZZNbR2cBPfUpgjQV8tksRZvNCp2H3y2');
  if (!matches || user?.status !== 'active') {
    await audit(null, 'auth.failed', input.email);
    throw fail(401, 'Email hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa.');
  }
  await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  req.session.userId = user._id;
  req.session.csrfToken = randomBytes(32).toString('hex');
  await audit(toPublic(user), 'auth.login', user.email);
  res.json({ user: toPublic(user), csrfToken: req.session.csrfToken });
}

export const getMe = (req, res) => res.json({ user: req.user, csrfToken: req.session.csrfToken, demo: req.app.locals.config.demo });

export async function logout(req, res) {
  await audit(req.user, 'auth.logout', req.user.id);
  await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
  res.clearCookie('nodo.sid').json({ ok: true });
}

export async function changePassword(req, res) {
  const input = z.object({ currentPassword: z.string().max(128), password: z.string().min(10).max(128) }).strict().parse(req.body);
  const user = await User.findById(req.user.id).select('+password_hash').lean();
  if (!await bcrypt.compare(input.currentPassword, user.password_hash)) throw fail(400, 'Mật khẩu hiện tại chưa đúng.');
  await User.updateOne({ _id: user._id }, { $set: { password_hash: await bcrypt.hash(input.password, 12) } });
  await revokeSessions(user._id, req.sessionID);
  await audit(req.user, 'user.password_changed', req.user.id);
  req.app.locals.notify('user');
  res.json({ ok: true });
}
