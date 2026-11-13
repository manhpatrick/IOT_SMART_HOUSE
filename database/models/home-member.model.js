import mongoose from 'mongoose';
import { identifier, modelOptions } from './base.js';
const schema = new mongoose.Schema({
  _id: identifier, home_id: { type: String, ref: 'Home', required: true },
  user_id: { type: String, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['operator', 'viewer'], required: true },
}, modelOptions);
schema.index({ home_id: 1, user_id: 1 }, { unique: true });
export default mongoose.model('HomeMember', schema);
