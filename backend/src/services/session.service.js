import mongoose from 'mongoose';

export async function revokeSessions(userId, keepSid) {
  return mongoose.connection.collection('sessions').deleteMany({ 'session.userId': userId, ...(keepSid ? { _id: { $ne: keepSid } } : {}) });
}

export async function isSessionValid(sid) {
  return !!await mongoose.connection.collection('sessions').findOne({ _id: sid, expires: { $gt: new Date() } }, { projection: { _id: 1 } });
}
