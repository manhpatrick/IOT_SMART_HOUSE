import mongoose from 'mongoose';
import { modelOptions } from './base.js';

const deviceSchema = new mongoose.Schema({
  _id: { type: String, required: true, match: /^[a-z0-9][a-z0-9-]{2,39}$/ },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  profile: { type: String, enum: ['climate', 'lighting'], required: true },
  location: { type: String, required: true, trim: true, maxlength: 100 },
  owner_id: { type: String, ref: 'User', default: null, index: true },
  viewer_ids: [{ type: String, ref: 'User' }],
  lifecycle: { type: String, enum: ['registered', 'provisioned', 'active', 'maintenance', 'locked', 'decommissioned'], default: 'registered', index: true },
  firmware: { type: String, default: '1.0.0', maxlength: 40 },
  hardware: { type: String, default: 'ESP32', maxlength: 40 },
  mqtt_username: { type: String, default: null },
  config: { type: mongoose.Schema.Types.Mixed, required: true },
  reported_state: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  last_seen: { type: Date, default: null },
  fault: { type: String, default: null, maxlength: 200 },
}, { ...modelOptions, minimize: false });
deviceSchema.index({ mqtt_username: 1 }, { unique: true, partialFilterExpression: { mqtt_username: { $type: 'string' } } });

export default mongoose.model('Device', deviceSchema);
