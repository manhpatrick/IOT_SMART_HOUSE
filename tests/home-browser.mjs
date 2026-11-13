import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { createApplication } from '../backend/src/app.js';
import { startTestDatabase } from './helpers/mongodb.js';
const {database,config}=await startTestDatabase('nodo_home_browser_test');
const application=await createApplication(config);
await new Promise(resolve=>application.server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${application.server.address().port}`;
const executablePath=[process.env.BROWSER_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>p&&existsSync(p));
mkdirSync('.artifacts',{recursive:true});let browser;
const errors=[];
try {
  browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',error=>errors.push(error.message));
  async function login(page,role){await page.goto(base+'/login');await page.getByRole('button',{name:role,exact:true}).click();await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();}
  async function waitDevice(predicate) {const end=Date.now()+12000;while(Date.now()<end){const d=await (await context.request.get(base+'/api/devices/node-01')).json();if(predicate(d))return;await new Promise(r=>setTimeout(r,150));}throw new Error('Device did not reach expected state');}
  await login(page,'Operator');await page.getByRole('heading',{name:'Nhà của tôi',exact:true}).waitFor();
  await waitDevice(d=>d.connection==='online');await page.getByRole('button',{name:'Làm mới',exact:true}).click();
  await page.screenshot({path:'.artifacts/home-operator-desktop.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'＋ Thêm phòng',exact:true}).click();await page.locator('#room-form [name="name"]').fill('Phòng đọc sách');
  await page.locator('#room-form [type="submit"]').click();await page.locator('#home-dialog').waitFor({state:'hidden'});
  await page.locator('#side-nav').getByRole('link',{name:'Phòng',exact:true}).click();
  const room=page.locator('.room-card').filter({hasText:'Phòng đọc sách'});await room.getByRole('button',{name:'Đổi tên',exact:true}).click();
  await page.locator('#room-form [name="name"]').fill('Phòng học');await page.locator('#room-form [type="submit"]').click();await page.locator('#home-dialog').waitFor({state:'hidden'});
  await page.locator('#side-nav').getByRole('link',{name:'Thiết bị',exact:true}).click();
  const node=page.locator('[data-device="node-01"]');await node.getByRole('button',{name:'Cấu hình & chế độ',exact:true}).click();
  await page.locator('#config-form [name="mode"]').selectOption('MANUAL');await page.locator('#config-form [type="submit"]').click();
  await page.locator('#home-dialog').waitFor({state:'hidden'});await waitDevice(d=>d.config.mode==='MANUAL');
  await page.getByRole('button',{name:'Làm mới',exact:true}).click();await node.getByRole('switch',{name:'Quạt · Trạm môi trường',exact:true}).click();await waitDevice(d=>d.reported_state.fan===true);
  await page.getByRole('button',{name:'Làm mới',exact:true}).click();await node.getByRole('button',{name:'Lịch sử ↗',exact:true}).click();
  await page.locator('#history-chart').waitFor();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Tải CSV',exact:true}).click();assert.equal((await download).suggestedFilename(),'nodo-node-01.csv');
  await page.getByRole('button',{name:'Đóng',exact:true}).click();
  // Onboarding a real device uses the same UI; this test uses simulated provisioning.
  const adminContext=await browser.newContext();
  const adminResponse=await adminContext.request.post(base+'/api/auth/login',{data:{email:'admin@nodo.local',password:'Admin@12345'}}),admin=await adminResponse.json();
  const post=async(path,body)=>{const r=await adminContext.request.post(base+'/api'+path,{headers:{'X-CSRF-Token':admin.csrfToken},data:body});assert.ok(r.ok(),await r.text());return r.json();};
  await post('/devices',{id:'mobile-claim',name:'Đèn mới',profile:'lighting',location:'Kho'});await post('/devices/mobile-claim/lifecycle',{state:'provisioned'});
  const code=await post('/devices/mobile-claim/claim-code');
  await adminContext.close();await page.goto(base+'/app#devices');await page.getByRole('button',{name:'＋ Nhận thiết bị',exact:true}).click();
  await page.locator('#claim-form [name="deviceId"]').fill('mobile-claim');await page.locator('#claim-form [name="code"]').fill(code.code);await page.locator('#claim-form [type="submit"]').click();
  await page.locator('#home-dialog').waitFor({state:'hidden'});await page.locator('[data-device="mobile-claim"]').waitFor();
  // Invite a new viewer, who registers then accepts on their own session.
  const guestContext=await browser.newContext({viewport:{width:390,height:844}}),guest=await guestContext.newPage();guest.on('pageerror',error=>errors.push(error.message));
  await guest.goto(base+'/login');await guest.getByRole('button',{name:'Chưa có tài khoản? Đăng ký',exact:true}).click();
  await guest.locator('#login-form [name="name"]').fill('Người xem mới');await guest.locator('#login-form [name="email"]').fill('guest@example.com');await guest.locator('#login-form [name="password"]').fill('Guest@12345');await guest.locator('#login-form [name="role"]').selectOption('viewer');
  await guest.getByRole('button',{name:'Tạo tài khoản',exact:true}).click();await guest.getByRole('heading',{name:'Chưa có ngôi nhà nào',exact:true}).waitFor();
  await page.goto(base+'/app#members');await page.getByRole('button',{name:'＋ Mời viewer',exact:true}).click();await page.locator('#invite-form [name="email"]').fill('guest@example.com');await page.locator('#invite-form [type="submit"]').click();
  await page.locator('#invite-link').waitFor();const inviteURL=await page.locator('#invite-link').textContent();
  await guest.goto(inviteURL);await guest.getByRole('button',{name:'Chấp nhận lời mời',exact:true}).click();await guest.locator('#home-dialog').waitFor({state:'hidden'});await guest.getByRole('heading',{name:'Nhà của tôi',exact:true}).waitFor();
  assert.equal(await guest.getByRole('switch').count(),0);assert.equal(await guest.getByRole('button',{name:'Cấu hình & chế độ',exact:true}).count(),0);
  assert.equal(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Viewer mobile overflow');
  await guest.screenshot({path:'.artifacts/home-viewer-mobile.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Đóng',exact:true}).click();await page.getByRole('button',{name:'Làm mới',exact:true}).click();
  const guestRow=page.locator('.event-row').filter({hasText:'guest@example.com'}).filter({has:page.getByRole('button',{name:'Thu hồi',exact:true})});
  await guestRow.getByRole('button',{name:'Thu hồi',exact:true}).click();await page.getByRole('button',{name:'Xác nhận',exact:true}).click();
  await guest.getByRole('button',{name:'Làm mới',exact:true}).click();await guest.getByRole('heading',{name:'Chưa có ngôi nhà nào',exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});await page.goto(base+'/app#overview');await page.getByRole('heading',{name:'Nhà của tôi',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Operator mobile overflow');
  await page.screenshot({path:'.artifacts/home-operator-mobile.png',fullPage:true,animations:'disabled'});
  await page.evaluate(()=>navigator.serviceWorker.ready);const cacheBefore=await page.evaluate(async()=>{const keys=await caches.keys();const urls=[];for(const k of keys){for(const r of await (await caches.open(k)).keys())urls.push(new URL(r.url).pathname);}return urls;});
  assert.ok(!cacheBefore.some(p=>p.startsWith('/api/')),'Private API data must never be cached');
  const commandsBefore=await application.models.Command.countDocuments();await context.setOffline(true);await page.locator('#connection-banner').waitFor({state:'visible'});
  assert.equal(await page.locator('[data-write]:not(:disabled)').count(),0,'Writes disabled while offline');
  await page.screenshot({path:'.artifacts/home-offline-mobile.png',fullPage:true,animations:'disabled'});
  await context.setOffline(false);await page.getByRole('button',{name:'Làm mới',exact:true}).click();await page.locator('#connection-banner').waitFor({state:'hidden'});
  assert.equal(await application.models.Command.countDocuments(),commandsBefore,'Reconnect must not replay manual commands');
  assert.deepEqual(errors,[]);
  console.log('Home browser QA passed: operator rooms, config/actuator ACK, CSV, claiming, registration, invitation, viewer read-only, access revocation, mobile layout, offline/reconnect, PWA cache privacy.');
} catch(error) {
  const page=browser?.contexts()[0]?.pages()[0];if(page){await page.screenshot({path:'.artifacts/home-browser-failure.png',fullPage:true});console.error('Visible errors:',await page.locator('.home-form-error:visible').allTextContents());}throw error;
} finally {if(browser)await browser.close();await application.close();await database.stop();}
