import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
}, { versionKey: false });

export default mongoose.model('Setting', settingSchema);
