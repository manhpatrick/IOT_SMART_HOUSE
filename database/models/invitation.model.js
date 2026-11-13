import mongoose from 'mongoose';
import { identifier, modelOptions } from './base.js';
const schema = new mongoose.Schema({
  _id: identifier, home_id: { type: String, ref: 'Home', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  token_hash: { type: String, required: true, select: false, unique: true },
  role: { type: String, enum: ['viewer'], default: 'viewer' },
  status: { type: String, enum: ['pending', 'accepted', 'revoked'], default: 'pending' },
  invited_by: { type: String, required: true }, expires_at: { type: Date, required: true },
  accepted_by: { type: String, default: null },
}, modelOptions);
export default mongoose.model('Invitation', schema);
