import { User } from '../../models/index.js';
import { toPublic } from '../../models/base.js';
import { fail } from '../utils/errors.js';

export async function authMiddleware(req, res, next) {
  const user = req.session.userId && await User.findById(req.session.userId).lean();
  if (!user || user.status !== 'active') throw fail(401, 'Vui lòng đăng nhập để tiếp tục.');
  req.user = toPublic(user);
  next();
}

export function csrfMiddleware(req, res, next) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (!req.session.csrfToken || req.headers['x-csrf-token'] !== req.session.csrfToken)) throw fail(403, 'CSRF token không hợp lệ.');
  next();
}

export function sameOrigin(req, res, next) {
  if (req.headers.origin && req.headers.origin !== `${req.protocol}://${req.get('host')}`) throw fail(403, 'Origin không hợp lệ.');
  next();
}
