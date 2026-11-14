import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApplication} from '../backend/src/app.js';
import {startTestDatabase} from './helpers/mongodb.js';
let app,db,base,seq=0;
before(async()=>{const t=await startTestDatabase('nodo_gas_test');db=t.database;app=await createApplication(t.config);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;});
after(async()=>{await app?.close();await db?.stop();});
const ingest=(gas,time=Date.now())=>app.iot.ingest('node-01',{deviceId:'node-01',bootId:'gas-tests',seq:seq++,timestamp:new Date(time).toISOString(),readings:{temperature:25,humidity:60,...(gas===undefined?{}:{gasRaw:gas})},state:{mode:'MANUAL'}});
async function waitFor(predicate){const until=Date.now()+8000;while(Date.now()<until){const result=await predicate();if(result)return result;await new Promise(r=>setTimeout(r,70));}throw Error('Timed out');}
async function auth(role){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:role+'@nodo.local',password:{admin:'Admin@12345',viewer:'Viewer@12345',operator:'Operator@12345'}[role]})});return {cookie:r.headers.get('set-cookie').split(';')[0],...(await r.json())};}
async function request(a,path,method='GET',body){const r=await fetch(base+'/api'+path,{method,headers:{cookie:a.cookie,'X-CSRF-Token':a.csrfToken,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}

test('gas validates raw ADC/profile, persists history and deduplicates active alerts',async()=>{
 await app.models.Device.updateOne({_id:'node-01'},{$set:{'config.mode':'MANUAL'}});
 await assert.rejects(ingest(4096));await assert.rejects(ingest(1.5));await assert.rejects(ingest(-1));
 await assert.rejects(app.iot.ingest('node-02',{deviceId:'node-02',bootId:'gas-tests',seq:1,timestamp:new Date().toISOString(),readings:{lightPercent:50,gasRaw:1200}}));
 await ingest(1400);await ingest(1500);
 assert.equal(await app.models.Alert.countDocuments({device_id:'node-01',kind:'gas',status:'open'}),1);
 assert.equal((await app.models.Telemetry.findOne({device_id:'node-01',boot_id:'gas-tests'}).sort({seq:-1})).gas_raw,1500);
 assert.equal((await app.iot.device('node-01')).gas_alarm_active,true);
 const a=await auth('admin');const alerts=await request(a,'/alerts');const gas=alerts.body.find(x=>x.kind==='gas'&&x.status==='open');
 await request(a,'/alerts/'+gas.id+'/acknowledge','PATCH');await ingest(1450);
 assert.equal(await app.models.Alert.countDocuments({device_id:'node-01',kind:'gas',status:{$in:['open','acknowledged']}}),1);
});

test('gas rule drives buzzer with ACK in Manual, blocks manual off and avoids command flooding',async()=>{
 const cmd=await waitFor(()=>app.models.Command.findOne({device_id:'node-01',source:'gas_rule','payload.value':true}).lean());
 assert.equal(cmd.actor_id,null);assert.deepEqual(cmd.payload,{actuator:'buzzer',value:true});
 await waitFor(async()=> (await app.iot.device('node-01')).reported_state.buzzer===true);
 const admin=await auth('admin');const off=await request(admin,'/devices/node-01/commands','POST',{actuator:'buzzer',value:false});assert.equal(off.status,409);
 const viewer=await auth('viewer');assert.equal((await request(viewer,'/devices/node-01/config','PATCH',{gasThreshold:1700,gasClearThreshold:1100})).status,403);
 assert.equal((await request(viewer,'/devices/node-01/commands','POST',{actuator:'buzzer',value:true})).status,403);
 await ingest(1800);assert.equal(await app.models.Command.countDocuments({device_id:'node-01',source:'gas_rule','payload.value':true}),1);
});

test('gas missing/old readings do not clear alarm; hysteresis clears with fresh low sample and releases owned buzzer',async()=>{
 const before=(await app.iot.device('node-01')).gas_recorded_at;
 await ingest(undefined);await ingest(0,Date.now()-120000);
 assert.equal((await app.iot.device('node-01')).gas_alarm_active,true);
 assert.equal(Date.parse((await app.iot.device('node-01')).gas_recorded_at),Date.parse(before));
 await ingest(1100);assert.equal((await app.iot.device('node-01')).gas_alarm_active,true);
 await ingest(1000);assert.equal((await app.iot.device('node-01')).gas_alarm_active,false);
 assert.equal(await app.models.Alert.countDocuments({device_id:'node-01',kind:'gas',status:'resolved'}),1);
 await waitFor(async()=> (await app.iot.device('node-01')).reported_state.buzzer===false);
 assert.ok(await app.models.Command.exists({device_id:'node-01',source:'gas_rule','payload.value':false,status:'applied'}));
});

test('gas config keeps confirmed values until ACK, validates thresholds and exports gas raw',async()=>{
 const admin=await auth('admin');
 assert.equal((await request(admin,'/devices/node-01/config','PATCH',{gasThreshold:1000,gasClearThreshold:1100})).status,400);
 const r=await request(admin,'/devices/node-01/config','PATCH',{gasThreshold:1700,gasClearThreshold:1200});assert.equal(r.status,202);
 assert.equal((await app.iot.device('node-01')).config.gasThreshold,1200);
 await waitFor(async()=> (await app.iot.device('node-01')).config.gasThreshold===1700);
 const csv=await fetch(base+'/api/telemetry?deviceId=node-01&format=csv',{headers:{cookie:admin.cookie}});assert.match(await csv.text(),/gas_raw/);
 const history=await request(admin,'/telemetry?deviceId=node-01');assert.ok(history.body.some(row=>row.gas_raw===1500));
});

test('Auto gas alarm does not change mode and rejects an applied ACK with wrong buzzer state',async()=>{
 const template=await app.iot.device('node-01');
 await app.models.Device.create({_id:'gas-auto-01',name:'Gas Auto test',profile:'climate',location:'Lab',lifecycle:'active',last_seen:new Date(),config:{...template.config,mode:'AUTO'},reported_state:{buzzer:false,mode:'AUTO'}});
 await app.iot.ingest('gas-auto-01',{deviceId:'gas-auto-01',bootId:'auto-test',seq:1,timestamp:new Date().toISOString(),readings:{temperature:25,humidity:60,gasRaw:2500}});
 const cmd=await waitFor(()=>app.models.Command.findOne({device_id:'gas-auto-01',source:'gas_rule',status:'pending'}).lean());
 await app.iot.acknowledge('gas-auto-01',{commandId:cmd._id,status:'applied',state:{buzzer:false}});
 assert.equal((await app.models.Command.findById(cmd._id)).status,'failed');
 assert.equal((await app.iot.device('gas-auto-01')).config.mode,'AUTO');
 // Demo firmware may independently enable its local gas rule; the bad ACK must not become applied.
 assert.notEqual((await app.models.Command.findById(cmd._id)).status,'applied');
});
