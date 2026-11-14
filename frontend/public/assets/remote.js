/* Voice creates a preview only. The authenticated API remains authoritative. */
window.NodoRemote = (()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const outputs=d=>d.profile==='climate'?[['fan','Quạt'],['buzzer','Còi'],['light','Đèn']]:[['light','Đèn']];
 let ctx,selected='',requested='',transcript='',recognition=null,listening=false,sending=false,intent=null,contextKey='',message='Bấm micro hoặc nhập câu lệnh để xem trước.',generation=0;
 const state=()=>ctx.getState();
 const allowed=()=>!!ctx&&ctx.manage();
 const device=()=>state().home?.devices.find(d=>d.id===selected);
 const blocked=d=>!d||!allowed()||!navigator.onLine||!state().connected||!state().overview?.broker.connected||d.lifecycle!=='active'||d.connection!=='online'||!!d.pendingCommand;
 function blockReason(d){
  if(!d)return 'Chọn thiết bị để điều khiển.';
  if(!allowed())return 'Chỉ operator quản lý nhà được điều khiển thiết bị.';
  if(!navigator.onLine||!state().connected)return 'Web mất kết nối máy chủ, chưa gửi được lệnh.';
  if(!state().overview?.broker.connected)return 'MQTT broker chưa kết nối, chưa gửi được lệnh.';
  if(d.lifecycle!=='active')return 'Thiết bị chưa active hoặc đang bị khóa/bảo trì.';
  if(d.connection!=='online')return 'Thiết bị offline: cần ESP32 hoặc MQTTX kết nối và gửi heartbeat mới. Hồ sơ và số đo cũ không chứng minh thiết bị đang chạy.';
  if(d.pendingCommand)return 'Đang chờ ACK lệnh trước; chờ kết quả rồi gửi tiếp.';
  return '';
 }
 const normalize=s=>s.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[.,!?]/g,'').replace(/\s+/g,' ').trim();
 function parse(text){
  const s=normalize(text),match=s.match(/^(bat|tat) (quat|den|coi)( bao dong)?$/);
  if(match)return {kind:'actuator',actuator:{quat:'fan',den:'light',coi:'buzzer'}[match[2]],value:match[1]==='bat'};

  return null;
 }
 function reason(d,action){
  if(blocked(d))return blockReason(d);
  if(action.kind==='actuator'&&!outputs(d).some(([a])=>a===action.actuator))return 'Thiết bị đang chọn không có đầu ra này.';

  if(action.actuator==='buzzer'&&!action.value&&d.gas_alarm_active)return 'Gas còn cảnh báo, không thể tắt còi.';
  return '';
 }
 const label=a=>a.kind==='mode'?`Chuyển sang ${a.mode==='MANUAL'?'Thủ công':'Tự động'}`:`${a.value?'Bật':'Tắt'} ${{fan:'quạt',light:'đèn',buzzer:'còi'}[a.actuator]}`;
 function stop(){generation++;listening=false;recognition?.abort();recognition=null;}
 function leave(){stop();intent=null;document.querySelector('#remote-dialog')?.close();}
 function sync(){
  if(!ctx||!document.querySelector('.remote-page'))return;
  const d=device();
  if(!allowed()){leave();document.querySelector('.remote-page').innerHTML='<p class="notice warning">Bạn không còn quyền điều khiển nhà này.</p>';return;}
  for(const b of document.querySelectorAll('[data-r-action="actuator"],[data-r-action="mode"]')){
   const action=b.dataset.rAction==='mode'?{kind:'mode',mode:b.dataset.mode}:{kind:'actuator',actuator:b.dataset.output,value:b.dataset.value==='true'};
   const no=!!reason(d,action)||(action.kind==='mode'&&d?.config.mode===action.mode);
   b.dataset.blocked=String(no);b.disabled=no||sending;
   if(action.kind==='mode'){b.classList.toggle('primary',d?.config.mode===action.mode);b.classList.toggle('secondary',d?.config.mode!==action.mode);}
  }
  const help=document.querySelector('[data-r-block-reason]');if(help){help.textContent=blockReason(d);help.hidden=!blocked(d);}
  const badge=document.querySelector('.remote-status .state-tag');if(badge&&d)badge.textContent=d.connection;
  for(const el of document.querySelectorAll('[data-r-state]')){const value=d?.reported_state[el.dataset.rState];el.textContent=value===undefined?'Chưa xác nhận':value?'Đang bật':'Đang tắt';}
  const pending=document.querySelector('[data-r-pending]');if(pending)pending.hidden=!d?.pendingCommand;
  const history=document.querySelector('.remote-history');if(history)history.innerHTML='<h2>Lệnh gần đây của thiết bị</h2>'+state().commands.filter(c=>c.device_id===selected).slice(0,8).map(c=>`<div><span>${c.kind==='config'?'Cấu hình/chế độ':esc({fan:'Quạt',buzzer:'Còi',light:'Đèn'}[c.payload.actuator]||c.payload.actuator)+' → '+(c.payload.value?'bật':'tắt')} · ${c.source==='voice'?'Voice':c.source==='gas_rule'?'Báo động gas':'Thao tác web'}</span><strong>${esc({pending:'Chờ ACK',applied:'Đã áp dụng',failed:'Thất bại',timeout:'Hết thời gian',cancelled:'Đã hủy'}[c.status])}</strong><small>${esc(c.result||'')}</small></div>`).join('');
  const preview=document.querySelector('[data-r-action="preview"]');if(preview)preview.disabled=blocked(d)||sending;
  const mic=document.querySelector('[data-r-action="mic"]');if(mic)mic.disabled=(!listening&&blocked(d))||!window.isSecureContext||!(window.SpeechRecognition||window.webkitSpeechRecognition)||sending;
 }
 function view(options){
  ctx=options;
  const next=state().home?.id+':'+state().user?.id;
  if(next!==contextKey){leave();selected='';transcript='';contextKey=next;}
  if(!allowed()){leave();return '<section class="empty"><h1>Không có quyền điều khiển</h1><p>Trang dành cho chủ nhà/operator được quản lý nhà này.</p></section>';}
  const devices=state().home.devices;if(requested){selected=requested;requested='';}if(!devices.some(d=>d.id===selected))selected=devices[0]?.id||'';
  const d=device(),speech=window.SpeechRecognition||window.webkitSpeechRecognition,mic=!!speech&&window.isSecureContext;
  const history=state().commands.filter(c=>c.device_id===selected).slice(0,8);
  return `<section class="remote-page"><div class="page-head"><div><span class="overline">NODO / REMOTE CONTROL</span><h1>Điều khiển từ xa</h1><p>Bật/tắt đầu ra bằng nút hoặc giọng nói. Trạng thái cập nhật theo phản hồi thiết bị.</p></div></div><div class="remote-layout"><section class="panel-home remote-console"><label class="home-field">Thiết bị điều khiển<select id="remote-device">${devices.map(n=>`<option value="${esc(n.id)}" ${n.id===selected?'selected':''}>${esc(n.name)} · ${esc(n.room_name||n.id)}</option>`).join('')}</select></label>${d?`<div class="remote-status"><strong>${esc(d.name)}</strong><span class="state-tag ${d.connection==='online'?'':'warn'}">${esc(d.connection)}</span></div>${d.gas_alarm_active?'<p class="notice warning">Gas đang cảnh báo. Còi được ưu tiên và không cho tắt thủ công.</p>':''}<p class="muted-copy">${d.connection==='online'?'Trạng thái bên dưới do thiết bị báo.':'Đầu ra là trạng thái xác nhận cuối, chưa rõ hiện tại.'}</p><p class="notice warning" data-r-block-reason ${blocked(d)?'':'hidden'}>${esc(blockReason(d))}</p><div class="remote-outputs">${outputs(d).map(([a,name])=>`<article><div><h2>${name}</h2><span data-r-state="${a}">${d.reported_state[a]===undefined?'Chưa xác nhận':d.reported_state[a]?'Đang bật':'Đang tắt'}</span></div><div>${[true,false].map(value=>{const no=!!reason(d,{kind:'actuator',actuator:a,value});return `<button class="${value?'primary':'secondary'}" data-r-action="actuator" data-output="${a}" data-value="${value}" data-write data-blocked="${no}" ${no?'disabled':''}>${value?'Bật':'Tắt'} ${name.toLowerCase()}</button>`;}).join('')}</div></article>`).join('')}</div><p class="notice" data-r-pending ${d.pendingCommand?'':'hidden'}>Đang chờ ACK từ node; chưa coi thao tác là thành công.</p><p class="muted-copy">Lệnh tay giữ 5 phút, sau đó trở về quy tắc tự động. Cảnh báo nhiệt/gas luôn ưu tiên.</p>`:'<p>Nhà chưa có thiết bị. Nhận thiết bị trong trang Thiết bị trước.</p>'}</section><section class="panel-home remote-voice"><span class="overline">VOICE · TIẾNG VIỆT</span><h2>Ra lệnh bằng giọng nói</h2><p>Lệnh áp dụng cho thiết bị đang chọn. Nhận dạng xong cần xác nhận trước khi gửi.</p><button class="remote-mic" data-r-action="mic" ${!mic||blocked(d)?'disabled':''} aria-label="Bắt đầu ghi âm lệnh">🎙 <span>Bấm để nói</span></button><p class="remote-voice-status" role="status">${esc(!window.isSecureContext?'Micro cần HTTPS khi mở bằng IP điện thoại. Các nút bên trái vẫn dùng được.':!speech?'Trình duyệt chưa hỗ trợ nhận dạng giọng nói. Bạn có thể nhập câu lệnh bên dưới.':message)}</p><label class="home-field" for="remote-transcript">Câu lệnh nhận được</label><textarea id="remote-transcript" maxlength="160" rows="2" placeholder="Ví dụ: Bật quạt">${esc(transcript)}</textarea><button class="primary" data-r-action="preview" ${blocked(d)?'disabled':''}>Xem trước lệnh</button><div class="remote-examples"><span>Thử nói:</span>${['Bật quạt','Tắt quạt','Bật còi','Tắt còi','Bật đèn','Tắt đèn'].map(t=>`<button class="text-button" data-r-action="example" aria-label="Câu mẫu: ${t}" data-text="${t}">${t}</button>`).join('')}</div><p class="remote-privacy">Ứng dụng không lưu bản ghi âm. Trình duyệt có thể dùng dịch vụ nhận dạng trực tuyến; cần Internet và quyền micro. Ngưỡng cảm biến chỉnh riêng ở Thiết bị.</p></section></div><section class="panel-home remote-history"><h2>Lệnh gần đây của thiết bị</h2>${history.map(c=>`<div><span>${c.kind==='config'?'Cấu hình/chế độ':esc(c.payload.actuator)+' → '+(c.payload.value?'bật':'tắt')} · ${c.source==='voice'?'Voice':c.source==='gas_rule'?'Báo động gas':'Thao tác web'}</span><strong>${esc({pending:'Chờ ACK',applied:'Đã áp dụng',failed:'Thất bại',timeout:'Hết thời gian',cancelled:'Đã hủy'}[c.status])}</strong><small>${esc(c.result||'')}</small></div>`).join('')||'<p>Chưa có lệnh.</p>'}</section></section>`;
 }
 async function send(action,channel='manual'){
  const d=device(),error=reason(d,action);if(error)throw Error(error);
  sending=true;stop();sync();
  try{
   if(action.kind==='mode')await ctx.api('/devices/'+encodeURIComponent(d.id)+'/config','PATCH',{mode:action.mode,channel});
   else await ctx.api('/devices/'+encodeURIComponent(d.id)+'/commands','POST',{actuator:action.actuator,value:action.value,channel});
   ctx.toast('Đã gửi lệnh, đang chờ ACK từ thiết bị.');
  }finally{sending=false;await ctx.reload();}
 }
 function preview(){
  transcript=document.querySelector('#remote-transcript')?.value||transcript;
  const action=parse(transcript);if(!action)throw Error('Chưa hiểu câu lệnh. Dùng một câu trong danh sách, ví dụ “Bật quạt”.');
  const d=device(),error=reason(d,action);if(error)throw Error(error);
  intent={...action,deviceId:d.id,homeId:state().home.id};
  let dialog=document.querySelector('#remote-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='remote-dialog';document.body.append(dialog);}
  dialog.innerHTML=`<div class="remote-confirm"><h2>Xác nhận lệnh voice</h2><p>${esc(label(action))}</p><strong>${esc(d.name)}</strong><p>${esc(d.room_name||'Chưa xếp phòng')} · ${esc(state().home.name)}</p><div><button class="secondary" data-r-action="cancel">Hủy</button><button class="primary" data-r-action="confirm">Xác nhận gửi lệnh</button></div></div>`;dialog.showModal();
 }
 function microphone(){
  if(listening){stop();message='Đã dừng micro.';return ctx.reload();}
  if(!window.isSecureContext)throw Error('Cần HTTPS để dùng micro từ điện thoại.');
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Speech)throw Error('Trình duyệt không hỗ trợ micro nhận dạng.');
  if(blocked(device()))throw Error('Kiểm tra kết nối và quyền điều khiển trước khi dùng micro.');
  recognition=new Speech();recognition.lang='vi-VN';recognition.continuous=false;recognition.interimResults=false;recognition.maxAlternatives=1;
  const current=++generation,homeId=state().home.id,deviceId=selected;
  const status=text=>{message=text;const box=document.querySelector('.remote-voice-status');if(box)box.textContent=text;};
  recognition.onresult=event=>{if(current!==generation||homeId!==state().home?.id||deviceId!==selected||!allowed()||!navigator.onLine)return;transcript=event.results[0][0].transcript;const input=document.querySelector('#remote-transcript');if(input)input.value=transcript;status('Đã nhận dạng. Kiểm tra câu lệnh rồi bấm Xem trước lệnh.');};
  recognition.onerror=event=>{if(current!==generation)return;status({'not-allowed':'Chưa được cấp quyền micro. Kiểm tra quyền của trang trong trình duyệt.','audio-capture':'Không tìm thấy micro khả dụng.','no-speech':'Chưa nghe thấy giọng nói, thử lại.','network':'Dịch vụ nhận dạng mất mạng. Bạn vẫn có thể dùng nút hoặc nhập lệnh.'}[event.error]||'Không nhận dạng được, hãy nhập lệnh hoặc thử lại.');};
  recognition.onend=()=>{if(current===generation){listening=false;recognition=null;const label=document.querySelector('.remote-mic span');if(label)label.textContent='Bấm để nói';}};
  try{listening=true;recognition.start();status('Đang nghe… Bấm micro để dừng.');document.querySelector('.remote-mic span').textContent='Dừng nghe';}catch{stop();throw Error('Không mở được micro, kiểm tra quyền hoặc thử lại.');}
 }
 document.addEventListener('input',e=>{if(e.target.id==='remote-transcript')transcript=e.target.value;});
 document.addEventListener('change',e=>{if(e.target.id==='remote-device'){leave();selected=e.target.value;transcript='';ctx.reload();}});
 document.addEventListener('click',e=>{const b=e.target.closest('[data-r-action]');if(!b||b.disabled||sending)return;const action=b.dataset.rAction;Promise.resolve().then(async()=>{
  if(action==='mic')return microphone();if(action==='preview')return preview();
  if(action==='example'){transcript=b.dataset.text;document.querySelector('#remote-transcript').value=transcript;return;}
  if(action==='cancel'){intent=null;document.querySelector('#remote-dialog').close();return;}
  if(action==='confirm'){const chosen=intent;intent=null;document.querySelector('#remote-dialog').close();if(!chosen||chosen.deviceId!==selected||chosen.homeId!==state().home?.id)throw Error('Nhà hoặc thiết bị đã đổi. Tạo lệnh mới.');return send(chosen,'voice');}
  if(action==='mode')return send({kind:'mode',mode:b.dataset.mode});
  if(action==='actuator')return send({kind:'actuator',actuator:b.dataset.output,value:b.dataset.value==='true'});
 }).catch(error=>ctx?.toast(error.message,true));});
 window.addEventListener('offline',()=>{leave();message='Mất mạng, micro đã dừng. Không xếp hàng lệnh.';document.querySelectorAll('[data-r-action="preview"],[data-r-action="mic"]').forEach(b=>b.disabled=true);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
 return {view,leave,sync,select:id=>{leave();requested=id;},isBusy:()=>listening||sending||!!document.querySelector('#remote-dialog')?.open||document.activeElement?.id==='remote-transcript'};
})();
