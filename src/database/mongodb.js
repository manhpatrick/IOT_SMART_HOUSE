import mongoose from 'mongoose';
import { setServers } from 'node:dns/promises';
import { isIP } from 'node:net';
import * as models from '../../models/index.js';

mongoose.set('bufferCommands', false);

export async function connectDB({ mongoUri, dbName = 'iot_admin', dnsServers = [] }) {
  if (!mongoUri || !/^mongodb(?:\+srv)?:\/\//.test(mongoUri) || /[<>]/.test(mongoUri)) {
    throw new Error('Chưa có MongoDB URI hợp lệ. Điền MONGODB_URI và MONGODB_DB_NAME=iot_admin trong file .env. Xem docs/MONGODB-ATLAS.md.');
  }
  if (mongoUri.startsWith('mongodb+srv://') && dnsServers.length) {
    if (!dnsServers.every(server => isIP(server))) throw new Error('MONGODB_DNS_SERVERS chỉ nhận danh sách địa chỉ IP DNS, phân cách bằng dấu phẩy.');
    // Applies to this Node process only; the computer's DNS settings are unchanged.
    setServers(dnsServers);
  }
  let phase = 'connect';
  try {
    await mongoose.connect(mongoUri, { dbName, serverSelectionTimeoutMS: 8000, maxPoolSize: 10, autoCreate: false, autoIndex: false });
    phase = 'model-indexes';
    // Explicitly initialize after connect; avoid indexing through a closed client
    // when the application is intentionally closed and reopened in one process.
    await Promise.all(Object.values(models).map(async model => {
      await model.createCollection();
      await model.createIndexes();
    }));
    phase = 'session-index';
    await mongoose.connection.collection('sessions').createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
    return mongoose.connection;
  } catch (error) {
    await mongoose.disconnect().catch(() => {});
    // Do not log the URI, credentials, or raw driver messages containing hostnames.
    const safe = new Error('Không kết nối được MongoDB. Kiểm tra MONGODB_URI, mật khẩu DB user, IP Access List của Atlas và kết nối mạng.');
    safe.code = error.code || error.name;
    safe.phase = phase;
    safe.diagnostic = {
      authenticationFailed: error.code === 18 || /authentication failed|bad auth/i.test(error.message || ''),
      dnsFailure: /querySrv|queryTxt|getaddrinfo/i.test(error.message || ''),
      tlsFailure: /SSL|TLS|CERT_/i.test(error.message || ''),
      serverErrors: [...(error.reason?.servers?.values?.() || [])].map(server => ({
        name: server.error?.name,
        code: server.error?.code,
        causeCode: server.error?.cause?.code,
      })).filter(server => server.name || server.code || server.causeCode),
    };
    throw safe;
  }
}

export const disconnectDB = () => mongoose.disconnect();
