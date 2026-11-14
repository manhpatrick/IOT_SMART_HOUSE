// Generates sample data only: no network connection and no claim of physical readings.
import { randomUUID } from 'node:crypto';
const [deviceId, profile, gasValue] = process.argv.slice(2);
if (!deviceId || !/^[a-z0-9][a-z0-9-]{2,39}$/.test(deviceId) || !['climate', 'lighting'].includes(profile)) {
  console.error('Usage: npm run mqtt:sample -- <deviceId> <climate|lighting> [gasRaw]');
  process.exitCode = 1;
} else {
  const gasRaw=gasValue===undefined?undefined:Number(gasValue);
  if(gasRaw!==undefined&&(profile!=='climate'||!Number.isInteger(gasRaw)||gasRaw<0||gasRaw>4095))throw new Error('Gas ADC phải là số nguyên 0–4095 cho profile climate.');
  const climate = profile === 'climate';
  console.log(JSON.stringify({ deviceId, bootId: randomUUID(), seq: 0, timestamp: new Date().toISOString(),
    readings: climate ? { temperature: 29.2, humidity: 65.1, lightPercent: 28, gasRaw: gasRaw ?? 650 } : { lightPercent: 28 },
    state: climate ? { fan: false, buzzer: false, light: true, mode: 'AUTO' } : { light: true, mode: 'AUTO' },
  }, null, 2));
}
