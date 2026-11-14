import {createHash} from 'node:crypto';
import {LoginEvent,Setting,User} from '../../../database/models/index.js';
import {localLoginTime} from '../ai/login-model.js';

// One-time lab initialization. Kept distinct from server-observed logins.
export async function ensureLoginBootstrap(userId,date=new Date()) {
  if(!await User.exists({_id:userId,role:{$in:['operator','viewer']}}))return;
  const key='login-bootstrap-'+userId;
  const marker=await Setting.findOneAndUpdate({_id:key},{$setOnInsert:{value:{anchor:date,complete:false,version:1}}},{upsert:true,returnDocument:'after'}).lean();
  if(marker.value.complete)return;
  const localDay=localLoginTime(marker.value.anchor).day;
  const anchor=Date.parse(localDay+'T00:00:00+07:00');
  const prefix=createHash('sha256').update(userId).digest('hex').slice(0,24);
  const operations=[];let i=0;
  for(let day=1;day<=8;day++)for(const hour of [8,9,19,20]){
    const occurred=new Date(anchor-day*86400000+(hour*60+10)*60000);
    operations.push({updateOne:{filter:{_id:'bootstrap-'+prefix+'-'+i++},update:{$setOnInsert:{user_id:userId,occurred_at:occurred,source:'bootstrap',status:'normal',review:'pending',expires_at:new Date(occurred.getTime()+120*86400000)}},upsert:true}});
  }
  await LoginEvent.bulkWrite(operations);
  await Setting.updateOne({_id:key},{$set:{'value.complete':true}});
}
