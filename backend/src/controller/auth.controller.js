import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { User, LoginEvent } from '../../../database/models/index.js';
import { toPublic } from '../../../database/models/base.js';
import { fail } from '../utils/errors.js';
import { audit } from '../services/audit.service.js';
import { revokeSessions } from '../services/session.service.js';
import { passwordSchema } from '../validation/schemas.js';

export async function register(req, res) {
  const input = z.object({ name: z.string().trim().min(2).max(80), email: z.email().trim().toLowerCase().max(120), password: passwordSchema, role: z.enum(['operator', 'viewer']).default('operator') }).strict().parse(req.body);
  if (await User.exists({ email: input.email })) throw fail(409, 'Email đã được sử dụng.');
  const { password, ...fields } = input;
  const user = await User.create({ ...fields, password_hash: await bcrypt.hash(password, 12) });
  await audit(toPublic(user), 'auth.registered', user._id);
  res.status(201).json({ ok: true });
}

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
  // Password/session validation stays authoritative; AI failure never blocks login.
  let loginAnalysis;
  try { loginAnalysis=await req.app.locals.ai.recordLogin(toPublic(user)); }
  catch {
    loginAnalysis={status:'unavailable',reason:'Chưa đánh giá được giờ đăng nhập; không coi là bình thường.'};
    await LoginEvent.create({user_id:user._id,occurred_at:new Date(),status:'unavailable',analysis:loginAnalysis,expires_at:new Date(Date.now()+120*86400_000)}).catch(()=>{});
  }
  await audit(toPublic(user), 'auth.login', user.email);
  res.json({ user: toPublic(user), csrfToken: req.session.csrfToken, loginAnalysis });
}

export const getMe = (req, res) => res.json({ user: req.user, csrfToken: req.session.csrfToken, demo: req.app.locals.config.demo });

export async function logout(req, res) {
  await audit(req.user, 'auth.logout', req.user.id);
  await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
  res.clearCookie('nodo.sid').json({ ok: true });
}

export async function changePassword(req, res) {
  const input = z.object({ currentPassword: z.string().max(128), password: passwordSchema }).strict().parse(req.body);
  const user = await User.findById(req.user.id).select('+password_hash').lean();
  if (!await bcrypt.compare(input.currentPassword, user.password_hash)) throw fail(400, 'Mật khẩu hiện tại chưa đúng.');
  await User.updateOne({ _id: user._id }, { $set: { password_hash: await bcrypt.hash(input.password, 12) } });
  await revokeSessions(user._id, req.sessionID);
  await audit(req.user, 'user.password_changed', req.user.id);
  req.app.locals.notify('user');
  res.json({ ok: true });
}
