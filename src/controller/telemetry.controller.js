import { z } from 'zod';
import { Device, Telemetry } from '../../models/index.js';
import { toPublic } from '../../models/base.js';
import { deviceFilter } from '../services/device.service.js';
import { audit } from '../services/audit.service.js';
import { fail } from '../utils/errors.js';

export async function getTelemetry(req, res) {
  const input = z.object({ deviceId: z.string().optional(), hours: z.coerce.number().min(1).max(168).default(24), limit: z.coerce.number().int().min(1).max(2000).default(500) }).parse(req.query);
  const devices = await Device.find(deviceFilter(req.user)).select('name').lean(), allowed = devices.map(d => d._id);
  if (input.deviceId && !allowed.includes(input.deviceId)) throw fail(403, 'Bạn không được cấp quyền cho thiết bị này.');
  const ids = input.deviceId ? [input.deviceId] : allowed;
  const names = new Map(devices.map(d => [d._id, d.name]));
  const rows = await Telemetry.find({ device_id: { $in: ids }, recorded_at: { $gte: new Date(Date.now() - input.hours * 3600_000) } }).sort({ recorded_at: -1, _id: -1 }).limit(input.limit).lean();
  if (req.query.format === 'csv') {
    await audit(req.user, 'telemetry.export', input.deviceId || 'all');
    return res.attachment('nodo-telemetry.csv').type('text/csv').send('\uFEFFdevice_id,timestamp,temperature_c,humidity_percent,light_percent\n' + rows.map(r => [r.device_id, r.recorded_at.toISOString(), r.temperature ?? '', r.humidity ?? '', r.light_percent ?? ''].join(',')).join('\n'));
  }
  res.json(rows.reverse().map(row => ({ ...toPublic(row), device_name: names.get(row.device_id) || row.device_id })));
}
