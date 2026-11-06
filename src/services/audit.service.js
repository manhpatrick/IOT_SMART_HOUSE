import { AuditLog } from '../../models/index.js';

export const audit = (actor, action, target, detail = '') => AuditLog.create({
  actor_id: actor?.id || null,
  actor_name: actor?.name || 'Hệ thống',
  action,
  target: String(target),
  detail,
});
