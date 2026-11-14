import { z } from 'zod';
import { AiResult, AccountAlert, LoginEvent, User } from '../../../database/models/index.js';
import { toPublic } from '../../../database/models/base.js';
import { scopedDevice, devicesFor, canWrite } from '../services/device.service.js';
import { analyzeLogin } from '../ai/login-model.js';
import {ensureLoginBootstrap} from '../services/login-bootstrap.service.js';

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
  if(req.app.locals.config.loginSeed)await ensureLoginBootstrap(req.user.id);
  const now=new Date();
  const [history,events]=await Promise.all([
    LoginEvent.find({user_id:req.user.id,occurred_at:{$lt:now,$gte:new Date(now.getTime()-90*86400000)}}).sort({occurred_at:-1}).limit(1000).lean(),
    LoginEvent.find({user_id:req.user.id,source:{$in:['server','legacy_audit']}}).sort({occurred_at:-1}).limit(100).lean(),
  ]);
  const latest=events[0];
  res.json({profile:analyzeLogin(history,now,{includeLearning:true}),events:events.map(e=>({...toPublic(e),user_name:req.user.name,user_email:req.user.email})),
    latest_evaluation:latest?{event_id:latest._id,occurred_at:latest.occurred_at,user_name:req.user.name,...(latest.analysis||{status:latest.status})}:null,
    training:{seed_events:history.filter(e=>e.source==='bootstrap').length,observed_events:history.filter(e=>e.source!=='bootstrap').length}});
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
