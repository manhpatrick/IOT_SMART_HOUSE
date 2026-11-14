import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApplication} from '../backend/src/app.js';
import {startTestDatabase} from './helpers/mongodb.js';
let app,db,base,seq=0;
before(async()=>{const t=await startTestDatabase('nodo_multisensor_test');db=t.database;app=await createApplication(t.config);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;});
after(async()=>{await app?.close();await db?.stop();});
const packet=(readings)=>({deviceId:'node-01',bootId:'multi-test',seq:seq++,timestamp:new Date().toISOString(),readings,state:{fan:false,buzzer:false,light:true,mode:'MANUAL'}});
async function auth(role){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:role+'@nodo.local',password:{admin:'Admin@12345',operator:'Operator@12345',viewer:'Viewer@12345'}[role]})});return {cookie:r.headers.get('set-cookie').split(';')[0],...(await r.json())};}
async function request(a,path,method='GET',body){const r=await fetch(base+'/api'+path,{method,headers:{cookie:a.cookie,'X-CSRF-Token':a.csrfToken,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};}
async function waitFor(fn){const until=Date.now()+10000;while(Date.now()<until){if(await fn())return;await new Promise(r=>setTimeout(r,60));}throw Error('Timed out');}

test('one node stores all sensing groups and reported outputs in one deduplicated sample',async()=>{
 await app.models.Device.updateOne({_id:'node-01'},{$set:{'config.mode':'MANUAL'}});
 const data=packet({temperature:29.2,humidity:65.1,lightPercent:28,gasRaw:650});
 assert.deepEqual(await app.iot.ingest('node-01',data),{accepted:true});assert.deepEqual(await app.iot.ingest('node-01',data),{duplicate:true});
 const rows=await app.models.Telemetry.find({device_id:'node-01',boot_id:'multi-test',seq:data.seq}).lean();assert.equal(rows.length,1);
 assert.deepEqual([rows[0].temperature,rows[0].humidity,rows[0].light_percent,rows[0].gas_raw],[29.2,65.1,28,650]);
 const d=await app.iot.device('node-01');assert.equal(d.reported_state.light,true);assert.equal(d.gas_raw,650);
 const a=await auth('operator');const csv=await request(a,'/telemetry?deviceId=node-01&format=csv');assert.match(csv.body,/29\.2,65\.1,28,650/);
});

test('invalid light/gas values reject the entire sample and old DHT-only payloads remain compatible',async()=>{
 for(const readings of [{temperature:25,humidity:60,lightPercent:101,gasRaw:650},{temperature:25,humidity:60,lightPercent:-1},{temperature:25,humidity:60,lightPercent:28,gasRaw:1.5},{lightPercent:28,gasRaw:650}]){
  const data=packet(readings);await assert.rejects(app.iot.ingest('node-01',data));assert.equal(await app.models.Telemetry.countDocuments({boot_id:data.bootId,seq:data.seq}),0);
 }
 const old=packet({temperature:25,humidity:60});await app.iot.ingest('node-01',old);
 const row=await app.models.Telemetry.findOne({boot_id:old.bootId,seq:old.seq});assert.equal(row.light_percent,null);assert.equal(row.gas_raw,null);
 assert.equal((await app.iot.device('node-01')).gas_raw,650,'Missing gas must not fabricate a new zero reading');
});

test('existing climate configuration gains default light thresholds; changes wait for ACK and preserve other sensors',async()=>{
 await app.models.Device.updateOne({_id:'node-01'},{$unset:{'config.lightOn':'','config.lightOff':''}});
 let d=await app.iot.device('node-01');assert.equal(d.config.lightOn,30);assert.equal(d.config.lightOff,45);
 const a=await auth('operator');assert.equal((await request(a,'/devices/node-01/config','PATCH',{lightOn:50,lightOff:40})).status,400);
 const response=await request(a,'/devices/node-01/config','PATCH',{lightOn:22,lightOff:48});assert.equal(response.status,202);
 assert.equal((await app.iot.device('node-01')).config.lightOn,30);
 await app.iot.acknowledge('node-01',{commandId:response.body.id,status:'applied',state:{mode:'MANUAL'}});
 d=await app.iot.device('node-01');assert.equal(d.config.lightOn,22);assert.equal(d.config.lightOff,48);assert.equal(d.config.fanOn,30);assert.equal(d.config.gasThreshold,1200);
});

test('operator controls LED on the same node with ACK; viewer cannot control LED or thresholds',async()=>{
 const a=await auth('operator');const response=await request(a,'/devices/node-01/commands','POST',{actuator:'light',value:false,channel:'voice'});assert.equal(response.status,202);
 assert.equal((await app.iot.device('node-01')).reported_state.light,true,'Do not optimistically apply command');
 await app.iot.acknowledge('node-01',{commandId:response.body.id,status:'applied',state:{light:false}});
 assert.equal((await app.iot.device('node-01')).reported_state.light,false);
 const v=await auth('viewer');assert.equal((await request(v,'/devices/node-01/commands','POST',{actuator:'light',value:true})).status,403);
 assert.equal((await request(v,'/devices/node-01/config','PATCH',{lightOn:20,lightOff:40})).status,403);
});

test('demo Auto runs fan and light hysteresis independently on a single node',async()=>{
 // Actual ESP32 Auto remains firmware work. Here the simulator exercises both branches.
 await app.models.Device.updateOne({_id:'node-01'},{$set:{'config.mode':'AUTO',manual_overrides:{},'config.fanOn':15,'config.fanOff':10,'config.lightOn':90,'config.lightOff':99,'reported_state.fan':false,'reported_state.light':false}});
 await waitFor(async()=>{const d=await app.iot.device('node-01');return d.reported_state.fan===true&&d.reported_state.light===true;});
 await app.models.Device.updateOne({_id:'node-01'},{$set:{'config.fanOn':60,'config.fanOff':55,'config.lightOn':0,'config.lightOff':1}});
 await waitFor(async()=>{const d=await app.iot.device('node-01');return d.reported_state.fan===false&&d.reported_state.light===false;});
});

test('admin monitors all nodes but cannot send manual/voice commands or change mode',async()=>{
 const a=await auth('admin');const d=await app.iot.device('node-01');
 for(const channel of ['manual','voice'])for(const actuator of ['fan','light','buzzer']){
  assert.equal((await request(a,'/devices/node-01/commands','POST',{actuator,value:true,channel})).status,403);
 }
 assert.equal((await request(a,'/devices/node-01/config','PATCH',{mode:d.config.mode==='AUTO'?'MANUAL':'AUTO'})).status,403);
 assert.equal((await request(a,'/devices')).status,200);assert.equal((await request(a,'/telemetry?deviceId=node-02')).status,200);
});

test('admin cannot bypass claim or home invitations by assigning device ownership',async()=>{
 const a=await auth('admin'),before=await app.iot.device('node-01');
 const body={id:'claim-only-01',name:'New device',profile:'climate',location:'Kho',owner_id:'user-operator'};
 assert.equal((await request(a,'/devices','POST',body)).status,400);
 assert.equal(await app.models.Device.countDocuments({_id:body.id}),0);
 for(const fields of [{owner_id:null},{home_id:null},{room_id:null},{viewer_ids:['user-viewer']}]){
  assert.equal((await request(a,'/devices/node-01','PATCH',{name:before.name,...fields})).status,400);
 }
 assert.equal((await request(a,'/devices/node-01','PATCH',{name:before.name})).status,200);
 const after=await app.iot.device('node-01');assert.equal(after.owner_id,before.owner_id);assert.equal(after.home_id,before.home_id);assert.equal(after.room_id,before.room_id);
});

test('remote control coexists with automatic rules; hold expires and thermal alarm wins',async()=>{
 await app.models.Device.updateOne({_id:'node-01'},{$set:{'config.mode':'AUTO','config.lightOn':90,'config.lightOff':99,manual_overrides:{}}});
 const a=await auth('operator');const cmd=await request(a,'/devices/node-01/commands','POST',{actuator:'light',value:false});assert.equal(cmd.status,202);
 await app.iot.acknowledge('node-01',{commandId:cmd.body.id,status:'applied',state:{light:false}});
 let d=await app.iot.device('node-01');assert.equal(d.manual_overrides.light.value,false);assert.ok(Date.parse(d.manual_overrides.light.until)>Date.now()+290000);
 await new Promise(r=>setTimeout(r,4500));assert.equal((await app.iot.device('node-01')).reported_state.light,false);
 await app.models.Device.updateOne({_id:'node-01'},{$set:{'manual_overrides.light.until':new Date(0)}});
 await waitFor(async()=> (await app.iot.device('node-01')).reported_state.light===true);
 await app.iot.ingest('node-01',packet({temperature:40,humidity:60,lightPercent:20,gasRaw:650}));
 assert.equal((await request(a,'/devices/node-01/commands','POST',{actuator:'fan',value:false})).status,409);
});
