import { quantile } from './sensor-model.js';
const PERIOD=1440,TIMEZONE='Asia/Ho_Chi_Minh';
const clock=new Intl.DateTimeFormat('en-CA',{timeZone:TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function localLoginTime(date) {
  const p=Object.fromEntries(clock.formatToParts(new Date(date)).map(v=>[v.type,v.value]));
  return {day:`${p.year}-${p.month}-${p.day}`,minute:Number(p.hour)*60+Number(p.minute),display:`${p.hour}:${p.minute}`};
}
export function circularDistance(a,b){const diff=Math.abs(a-b)%PERIOD;return Math.min(diff,PERIOD-diff);}
function density(minute,points,bandwidth,excludeDay=null) {
  const relevant=points.filter(p=>p.day!==excludeDay),counts=new Map();
  for(const p of relevant)counts.set(p.day,(counts.get(p.day)||0)+1);
  if(!counts.size)return 0;
  let result=0;
  for(const p of relevant) {
    const difference=minute-p.minute;
    const kernel=[-PERIOD,0,PERIOD].reduce((sum,shift)=>sum+Math.exp(-.5*((difference+shift)/bandwidth)**2),0)/(bandwidth*Math.sqrt(2*Math.PI));
    result+=kernel/(counts.size*counts.get(p.day));
  }
  return result;
}
export function analyzeLogin(history,date,{minEvents=6,minDays=1,bandwidth=60,includeLearning=false}={}) {
  const current=localLoginTime(date),cutoff=Date.parse(date)-90*86400_000,slots=new Map();
  for(const event of history) {
    if(Date.parse(event.occurred_at)>=Date.parse(date)||Date.parse(event.occurred_at)<cutoff||event.review==='unrecognized'||(['anomaly','unavailable'].includes(event.status)&&event.review!=='expected'))continue;
    const p=localLoginTime(event.occurred_at);
    // Repeated logins in one hour/day cannot create unlimited baseline weight.
    slots.set(`${p.day}:${Math.floor(p.minute/60)}`,{...p,source:event.source});
  }
  const points=[...slots.values()],days=new Set(points.map(p=>p.day)).size;
  const base={algorithm:'circular-kde-v1',timezone:TIMEZONE,local_time:current.display,baseline_events:points.length,baseline_days:days,min_events:minEvents,min_days:minDays,bandwidth_minutes:bandwidth,confidence:days>=5&&points.length>=20?'established':'preliminary'};
  if(includeLearning)base.learning={hours:Array.from({length:24},(_,hour)=>({hour,seed:points.filter(p=>Math.floor(p.minute/60)===hour&&p.source==='bootstrap').length,observed:points.filter(p=>Math.floor(p.minute/60)===hour&&p.source!=='bootstrap').length})),density:points.length>=minEvents?Array.from({length:145},(_,i)=>({minute:i*10,value:density((i*10)%PERIOD,points,bandwidth)})):[],samples:points.length};
  if(points.length<minEvents||days<minDays)return {...base,status:'insufficient_data',reason:`Cần ${minEvents} mẫu giờ đăng nhập trên ít nhất ${minDays} ngày; hiện có ${points.length} mẫu/${days} ngày.`};
  // Leave-one-day-out calibration avoids evaluating a login against its own day.
  const reference=points.map(p=>-Math.log(Math.max(1e-12,days>1?density(p.minute,points,bandwidth,p.day):density(p.minute,points.filter(other=>other!==p),bandwidth))));
  const median=quantile(reference,.5),mad=quantile(reference.map(v=>Math.abs(v-median)),.5);
  const threshold=median+Math.max(1,4*mad),score=-Math.log(Math.max(1e-12,density(current.minute,points,bandwidth)));
  const peaks=Array.from({length:24},(_,hour)=>({hour,density:density(hour*60+30,points,bandwidth)})).sort((a,b)=>b.density-a.density).slice(0,3).map(p=>`${String(p.hour).padStart(2,'0')}:00`);
  return {...base,status:score>threshold?'anomaly':'normal',score,threshold,calibration:days>1?'leave-one-day-out median + max(1,4*MAD)':'leave-one-slot-out median + max(1,4*MAD)',usual_hours:peaks,reason:score>threshold?'Thời điểm đăng nhập ít gặp so với lịch sử riêng của tài khoản.':'Thời điểm đăng nhập phù hợp với lịch sử đã học.'};
}

// Isolated example: never inserted into LoginEvent or used as a user's baseline.
export function loginExample() {
  const history=[];
  for(let day=1;day<=8;day++)for(const hour of [8,9,19,20])history.push({occurred_at:new Date(Date.UTC(2026,9,day,hour-7,10)),status:'normal'});
  return {source:'synthetic',persisted:false,description:'Lịch sử mẫu đăng nhập khoảng 08–09h và 19–20h, Asia/Ho_Chi_Minh. Không phải lịch sử của bạn.',samples:history.length,history:history.map(e=>({occurred_at:e.occurred_at,local_time:localLoginTime(e.occurred_at).display})),examples:[{label:'Giờ thường dùng — 08:10',analysis:analyzeLogin(history,new Date('2026-10-10T01:10:00Z'))},{label:'Giờ ít gặp — 03:00',analysis:analyzeLogin(history,new Date('2026-10-09T20:00:00Z'))}]};
}
