import mongoose from 'mongoose';
import { identifier } from './base.js';

const alertSchema = new mongoose.Schema({
  _id: identifier,
  device_id: { type: String, ref: 'Device', required: true },
  kind: { type: String, enum: ['temperature', 'offline'], required: true },
  severity: { type: String, enum: ['warning', 'critical'], required: true },
  message: { type: String, required: true, maxlength: 500 },
  status: { type: String, enum: ['open', 'acknowledged'], default: 'open' },
  created_at: { type: Date, default: Date.now },
  acknowledged_at: { type: Date, default: null },
  acknowledged_by: { type: String, ref: 'User', default: null },
}, { versionKey: false });
alertSchema.index({ device_id: 1, kind: 1, status: 1 });
alertSchema.index({ created_at: -1 });

export default mongoose.model('Alert', alertSchema);
