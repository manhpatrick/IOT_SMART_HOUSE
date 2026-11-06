import { z } from 'zod';

export const userSchema = z.object({
  name: z.string().trim().min(2).max(80), email: z.email().trim().toLowerCase().max(120),
  role: z.enum(['admin', 'operator', 'viewer']), password: z.string().min(10).max(128),
  status: z.enum(['active', 'disabled']).default('active'),
}).strict();

export const deviceSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,39}$/), name: z.string().trim().min(2).max(80),
  profile: z.enum(['climate', 'lighting']), location: z.string().trim().min(1).max(100),
  owner_id: z.string().nullable().default(null), viewer_ids: z.array(z.string()).max(100).default([]),
}).strict();

export const telemetrySchema = z.object({
  deviceId: z.string(), bootId: z.string().min(1).max(80), seq: z.number().int().min(0), timestamp: z.iso.datetime(),
  readings: z.object({ temperature: z.number().min(-40).max(80).optional(), humidity: z.number().min(0).max(100).optional(), lightPercent: z.number().min(0).max(100).optional() }).strict(),
  state: z.object({ fan: z.boolean().optional(), buzzer: z.boolean().optional(), light: z.boolean().optional(), mode: z.enum(['AUTO', 'MANUAL']).optional() }).strict().optional(),
}).strict();

export const ackSchema = z.object({
  commandId: z.string(), status: z.enum(['applied', 'failed']), message: z.string().max(300).optional(), state: telemetrySchema.shape.state,
}).strict();

export const workspaceSchema = z.object({
  name: z.string().trim().min(2).max(100), timezone: z.literal('Asia/Ho_Chi_Minh'),
  offlineSeconds: z.number().int().min(15).max(300), retentionDays: z.number().int().min(1).max(365),
}).strict();

export function configSchema(profile) {
  return profile === 'climate'
    ? z.object({ mode: z.enum(['AUTO', 'MANUAL']), fanOn: z.number().min(15).max(60), fanOff: z.number().min(10).max(55), temperatureAlert: z.number().min(20).max(75) }).strict().refine(v => v.fanOff < v.fanOn && v.temperatureAlert >= v.fanOn, 'Cần fanOff < fanOn ≤ temperatureAlert.')
    : z.object({ mode: z.enum(['AUTO', 'MANUAL']), lightOn: z.number().min(0).max(99), lightOff: z.number().min(1).max(100) }).strict().refine(v => v.lightOn < v.lightOff, 'Ngưỡng bật phải nhỏ hơn ngưỡng tắt.');
}
