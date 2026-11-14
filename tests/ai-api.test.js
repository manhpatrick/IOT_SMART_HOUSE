import {ensureLoginBootstrap} from '../backend/src/services/login-bootstrap.service.js';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApplication} from '../backend/src/app.js';
import {startTestDatabase} from './helpers/mongodb.js';
let app,database,base,admin,operator,viewer;
async function call(auth,path,method='GET',body){const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...(auth?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrfToken}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};}
async function login(role){const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:role+'@nodo.local',password:{admin:'Admin@12345',operator:'Operator@12345',viewer:'Viewer@12345'}[role]})});assert.equal(response.status,200);return {cookie:response.headers.get('set-cookie').split(';')[0],...await response.json()};}
before(async()=>{const result=await startTestDatabase('nodo_ai_api');database=result.database;app=await createApplication(result.config);await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${app.server.address().port}`;admin=await login('admin');operator=await login('operator');viewer=await login('viewer');});
after(async()=>{if(app)await app.close();if(database)await database.stop();});
test('AI cold start is explicit, authenticated, and viewer cannot train',async()=>{
  assert.equal((await call(null,'/ai/summary')).status,401);
  assert.equal(operator.loginAnalysis.status,'insufficient_data');
  assert.equal((await call(viewer,'/ai/devices/node-01/train','POST',{confirmedNormal:true,includeDemo:true})).status,403);
  assert.equal((await call(operator,'/ai/devices/node-01/train','POST',{confirmedNormal:true})).status,400,'Demo data is not silently used as hardware training data');
  assert.equal((await call(operator,'/ai/devices/node-02/train','POST',{confirmedNormal:true})).status,400);
});
test('a real worker trains and persists a marked demo model without exposing its weights',async()=>{
  const end=Math.floor(Date.now()/10000)*10000,rows=Array.from({length:600},(_,i)=>({device_id:'node-01',source:'demo',boot_id:'ai-fixture',seq:i,recorded_at:new Date(end-(600-i)*10000),temperature:27+Math.sin(i/25),humidity:64+3*Math.cos(i/28)}));
  await app.models.Telemetry.insertMany(rows);
  const response=await call(operator,'/ai/devices/node-01/train','POST',{confirmedNormal:true,includeDemo:true});assert.equal(response.status,202);
  let model;const deadline=Date.now()+15000;
  do{model=await app.models.AiModel.findById(response.body.id).lean();if(model.status!=='training')break;await new Promise(r=>setTimeout(r,100));}while(Date.now()<deadline);
  assert.equal(model.status,'ready',model.error);assert.equal(model.data_source,'demo_or_mixed');assert.ok(model.report.test.temperature.mae>=0);assert.ok(model.report.test_preview.length>0&&model.report.test_preview.length<=120);assert.ok(model.report.test_preview.every(p=>p.prediction.every(Number.isFinite)));
  assert.ok(!('artifact'in model));
  const api=await call(operator,'/ai/devices/node-01');assert.equal(api.body.model.status,'ready');assert.ok(!JSON.stringify(api.body).includes('"wx"'));
  const result=await app.ai.analyzeDevice('node-01');assert.ok(['normal','anomaly'].includes(result.status));
  assert.ok(await app.models.AiResult.exists({model_id:model._id}));
});
test('sensor AI endpoints enforce house scope even if the device/model ID is known',async()=>{
  assert.equal((await call(null,'/auth/register','POST',{name:'Other home',email:'other@example.com',password:'OtherHome@12345',role:'operator'})).status,201);
  const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'other@example.com',password:'OtherHome@12345'})});
  const stranger={cookie:response.headers.get('set-cookie').split(';')[0],...await response.json()};
  const summary=await call(viewer,'/ai/summary');assert.equal(summary.status,200);
  assert.equal((await call(stranger,'/ai/devices/node-01')).status,403);
  assert.equal((await call(stranger,'/ai/devices/node-01/train','POST',{confirmedNormal:true})).status,403);
  assert.deepEqual((await call(stranger,'/ai/summary')).body.devices,[]);
});
test('a failed retraining job preserves the last ready model and its report',async()=>{
  const ready=await app.models.AiModel.findOne({device_id:'node-01',status:'ready'}).lean();
  await app.models.AiModel.create({device_id:'node-01',trained_by:operator.user.id,data_source:'demo_or_mixed',status:'failed',error:'Injected failed retraining',created_at:new Date(Date.now()+1000)});
  const result=await call(operator,'/ai/devices/node-01');
  assert.equal(result.body.model.id,ready._id);assert.equal(result.body.model.status,'ready');assert.equal(result.body.training_job.status,'failed');
});
test('an unusual successful login creates a private alert but does not block the account',async()=>{
  const date=new Date('2026-11-10T20:00:00Z'),history=[];
  for(let day=1;day<=12;day++)for(const hour of [8,12])history.push({user_id:operator.user.id,occurred_at:new Date(Date.UTC(2026,9,day,hour-7,12)),status:'normal',source:'test_fixture',expires_at:new Date(Date.now()+120*86400_000)});
  await app.models.LoginEvent.insertMany(history);
  const result=await app.ai.recordLogin(operator.user,date);assert.equal(result.status,'anomaly');
  const privateAlerts=await call(operator,'/ai/security-alerts');assert.equal(privateAlerts.body.length,1);
  assert.equal((await call(viewer,'/ai/security-alerts')).body.length,0);
  assert.equal((await call(viewer,'/ai/login-history')).body.events.every(e=>e.user_id===viewer.user.id),true);
  const id=privateAlerts.body[0].id;
  assert.equal((await call(admin,'/ai/security-alerts/'+id+'/review','PATCH',{decision:'expected'})).status,403,'Admin cannot teach another user a fake baseline');
  assert.equal((await call(operator,'/ai/security-alerts/'+id+'/review','PATCH',{decision:'expected'})).status,200);
  assert.equal((await app.models.LoginEvent.findById(result.event_id)).review,'expected');
  assert.equal((await app.models.User.findById(operator.user.id)).status,'active');
  assert.equal((await call(operator,'/ai/security-alerts/'+id+'/review','PATCH',{decision:'unrecognized'})).status,409);
});
test('AI analysis failure does not break successful authentication',async()=>{
  const original=app.ai.recordLogin;app.ai.recordLogin=async()=>{throw new Error('Injected AI failure');};
  try {const result=await login('viewer');assert.equal(result.loginAnalysis.status,'unavailable');assert.equal((await call(result,'/devices')).status,200);}
  finally {app.ai.recordLogin=original;}
});

test('seed history is one-time, scoped and combines with real events without rewriting them',async()=>{
 const before=await app.models.LoginEvent.countDocuments({user_id:'user-operator',source:'server'});
 await Promise.all([ensureLoginBootstrap('user-operator'),ensureLoginBootstrap('user-operator')]);
 assert.equal(await app.models.LoginEvent.countDocuments({user_id:'user-operator',source:'bootstrap'}),32);
 await ensureLoginBootstrap('user-operator');assert.equal(await app.models.LoginEvent.countDocuments({user_id:'user-operator',source:'bootstrap'}),32);
 assert.equal(await app.models.LoginEvent.countDocuments({user_id:'user-viewer',source:'bootstrap'}),0);
 assert.equal(await app.models.LoginEvent.countDocuments({user_id:'user-operator',source:'server'}),before);
 const history=await call(operator,'/ai/login-history');assert.notEqual(history.body.profile.status,'insufficient_data');assert.equal(history.body.events.some(e=>e.source==='bootstrap'),false);assert.ok(history.body.events.every(e=>e.user_name===operator.user.name));assert.equal(history.body.latest_evaluation.event_id,history.body.events[0].id);assert.equal(history.body.training.seed_events,32);assert.equal(history.body.profile.learning.hours.length,24);assert.equal(history.body.profile.learning.density.length,145);assert.equal(history.body.profile.learning.hours.reduce((n,h)=>n+h.seed+h.observed,0),history.body.profile.baseline_events);assert.equal(history.body.profile.learning.density[0].value,history.body.profile.learning.density[144].value);
 assert.equal((await call(viewer,'/ai/login-example')).status,404);
});
