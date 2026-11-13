import { fitRnn, forward } from './rnn.js';
export const SENSOR_DEFAULTS = {stepMs:10000,window:12,minPoints:360,hidden:8,epochs:40,seed:42};
export function quantile(values,q) {
  const sorted=values.slice().sort((a,b)=>a-b), i=(sorted.length-1)*q, low=Math.floor(i);
  return sorted[low]+(sorted[Math.ceil(i)]-sorted[low])*(i-low);
}
// Causal last observation in a closed bucket, never interpolate across missing buckets.
export function prepareSeries(rows,stepMs=10000,now=Date.now()) {
  const bins=new Map();
  for(const row of rows.slice().sort((a,b)=>Date.parse(a.recorded_at)-Date.parse(b.recorded_at))) {
    const time=Date.parse(row.recorded_at), end=(Math.floor(time/stepMs)+1)*stepMs;
    if(!Number.isFinite(time)||end>now||!Number.isFinite(row.temperature)||!Number.isFinite(row.humidity)||row.temperature < -40||row.temperature>80||row.humidity<0||row.humidity>100)continue;
    const previous=bins.get(end);
    bins.set(end,{time:end,values:[row.temperature,row.humidity],label:!!row.label||!!previous?.label});
  }
  return [...bins.values()].sort((a,b)=>a.time-b.time);
}
function fitScaler(points) {
  const mean=[0,1].map(k=>points.reduce((s,p)=>s+p.values[k],0)/points.length);
  const scale=mean.map((m,k)=>Math.max(k===0?.25:1,Math.sqrt(points.reduce((s,p)=>s+(p.values[k]-m)**2,0)/points.length)));
  return {mean,scale};
}
const normalize=(values,scaler)=>values.map((v,k)=>(v-scaler.mean[k])/scaler.scale[k]);
export function makeWindows(points,window,stepMs,scaler) {
  const samples=[];
  for(let i=window;i<points.length;i++) {
    const chunk=points.slice(i-window,i+1);
    if(chunk.some((p,j)=>j>0&&p.time-chunk[j-1].time!==stepMs))continue;
    samples.push({x:chunk.slice(0,-1).map(p=>normalize(p.values,scaler)),y:normalize(points[i].values,scaler),time:points[i].time,actual:points[i].values,label:points[i].label});
  }
  return samples;
}
export function forecastMetrics(model,samples,scaler,persistence=false) {
  const abs=[0,0],squared=[0,0];
  for(const sample of samples) {
    const prediction=persistence?sample.x.at(-1):forward(model,sample.x).output;
    for(let k=0;k<2;k++){const error=(prediction[k]-sample.y[k])*scaler.scale[k];abs[k]+=Math.abs(error);squared[k]+=error**2;}
  }
  return {samples:samples.length,temperature:{mae:abs[0]/samples.length,rmse:Math.sqrt(squared[0]/samples.length),unit:'°C'},humidity:{mae:abs[1]/samples.length,rmse:Math.sqrt(squared[1]/samples.length),unit:'%RH'}};
}
export function trainSensor(rows,options={},onProgress=()=>{}) {
  const settings={...SENSOR_DEFAULTS,...options},points=prepareSeries(rows,settings.stepMs,options.now??Date.now());
  if(points.length<settings.minPoints)throw new Error(`Cần ít nhất ${settings.minPoints} mẫu sau resample (khoảng một giờ dữ liệu đều); hiện có ${points.length}.`);
  const a=Math.floor(points.length*.6),b=Math.floor(points.length*.8),trainPoints=points.slice(0,a),scaler=fitScaler(trainPoints);
  const train=makeWindows(trainPoints,settings.window,settings.stepMs,scaler),validation=makeWindows(points.slice(a,b),settings.window,settings.stepMs,scaler),test=makeWindows(points.slice(b),settings.window,settings.stepMs,scaler);
  if([train,validation,test].some(s=>s.length<20))throw new Error('Chuỗi bị đứt hoặc chưa đủ cửa sổ liên tục trong train/validation/test.');
  const fitted=fitRnn(train,validation,{...settings,onProgress});
  const validationScores=validation.map(s=>forward(fitted.model,s.x).output.reduce((v,p,k)=>v+(p-s.y[k])**2,0)/2);
  const threshold=Math.max(.08,quantile(validationScores,.99)*1.25+.02);
  const artifact={version:'elman-rnn-v1',...fitted.model,scaler,window:settings.window,stepMs:settings.stepMs,threshold};
  return {artifact,report:{algorithm:'Elman tanh RNN + Adam/BPTT',features:['temperature','humidity'],settings,raw_rows:rows.length,resampled_points:points.length,
    ranges:{train:[trainPoints[0].time,trainPoints.at(-1).time],validation:[points[a].time,points[b-1].time],test:[points[b].time,points.at(-1).time]},
    windows:{train:train.length,validation:validation.length,test:test.length},curve:fitted.curve,threshold,calibration:'99th percentile validation residual; floor 0.08',
    test:forecastMetrics(fitted.model,test,scaler),baseline_persistence:forecastMetrics(fitted.model,test,scaler,true),
    detection_metrics:null,detection_note:'Không có nhãn bất thường độc lập trong dữ liệu huấn luyện; chưa công bố precision/recall/F1.',experimental:true}};
}
export function scoreSensor(artifact,rows,now=Date.now()) {
  const points=prepareSeries(rows,artifact.stepMs,now),sample=makeWindows(points,artifact.window,artifact.stepMs,artifact.scaler).at(-1);
  if(!sample)return {status:'warmup',reason:'Chưa đủ cửa sổ liên tục; chờ dữ liệu mới.'};
  if(now-sample.time>artifact.stepMs*2+20000)return {status:'stale',reason:'Dữ liệu quá cũ để đánh giá hiện tại.'};
  const normalized=forward(artifact,sample.x).output,score=normalized.reduce((v,p,k)=>v+(p-sample.y[k])**2,0)/2;
  return {status:score>artifact.threshold?'anomaly':'normal',recorded_at:new Date(sample.time),score,threshold:artifact.threshold,
    prediction:normalized.map((v,k)=>v*artifact.scaler.scale[k]+artifact.scaler.mean[k]),actual:sample.actual};
}
