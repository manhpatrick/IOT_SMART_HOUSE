import mongoose from 'mongoose';
import { identifier } from './base.js';

const auditSchema = new mongoose.Schema({
  _id: identifier,
  actor_id: { type: String, default: null },
  actor_name: { type: String, required: true },
  action: { type: String, required: true },
  target: { type: String, required: true },
  detail: { type: String, default: '' },
  created_at: { type: Date, default: Date.now, index: true },
}, { versionKey: false });

export default mongoose.model('AuditLog', auditSchema);
