import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { User, Device, Telemetry, Command, Alert, AuditLog, DeviceEvent, Setting } from '../../models/index.js';
import { connectDB, disconnectDB } from './mongodb.js';
import { getConfig } from '../../config/env.js';

// The old database is opened read-only. Existing MongoDB documents are never overwritten.
export async function migrateSQLite(path = './data/nodo.sqlite') {
  if (!existsSync(path)) throw new Error('Không tìm thấy SQLite cũ. Truyền đường dẫn sau npm run migrate:sqlite -- <path>.');
  const { DatabaseSync } = await import('node:sqlite');
  const sqlite = new DatabaseSync(path, { readOnly: true });
  try {
    const tables = ['users', 'devices', 'device_access', 'telemetry', 'commands', 'alerts', 'audit_logs', 'device_events', 'settings'];
    const source = Object.fromEntries(tables.map(name => [name, sqlite.prepare(`SELECT * FROM ${name}`).all()]));
    for (const user of source.users) {
      const conflict = await User.findOne({ email: user.email, _id: { $ne: user.id } }).select('_id').lean();
      if (conflict) throw new Error('Email trong SQLite trùng tài khoản MongoDB có ID khác. Migration chưa ghi dữ liệu; cần đối chiếu tài khoản trước.');
    }
    for (const device of source.devices) {
      const existing = await Device.findById(device.id).select('profile').lean();
      if (existing && existing.profile !== device.profile) throw new Error('Device ID đang được dùng cho loại node khác trong MongoDB. Migration chưa ghi dữ liệu.');
    }
    const clean = row => { const { id, ...fields } = row; return { _id: String(id), ...fields }; };
    const inserted = {};
    async function copy(label, Model, documents, filter = d => ({ _id: d._id })) {
      if (!documents.length) { inserted[label] = 0; return; }
      const result = await Model.bulkWrite(documents.map(document => ({ updateOne: { filter: filter(document), update: { $setOnInsert: document }, upsert: true, timestamps: false } })), { ordered: true, timestamps: false });
      inserted[label] = result.upsertedCount;
    }
    await copy('users', User, source.users.map(clean));
    await copy('devices', Device, source.devices.map(row => ({ ...clean(row), config: JSON.parse(row.config), reported_state: JSON.parse(row.reported_state), viewer_ids: source.device_access.filter(a => a.device_id === row.id).map(a => a.user_id) })));
    await copy('telemetry', Telemetry, source.telemetry.map(row => ({ ...clean(row), _id: `legacy-telemetry-${row.id}` })), d => ({ device_id: d.device_id, boot_id: d.boot_id, seq: d.seq }));
    await copy('commands', Command, source.commands.map(row => ({ ...clean(row), payload: JSON.parse(row.payload), ...(row.status === 'pending' ? { status: 'cancelled', result: 'Hủy lệnh cũ khi chuyển database. Gửi lại lệnh từ hệ thống mới nếu cần.', completed_at: new Date() } : {}) })));
    await copy('alerts', Alert, source.alerts.map(clean));
    await copy('audit_logs', AuditLog, source.audit_logs.map(row => ({ ...clean(row), _id: `legacy-audit-${row.id}` })));
    await copy('device_events', DeviceEvent, source.device_events.map(row => ({ ...clean(row), _id: `legacy-event-${row.id}` })));
    await copy('settings', Setting, source.settings.map(row => ({ _id: row.key, value: JSON.parse(row.value) })));
    return inserted;
  } finally { sqlite.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await connectDB(getConfig());
    console.log('Số bản ghi mới chuyển sang MongoDB:', await migrateSQLite(process.argv[2]));
    console.log('SQLite gốc và các bản ghi MongoDB đã có được giữ nguyên. Đăng nhập lại sau khi chuyển database.');
  } catch (error) {
    console.error(error.code === 11000 ? 'Có dữ liệu trùng khóa ở MongoDB. Dữ liệu gốc còn nguyên; kiểm tra bản ghi xung đột trước khi chạy lại.' : error.message);
    process.exitCode = 1;
  } finally { await disconnectDB(); }
}
