// Generates sample data only: no network connection and no claim of physical readings.
import { randomUUID } from 'node:crypto';
const [deviceId, profile] = process.argv.slice(2);
if (!deviceId || !/^[a-z0-9][a-z0-9-]{2,39}$/.test(deviceId) || !['climate', 'lighting'].includes(profile)) {
  console.error('Usage: npm run mqtt:sample -- <deviceId> <climate|lighting>');
  process.exitCode = 1;
} else {
  const climate = profile === 'climate';
  console.log(JSON.stringify({ deviceId, bootId: randomUUID(), seq: 0, timestamp: new Date().toISOString(),
    readings: climate ? { temperature: 29.2, humidity: 65.1 } : { lightPercent: 28 },
    state: climate ? { fan: false, buzzer: false, mode: 'AUTO' } : { light: true, mode: 'AUTO' },
  }, null, 2));
}
