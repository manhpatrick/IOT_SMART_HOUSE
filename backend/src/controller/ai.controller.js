import { z } from 'zod';
import { AiResult, AccountAlert, LoginEvent, User } from '../../../database/models/index.js';
import { toPublic } from '../../../database/models/base.js';
import { scopedDevice, devicesFor, canWrite } from '../services/device.service.js';
import { analyzeLogin } from '../ai/login-model.js';

export async function summary(req,res) {
  const devices=(await devicesFor(req.user,req.app.locals.iot)).filter(d=>d.profile==='climate');
  res.json({enabled:req.app.locals.ai.enabled,devices:await Promise.all(devices.map(async d=>({id:d.id,name:d.name,home_id:d.home_id,home_name:d.home_name,can_train:await canWrite(req.user,d),...await req.app.locals.ai.deviceStatus(d.id,d)})))});
}
export async function getDeviceAI(req,res) {
  const device=await scopedDevice(req);
  const status=await req.app.locals.ai.deviceStatus(device.id,device);
  const results=status.model?.status==='ready'?await AiResult.find({device_id:device.id,model_id:status.model.id}).sort({recorded_at:-1}).limit(150).lean():[];
  res.json({...status,results:results.reverse().map(toPublic)});
}
export async function trainDevice(req,res) {
  const device=await scopedDevice(req,true);
  const input=z.object({days:z.number().int().min(1).max(30).default(7),includeDemo:z.boolean().default(false),confirmedNormal:z.literal(true)}).strict().parse(req.body);
  res.status(202).json(await req.app.locals.ai.train(device,req.user,input));
}
export async function loginHistory(req,res) {
  const events=await LoginEvent.find({user_id:req.user.id}).sort({occurred_at:-1}).limit(100).lean();
  res.json({profile:analyzeLogin(events,new Date()),events:events.map(toPublic)});
}
export async function securityAlerts(req,res) {
  const mine=req.query.mine==='true'||req.user.role!=='admin';
  const alerts=await AccountAlert.find(mine?{user_id:req.user.id}:{}).sort({created_at:-1}).limit(100).lean();
  const users=await User.find({_id:{$in:alerts.map(a=>a.user_id)}}).select('name').lean();
  res.json(alerts.map(a=>({...toPublic(a),user_name:users.find(u=>u._id===a.user_id)?.name||'Tài khoản'})));
}
export async function reviewLogin(req,res) {
  const input=z.object({decision:z.enum(['expected','unrecognized'])}).strict().parse(req.body);
  res.json(await req.app.locals.ai.reviewAccount(req.user,req.params.id,input.decision));
}
