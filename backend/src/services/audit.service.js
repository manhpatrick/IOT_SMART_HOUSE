import { AuditLog } from '../../../database/models/index.js';

export const audit = (actor, action, target, detail = '', homeId = null) => AuditLog.create({
  actor_id: actor?.id || null,
  actor_name: actor?.name || 'Hệ thống',
  action,
  target: String(target),
  detail,
  home_id: homeId,
});
