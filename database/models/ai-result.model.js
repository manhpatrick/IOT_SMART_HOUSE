import mongoose from 'mongoose';
import { identifier } from './base.js';
const schema = new mongoose.Schema({
  _id: identifier, device_id: { type: String, ref: 'Device', required: true },
  model_id: { type: String, ref: 'AiModel', required: true },
  recorded_at: { type: Date, required: true }, created_at: { type: Date, default: Date.now },
  status: { type: String, enum: ['normal','anomaly'], required: true },
  score: { type: Number, required: true }, threshold: { type: Number, required: true },
  prediction: { type: [Number], required: true }, actual: { type: [Number], required: true },
  inference_ms: { type: Number, required: true },
  expires_at: { type: Date, default: () => new Date(Date.now()+30*86400_000) },
}, { versionKey: false });
schema.index({ device_id: 1, model_id: 1, recorded_at: 1 }, { unique: true });
schema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('AiResult', schema);
