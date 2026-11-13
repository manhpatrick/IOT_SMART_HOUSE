// Independent synthetic experiment. Does not connect to MongoDB, broker or a real account.
import {mkdirSync,writeFileSync} from 'node:fs';
import {trainSensor,scoreSensor} from '../src/ai/sensor-model.js';
import {analyzeLogin} from '../src/ai/login-model.js';
const end=Math.floor(Date.now()/10000)*10000,count=720,start=end-count*10000;
const rows=Array.from({length:count},(_,i)=>({recorded_at:new Date(start+i*10000).toISOString(),temperature:27+1.2*Math.sin(i/25)+.2*Math.sin(i/7),humidity:64+3*Math.cos(i/28),source:'demo'}));
const trained=trainSensor(rows),testStart=Math.floor(count*.8),testRows=structuredClone(rows);
for(let i=testStart;i<count;i++) {
  testRows[i].label=(i>=610&&i<616)||(i>=670&&i<678);
  if(testRows[i].label){testRows[i].temperature+=4;testRows[i].humidity+=10;}
}
function classification(predictions){
  let tp=0,tn=0,fp=0,fn=0;
  for(const p of predictions){if(p.actual&&p.predicted)tp++;else if(p.actual)fn++;else if(p.predicted)fp++;else tn++;}
  const precision=tp+fp?tp/(tp+fp):0,recall=tp+fn?tp/(tp+fn):0;
  return {samples:predictions.length,tp,tn,fp,fn,precision,recall,f1:precision+recall?2*precision*recall/(precision+recall):0};
}
const predictions=[];
for(let i=testStart+trained.artifact.window;i<count;i++) {
  const result=scoreSensor(trained.artifact,testRows.slice(testStart,i+1),Date.parse(testRows[i].recorded_at)+10000);
  predictions.push({time:testRows[i].recorded_at,actual:!!testRows[i].label,predicted:result.status==='anomaly',score:result.score,threshold:result.threshold});
}
const loginHistory=[];
for(let day=1;day<=12;day++)for(const hour of [8,12])loginHistory.push({occurred_at:new Date(Date.UTC(2026,9,day,hour-7,12)),status:'normal',review:'pending'});
const loginPredictions=[];
for(let i=0;i<24;i++){
  const date=new Date(Date.UTC(2026,9,20+Math.floor(i/4),(i%2?3:8)-7,10+i%5)),expectedAnomaly=i%2===1,result=analyzeLogin(loginHistory,date);
  loginPredictions.push({time:date.toISOString(),actual:expectedAnomaly,predicted:result.status==='anomaly',score:result.score,threshold:result.threshold});
}
const report={generated_at:new Date().toISOString(),data_source:'synthetic fixtures, not ESP32 measurements or real login history',hardware_validated:false,
  sensor:{training:trained.report,labelled_test:classification(predictions),label_note:'Two injected spikes, point-level evaluation; not field fault-detection performance.',predictions},
  login:{algorithm:'circular-kde-v1',labelled_test:classification(loginPredictions),label_note:'Known generated usual/unusual hours; not real intrusion-detection performance.',predictions:loginPredictions}};
mkdirSync('.artifacts',{recursive:true});writeFileSync('.artifacts/ai-demo-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({data_source:report.data_source,sensor_forecast:report.sensor.training.test,baseline:report.sensor.training.baseline_persistence,sensor_detection:report.sensor.labelled_test,login_detection:report.login.labelled_test,report:'.artifacts/ai-demo-report.json'},null,2));
