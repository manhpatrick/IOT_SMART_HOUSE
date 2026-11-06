import mongoose from 'mongoose';
import { identifier } from './base.js';

const commandSchema = new mongoose.Schema({
  _id: identifier,
  device_id: { type: String, ref: 'Device', required: true },
  actor_id: { type: String, ref: 'User', default: null },
  kind: { type: String, enum: ['actuator', 'config'], required: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['pending', 'applied', 'failed', 'timeout', 'cancelled'], default: 'pending' },
  result: { type: String, default: null },
  created_at: { type: Date, default: Date.now },
  expires_at: { type: Date, required: true },
  completed_at: { type: Date, default: null },
}, { versionKey: false });
commandSchema.index({ device_id: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });
commandSchema.index({ created_at: -1 });
commandSchema.index({ status: 1, expires_at: 1 });

export default mongoose.model('Command', commandSchema);
