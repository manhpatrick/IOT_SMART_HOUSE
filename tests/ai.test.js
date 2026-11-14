import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialize,forward,lossGradient } from '../backend/src/ai/rnn.js';
import { prepareSeries,makeWindows,trainSensor,scoreSensor } from '../backend/src/ai/sensor-model.js';
import { analyzeLogin,localLoginTime,circularDistance,loginExample } from '../backend/src/ai/login-model.js';

test('one-day history can calibrate with six unique hour slots without waiting five days',()=>{
 const history=[8,9,10,11,12,13].map(hour=>({occurred_at:new Date(Date.UTC(2026,9,19,hour-7,10)),status:'normal'}));
 const familiar=analyzeLogin(history,new Date('2026-10-20T03:00:00Z'));
 assert.equal(familiar.status,'normal');assert.equal(familiar.min_days,1);assert.equal(familiar.confidence,'preliminary');assert.match(familiar.calibration,/slot/);
 assert.equal(analyzeLogin(history,new Date('2026-10-19T20:00:00Z')).status,'anomaly');
 const demo=loginExample();assert.equal(demo.persisted,false);assert.deepEqual(demo.examples.map(e=>e.analysis.status),['normal','anomaly']);
});

export function sensorFixture(count=600,end=Date.now()) {
  const start=Math.floor(end/10000)*10000-count*10000;
  return Array.from({length:count},(_,i)=>({recorded_at:new Date(start+i*10000).toISOString(),temperature:27+1.2*Math.sin(i/25)+.2*Math.sin(i/7),humidity:64+3*Math.cos(i/28),source:'demo'}));
}
export function loginFixture(hour=8) {
  const rows=[];
  for(let day=1;day<=12;day++)for(const time of [hour,hour+4])rows.push({occurred_at:new Date(Date.UTC(2026,9,day,time-7,10+day%5)),status:'normal',review:'pending'});
  return rows;
}
test('RNN BPTT gradient agrees with independent finite differences',()=>{
  const model=initialize(3,7),sequence=[[.2,-.1],[.3,.05],[-.1,.4]],target=[.1,-.2];
  const analytical=lossGradient(model,sequence,target).gradient;
  const loss=()=>forward(model,sequence).output.reduce((s,p,k)=>s+(p-target[k])**2,0)/2;
  for(const [key,index]of [['wx',1],['wh',4],['bh',2],['wy',2],['by',1]]){
    const original=model[key][index],epsilon=1e-5;
    model[key][index]=original+epsilon;const plus=loss();model[key][index]=original-epsilon;const minus=loss();model[key][index]=original;
    assert.ok(Math.abs((plus-minus)/(2*epsilon)-analytical[key][index])<1e-6,key);
  }
});
test('resampling uses only closed buckets and never creates windows over gaps',()=>{
  const now=Date.now(),rows=sensorFixture(80,now);
  const series=prepareSeries(rows,10000,now);
  assert.ok(series.every(p=>p.time<=now));
  const gapped=series.filter((_,i)=>i<30||i>45),scaler={mean:[27,64],scale:[1,3]};
  const windows=makeWindows(gapped,12,10000,scaler);
  assert.ok(!windows.some(w=>w.time>series[45].time&&w.time<series[58].time));
  assert.throws(()=>trainSensor(rows),/360/);
});
test('RNN trains on ordered splits, serializes reproducibly and detects held-out residual spikes',()=>{
  const now=Date.now(),rows=sensorFixture(600,now),result=trainSensor(rows,{epochs:25});
  assert.ok(result.report.ranges.train[1]<result.report.ranges.validation[0]);
  assert.ok(result.report.ranges.validation[1]<result.report.ranges.test[0]);
  assert.ok(result.report.test.temperature.mae>=0&&Number.isFinite(result.report.test.humidity.rmse));
  assert.ok(result.report.curve.at(-1).train_mse<result.report.curve[0].train_mse);
  const normal=scoreSensor(result.artifact,rows,now),spike=structuredClone(rows);
  spike.at(-1).temperature+=6;spike.at(-1).humidity+=15;
  const anomalous=scoreSensor(result.artifact,spike,now);
  assert.equal(anomalous.status,'anomaly');assert.ok(anomalous.score>normal.score);
  assert.deepEqual(scoreSensor(JSON.parse(JSON.stringify(result.artifact)),rows,now),normal);
  assert.equal(scoreSensor(result.artifact,rows,now+120000).status,'stale');
  assert.equal(result.report.detection_metrics,null,'Unlabelled data must not fabricate F1');
});
test('login model stays cold without enough separate days and rejects the current/future event',()=>{
  const date=new Date('2026-10-20T20:00:00Z');
  const sameDay=Array.from({length:100},()=>({occurred_at:new Date('2026-10-19T01:00:00Z'),status:'normal'}));
  assert.equal(analyzeLogin(sameDay,date).status,'insufficient_data');
  const future=loginFixture().map(e=>({...e,occurred_at:new Date('2026-11-01T01:00:00Z')}));
  assert.equal(analyzeLogin(future,date).baseline_events,0);
});
test('login anomaly uses the individual history, circular time, not a fixed forbidden hour',()=>{
  const history=loginFixture();
  assert.equal(analyzeLogin(history,new Date('2026-10-20T01:12:00Z')).status,'normal');
  assert.equal(analyzeLogin(history,new Date('2026-10-20T20:00:00Z')).status,'anomaly');
  const night=loginFixture(1);
  assert.equal(analyzeLogin(night,new Date('2026-10-20T18:12:00Z')).status,'normal');
  assert.equal(localLoginTime(new Date('2026-10-20T17:05:00Z')).display,'00:05');
  assert.equal(circularDistance(1430,10),20);
  const midnight=Array.from({length:24},(_,i)=>({occurred_at:new Date(Date.UTC(2026,9,1+Math.floor(i/2),i%2?17:16,i%2?10:50)),status:'normal'}));
  assert.equal(analyzeLogin(midnight,new Date('2026-10-20T17:05:00Z')).status,'normal');
});
test('unreviewed anomalies and unrecognized logins cannot poison a normal login baseline',()=>{
  const history=loginFixture(),date=new Date('2026-10-20T20:00:00Z');
  const attacks=Array.from({length:100},(_,i)=>({occurred_at:new Date(Date.UTC(2026,9,13+Math.floor(i/24),20,i%60)),status:'anomaly',review:'pending'}));
  const before=analyzeLogin(history,date),after=analyzeLogin([...history,...attacks],date);
  assert.equal(after.status,'anomaly');assert.equal(after.baseline_events,before.baseline_events);
});
test('one old rare time or unavailable event does not normalize the entire day',()=>{
  const history=loginFixture(),date=new Date('2026-10-20T20:00:00Z');
  const rare={occurred_at:new Date('2026-10-19T15:00:00Z'),status:'normal'};
  const unavailable=Array.from({length:30},(_,i)=>({occurred_at:new Date(Date.UTC(2026,9,13+i%6,20,15)),status:'unavailable'}));
  const result=analyzeLogin([...history,rare,...unavailable],date);
  assert.equal(result.status,'anomaly');assert.equal(result.baseline_events,25);
});
