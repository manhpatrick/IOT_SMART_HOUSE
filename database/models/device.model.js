import mongoose from 'mongoose';
import { modelOptions } from './base.js';

const deviceSchema = new mongoose.Schema({
  _id: { type: String, required: true, match: /^[a-z0-9][a-z0-9-]{2,39}$/ },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  profile: { type: String, enum: ['climate', 'lighting'], required: true },
  location: { type: String, required: true, trim: true, maxlength: 100 },
  home_id: { type: String, ref: 'Home', default: null, index: true },
  room_id: { type: String, ref: 'Room', default: null, index: true },
  claim_hash: { type: String, default: null, select: false },
  claim_expires_at: { type: Date, default: null },
  owner_id: { type: String, ref: 'User', default: null, index: true },
  viewer_ids: [{ type: String, ref: 'User' }],
  lifecycle: { type: String, enum: ['registered', 'provisioned', 'active', 'maintenance', 'locked', 'decommissioned'], default: 'registered', index: true },
  firmware: { type: String, default: '1.0.0', maxlength: 40 },
  hardware: { type: String, default: 'ESP32', maxlength: 40 },
  mqtt_username: { type: String, default: null },
  config: { type: mongoose.Schema.Types.Mixed, required: true },
  reported_state: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  last_command_id: { type: String, default: null },
  manual_overrides: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  gas_alarm_active: { type: Boolean, default: false },
  gas_raw: { type: Number, default: null },
  gas_recorded_at: { type: Date, default: null },
  gas_buzzer_owned: { type: Boolean, default: false },
  last_seen: { type: Date, default: null },
  fault: { type: String, default: null, maxlength: 200 },
}, { ...modelOptions, minimize: false });
deviceSchema.index({ mqtt_username: 1 }, { unique: true, partialFilterExpression: { mqtt_username: { $type: 'string' } } });

export default mongoose.model('Device', deviceSchema);
