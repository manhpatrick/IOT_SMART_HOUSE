import mongoose from 'mongoose';
import { getConfig } from '../../config/env.js';
import { connectDB, disconnectDB } from './mongodb.js';

try {
  const connection = await connectDB(getConfig());
  await mongoose.connection.db.command({ ping: 1 });
  console.log(`MongoDB kết nối thành công. Database: ${connection.name}`);
} catch (error) {
  console.error(error.message);
  if (error.code) console.error('Connection diagnostic:', JSON.stringify({ code: error.code, phase: error.phase, ...error.diagnostic }));
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
