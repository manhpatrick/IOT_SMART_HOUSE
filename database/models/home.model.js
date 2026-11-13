import mongoose from 'mongoose';
import { identifier, modelOptions } from './base.js';
export default mongoose.model('Home', new mongoose.Schema({
  _id: identifier, name: { type: String, required: true, trim: true, maxlength: 80 },
  address: { type: String, default: '', trim: true, maxlength: 200 },
  owner_id: { type: String, ref: 'User', required: true, index: true },
}, modelOptions));
