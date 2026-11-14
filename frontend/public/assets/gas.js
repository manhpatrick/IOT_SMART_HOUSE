window.NodoGas = (()=>{
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function panel(d){
  if(d.profile!=='climate')return '';
  const valid=typeof d.gas_raw==='number',fresh=valid&&d.connection==='online'&&Date.now()-Date.parse(d.gas_recorded_at)<60000;
  const active=!!d.gas_alarm_active;
  return `<section class="gas-panel ${active?'gas-danger':''}" aria-label="Giám sát gas"><div class="gas-title"><strong>Gas · MQ-2</strong><span>${active?'CẢNH BÁO':!valid?'CHƯA CÓ SỐ ĐO':fresh?'Dưới ngưỡng báo động':'DỮ LIỆU CŨ'}</span></div><div class="gas-reading">${valid?esc(d.gas_raw):'—'} <small>ADC raw / 4095</small></div><p>Báo động từ ${esc(d.config.gasThreshold??1200)} · kết thúc khi ≤ ${esc(d.config.gasClearThreshold??1000)}</p><p>${active?'Gas còn cảnh báo; xác nhận thông báo không tắt còi. ':''}Còi ${d.connection!=='online'?'(trạng thái lần cuối) ':''}: ${d.reported_state?.buzzer===true?'thiết bị báo đang bật':active?'đang yêu cầu bật, chờ thiết bị xác nhận':d.reported_state?.buzzer===false?'thiết bị báo đang tắt':'chưa có xác nhận'}.</p>${valid?`<p>Đo lúc ${esc(new Date(d.gas_recorded_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}))}</p>`:''}<small>Số ADC thô, chưa phải ppm hoặc kết luận nồng độ an toàn.</small></section>`;
 }
 function fields(c){return `<label class="field home-field">Ngưỡng cảnh báo gas (ADC)<input name="gasThreshold" type="number" min="1" max="4095" step="1" required value="${esc(c.gasThreshold??1200)}"></label><label class="field home-field">Kết thúc cảnh báo gas khi ≤ (ADC)<input name="gasClearThreshold" type="number" min="0" max="4094" step="1" required value="${esc(c.gasClearThreshold??1000)}"></label><p class="gas-help">Cảnh báo gas hoạt động cả Auto/Manual. Ngưỡng kết thúc phải thấp hơn ngưỡng báo động. Cấu hình chỉ có hiệu lực sau ACK.</p>`;}
 return {panel,fields};
})();
