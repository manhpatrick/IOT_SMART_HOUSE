import mongoose from 'mongoose';
import { identifier } from './base.js';

const eventSchema = new mongoose.Schema({
  _id: identifier,
  device_id: { type: String, ref: 'Device', required: true, index: true },
  from_state: { type: String, default: null },
  to_state: { type: String, required: true },
  actor_name: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
}, { versionKey: false });

export default mongoose.model('DeviceEvent', eventSchema);
