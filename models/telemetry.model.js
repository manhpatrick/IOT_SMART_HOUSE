import mongoose from 'mongoose';
import { identifier } from './base.js';

const telemetrySchema = new mongoose.Schema({
  _id: identifier,
  device_id: { type: String, ref: 'Device', required: true },
  boot_id: { type: String, required: true, maxlength: 80 },
  seq: { type: Number, required: true, min: 0 },
  recorded_at: { type: Date, required: true },
  received_at: { type: Date, required: true, default: Date.now },
  temperature: { type: Number, min: -40, max: 80, default: null },
  humidity: { type: Number, min: 0, max: 100, default: null },
  light_percent: { type: Number, min: 0, max: 100, default: null },
}, { versionKey: false });
telemetrySchema.index({ device_id: 1, boot_id: 1, seq: 1 }, { unique: true });
telemetrySchema.index({ device_id: 1, recorded_at: -1 });

export default mongoose.model('Telemetry', telemetrySchema);
