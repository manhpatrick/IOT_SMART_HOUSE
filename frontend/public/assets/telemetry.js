// Bounded client pagination over the API query; never presents this as the full DB history.
window.NodoTelemetry = (() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const time = value => new Date(value).toLocaleString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'});
  const metrics = [['temperature','Nhiệt độ','°C','#da7946'],['humidity','Độ ẩm','%RH','#378a79'],['light_percent','Độ sáng','%','#a47d21'],['gas_raw','Gas','ADC raw','#b94b36']];
  let key='', page=1, size=25, latest=[], snapshot=null, seen=new Set(), highlights=new Map(), columns=[], deviceMap=new Map();
  const id = row => row.id || `${row.device_id}:${row.boot_id}:${row.seq}`;
  const placement=d=>d.home_id?`${d.home_name||'Ngôi nhà'} / ${d.room_name||'Chưa xếp phòng'}`:'Chưa bàn giao';
  const valid = value => typeof value==='number' && Number.isFinite(value);
  function table() {
    const rows=snapshot||latest, pages=Math.max(1,Math.ceil(rows.length/size));
    page=Math.min(page,pages);
    const start=(page-1)*size, selected=rows.slice(start,start+size);
    const captured=new Set((snapshot||[]).map(id));
    const newer=snapshot?latest.filter(r=>!captured.has(id(r))).length:0;
    return `<div class="panel-header"><div><h2 class="panel-title">Lịch sử số đo</h2><p class="panel-subtitle">${snapshot?'Đang giữ vị trí đọc · bấm Về mới nhất để cập nhật bảng':'Mới nhất trước · thời gian Việt Nam'}</p></div><span class="badge ${newer?'green':''}">${newer?newer+' bản ghi mới trong truy vấn':latest.length+' bản ghi khớp bộ lọc'}</span></div>
      <div class="table-wrap"><table class="telemetry-table"><caption class="sr-only">Lịch sử cảm biến, trang ${page} trên ${pages}</caption><thead><tr><th scope="col">THỜI GIAN</th><th scope="col">THIẾT BỊ</th>${columns.map(([,name,unit])=>`<th scope="col">${name.toUpperCase()} (${unit})</th>`).join('')}<th scope="col">SEQ</th></tr></thead><tbody>${selected.map(r=>`<tr class="${page===1&&(highlights.get(id(r))||0)>Date.now()?'telemetry-new':''}"><td>${time(r.recorded_at)}</td><td><strong>${esc(r.device_name||r.device_id)}</strong><span class="subtext mono">${esc(r.device_id)}</span></td>${columns.map(([field])=>`<td>${valid(r[field])?esc(r[field]):'<span class="telemetry-na" title="Không có giá trị cho chỉ số này">Không có dữ liệu</span>'}</td>`).join('')}<td class="mono">${esc(r.seq)}</td></tr>`).join('')||`<tr><td colspan="${3+columns.length}" class="telemetry-empty">Chưa có bản ghi khớp bộ lọc.</td></tr>`}</tbody></table></div>
      <div class="telemetry-pagination"><span>${rows.length?start+1:0}–${Math.min(start+size,rows.length)} / ${rows.length} bản ghi đã tải</span><label>Số dòng <select id="telemetry-size" aria-label="Số dòng mỗi trang">${[25,50].map(n=>`<option ${n===size?'selected':''}>${n}</option>`).join('')}</select></label><div><button class="btn btn-secondary btn-small" data-t-action="latest">Về mới nhất</button><button class="btn btn-secondary btn-small" data-t-action="prev" ${page===1?'disabled':''}>Trước</button><span aria-live="polite">${page} / ${pages}</span><button class="btn btn-secondary btn-small" data-t-action="next" ${page===pages?'disabled':''}>Sau</button></div></div>`;
  }
  function view({rows,devices,filter,hours,search,broker,demo}) {
    const nextKey=JSON.stringify([filter,hours,search]);
    const reset=key!==nextKey;
    if(reset){key=nextKey;page=1;snapshot=null;seen=new Set();highlights.clear();}
    deviceMap=new Map(devices.map(d=>[d.id,d]));
    const selected=devices.filter(d=>filter==='all'||d.id===filter);
    columns=metrics.filter(([field])=>selected.some(d=>field==='light_percent'?['climate','lighting'].includes(d.profile):d.profile==='climate'));
    latest=rows.filter(r=>`${r.device_id} ${r.device_name}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))).slice().reverse();
    if(!reset&&seen.size)for(const r of latest)if(!seen.has(id(r)))highlights.set(id(r),Date.now()+2200);
    seen=new Set(latest.map(id));
    for(const [rowId,expiry] of highlights)if(expiry<Date.now())highlights.delete(rowId);
    const cards=(filter==='all'?[]:columns).map(([field,name,unit])=>{
      const candidates=selected.filter(d=>valid(d.latest?.[field])).sort((a,b)=>Date.parse(b.latest.recorded_at)-Date.parse(a.latest.recorded_at));
      const d=candidates[0], fresh=d?.data_status==='fresh'&&d?.connection==='online';
      return `<article class="stat-card ${fresh?'':'telemetry-muted'}"><div class="stat-top"><span>${name}</span><span class="badge ${fresh?'green':'orange'}">${!d?'Chưa có số đo':fresh?'Mới':'Lần đo cuối'}</span></div><div class="stat-value">${d?esc(d.latest[field]):'—'}<small>${unit}</small></div><p class="telemetry-note">${d?esc(d.name)+' · '+time(d.latest.recorded_at):'Chờ thiết bị gửi dữ liệu'}</p>${selected.length>1?'<small class="muted">Số đo gần nhất trong các node được chọn</small>':''}</article>`;
    });
    const connectionHTML=`<div class="telemetry-connection"><div><span class="badge ${demo?'orange':broker?.connected?'green':'red'}">${demo?'Mô phỏng':broker?.connected?'Broker đã kết nối':'Broker mất kết nối'}</span><span>${selected.filter(d=>d.connection==='online').length}/${selected.length} ESP32 online</span></div><span class="telemetry-note">${demo?'Dữ liệu thử nghiệm':selected.some(d=>!d.home_id)?'Thiết bị chưa bàn giao vẫn có thể kết nối MQTT.':'Kết nối broker và kết nối ESP32 được theo dõi riêng.'}</span></div>`;

    return `<section class="telemetry-section" aria-label="Giám sát dữ liệu cảm biến"><div class="telemetry-filters"><label>Thiết bị<select id="page-filter" aria-label="Chọn node"><option value="all">Tất cả thiết bị</option>${devices.map(d=>`<option value="${esc(d.id)}" ${filter===d.id?'selected':''}>${esc(d.name)} · ${esc(d.id)} — ${esc(placement(d))}</option>`).join('')}</select></label><div class="telemetry-period" role="group" aria-label="Khoảng thời gian">${[1,6,24,168].map(h=>`<button data-action="telemetry-period" data-hours="${h}" aria-pressed="${hours===h}" class="${hours===h?'active':''}">${h===168?'7 ngày':h+' giờ'}</button>`).join('')}</div><span class="telemetry-note">Tối đa 1.000 bản ghi gần nhất mỗi truy vấn</span></div>${connectionHTML}<div class="telemetry-metrics">${cards.join('')}</div>${filter==='all'?`<section class="panel mb-5 telemetry-node-summary"><div class="panel-header"><div><h2 class="panel-title">Số đo theo từng ESP32</h2><p class="panel-subtitle">Mỗi dòng là một node. Chọn thiết bị để xem riêng biểu đồ, lịch sử và xuất CSV.</p></div></div><div class="table-wrap"><table><thead><tr><th>THIẾT BỊ / NHÀ / PHÒNG</th><th>KẾT NỐI / DỮ LIỆU</th>${metrics.map(([,name,unit])=>'<th>'+name+' ('+unit+')</th>').join('')}<th>ĐO LÚC</th><th></th></tr></thead><tbody>${selected.map(d=>'<tr data-summary-node="'+esc(d.id)+'"><td><strong>'+esc(d.name)+'</strong><span class="subtext mono">'+esc(d.id)+'</span><span class="subtext">'+esc(placement(d))+'</span></td><td>'+esc(({online:'Online',offline:'Offline',unknown:'Chưa rõ kết nối'})[d.connection]||d.connection)+'<span class="subtext">'+esc(({fresh:'Số đo mới',stale:'Số đo cũ',missing:'Chưa có số đo'})[d.data_status]||d.data_status)+'</span></td>'+metrics.map(([key])=>'<td class="'+(d.data_status!=='fresh'||d.connection!=='online'?'telemetry-muted':'')+'">'+(valid(d.latest?.[key])?esc(d.latest[key]):'—')+'</td>').join('')+'<td>'+(d.latest?time(d.latest.recorded_at):'—')+'</td><td><button class="btn btn-secondary btn-small" data-t-action="select" data-id="'+esc(d.id)+'">Xem node</button></td></tr>').join('')||'<tr><td colspan="8">Chưa có thiết bị.</td></tr>'}</tbody></table></div></section>`:'<div class="telemetry-selected"><div><strong>'+esc(selected[0]?.name||filter)+'</strong><span class="mono">'+esc(filter)+'</span></div><span class="badge">'+esc(selected[0]?placement(selected[0]):'Chưa có thiết bị')+'</span></div>'}<section class="panel mb-5"><div class="panel-header"><div><h2 class="panel-title">Xu hướng cảm biến</h2><p class="panel-subtitle">Lịch sử theo thiết bị và chỉ số · tách trục °C, % và ADC</p></div></div>${latest.length?'<div class="chart-wrap"><canvas id="telemetry-chart" role="img" aria-label="Biểu đồ lịch sử theo từng thiết bị"></canvas></div>':'<div class="telemetry-empty"><strong>Chưa có dữ liệu cảm biến</strong><span>Chọn khoảng thời gian khác hoặc chờ ESP32 gửi số đo.</span></div>'}</section><section id="telemetry-table-panel" class="panel" aria-label="Bảng lịch sử cảm biến">${table()}</section><details class="telemetry-query-help"><summary>Giới hạn truy vấn & xuất CSV</summary><p class="telemetry-note">Biểu đồ dùng tối đa 250 điểm mỗi đường; bảng phân trang trên dữ liệu đã tải, không phải toàn bộ database. Thẻ tóm tắt là số đo gần nhất, độc lập khoảng lịch sử. Xuất CSV dùng node/khoảng thời gian đã chọn, tối đa 2.000 dòng; không áp dụng tìm kiếm văn bản.</p></details></section>`;
  }
  function chart() {
    const canvas=document.querySelector('#telemetry-chart');if(!canvas||!window.Chart)return null;
    const datasets=[];
    for(const [index,device] of [...deviceMap.values()].entries())for(const [field,name,unit,color] of columns){
      const rows=latest.filter(r=>r.device_id===device.id&&valid(r[field])).reverse();if(!rows.length)continue;
      const stride=Math.max(1,Math.ceil(rows.length/249)),data=[];
      for(let i=0;i<rows.length;i++){
        if(i&&Date.parse(rows[i].recorded_at)-Date.parse(rows[i-1].recorded_at)>60000)data.push({x:Date.parse(rows[i-1].recorded_at)+1,y:null});
        if(i%stride===0||i===rows.length-1)data.push({x:Date.parse(rows[i].recorded_at),y:rows[i][field]});
      }
      datasets.push({label:`${device.name} · ${name} (${unit})`,data,borderColor:color,backgroundColor:color,borderDash:index%2?[5,4]:[],borderWidth:2,pointRadius:2,pointHitRadius:8,tension:0,spanGaps:false,yAxisID:field==='temperature'?'y':field==='gas_raw'?'gas':'percent'});
    }
    return new Chart(canvas,{type:'line',data:{datasets},options:{responsive:true,maintainAspectRatio:false,animation:false,parsing:false,plugins:{legend:{position:'bottom',labels:{boxWidth:16,font:{size:11}}},tooltip:{callbacks:{title:items=>items.length?time(items[0].parsed.x):''}}},scales:{gas:{display:datasets.some(d=>d.yAxisID==='gas'),position:'right',min:0,max:4095,grid:{drawOnChartArea:false},title:{display:true,text:'Gas ADC raw'}},x:{type:'linear',ticks:{maxTicksLimit:6,maxRotation:0,callback:value=>new Date(value).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'})},grid:{display:false}},y:{display:datasets.some(d=>d.yAxisID==='y'),title:{display:true,text:'°C'}},percent:{display:datasets.some(d=>d.yAxisID==='percent'),position:'right',min:0,max:100,grid:{drawOnChartArea:false},title:{display:true,text:'%RH / % ánh sáng'}}}}});
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-t-action]');if(!button||button.disabled)return;
    if(button.dataset.tAction==='select'){const select=document.querySelector('#page-filter');select.value=button.dataset.id;select.dispatchEvent(new Event('change',{bubbles:true}));return;}
    if(button.dataset.tAction==='next'){snapshot ||= latest.slice();page++;}
    if(button.dataset.tAction==='prev'){page=Math.max(1,page-1);if(page===1)snapshot=null;}
    if(button.dataset.tAction==='latest'){page=1;snapshot=null;}
    document.querySelector('#telemetry-table-panel').innerHTML=table();
  });
  document.addEventListener('change',event=>{if(event.target.id==='telemetry-size'){size=Number(event.target.value);page=1;snapshot=null;document.querySelector('#telemetry-table-panel').innerHTML=table();}});
  return {view,chart};
})();
