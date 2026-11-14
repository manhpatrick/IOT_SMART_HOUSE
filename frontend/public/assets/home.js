/* NODO Home: the API is the authority for memberships, telemetry and command results. */
const $ = q => document.querySelector(q);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const paths = { home:'m3 10 9-7 9 7v11h-7v-7h-4v7H3z', rooms:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', devices:'M6 6h12v12H6zM9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4', alerts:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4', members:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8m6 10v-2a4 4 0 0 0-3-4M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', activity:'M4 3h16v18H4zM8 8h8m-8 4h8m-8 4h5', climate:'M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0M12 8v10', lighting:'M9 18h6m-5 3h4M8 14a7 7 0 1 1 8 0l-1 2H9z', chart:'M3 3v18h18M7 14l4-5 4 3 5-7' };
const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.home}"/></svg>`;
const S = { user:null, csrf:'', homes:[], home:null, homeId:new URL(location.href).searchParams.get('homeId') || '', tab:'overview', room:'all', alerts:[], commands:[], invitations:[], overview:null, connected:false, socketLive:false, lastSync:null, chart:null, loading:false, chartDevice:'', hours:24, socket:null, retry:0, stopped:false };
const titles = { homes:'Các ngôi nhà', overview:'Tổng quan', rooms:'Phòng', devices:'Thiết bị', alerts:'Cảnh báo', ai:'AI & bảo mật', members:'Thành viên', activity:'Hoạt động' };
const date = v => v ? new Intl.DateTimeFormat('vi-VN', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' }).format(new Date(v)) : 'Chưa có';
const age = v => { if (!v) return 'Chưa có'; const n = Math.max(0, Math.floor((Date.now() - Date.parse(v)) / 1000)); return n < 60 ? `${n} giây trước` : n < 3600 ? `${Math.floor(n / 60)} phút trước` : `${Math.floor(n / 3600)} giờ trước`; };
const manage = () => !!S.home && (S.user?.role === 'admin' || (S.user?.role === 'operator' && S.home.access_role === 'operator'));
const nodes = () => S.home?.devices || [];
const currentAlerts = () => S.alerts.filter(a => nodes().some(d => d.id === a.device_id));
const currentCommands = () => S.commands.filter(c => nodes().some(d => d.id === c.device_id));
const tag = (label, style = '') => `<span class="state-tag ${style}">${esc(label)}</span>`;
const btn = (action, text, cls = 'secondary', attrs = '') => `<button class="${cls}" data-action="${action}" ${attrs}>${text}</button>`;
function toast(text, error = false) { const el = document.createElement('div'); el.className = `home-toast${error ? ' error' : ''}`; el.textContent = text; if ($('#home-toasts').children.length >= 3) $('#home-toasts').firstChild.remove(); $('#home-toasts').append(el); setTimeout(() => el.remove(), 6000); }
function connection() {
  const online = navigator.onLine && S.connected;
  $('#server-dot').classList.toggle('connected', online);
  $('#connection-text').textContent = !navigator.onLine ? 'Điện thoại đang mất mạng' : !S.connected ? 'Không kết nối được máy chủ' : S.socketLive ? 'Đang cập nhật trực tiếp' : 'Đang cập nhật định kỳ';
  const banner = $('#connection-banner');
  banner.hidden = online;
  banner.textContent = `${!navigator.onLine ? 'Mất kết nối Internet.' : 'Chưa nhận được phản hồi từ máy chủ.'} ${S.lastSync ? 'Dữ liệu trên màn hình được nhận lúc ' + date(S.lastSync) + '.' : 'Chưa tải được dữ liệu.'} Các thao tác bị tạm khóa; không có lệnh nào được xếp hàng để tự gửi lại.`;
  document.querySelectorAll('[data-write]').forEach(el => { el.disabled = !online || S.loading || el.dataset.blocked === 'true'; });
}
async function api(path, method = 'GET', body) {
  if (method !== 'GET' && (!navigator.onLine || !S.connected)) throw new Error('Chờ kết nối máy chủ trở lại trước khi thực hiện thao tác.');
  let response;
  try { response = await fetch('/api' + path, { method, credentials:'same-origin', cache:'no-store', signal:AbortSignal.timeout(10000), headers:{ 'Content-Type':'application/json', 'X-CSRF-Token':S.csrf }, ...(body ? { body:JSON.stringify(body) } : {}) }); }
  catch { S.connected = false; connection(); throw new Error(method === 'GET' ? 'Không kết nối được máy chủ. Đang thử lại…' : 'Chưa nhận được phản hồi. Kiểm tra lịch sử lệnh trước khi gửi lại.'); }
  if (response.status === 401) { S.stopped = true; S.home = null; $('#main').replaceChildren(); location.replace('/login' + (location.hash.startsWith('#join=') ? location.hash : '')); throw new Error('Phiên đăng nhập đã kết thúc.'); }
  const data = await response.json();
  if (response.status >= 500) { S.connected = false; connection(); }
  if (!response.ok) { const e = new Error(data.error || 'Không thể hoàn tất thao tác.'); e.status = response.status; throw e; }
  return data;
}
function navigation() {
  const tabs = [...(S.user.role === 'admin' ? ['homes'] : []), 'overview','rooms','devices','alerts','ai', ...(manage() ? ['members','activity'] : [])];
  const links = tabs.map(t => `<a class="home-nav-link ${S.tab === t ? 'active' : ''}" href="#${t}" ${S.tab === t ? 'aria-current="page"' : ''}>${icon(t === 'homes' ? 'home' : t === 'overview' ? 'home' : t)}<span>${titles[t]}</span>${t === 'alerts' && currentAlerts().some(a => a.status === 'open') ? `<span class="nav-pill">${currentAlerts().filter(a => a.status === 'open').length}</span>` : ''}</a>`);
  $('#side-nav').innerHTML = links.join('');
  $('#mobile-nav').innerHTML = tabs.filter(t => !['activity', 'members'].includes(t)).map(t => links[tabs.indexOf(t)]).join('');
  $('#house-picker').innerHTML = S.homes.length ? S.homes.map(h => `<option value="${esc(h.id)}" ${h.id === S.homeId ? 'selected' : ''}>${esc(h.name)}</option>`).join('') : '<option value="">Chưa tham gia nhà nào</option>';
}
function head(title, description, actions = '') { return `<div class="page-head"><div><span class="overline">${S.user.role === 'admin' ? 'NODO / SYSTEM OVERVIEW' : 'NODO / YOUR CONNECTED HOME'}</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="head-buttons">${actions}</div></div>`; }
function writable(action, text, attrs = '', cls = 'primary', blocked = false) { return btn(action, text, cls, `data-write data-blocked="${blocked}" ${blocked || !S.connected ? 'disabled' : ''} ${attrs}`); }
function empty(title, copy, actions = '') { return `<div class="empty">${icon('home','icon-small')}<h2>${esc(title)}</h2><p>${esc(copy)}</p>${actions}</div>`; }
function status(d) { return tag(d.connection === 'online' ? '● Online' : d.connection === 'unknown' ? 'Chưa rõ kết nối' : 'Offline', d.connection === 'online' ? '' : d.connection === 'unknown' ? 'warn' : 'neutral'); }
function deviceCard(d) {
  const blocked = d.connection !== 'online' || d.lifecycle !== 'active' || !!d.pendingCommand || !S.overview?.broker.connected;
  const manual = d.config.mode === 'MANUAL';
  const read = (key, unit, label) => `<div><div class="reading">${d.latest?.[key] ?? '—'}<small>${unit}</small></div><div class="reading-label">${label}</div></div>`;
  const outputs = d.profile === 'climate' ? [['fan','Quạt'],['buzzer','Còi']] : [['light','Đèn']];
  return `<article class="node-card ${d.data_status !== 'fresh' ? 'stale' : ''}" data-device="${esc(d.id)}"><div class="node-header"><span class="node-symbol ${d.profile}">${icon(d.profile)}</span>${status(d)}</div><h3>${esc(d.name)}</h3><div class="node-subtitle">${esc(d.room_name || 'Chưa xếp phòng')} · ${esc(d.id)} ${tag(manual ? 'Thủ công' : 'Tự động','neutral')}</div><div class="readings">${d.profile === 'climate' ? read('temperature','°C','Nhiệt độ') + read('humidity','%','Độ ẩm') : read('light_percent','%','Độ sáng tương đối')}</div><div class="node-footnote">${d.data_status === 'missing' ? 'Chưa có dữ liệu cảm biến.' : `${d.data_status === 'stale' ? '⚠ Dữ liệu cũ · ' : ''}Đo lúc ${date(d.latest.recorded_at)}`}<br>Heartbeat: ${age(d.last_seen)}${d.fault ? `<br>${tag('Lỗi: ' + d.fault,'bad')}` : ''}${d.pendingCommand ? `<br>${tag(d.pendingCommand.ack_received_at ? 'Đã nhận ACK · đang đồng bộ' : 'Đang chờ thiết bị xác nhận','warn')}` : ''}</div>${window.NodoGas.panel(d)}<div class="node-controls">${outputs.map(([output,label]) => `<div class="control-item"><span>${label}</span>${manage() ? `<button class="switch ${d.reported_state[output] ? 'on' : ''}" role="switch" aria-label="${label} · ${esc(d.name)}" aria-checked="${!!d.reported_state[output]}" data-action="toggle" data-id="${esc(d.id)}" data-output="${output}" data-write data-blocked="${blocked || !manual || (output === 'buzzer' && d.gas_alarm_active && d.reported_state.buzzer)}" ${blocked || !manual || (output === 'buzzer' && d.gas_alarm_active && d.reported_state.buzzer) ? 'disabled' : ''}><span></span></button>` : tag(d.reported_state[output] === undefined ? 'Chưa rõ' : d.reported_state[output] ? 'Bật' : 'Tắt','neutral')}</div>`).join('')}</div><div class="node-links">${manage() ? `${writable('config','Cấu hình & chế độ',`data-id="${esc(d.id)}"`,'text-button',blocked)}${btn('move','Đổi tên / phòng','text-button',`data-id="${esc(d.id)}"`)}` : '<span class="muted-copy">Quyền chỉ xem</span>'}${btn('history','Lịch sử ↗','text-button',`data-id="${esc(d.id)}"`)}</div>${manage() && !manual ? '<div class="muted-copy">Chuyển sang Thủ công để bật/tắt trực tiếp.</div>' : ''}</article>`;
}
function roomTabs() { return `<div class="room-tabs">${[['all','Tất cả phòng'],...(S.home?.rooms || []).map(r => [r.id,r.name])].map(([id,name]) => `<button class="room-tab ${S.room === id ? 'active' : ''}" data-action="room-filter" data-id="${esc(id)}">${esc(name)}</button>`).join('')}</div>`; }
function deviceGrid() { const ds = nodes().filter(d => S.room === 'all' || d.room_id === S.room); return `<div class="node-grid">${ds.map(deviceCard).join('')}</div>${ds.length ? '' : empty('Chưa có thiết bị trong phòng','Thiết bị sẽ xuất hiện sau khi chủ nhà nhận và xếp vào phòng.')}`; }
const actionNames = { 'home.created':'Tạo nhà', 'home.updated':'Cập nhật nhà', 'room.created':'Tạo phòng', 'room.updated':'Đổi tên phòng', 'room.deleted':'Xóa phòng', 'device.moved':'Đổi tên / chuyển phòng', 'device.claimed':'Nhận thiết bị', 'member.invited':'Mời viewer', 'member.joined':'Tham gia nhà', 'member.removed':'Thu hồi quyền thành viên', 'member.invite_revoked':'Hủy lời mời', 'device.config':'Gửi cấu hình', 'device.actuator':'Gửi lệnh điều khiển', 'command.applied':'Thiết bị đã áp dụng', 'command.failed':'Thiết bị báo lỗi', 'alert.acknowledged':'Xác nhận cảnh báo', 'device.lifecycle':'Thay đổi vòng đời' };
function auditRows(rows) { return rows.map(a => `<div class="event-row"><span class="event-icon">↗</span><div class="event-content"><strong>${esc(actionNames[a.action] || a.action)}</strong><p>${esc(a.actor_name)} · ${esc(a.detail || a.target)}</p></div><time>${date(a.created_at)}</time></div>`).join('') || empty('Chưa có hoạt động','Các thay đổi trong nhà sẽ được ghi lại tại đây.'); }
function overview() {
  const ds = nodes(), fresh = ds.filter(d => d.connection === 'online' && d.data_status === 'fresh'), temps = fresh.filter(d => d.profile === 'climate'), lights = fresh.filter(d => d.profile === 'lighting');
  const average = (rows,key) => rows.length ? (rows.reduce((s,d) => s + d.latest[key],0) / rows.length).toFixed(1) : '—';
  const sum = (label,value,unit,hint,featured = false) => `<div class="summary-card ${featured ? 'featured' : ''}"><div class="label">${label}<span>↗</span></div><div class="value">${value}<small>${unit}</small></div><div class="hint">${hint}</div></div>`;
  return head(S.home.name, S.home.address || 'Một góc nhìn cho mọi kết nối trong nhà.', manage() ? writable('new-room','＋ Thêm phòng') : tag('Viewer · Chỉ xem','neutral')) + `<div class="summary-grid">${sum('Thiết bị kết nối',ds.filter(d => d.connection === 'online').length, '/ ' + ds.length,'Theo heartbeat gần nhất',true)}${sum('Nhiệt độ trung bình',average(temps,'temperature'),'°C',temps.length ? `${temps.length} node có dữ liệu mới` : 'Chưa có số đo mới')}${sum('Độ ẩm trung bình',average(temps,'humidity'),'%', 'Chỉ tính node có dữ liệu mới')}${sum('Cảnh báo chưa xử lý',currentAlerts().filter(a => a.status === 'open').length,'',ds.some(d => d.data_status !== 'fresh') ? 'Có dữ liệu cũ hoặc còn thiếu' : `${lights.length} node ánh sáng có dữ liệu mới`)}</div>${ds.some(d => d.data_status !== 'fresh') ? '<div class="notice warning">Dữ liệu cũ hoặc thiếu được đánh dấu riêng và không tính vào trung bình hiện tại. Heartbeat online không đồng nghĩa cảm biến đang gửi số đo mới.</div>' : ''}<div class="section-head"><h2>Không gian của bạn</h2><small>${S.home.rooms.length} phòng · ${ds.length} node</small></div>${roomTabs()}${deviceGrid()}<div class="overview-bottom"><section class="panel-home"><div class="section-head"><h2>Nhịp điệu ngôi nhà</h2><small>24 giờ gần nhất</small></div><div class="chart-box"><canvas id="home-chart" aria-label="Lịch sử số đo cảm biến" role="img"></canvas></div></section><section class="panel-home"><div class="section-head"><h2>${manage() ? 'Hoạt động gần đây' : 'Cảnh báo gần đây'}</h2>${tag('Trong nhà này','neutral')}</div>${manage() ? auditRows(S.home.audit.slice(0,4)) : alertRows(currentAlerts().slice(0,3))}</section></div>`;
}
function alertRows(rows) { return rows.map(a => `<div class="event-row"><span class="event-icon">${a.status === 'resolved' ? '✓' : '!'}</span><div class="event-content"><strong>${esc(a.message)}</strong><p>${esc(a.device_name)} · ${date(a.created_at)}${a.resolved_at ? ' · Hết bất thường ' + date(a.resolved_at) : ''}</p></div><div class="event-actions">${tag({open:'Chưa xử lý',acknowledged:'Đã xác nhận',resolved:'Đã hết bất thường'}[a.status],a.status === 'open' ? 'warn' : 'neutral')}${manage() && a.status === 'open' ? writable('ack','Xác nhận',`data-id="${esc(a.id)}"`,'secondary') : ''}</div></div>`).join('') || empty('Mọi thứ đang yên ổn','Chưa có cảnh báo trong nhà này.'); }
function roomsPage() { return head('Các phòng', 'Tổ chức các node theo không gian sử dụng.',manage() ? writable('new-room','＋ Thêm phòng') : '') + `<section class="panel-home">${S.home.rooms.map(r => `<div class="room-card"><span class="node-symbol lighting">${icon('rooms')}</span><div><h3>${esc(r.name)}</h3><p>${nodes().filter(d => d.room_id === r.id).length} node · ${nodes().filter(d => d.room_id === r.id && d.connection === 'online').length} online</p></div><div class="head-buttons">${btn('open-room','Xem','secondary',`data-id="${esc(r.id)}"`)}${manage() ? writable('edit-room','Đổi tên',`data-id="${esc(r.id)}"`,'secondary') + writable('delete-room','Xóa',`data-id="${esc(r.id)}"`,'danger') : ''}</div></div>`).join('') || empty('Chưa có phòng','Chủ nhà có thể tự đặt tên phòng và thêm nhiều node vào mỗi phòng.')}</section>`; }
function membersPage() { return head('Thành viên trong nhà','Viewer chỉ xem; operator quản lý nhà và thiết bị.',writable('invite','＋ Mời viewer')) + `<section class="panel-home">${S.home.members.map(m => `<div class="event-row"><span class="event-icon">${esc(m.name.slice(0,1))}</span><div class="event-content"><strong>${esc(m.name)}</strong><p>${esc(m.email)}</p></div><div class="event-actions">${tag(m.owner ? 'Operator · Chủ nhà' : 'Viewer','neutral')}${!m.owner ? writable('remove-member','Thu hồi',`data-id="${esc(m.user_id)}"`,'danger') : ''}</div></div>`).join('')}</section><div class="section-head"><h2>Lời mời</h2><small>Mã hết hạn sau 48 giờ</small></div><section class="panel-home">${S.invitations.map(i => `<div class="event-row"><div class="event-content"><strong>${esc(i.email)}</strong><p>Viewer · Hạn ${date(i.expires_at)}</p></div><div class="event-actions">${tag(i.status === 'pending' && Date.parse(i.expires_at) < Date.now() ? 'Hết hạn' : {pending:'Chờ chấp nhận',accepted:'Đã tham gia',revoked:'Đã hủy'}[i.status],'neutral')}${i.status === 'pending' ? writable('revoke-invite','Hủy',`data-id="${esc(i.id)}"`,'secondary') : ''}</div></div>`).join('') || empty('Chưa gửi lời mời','Mời bằng email và gửi mã/link trực tiếp cho người nhận.')}</section>`; }
function activityPage() { const names = {pending:'Chờ ACK',applied:'Đã áp dụng',failed:'Thất bại',timeout:'Hết thời gian',cancelled:'Đã hủy'}; return head('Hoạt động & điều khiển','Theo dõi người thực hiện, cấu hình và phản hồi thực tế từ node.') + `<section class="panel-home"><div class="section-head"><h2>Lịch sử lệnh</h2><small>Không tự gửi lại lệnh hết hạn</small></div>${currentCommands().map(c => `<div class="event-row"><span class="event-icon">↗</span><div class="event-content"><strong>${esc(c.device_name)} · ${c.kind === 'config' ? 'Cấu hình' : 'Điều khiển'}</strong><p>${esc(JSON.stringify(c.payload))}<br>${esc(c.result || 'Đang chờ xác nhận')} · ${date(c.created_at)}</p></div>${tag(names[c.status],c.status === 'applied' ? '' : 'warn')}</div>`).join('') || empty('Chưa có lệnh','Lệnh mới sẽ hiển thị cùng kết quả xác nhận.')}</section><div class="section-head"><h2>Audit log của nhà</h2></div><section class="panel-home">${auditRows(S.home.audit)}</section>`; }
function homesPage() { return head('Các ngôi nhà','Giám sát kết nối, dữ liệu và hoạt động theo từng nhà.',btn('create-home','＋ Thêm nhà','primary')) + `<div class="node-grid">${S.homes.map(h => `<article class="node-card"><div class="node-header"><span class="node-symbol">${icon('home')}</span>${tag(h.counts.online + '/' + h.counts.devices + ' online')}</div><h3>${esc(h.name)}</h3><p class="muted-copy">${esc(h.address || 'Chưa thêm địa chỉ')}</p><div class="readings"><div><div class="reading">${h.counts.devices}</div><div class="reading-label">Thiết bị</div></div><div><div class="reading">${h.counts.stale}</div><div class="reading-label">Dữ liệu cũ / thiếu</div></div></div>${btn('select-home','Giám sát nhà ↗','secondary',`data-id="${esc(h.id)}"`)}</article>`).join('')}</div>`; }
async function render() {
  if (S.chart) { S.chart.destroy(); S.chart = null; }
  navigation();
  let html;
  if (S.tab === 'ai') { window.NodoAI.configure({api,user:S.user,toast,reload:()=>load(true),allSecurity:S.user.role==='admin'}); html=await window.NodoAI.view({homeId:S.home?.id||null}); }
  else if (S.tab === 'homes' && S.user.role === 'admin') html = homesPage();
  else if (!S.home) html = head('Chào ' + S.user.name.split(' ').slice(-1)[0] + '!', 'Bắt đầu kết nối với ngôi nhà của bạn.') + empty('Chưa có ngôi nhà nào',S.user.role === 'viewer' ? 'Nhập mã mời được chủ nhà gửi để tham gia.' : 'Tạo nhà, đặt tên phòng và nhận thiết bị của bạn.',(S.user.role !== 'viewer' ? btn('create-home','＋ Tạo nhà','primary') : '') + btn('join','Nhập mã mời','secondary'));
  else {
    if (!manage() && ['activity','members'].includes(S.tab)) S.tab = 'overview';
    if (S.tab === 'overview') html = overview();
    if (S.tab === 'rooms') html = roomsPage();
    if (S.tab === 'devices') html = head('Thiết bị trong nhà','Thông số, trạng thái và điều khiển theo từng node.',manage() ? writable('claim','＋ Nhận thiết bị') : '') + roomTabs() + deviceGrid();
    if (S.tab === 'alerts') html = head('Cảnh báo','Xác nhận đã đọc và hết bất thường là hai trạng thái riêng.') + '<section class="panel-home">' + alertRows(currentAlerts()) + '</section>';
    if (S.tab === 'members') html = membersPage();
    if (S.tab === 'activity') html = activityPage();
  }
  const notice = S.overview?.demo ? '<div class="notice">DEMO · Số đo cảm biến và ACK đang được mô phỏng. Tài khoản, nhà/phòng và lịch sử được lưu trong MongoDB.</div>' : '';
  const brokerWarning = S.overview && !S.overview.broker.connected ? '<div class="notice warning">Backend đang mất kết nối MQTT broker. Chưa xác định được kết nối hiện tại của node; điều khiển bị tạm khóa.</div>' : '';
  const securityNotice=S.overview?.counts.security_alerts?`<div class="ai-security-banner"><span>Có ${S.overview.counts.security_alerts} cảnh báo giờ đăng nhập cần kiểm tra.</span><a href="#ai">AI & bảo mật ↗</a></div>`:'';
  $('#main').innerHTML = securityNotice + notice + brokerWarning + (html || overview());
  document.querySelectorAll('[data-device] .node-footnote').forEach(el => {
    const d = nodes().find(d => d.id === el.closest('[data-device]').dataset.device);
    if (d && d.connection !== 'online') el.append(document.createElement('br'),document.createTextNode('Đầu ra là trạng thái xác nhận cuối; chưa rõ hiện tại.'));
  });
  $('#updated-at').textContent = S.lastSync ? 'Đồng bộ ' + date(S.lastSync) : 'Chưa đồng bộ';
  connection();
  if ($('#home-chart')) await drawChart();
}
async function drawChart(deviceId = '', selector = '#home-chart') {
  const device = nodes().find(d => d.id === deviceId) || nodes().find(d => d.profile === 'climate') || nodes()[0];
  if (!device || !window.Chart) return;
  const rows = await api(`/telemetry?deviceId=${encodeURIComponent(device.id)}&hours=${S.hours}&limit=500`);
  const canvas = $(selector); if (!canvas) return;
  if (S.chart) S.chart.destroy();
  const light = device.profile === 'lighting';
  S.chart = new Chart(canvas,{type:'line',data:{labels:rows.map(r => date(r.recorded_at)),datasets:[{label:light ? 'Độ sáng (%)' : 'Nhiệt độ (°C)',data:rows.map(r => light ? r.light_percent : r.temperature),borderColor:'#72975c',backgroundColor:'#72975c12',fill:true,tension:.25,pointRadius:0,borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false}},scales:{x:{ticks:{maxTicksLimit:5,color:'#8b9685',font:{size:9}},grid:{display:false}},y:{ticks:{color:'#8b9685',font:{size:9}},grid:{color:'#eff2eb'}}}}});
}
async function load(quiet = false) {
  if (S.stopped) return;
  if (S.loading) { S.reload = true; return; } S.loading = true; connection();
  try {
    const [homes,overview,alerts,commands] = await Promise.all([api('/homes'),api('/overview'),api('/alerts'),api('/commands')]);
    S.homes = homes; S.overview = overview; S.alerts = alerts; S.commands = commands;
    if (!homes.some(h => h.id === S.homeId)) S.homeId = homes[0]?.id || '';
    const requestedHomeId = S.homeId;
    const home = requestedHomeId ? await api('/homes/' + encodeURIComponent(requestedHomeId)) : null;
    if (requestedHomeId !== S.homeId) { S.reload = true; return; }
    S.home = home;
    S.invitations = S.home && manage() ? await api('/homes/' + S.homeId + '/invitations') : [];
    S.connected = true; S.lastSync = new Date().toISOString();
    if (!$('#home-dialog').open&&!window.NodoAI?.isDialogOpen()) await render(); else connection();
  } catch (e) {
    if (e.status === 403 || e.status === 404) { S.home = null; S.homeId = ''; if ($('#home-dialog').open) $('#home-dialog').close(); await render(); }
    else if (!quiet && !S.lastSync) $('#main').innerHTML = empty('Chưa kết nối được','Kiểm tra Internet hoặc máy chủ rồi thử lại.',btn('refresh','Thử lại','primary'));
    if (!quiet && !S.stopped) toast(e.message,true); connection();
  } finally { S.loading = false; connection(); if (S.reload) { S.reload = false; queueMicrotask(() => load(true)); } }
}
function dialog(title, copy, content, form = '', submitText = 'Lưu thay đổi') {
  $('#dialog-body').innerHTML = `${form ? `<form id="${form}">` : ''}<div class="dialog-head"><div><h2>${esc(title)}</h2><p>${esc(copy)}</p></div><button type="button" class="close-button" data-action="close" aria-label="Đóng">×</button></div><div class="dialog-content">${content}<div class="home-form-error" role="alert" hidden></div></div>${form ? `<div class="dialog-actions"><button type="button" class="secondary" data-action="close">Hủy</button><button type="submit" class="primary">${submitText}</button></div></form>` : ''}`;
  if (!$('#home-dialog').open) $('#home-dialog').showModal();
}
const field = (name,label,value = '', type = 'text',attrs = '') => `<label class="home-field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs} required></label>`;
function roomField(selected = '') { return `<label class="home-field">Phòng<select name="room_id"><option value="">Chưa xếp phòng</option>${S.home.rooms.map(r => `<option value="${esc(r.id)}" ${selected === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>`; }
function configForm(id) {
  const d = nodes().find(d => d.id === id), c = d.config;
  if (!d || !manage()) return;
  dialog('Cấu hình ' + d.name,'Chờ node xác nhận trước khi cấu hình mới có hiệu lực.',`<input name="deviceId" type="hidden" value="${esc(id)}"><label class="home-field">Chế độ<select name="mode"><option value="AUTO" ${c.mode === 'AUTO' ? 'selected' : ''}>Tự động · Theo ngưỡng tại node</option><option value="MANUAL" ${c.mode === 'MANUAL' ? 'selected' : ''}>Thủ công · Điều khiển từ app</option></select></label><div class="field-grid">${d.profile === 'climate' ? field('fanOn','Bật quạt khi ≥ (°C)',c.fanOn,'number','min="15" max="60" step="0.1"') + field('fanOff','Tắt quạt khi ≤ (°C)',c.fanOff,'number','min="10" max="55" step="0.1"') : field('lightOn','Bật đèn khi ≤ (%)',c.lightOn,'number','min="0" max="99"') + field('lightOff','Tắt đèn khi ≥ (%)',c.lightOff,'number','min="1" max="100"')}</div>${d.profile === 'climate' ? field('temperatureAlert','Cảnh báo nhiệt độ từ (°C)',c.temperatureAlert,'number','min="20" max="75" step="0.1"') + window.NodoGas.fields(c) : ''}<div class="notice">Ngưỡng bật/tắt khác nhau giúp tránh đóng/ngắt liên tục. Auto chạy tại firmware; cảnh báo trên server vẫn hoạt động ở cả hai chế độ.</div>`,'config-form','Gửi cấu hình');
}
async function perform(action,el) {
  const id = el.dataset.id;
  if (action === 'close') return $('#home-dialog').close();
  if (action === 'refresh') { if (!S.user) return location.reload(); return load(); }
  if (action === 'logout') { await api('/auth/logout','POST'); S.stopped = true; S.home = null; S.homes = []; S.socket?.close(); location.replace('/login'); return; }
  if (action === 'select-home') { S.homeId = id; S.tab = 'overview'; S.room = 'all'; location.hash = 'overview'; return load(); }
  if (action === 'room-filter') { S.room = id; return render(); }
  if (action === 'open-room') { S.room = id; S.tab = 'devices'; location.hash = 'devices'; return render(); }
  if (action === 'new-room' || action === 'edit-room') { const r = S.home.rooms.find(r => r.id === id); dialog(r ? 'Đổi tên phòng' : 'Thêm phòng','Các thiết bị trong phòng cùng thuộc nhà này.',`<input type="hidden" name="id" value="${esc(id || '')}">${field('name','Tên phòng',r?.name || '', 'text','maxlength="80"')}`,'room-form'); return; }
  if (action === 'create-home' || action === 'edit-home') {
    let owners = '';
    if (S.user.role === 'admin' && action === 'create-home') { const users = await api('/users'); owners = `<label class="home-field">Operator / chủ nhà<select name="owner_id">${users.filter(u => u.role === 'operator' && u.status === 'active').map(u => `<option value="${esc(u.id)}">${esc(u.name)} · ${esc(u.email)}</option>`).join('')}<option value="${esc(S.user.id)}">Admin hiện tại</option></select></label>`; }
    dialog(action === 'create-home' ? 'Tạo ngôi nhà' : 'Thông tin nhà','Operator là chủ nhà và tự quản lý phòng, thiết bị, viewer.',`<input type="hidden" name="editing" value="${action === 'edit-home' ? S.homeId : ''}">${field('name','Tên nhà',action === 'edit-home' ? S.home.name : '', 'text','minlength="2" maxlength="80"')}<label class="home-field">Địa chỉ / ghi chú (tùy chọn)<input name="address" maxlength="200" value="${esc(action === 'edit-home' ? S.home.address : '')}"></label>${owners}`,'home-form'); return;
  }
  if (action === 'claim') return dialog('Nhận thiết bị','Nhập mã nhận thiết bị do admin bàn giao; mã khác mật khẩu MQTT.',field('deviceId','Device ID','','text','maxlength="40"') + field('code','Mã nhận thiết bị','','text','autocomplete="off" minlength="20" maxlength="100"') + roomField(),'claim-form','Nhận vào nhà');
  if (action === 'move') { const d = nodes().find(d => d.id === id); return dialog('Sắp xếp thiết bị','Đổi tên và chuyển phòng trong cùng nhà.',`<input type="hidden" name="deviceId" value="${esc(id)}">${field('name','Tên thiết bị',d.name,'text','minlength="2" maxlength="80"')}${roomField(d.room_id)}`,'move-form'); }
  if (action === 'config') return configForm(id);
  if (action === 'toggle') { const d = nodes().find(d => d.id === id); await api(`/devices/${encodeURIComponent(id)}/commands`,'POST',{actuator:el.dataset.output,value:!d.reported_state[el.dataset.output]}); toast('Đã gửi lệnh; đang chờ thiết bị xác nhận.'); return load(); }
  if (action === 'ack') { await api('/alerts/' + encodeURIComponent(id) + '/acknowledge','PATCH'); toast('Đã xác nhận đã đọc cảnh báo.'); return load(); }
  if (action === 'invite') return dialog('Mời viewer vào nhà','Viewer chỉ xem dữ liệu. Gửi mã hoặc link trực tiếp cho đúng email; app chưa gửi email tự động.',field('email','Email người nhận','','email','maxlength="120"'),'invite-form','Tạo lời mời');
  if (action === 'join') return dialog('Tham gia một ngôi nhà','Đăng nhập bằng đúng email được chủ nhà mời.',field('token','Mã mời',location.hash.startsWith('#join=') ? decodeURIComponent(location.hash.slice(6)) : '','text','minlength="20" maxlength="100" autocomplete="off"'),'join-form','Chấp nhận lời mời');
  if (action === 'copy-invite') { try { await navigator.clipboard.writeText($('#invite-link').textContent); toast('Đã sao chép link mời.'); } catch { toast('Chọn và sao chép link hiển thị trong hộp thoại.'); } return; }
  if (['delete-room','remove-member','revoke-invite'].includes(action)) { const descriptions = {'delete-room':'Chỉ xóa được phòng không còn thiết bị.','remove-member':'Người này mất quyền truy cập nhà ngay sau khi thu hồi. Tài khoản của họ vẫn tồn tại.','revoke-invite':'Mã mời này sẽ không còn dùng được.'}; return dialog('Xác nhận thao tác',descriptions[action],`<button class="danger" data-action="confirm-${action}" data-id="${esc(id)}">Xác nhận</button>`); }
  if (action.startsWith('confirm-')) { const suffix = {'confirm-delete-room':'rooms','confirm-remove-member':'members','confirm-revoke-invite':'invitations'}[action]; await api(`/homes/${S.homeId}/${suffix}/${encodeURIComponent(id)}`,'DELETE'); $('#home-dialog').close(); return load(); }
  if (action === 'history') { S.chartDevice = id; dialog('Lịch sử ' + nodes().find(d => d.id === id).name,'Số đo trong 24 giờ gần nhất.',`<div class="chart-box"><canvas id="history-chart" aria-label="Lịch sử cảm biến" role="img"></canvas></div>${btn('export','Tải CSV','secondary',`data-id="${esc(id)}"`)}`); return drawChart(id,'#history-chart'); }
  if (action === 'export') { const response = await fetch(`/api/telemetry?deviceId=${encodeURIComponent(id)}&hours=24&limit=2000&format=csv`,{cache:'no-store',signal:AbortSignal.timeout(10000)}); if (!response.ok) throw new Error('Không thể xuất dữ liệu.'); const url = URL.createObjectURL(await response.blob()), a = document.createElement('a'); a.href = url; a.download = `nodo-${id}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); return; }
  if (action === 'install') return window.nodoInstall?.();
  if (action === 'account') return dialog('Tài khoản & ứng dụng',S.user.email,`<p class="muted-copy">${esc(S.user.name)} · ${esc({admin:'Admin hệ thống',operator:'Operator / chủ nhà',viewer:'Viewer'}[S.user.role])}</p><div class="head-buttons">${S.user.role !== 'viewer' ? btn('create-home','Tạo nhà') : ''}${manage() ? btn('edit-home','Thông tin nhà') + btn('show-members','Thành viên') : ''}${btn('join','Nhập mã mời')}${btn('install','Cài ứng dụng')}${btn('password','Đổi mật khẩu')}${btn('logout','Đăng xuất','danger')}</div><p class="muted-copy">App dùng kết nối Internet để xem dữ liệu và điều khiển từ xa. Khi mất mạng, thao tác sẽ bị khóa và không tự phát lại lệnh.</p>`);
  if (action === 'show-members') { $('#home-dialog').close(); location.hash = 'members'; return; }
  if (action === 'password') return dialog('Đổi mật khẩu','Các phiên đăng nhập khác sẽ bị thu hồi.',field('currentPassword','Mật khẩu hiện tại','','password','autocomplete="current-password"') + field('password','Mật khẩu mới','','password','minlength="10" maxlength="72" autocomplete="new-password"'),'password-form','Đổi mật khẩu');
}
document.addEventListener('click',e => { const el = e.target.closest('[data-action]'); if (!el || el.disabled) return; const disabled = el.disabled; el.disabled = true; Promise.resolve(perform(el.dataset.action,el)).catch(error => { const box = $('#home-dialog').open ? $('.home-form-error') : null; if (box) { box.textContent = error.message; box.hidden = false; } else toast(error.message,true); }).finally(() => { if (el.isConnected) el.disabled = disabled; connection(); }); });
document.addEventListener('submit',async e => {
  const form = e.target; if (!form.closest('#home-dialog')) return; e.preventDefault();
  const submit = form.querySelector('[type="submit"]'), error = form.querySelector('.home-form-error'); submit.disabled = true; error.hidden = true;
  try {
    const values = Object.fromEntries(new FormData(form)), homePath = '/homes/' + S.homeId, formId = form.getAttribute('id');
    if (formId === 'room-form') { const id = values.id; delete values.id; await api(homePath + '/rooms' + (id ? '/' + id : ''),id ? 'PATCH' : 'POST',values); }
    if (formId === 'home-form') { const id = values.editing; delete values.editing; const result = await api('/homes' + (id ? '/' + id : ''),id ? 'PATCH' : 'POST',values); if (!id) S.homeId = result.id; }
    if (formId === 'claim-form') { values.room_id ||= null; await api(homePath + '/claim','POST',values); }
    if (formId === 'move-form') { const id = values.deviceId; delete values.deviceId; values.room_id ||= null; await api(homePath + '/devices/' + id,'PATCH',values); }
    if (formId === 'config-form') { const id = values.deviceId; delete values.deviceId; for (const key of Object.keys(values)) if (key !== 'mode') values[key] = Number(values[key]); await api('/devices/' + id + '/config','PATCH',values); toast('Đã gửi cấu hình; đang chờ ACK từ node.'); }
    if (formId === 'join-form') { const result = await api('/homes/accept-invitation','POST',values); S.homeId = result.home_id; location.hash = 'overview'; S.tab = 'overview'; }
    if (formId === 'password-form') await api('/auth/password','PATCH',values);
    if (formId === 'invite-form') { const i = await api(homePath + '/invitations','POST',values), link = location.origin + '/app#join=' + encodeURIComponent(i.token); dialog('Lời mời đã sẵn sàng','Gửi link cho ' + i.email + '. Hết hạn sau 48 giờ.',`<p class="muted-copy">Mã mời chỉ hiển thị lần này:</p><code class="secret-code">${esc(i.token)}</code><p class="muted-copy">Link tham gia:</p><code class="secret-code" id="invite-link">${esc(link)}</code>${btn('copy-invite','Sao chép link','primary')}`); return; }
    $('#home-dialog').close(); if (formId !== 'config-form') toast('Đã cập nhật.'); await load();
  } catch (e) { error.textContent = e.message; error.hidden = false; } finally { if (submit.isConnected) submit.disabled = false; }
});
$('#house-picker').addEventListener('change',async e => { S.homeId = e.target.value; S.room = 'all'; await load(); });
window.addEventListener('hashchange',() => { const tab = location.hash.slice(1); if (tab.startsWith('join=')) return perform('join',{dataset:{}}); S.tab = titles[tab] ? tab : 'overview'; render().catch(e => toast(e.message,true)); });
window.addEventListener('online',() => { if (!S.user) return location.reload(); connection(); load(true); });
window.addEventListener('offline',() => { S.connected = false; connection(); });
$('#home-dialog').addEventListener('close',() => { if (S.chart && !$('#home-chart')) { S.chart.destroy(); S.chart = null; } load(true); });
function connect() {
  if (S.stopped) return;
  S.socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
  S.socket.onopen = () => { S.socketLive = true; S.retry = 0; connection(); load(true); };
  let refreshTimer;
  S.socket.onmessage = event => { try { const message = JSON.parse(event.data); if (message.type !== 'connected') { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => load(true),250); } } catch {} };
  S.socket.onclose = event => { S.socketLive = false; connection(); if (event.code === 1008) { S.stopped = true; S.home = null; $('#main').replaceChildren(); location.replace('/login'); return; } if (!S.stopped) setTimeout(connect,Math.min(30000,1000 * 2 ** Math.min(S.retry++,5))); };
}
(async () => { try {
  const auth = await api('/auth/me'); S.user = auth.user; S.csrf = auth.csrfToken; S.connected = true;
  $('#user-name').textContent = S.user.name; $('#user-role').textContent = {admin:'System administrator',operator:'Operator / Chủ nhà',viewer:'Viewer / Chỉ xem'}[S.user.role]; $('#user-initial').textContent = S.user.name.slice(0,1).toUpperCase(); $('#admin-link').hidden = S.user.role !== 'admin';
  const tab = location.hash.slice(1); S.tab = titles[tab] ? tab : S.user.role === 'admin' ? 'homes' : 'overview';
  await load(); connect(); if (tab.startsWith('join=')) perform('join',{dataset:{}});
  setInterval(() => { if (!document.hidden) load(true); },10000);
  document.addEventListener('visibilitychange',() => { if (!document.hidden) load(true); });
} catch (e) { if (!S.stopped) { $('#main').innerHTML = empty('Chưa mở được ngôi nhà',e.message,btn('refresh','Thử lại','primary')); } } })();
