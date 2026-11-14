import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { AiModel, AiResult, Device, Telemetry, Alert, LoginEvent, AccountAlert, AuditLog } from '../../../database/models/index.js';
import { toPublic } from '../../../database/models/base.js';
import { scoreSensor, SENSOR_DEFAULTS } from '../ai/sensor-model.js';
import { analyzeLogin } from '../ai/login-model.js';
import { createLock } from '../utils/asyncLock.js';
import { fail } from '../utils/errors.js';
import { audit } from './audit.service.js';
import {ensureLoginBootstrap} from './login-bootstrap.service.js';
import {User} from '../../../database/models/index.js';

export async function createAI({notify,enabled=true,loginSeed=false}) {
  const lock=createLock(),pending=new Set(),work=new Set();
  let worker=null,trainingId=null,busy=false,closed=false,cycle=null;
  await AiModel.updateMany({status:'training'},{$set:{status:'failed',error:'Huấn luyện bị gián đoạn bởi lần khởi động lại trước.'}});
  if(enabled&&loginSeed)for(const user of await User.find({role:{$in:['operator','viewer']},status:'active'}).select('_id').lean())await ensureLoginBootstrap(user._id);
  const track=promise=>{work.add(promise);promise.finally(()=>work.delete(promise)).catch(()=>{});return promise;};

  async function train(device,actor,{days=7,includeDemo=false,confirmedNormal=false}={}) {
    if(!enabled)throw fail(503,'AI đang tắt.');
    if(device.profile!=='climate')throw fail(400,'RNN hiện hỗ trợ node nhiệt độ/độ ẩm climate.');
    if(!confirmedNormal)throw fail(400,'Xác nhận khoảng dữ liệu dùng huấn luyện là dữ liệu bình thường.');
    if(busy)throw fail(409,'Đang có một tác vụ huấn luyện. Chờ hoàn tất trước khi tạo tác vụ mới.');
    busy=true;
    try {
      const sources=includeDemo?['hardware','demo']:['hardware'];
      const rows=await Telemetry.find({device_id:device.id,source:{$in:sources},recorded_at:{$gte:new Date(Date.now()-days*86400_000)}}).sort({recorded_at:-1}).limit(20000).select('recorded_at temperature humidity source').lean();
      if(rows.length<360)throw fail(400,`Chưa đủ dữ liệu ${includeDemo?'được chọn':'phần cứng thật'}; hiện có ${rows.length} bản ghi. Cần ít nhất 360 mẫu sau resample.`);
      rows.reverse();
      const model=await AiModel.create({device_id:device.id,trained_by:actor.id,data_source:rows.some(r=>r.source==='demo')?'demo_or_mixed':'hardware'});
      trainingId=model._id;
      await audit(actor,'ai.training_started',device.id,JSON.stringify({days,includeDemo,rows:rows.length}),device.home_id);
      worker=new Worker(new URL('../ai/train-worker.js',import.meta.url),{workerData:{rows,options:SENSOR_DEFAULTS},resourceLimits:{maxOldGenerationSizeMb:256}});
      const currentWorker=worker,currentId=model._id;
      let finished=false;
      const timer=setTimeout(()=>{finish({error:'Huấn luyện vượt giới hạn 120 giây.'});currentWorker.terminate();},120000);
      const finish=message=>{
        if(finished)return;finished=true;clearTimeout(timer);
        const changes=message.result?{status:'ready',artifact:message.result.artifact,report:message.result.report,progress:100,error:null}:{status:'failed',error:message.error||'Worker huấn luyện dừng bất thường.'};
        track(AiModel.updateOne({_id:currentId},{$set:changes}).then(()=>{if(message.result)pending.add(device.id);notify('ai');}).catch(()=>{}));
        if(worker===currentWorker){worker=null;trainingId=null;busy=false;}
      };
      currentWorker.on('message',message=>{
        if(message.type==='progress'&&!finished)track(AiModel.updateOne({_id:currentId,status:'training'},{$set:{progress:Math.round(message.progress.epoch/message.progress.epochs*100)}}).catch(()=>{}));
        if(message.type==='done')finish(message);
        if(message.type==='failed')finish({error:message.error});
      });
      currentWorker.on('error',()=>finish({error:'Worker AI lỗi. Kiểm tra dữ liệu và tài nguyên máy.'}));
      currentWorker.on('exit',()=>finish({error:'Worker kết thúc trước khi có model.'}));
      notify('ai');
      return toPublic(model);
    } catch(error){busy=false;if(trainingId&&!worker){const id=trainingId;trainingId=null;await AiModel.updateOne({_id:id,status:'training'},{$set:{status:'failed',error:'Không khởi tạo được tác vụ huấn luyện.'}}).catch(()=>{});}throw error;}
  }

  const analyzeDevice=id=>lock(id,async()=>{
    if(!enabled||closed)return {status:'disabled'};
    const device=await Device.findById(id).lean();
    if(!device||device.lifecycle!=='active'||device.profile!=='climate')return {status:'inactive'};
    const model=await AiModel.findOne({device_id:id,status:'ready'}).sort({created_at:-1}).select('+artifact').lean();
    if(!model?.artifact)return {status:'no_model'};
    const rows=await Telemetry.find({device_id:id,source:{$in:model.data_source==='hardware'?['hardware']:['hardware','demo']}}).sort({recorded_at:-1}).limit(800).select('recorded_at temperature humidity').lean();
    const start=performance.now(),result=scoreSensor(model.artifact,rows),inference_ms=performance.now()-start;
    if(!['normal','anomaly'].includes(result.status))return result;
    try {await AiResult.create({...result,device_id:id,model_id:model._id,inference_ms});}
    catch(error){if(error.code===11000)return result;throw error;}
    const recent=await AiResult.find({device_id:id,model_id:model._id}).sort({recorded_at:-1}).limit(3).lean();
    const consecutive=(count,status)=>recent.length>=count&&recent.slice(0,count).every((r,i)=>r.status===status&&(!i||Date.parse(recent[i-1].recorded_at)-Date.parse(r.recorded_at)===model.artifact.stepMs));
    if(consecutive(2,'anomaly')&&!await Alert.exists({device_id:id,kind:'ai_anomaly',status:{$in:['open','acknowledged']}})) {
      await Alert.create({device_id:id,kind:'ai_anomaly',ai_model_id:model._id,severity:'warning',message:`AI RNN phát hiện biến thiên nhiệt độ/độ ẩm khác lịch sử đã học. Kiểm tra môi trường/cảm biến; đây không phải kết luận thiết bị hỏng.${model.data_source==='hardware'?'':' Model đang dùng dữ liệu demo/thử nghiệm.'}`});
      notify('alert');
    }
    if(consecutive(3,'normal'))await Alert.updateMany({device_id:id,kind:'ai_anomaly',status:{$in:['open','acknowledged']}},{$set:{status:'resolved',resolved_at:new Date()}});
    notify('ai');return {...result,inference_ms};
  });

  async function deviceStatus(id,deviceInfo=null) {
    const [job,active]=await Promise.all([AiModel.findOne({device_id:id}).sort({created_at:-1}).lean(),AiModel.findOne({device_id:id,status:'ready'}).sort({created_at:-1}).lean()]);
    const model=active||job,latest=active?await AiResult.findOne({device_id:id,model_id:active._id}).sort({recorded_at:-1}).lean():null;
    const state=!enabled?'disabled':!model?'no_model':model.status==='training'?'training':model.status==='failed'?'failed':deviceInfo&&deviceInfo.connection!=='online'?'stale':!latest?'warmup':Date.now()-Date.parse(latest.recorded_at)>60000?'stale':latest.status;
    return {enabled,state,model:toPublic(model),training_job:job&&job._id!==model?._id?toPublic(job):null,latest:toPublic(latest),defaults:SENSOR_DEFAULTS};
  }

  const recordLogin=(user,date=new Date())=>lock('login:'+user.id,async()=>{
    if(!enabled)return {status:'disabled'};
    // Import only when the account has no AI history. Never silently trust a new flagged login.
    if(!await LoginEvent.exists({user_id:user.id})) {
      const old=await AuditLog.find({actor_id:user.id,action:'auth.login',created_at:{$lt:date,$gte:new Date(Date.parse(date)-90*86400_000)}}).sort({created_at:-1}).limit(1000).lean();
      for(const event of old)await LoginEvent.updateOne({_id:'audit-'+event._id},{$setOnInsert:{user_id:user.id,occurred_at:event.created_at,source:'legacy_audit',status:'insufficient_data',expires_at:new Date(Date.parse(event.created_at)+120*86400_000)}},{upsert:true});
    }
    if(loginSeed)await ensureLoginBootstrap(user.id,date);
    const history=await LoginEvent.find({user_id:user.id,occurred_at:{$lt:date,$gte:new Date(Date.parse(date)-90*86400_000)}}).sort({occurred_at:-1}).limit(1000).lean();
    const analysis=analyzeLogin(history,date);
    const event=await LoginEvent.create({user_id:user.id,occurred_at:date,status:analysis.status,analysis,expires_at:new Date(Date.parse(date)+120*86400_000)});
    if(analysis.status==='anomaly') {
      await AccountAlert.create({user_id:user.id,login_event_id:event._id,message:`Đăng nhập lúc ${analysis.local_time} (${analysis.timezone}) khác giờ thường gặp của tài khoản. Đây có thể là bạn đổi lịch; hãy kiểm tra.`});
      await audit(user,'ai.login_anomaly',event._id,JSON.stringify({localTime:analysis.local_time,score:analysis.score,threshold:analysis.threshold}));notify('security');
    }
    return {...analysis,event_id:event._id};
  });

  const reviewAccount=(user,id,decision)=>lock('login:'+user.id,async()=>{
    const alert=await AccountAlert.findById(id).lean();
    if(!alert)throw fail(404,'Không tìm thấy cảnh báo đăng nhập.');
    if(alert.user_id!==user.id)throw fail(403,'Chỉ chủ tài khoản được xác nhận thói quen đăng nhập của mình.');
    if(alert.status!=='open'&&alert.status!==decision)throw fail(409,'Cảnh báo đã được xác nhận theo quyết định khác.');
    const event=await LoginEvent.findOne({_id:alert.login_event_id,user_id:user.id}).lean();
    if(!event)throw fail(409,'Lịch sử đăng nhập đã hết thời gian lưu; không dùng sự kiện này để học.');
    if(event.review!=='pending'&&event.review!==decision)throw fail(409,'Lần đăng nhập đã có quyết định khác.');
    await LoginEvent.updateOne({_id:event._id,user_id:user.id},{$set:{review:decision,reviewed_at:new Date()}});
    await AccountAlert.updateOne({_id:alert._id,user_id:user.id},{$set:{status:decision,reviewed_at:new Date()}});
    await audit(user,'ai.login_reviewed',alert._id,decision);notify('security');return {ok:true};
  });

  const timer=setInterval(()=>{
    if(closed||cycle||!pending.size)return;
    const ids=[...pending].slice(0,5);ids.forEach(id=>pending.delete(id));
    cycle=Promise.allSettled(ids.map(analyzeDevice)).finally(()=>{cycle=null;});
  },2000);
  timer.unref();
  return {train,deviceStatus,analyzeDevice,recordLogin,reviewAccount,enabled,
    enqueue(id){if(enabled&&!closed){if(pending.size<1000)pending.add(id);}},
    async close(){closed=true;clearInterval(timer);if(worker){const id=trainingId;await worker.terminate();if(id)await AiModel.updateOne({_id:id,status:'training'},{$set:{status:'failed',error:'Server dừng trong khi huấn luyện.'}});}if(cycle)await cycle;await Promise.allSettled([...work]);},
  };
}
