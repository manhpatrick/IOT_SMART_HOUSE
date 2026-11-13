import mongoose from 'mongoose';
import { identifier, modelOptions } from './base.js';

const userSchema = new mongoose.Schema({
  _id: identifier,
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
  password_hash: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'operator', 'viewer'], required: true },
  status: { type: String, enum: ['active', 'disabled'], default: 'active' },
}, modelOptions);

export default mongoose.model('User', userSchema);
