import { randomUUID } from 'node:crypto';

export const identifier = { type: String, default: () => randomUUID() };
export const modelOptions = { versionKey: false, timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } };
export function toPublic(document) {
  if (!document) return null;
  const object = typeof document.toObject === 'function' ? document.toObject() : document;
  const { _id, password_hash, ...fields } = object;
  return { id: String(_id), ...fields };
}
