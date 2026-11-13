import mongoose from 'mongoose';
import { identifier } from './base.js';
const schema = new mongoose.Schema({
  _id: identifier, user_id: { type: String, ref: 'User', required: true },
  occurred_at: { type: Date, required: true },
  source: { type: String, enum: ['server','legacy_audit','test_fixture'], default: 'server' },
  status: { type: String, enum: ['normal','anomaly','insufficient_data','unavailable'], required: true },
  analysis: { type: mongoose.Schema.Types.Mixed, default: null },
  review: { type: String, enum: ['pending','expected','unrecognized'], default: 'pending' },
  reviewed_at: { type: Date, default: null },
  expires_at: { type: Date, required: true },
}, { versionKey: false });
schema.index({ user_id: 1, occurred_at: -1 });
schema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('LoginEvent', schema);
