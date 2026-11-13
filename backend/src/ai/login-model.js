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
export function analyzeLogin(history,date,{minEvents=20,minDays=5,bandwidth=60}={}) {
  const current=localLoginTime(date),cutoff=Date.parse(date)-90*86400_000,slots=new Map();
  for(const event of history) {
    if(Date.parse(event.occurred_at)>=Date.parse(date)||Date.parse(event.occurred_at)<cutoff||event.review==='unrecognized'||(['anomaly','unavailable'].includes(event.status)&&event.review!=='expected'))continue;
    const p=localLoginTime(event.occurred_at);
    // Repeated logins in one hour/day cannot create unlimited baseline weight.
    slots.set(`${p.day}:${Math.floor(p.minute/60)}`,p);
  }
  const points=[...slots.values()],days=new Set(points.map(p=>p.day)).size;
  const base={algorithm:'circular-kde-v1',timezone:TIMEZONE,local_time:current.display,baseline_events:points.length,baseline_days:days,min_events:minEvents,min_days:minDays,bandwidth_minutes:bandwidth};
  if(points.length<minEvents||days<minDays)return {...base,status:'insufficient_data',reason:`Cần ${minEvents} mẫu giờ đăng nhập trên ít nhất ${minDays} ngày; hiện có ${points.length} mẫu/${days} ngày.`};
  // Leave-one-day-out calibration avoids evaluating a login against its own day.
  const reference=points.map(p=>-Math.log(Math.max(1e-12,density(p.minute,points,bandwidth,p.day))));
  const median=quantile(reference,.5),mad=quantile(reference.map(v=>Math.abs(v-median)),.5);
  const threshold=median+Math.max(1,4*mad),score=-Math.log(Math.max(1e-12,density(current.minute,points,bandwidth)));
  const peaks=Array.from({length:24},(_,hour)=>({hour,density:density(hour*60+30,points,bandwidth)})).sort((a,b)=>b.density-a.density).slice(0,3).map(p=>`${String(p.hour).padStart(2,'0')}:00`);
  return {...base,status:score>threshold?'anomaly':'normal',score,threshold,calibration:'leave-one-day-out median + max(1,4*MAD)',usual_hours:peaks,reason:score>threshold?'Thời điểm đăng nhập ít gặp so với lịch sử riêng của tài khoản.':'Thời điểm đăng nhập phù hợp với lịch sử đã học.'};
}
