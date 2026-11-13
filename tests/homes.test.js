import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../backend/src/app.js';
import { startTestDatabase } from './helpers/mongodb.js';
import { passwordSchema } from '../backend/src/validation/schemas.js';
let application, database, base, admin, operator, viewer, stranger, homeA, homeB, roomB;
async function request(auth,path,method='GET',body) {
  const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...(auth?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrfToken}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json()};
}
async function login(email,password) {
  const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  assert.equal(response.status,200);return {cookie:response.headers.get('set-cookie').split(';')[0],...(await response.json())};
}
before(async()=>{
  const result=await startTestDatabase('nodo_homes_test');database=result.database;
  application=await createApplication(result.config);
  await new Promise(resolve=>application.server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${application.server.address().port}`;
  admin=await login('admin@nodo.local','Admin@12345');operator=await login('operator@nodo.local','Operator@12345');viewer=await login('viewer@nodo.local','Viewer@12345');
  homeA=(await request(operator,'/homes')).body[0];
  assert.equal((await request(null,'/auth/register','POST',{name:'Chủ nhà B',email:'houseb@example.com',password:'HouseB@12345',role:'operator'})).status,201);
  stranger=await login('houseb@example.com','HouseB@12345');
  homeB=(await request(stranger,'/homes','POST',{name:'Nhà B'})).body;
  roomB=(await request(stranger,`/homes/${homeB.id}/rooms`,'POST',{name:'Phòng ngủ'})).body;
});
after(async()=>{if(application)await application.close();if(database)await database.stop();});
test('legacy nodes move into a home and room without changing device IDs',async()=>{
  const detail=await request(operator,'/homes/'+homeA.id);
  assert.equal(detail.body.devices.length,2);assert.equal(detail.body.rooms.length,1);
  assert.ok(detail.body.devices.every(d=>d.home_id===homeA.id&&d.room_id===detail.body.rooms[0].id));
  assert.equal((await request(viewer,'/homes/'+homeA.id)).body.access_role,'viewer');
});
test('cross-home reads, commands, history, rooms and invitations are forbidden',async()=>{
  for(const [path,method,body] of [
    ['/homes/'+homeA.id,'GET'],['/devices/node-01','GET'],['/telemetry?deviceId=node-01','GET'],
    [`/devices?homeId=${homeA.id}`,'GET'],[`/homes/${homeA.id}/rooms`,'POST',{name:'X'}],
    [`/homes/${homeA.id}/invitations`,'POST',{email:'x@example.com'}],
    ['/devices/node-01/config','PATCH',{mode:'MANUAL',fanOn:30,fanOff:28,temperatureAlert:35}],
  ])assert.equal((await request(stranger,path,method,body)).status,403,path);
  assert.ok(!(await request(stranger,'/devices')).body.some(d=>d.id==='node-01'));
  assert.ok(!(await request(stranger,'/alerts')).body.some(a=>a.device_id==='node-01'));
});
test('viewer cannot create houses, edit rooms, rename devices, invite or read audit',async()=>{
  for(const [path,method,body] of [
    ['/homes','POST',{name:'Viewer home'}],[`/homes/${homeA.id}/rooms`,'POST',{name:'Viewer room'}],
    [`/homes/${homeA.id}/invitations`,'POST',{email:'guest@example.com'}],
    [`/homes/${homeA.id}/devices/node-01`,'PATCH',{name:'Renamed',room_id:null}],
  ])assert.equal((await request(viewer,path,method,body)).status,403);
  assert.deepEqual((await request(viewer,'/homes/'+homeA.id)).body.audit,[]);
});
test('operator creates, renames and deletes own rooms, but cannot delete occupied rooms',async()=>{
  const created=await request(operator,`/homes/${homeA.id}/rooms`,'POST',{name:'Bếp'});assert.equal(created.status,201);
  assert.equal((await request(operator,`/homes/${homeA.id}/rooms/${created.body.id}`,'PATCH',{name:'Bếp mới'})).status,200);
  const oldRoom=(await request(operator,'/homes/'+homeA.id)).body.rooms.find(r=>r.id!==created.body.id);
  assert.equal((await request(operator,`/homes/${homeA.id}/rooms/${oldRoom.id}`,'DELETE')).status,409);
  assert.equal((await request(operator,`/homes/${homeA.id}/rooms/${created.body.id}`,'DELETE')).status,200);
  assert.equal((await request(operator,`/homes/${homeA.id}/devices/node-01`,'PATCH',{name:'X node',room_id:roomB.id})).status,400);
});
test('claim needs a private single-use code and a room in the target home',async()=>{
  assert.equal((await request(admin,'/devices','POST',{id:'claim-node',name:'Node bàn giao',profile:'lighting',location:'Kho'})).status,201);
  await request(admin,'/devices/claim-node/lifecycle','POST',{state:'provisioned'});
  const code=(await request(admin,'/devices/claim-node/claim-code','POST')).body.code;
  assert.ok(code.length>=24);
  assert.equal((await request(stranger,`/homes/${homeB.id}/claim`,'POST',{deviceId:'claim-node',code:'x'.repeat(32),room_id:roomB.id})).status,409);
  assert.equal((await request(stranger,`/homes/${homeB.id}/claim`,'POST',{deviceId:'claim-node',code,room_id:roomB.id})).status,200);
  assert.equal((await request(operator,`/homes/${homeA.id}/claim`,'POST',{deviceId:'claim-node',code,room_id:null})).status,409);
  assert.equal((await request(operator,'/devices/claim-node')).status,403);
  assert.ok(!JSON.stringify((await request(admin,'/devices/claim-node')).body).includes(code));
  assert.ok(!JSON.stringify((await request(admin,'/audit')).body).includes(code));
});
test('invitation is email-bound, single-use, scoped, revocable and expires',async()=>{
  const invitation=(await request(operator,`/homes/${homeA.id}/invitations`,'POST',{email:'houseb@example.com'})).body;
  assert.ok(invitation.token&&!invitation.token_hash);
  assert.equal((await request(viewer,'/homes/accept-invitation','POST',{token:invitation.token})).status,409);
  assert.equal((await request(stranger,'/homes/accept-invitation','POST',{token:invitation.token})).status,200);
  assert.equal((await request(stranger,'/homes/accept-invitation','POST',{token:invitation.token})).status,409);
  assert.equal((await request(stranger,'/homes/'+homeA.id)).body.access_role,'viewer');
  assert.equal((await request(stranger,'/devices/node-01/commands','POST',{actuator:'fan',value:true})).status,403);
  assert.ok(!(await request(operator,`/homes/${homeA.id}/invitations`)).body.some(i=>i.token||i.token_hash));
  await request(operator,`/homes/${homeA.id}/members/${stranger.user.id}`,'DELETE');
  assert.equal((await request(stranger,'/devices/node-01')).status,403);
  const pending=(await request(operator,`/homes/${homeA.id}/invitations`,'POST',{email:'houseb@example.com'})).body;
  await application.models.Invitation.updateOne({_id:pending.id},{$set:{expires_at:new Date(Date.now()-1000)}});
  assert.equal((await request(stranger,'/homes/accept-invitation','POST',{token:pending.token})).status,409);
  const revoked=(await request(operator,`/homes/${homeA.id}/invitations`,'POST',{email:'houseb@example.com'})).body;
  await request(operator,`/homes/${homeA.id}/invitations/${revoked.id}`,'DELETE');
  assert.equal((await request(stranger,'/homes/accept-invitation','POST',{token:revoked.token})).status,409);
});
test('member removal immediately revokes data access even when legacy viewer_ids still exists',async()=>{
  assert.equal((await request(operator,`/homes/${homeA.id}/members/${viewer.user.id}`,'DELETE')).status,200);
  assert.equal((await request(viewer,'/devices/node-01')).status,403);
  assert.equal((await request(viewer,'/telemetry?deviceId=node-01')).status,403);
  assert.equal((await request(operator,`/homes/${homeA.id}/members/${operator.user.id}`,'DELETE')).status,409);
});
test('admin audit can filter by home and does not mix in other homes',async()=>{
  const logs=(await request(admin,'/audit?homeId='+homeA.id)).body;
  assert.ok(logs.length>0);assert.ok(logs.every(l=>l.home_id===homeA.id));
});
test('heartbeat and telemetry do not silently clear hardware faults; old data does not replace live state',async()=>{
  await application.iot.pause('node-01',true);
  await application.iot.receiveStatus('node-01',{online:true,fault:'fan_motor_stuck'});
  const fresh={deviceId:'node-01',bootId:'resilience',seq:1,timestamp:new Date().toISOString(),readings:{temperature:29,humidity:60},state:{fan:true}};
  await application.iot.ingest('node-01',fresh);
  await application.iot.receiveStatus('node-01',{online:true});
  assert.equal((await application.iot.device('node-01')).fault,'fan_motor_stuck');
  await application.iot.ingest('node-01',{...fresh,seq:2,timestamp:new Date(Date.now()-3600_000).toISOString(),readings:{temperature:70,humidity:60},state:{fan:false}});
  const d=await application.iot.device('node-01');assert.equal(d.reported_state.fan,true);assert.equal(d.latest.temperature,29);
  assert.equal(await application.models.Alert.countDocuments({device_id:'node-01',kind:'temperature',status:'open',created_at:{$gt:new Date(Date.now()-3000)}}),0);
  await application.iot.receiveStatus('node-01',{online:true,fault:null});
  assert.equal((await application.iot.device('node-01')).fault,null);
});
test('heartbeat online with old measurements is marked stale; offline commands are rejected',async()=>{
  await application.models.Telemetry.updateMany({device_id:'node-01'},{$set:{recorded_at:new Date(Date.now()-120_000)}});
  await application.iot.receiveStatus('node-01',{online:true});
  assert.equal((await application.iot.device('node-01')).connection,'online');assert.equal((await application.iot.device('node-01')).data_status,'stale');
  await application.iot.receiveStatus('node-01',{online:false});
  assert.equal((await request(operator,'/devices/node-01/config','PATCH',{mode:'MANUAL',fanOn:30,fanOff:28,temperatureAlert:35})).status,409);
});
test('ACK database failure leaves a durable receipt and is recoverable without falsely marking applied',async()=>{
  await application.iot.receiveStatus('node-01',{online:true});
  const command=await request(operator,'/devices/node-01/config','PATCH',{mode:'MANUAL',fanOn:31,fanOff:28,temperatureAlert:35});assert.equal(command.status,202);
  const Device=application.models.Device, original=Device.updateOne;
  Device.updateOne=function(filter,update,...rest){if(update?.$set?.config)throw new Error('Injected storage failure');return original.call(this,filter,update,...rest);};
  try {await assert.rejects(application.iot.acknowledge('node-01',{commandId:command.body.id,status:'applied',state:{mode:'MANUAL'}}));}
  finally {Device.updateOne=original;}
  const pending=await application.models.Command.findById(command.body.id).lean();assert.equal(pending.status,'pending');assert.ok(pending.ack_received_at);
  await application.models.Command.updateOne({_id:pending._id},{$set:{expires_at:new Date(Date.now()-1000)}});
  await application.iot.acknowledge('node-01',{commandId:pending._id,status:'applied'});
  assert.equal((await application.models.Command.findById(pending._id)).status,'applied');assert.equal((await application.iot.device('node-01')).config.fanOn,31);
});
test('registration cannot create system admins or passwords truncated by bcrypt',async()=>{
  assert.equal((await request(null,'/auth/register','POST',{name:'Bad admin',email:'badadmin@example.com',password:'Password@12345',role:'admin'})).status,400);
  assert.equal(passwordSchema.safeParse('A'.repeat(72)+'1').success,false);
  assert.equal(passwordSchema.safeParse('ộ'.repeat(25)).success,false);
});
