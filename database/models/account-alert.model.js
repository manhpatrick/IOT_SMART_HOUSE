import mongoose from 'mongoose';
import { identifier } from './base.js';
const schema = new mongoose.Schema({
  _id: identifier, user_id: { type: String, ref: 'User', required: true, index: true },
  login_event_id: { type: String, ref: 'LoginEvent', required: true, unique: true },
  message: { type: String, required: true, maxlength: 500 },
  status: { type: String, enum: ['open','expected','unrecognized'], default: 'open' },
  created_at: { type: Date, default: Date.now }, reviewed_at: { type: Date, default: null },
}, { versionKey: false });
export default mongoose.model('AccountAlert', schema);
