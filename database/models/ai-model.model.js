import mongoose from 'mongoose';
import { identifier, modelOptions } from './base.js';
const schema = new mongoose.Schema({
  _id: identifier, device_id: { type: String, ref: 'Device', required: true, index: true },
  trained_by: { type: String, ref: 'User', required: true },
  algorithm: { type: String, default: 'elman-rnn-v1' },
  status: { type: String, enum: ['training','ready','failed'], default: 'training' },
  data_source: { type: String, enum: ['hardware','demo_or_mixed'], required: true },
  progress: { type: Number, default: 0 }, error: { type: String, default: null },
  report: { type: mongoose.Schema.Types.Mixed, default: null },
  artifact: { type: mongoose.Schema.Types.Mixed, default: null, select: false },
}, modelOptions);
schema.index({ device_id: 1, status: 1, created_at: -1 });
export default mongoose.model('AiModel', schema);
