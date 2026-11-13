import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const mqttMode = process.argv.includes('--mqtt');
if (mqttMode) {
  const envPath = path.join(cwd, '.env.mqtt-lab');
  const configured = existsSync(envPath) && readFileSync(envPath, 'utf8').match(/^\s*MQTT_PASSWORD\s*=\s*(.*)$/m)?.[1]?.trim();
  if (!configured || /^["']?["']?$/.test(configured) || configured.includes('REPLACE_WITH_')) {
    console.error('Copy .env.mqtt-lab.example thành .env.mqtt-lab và điền mật khẩu nodo-backend trước khi chạy.');
    process.exit(1);
  }
}
let docker = 'docker';
if (process.platform === 'win32') {
  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Docker/Docker/resources/bin/docker.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs/DockerDesktop/resources/bin/docker.exe'),
  ];
  docker = candidates.find(existsSync) || docker;
}
const compose = ['compose', '-f', 'deployment/compose.local.yaml'];
if (mqttMode) compose.push('-f', 'deployment/compose.mqtt-lab.yaml');
const args = [...compose, 'up', '-d', '--wait', '--wait-timeout', '60'];
if (process.argv.includes('--build')) args.push('--build');
const result = spawnSync(docker, args, { cwd, stdio: 'inherit', windowsHide: true });
if (result.error || result.status !== 0) {
  console.error('\nKhông khởi chạy được Docker demo. Kiểm tra Docker Desktop và lỗi phía trên.');
  process.exit(result.status || 1);
}
const published = spawnSync(docker, [...compose, 'port', 'app', '3080'], { cwd, encoding: 'utf8', windowsHide: true });
if (published.error || published.status !== 0) {
  console.error('Container đã chạy nhưng không đọc được cổng web. Dùng docker compose ps để kiểm tra.');
  process.exit(1);
}
const bindings = published.stdout.trim().split(/\r?\n/);
const port = bindings[0]?.match(/:(\d+)$/)?.[1];
if (!port) { console.error('Không tìm thấy cổng HTTP được publish.'); process.exit(1); }
console.log(`\nNODO Docker (${mqttMode ? 'MQTT lab, broker host:1884' : 'mô phỏng'}) đã sẵn sàng. Ctrl + click vào URL trong terminal VS Code:`);
console.log(`  Đăng nhập:       http://127.0.0.1:${port}/login`);
console.log(`  Admin:           http://127.0.0.1:${port}/`);
console.log(`  Operator/Viewer: http://127.0.0.1:${port}/app`);
if (bindings.some(binding => binding.startsWith('0.0.0.0:'))) {
  console.log('\nĐiện thoại cùng Wi-Fi/hotspot: chọn IPv4 của adapter Wi-Fi đang kết nối.');
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) console.log(`  ${name}: http://${address.address}:${port}/app`);
    }
  }
  console.log('Các adapter ảo/VPN có thể không truy cập được từ điện thoại.');
} else {
  console.log('\nCổng hiện chưa mở trên mọi IPv4 của laptop. Muốn dùng điện thoại, đổi binding');
  console.log('trong deployment/compose.local.yaml thành "0.0.0.0:3080:3080", rồi chạy lại lệnh này.');
}
console.log('\nKhông cần chạy thêm npm run dev.');
