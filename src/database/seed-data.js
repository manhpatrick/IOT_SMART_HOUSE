import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { User, Device, Telemetry, Alert, DeviceEvent, Setting } from '../../models/index.js';
import { defaults, workspaceDefaults } from '../utils/defaults.js';
import { audit } from '../services/audit.service.js';
import { connectDB, disconnectDB } from './mongodb.js';
import { getConfig } from '../../config/env.js';

export async function seedDatabase({ demo = true, adminEmail, adminPassword } = {}) {
  await Setting.updateOne({ _id: 'workspace' }, { $setOnInsert: { value: workspaceDefaults } }, { upsert: true });
  if (await User.exists({})) return;
  if (!demo && (!adminEmail || !adminPassword || adminPassword.length < 12))
    throw new Error('Đặt ADMIN_EMAIL và ADMIN_PASSWORD ít nhất 12 ký tự trước khi khởi tạo database không dùng demo.');
  await User.create({ _id: 'user-admin', name: 'Quản trị viên', email: adminEmail || 'admin@nodo.local', password_hash: await bcrypt.hash(adminPassword || 'Admin@12345', 12), role: 'admin' });
  if (!demo) return;
  await User.create([
    { _id: 'user-operator', name: 'Nguyễn Minh Anh', email: 'operator@nodo.local', password_hash: await bcrypt.hash('Operator@12345', 12), role: 'operator' },
    { _id: 'user-viewer', name: 'Trần Hoàng Nam', email: 'viewer@nodo.local', password_hash: await bcrypt.hash('Viewer@12345', 12), role: 'viewer' },
  ]);
  for (const [id, name, profile] of [['node-01', 'Trạm môi trường', 'climate'], ['node-02', 'Trạm chiếu sáng', 'lighting']]) {
    await Device.create({ _id: id, name, profile, location: 'Phòng thực hành A.201', owner_id: 'user-operator', viewer_ids: ['user-viewer'], lifecycle: 'active', mqtt_username: id, config: defaults(profile), last_seen: new Date(), reported_state: profile === 'climate' ? { fan: false, buzzer: false, mode: 'AUTO' } : { light: true, mode: 'AUTO' } });
    await DeviceEvent.create([
      { device_id: id, from_state: null, to_state: 'registered', actor_name: 'Hệ thống' },
      { device_id: id, from_state: 'registered', to_state: 'provisioned', actor_name: 'Hệ thống' },
      { device_id: id, from_state: 'provisioned', to_state: 'active', actor_name: 'Hệ thống' },
    ]);
    const readings = [];
    for (let i = 143; i >= 0; i--) {
      const ts = new Date(Date.now() - i * 600_000);
      readings.push({ device_id: id, boot_id: 'seed', seq: 143 - i, recorded_at: ts, received_at: ts,
        temperature: profile === 'climate' ? +(27.5 + 2.7 * Math.sin((143 - i) / 15)).toFixed(1) : null,
        humidity: profile === 'climate' ? +(65 + 6 * Math.cos(i / 18)).toFixed(1) : null,
        light_percent: profile === 'lighting' ? Math.round(48 + 30 * Math.sin(i / 20)) : null,
      });
    }
    await Telemetry.insertMany(readings);
  }
  await Alert.create({ device_id: 'node-01', kind: 'temperature', severity: 'warning', message: 'Nhiệt độ từng vượt ngưỡng 35°C. Kiểm tra quạt và điều kiện phòng.', created_at: new Date(Date.now() - 1_200_000) });
  await audit(null, 'system.seed', 'workspace', 'Khởi tạo dữ liệu minh họa hai node ESP32 trong MongoDB');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const config = getConfig(); await connectDB(config); await seedDatabase(config); console.log('MongoDB seed hoàn tất; dữ liệu hiện có được giữ nguyên.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { await disconnectDB(); }
}
