import { fail } from '../utils/errors.js';

export function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') throw fail(403, 'Chức năng dành cho quản trị viên.');
  next();
}

export function operatorMiddleware(req, res, next) {
  if (req.user.role === 'viewer') throw fail(403, 'Người xem không được thực hiện thao tác này.');
  next();
}
