import mongoose from 'mongoose';
import { identifier, modelOptions } from './base.js';
const schema = new mongoose.Schema({
  _id: identifier, home_id: { type: String, ref: 'Home', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
}, modelOptions);
schema.index({ home_id: 1, name: 1 }, { unique: true });
export default mongoose.model('Room', schema);
