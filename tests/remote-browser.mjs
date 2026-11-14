import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync} from 'node:fs';
import {createApplication} from '../backend/src/app.js';
import {startTestDatabase} from './helpers/mongodb.js';
const t=await startTestDatabase('nodo_remote_ui');const app=await createApplication(t.config);
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
const executablePath=[process.env.BROWSER_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>p&&existsSync(p));
let browser;
try{
 browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
 // Test recognition callbacks deterministically. This does not measure real microphone/STT accuracy.
 await ctx.addInitScript(()=>{window.SpeechRecognition=class{start(){this.timer=setTimeout(()=>{if(window.__voiceError)this.onerror?.({error:window.__voiceError});else this.onresult?.({results:[[{transcript:window.__voiceText||'Bật quạt'}]]});this.onend?.();},50);}abort(){clearTimeout(this.timer);this.onend?.();}};});
 const page=await ctx.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 async function login(role){await page.goto(base+'/login');await page.getByRole('button',{name:role,exact:true}).click();await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();}
 async function waitDevice(fn){const until=Date.now()+10000;while(Date.now()<until){const d=await app.iot.device('node-01');if(fn(d))return;await new Promise(r=>setTimeout(r,100));}throw Error('Remote state not applied');}
 await login('Operator');await page.getByRole('heading',{name:'Nhà của tôi',exact:true}).waitFor();
 assert.equal(await page.getByRole('switch').count(),0,'Device/config page must not duplicate manual controls');
 await page.goto(base+'/app#control');await page.getByRole('heading',{name:'Điều khiển từ xa',exact:true}).waitFor();
 await waitDevice(d=>d.connection==='online');await page.getByRole('button',{name:'Làm mới',exact:true}).click();
 await app.iot.pause('node-01',true);await page.getByRole('button',{name:'Làm mới',exact:true}).click();await page.locator('[data-r-block-reason]').filter({hasText:'Thiết bị offline'}).waitFor();assert.equal(await page.locator('[data-r-action="actuator"]:not(:disabled)').count(),0);await app.iot.pause('node-01',false);await page.getByRole('button',{name:'Làm mới',exact:true}).click();
 await page.getByRole('button',{name:'Bắt đầu ghi âm lệnh',exact:true}).click();
 await page.getByLabel('Câu lệnh nhận được',{exact:true}).filter({visible:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('#remote-transcript')?.value==='Bật quạt');
 const before=await app.models.Command.countDocuments({source:'voice'});
 await page.getByRole('button',{name:'Xem trước lệnh',exact:true}).click();await page.getByRole('heading',{name:'Xác nhận lệnh voice'}).waitFor();
 assert.equal(await app.models.Command.countDocuments({source:'voice'}),before,'Recognition/preview cannot execute a command');
 await page.getByRole('button',{name:'Xác nhận gửi lệnh',exact:true}).click();await waitDevice(d=>d.reported_state.fan===true);
 await page.waitForFunction(()=>document.querySelector('[data-r-state="fan"]')?.textContent==='Đang bật');
 assert.equal(await app.models.Command.countDocuments({source:'voice'}),before+1);
 // The same node now exposes its LDR/LED alongside DHT/gas and fan/buzzer.
 await page.getByLabel('Câu lệnh nhận được',{exact:true}).fill('Bật đèn');await page.getByRole('button',{name:'Xem trước lệnh',exact:true}).click();
 const lightResponse=page.waitForResponse(r=>r.url().endsWith('/devices/node-01/commands')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Xác nhận gửi lệnh',exact:true}).click();const lightCommand=await (await lightResponse).json();
 await waitDevice(d=>d.last_command_id===lightCommand.id&&d.reported_state.light===true&&!d.pendingCommand);
 await page.waitForFunction(()=>!document.querySelector('[data-r-action="actuator"][data-output="light"][data-value="false"]')?.disabled);
 await page.getByRole('button',{name:'Tắt đèn',exact:true}).click();await waitDevice(d=>d.reported_state.light===false);
 assert.ok(await app.models.Command.exists({device_id:'node-01',source:'voice','payload.actuator':'light',status:'applied'}));
 const voicesAfterLight=await app.models.Command.countDocuments({source:'voice'});
 await page.getByLabel('Câu lệnh nhận được',{exact:true}).fill('Đặt nhiệt độ 20 độ');await page.getByRole('button',{name:'Xem trước lệnh',exact:true}).click();
 await page.getByText('Chưa hiểu câu lệnh.',{exact:false}).waitFor();assert.equal(await app.models.Command.countDocuments({source:'voice'}),voicesAfterLight);
 await page.getByLabel('Câu lệnh nhận được',{exact:true}).fill('Tắt quạt');await page.getByRole('button',{name:'Xem trước lệnh',exact:true}).click();await page.getByRole('button',{name:'Hủy',exact:true}).click();
 assert.equal(await app.models.Command.countDocuments({source:'voice'}),voicesAfterLight);
 await page.evaluate(()=>{window.__voiceError='not-allowed';});await page.getByRole('button',{name:'Bắt đầu ghi âm lệnh',exact:true}).click();
 await page.getByText('Chưa được cấp quyền micro.',{exact:false}).waitFor();
 await page.getByLabel('Câu lệnh nhận được',{exact:true}).blur();
 mkdirSync('.artifacts',{recursive:true});await page.screenshot({path:'.artifacts/remote-desktop.png',fullPage:true});
 await page.setViewportSize({width:1280,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'.artifacts/remote-mobile.png',fullPage:true});
 await ctx.setOffline(true);await page.waitForFunction(()=>document.querySelector('[data-r-action="actuator"]')?.disabled);await ctx.setOffline(false);
 await page.goto(base+'/app#devices');await page.locator('[data-action="config"]').first().click();assert.equal(await page.locator('#config-form [name="mode"]').count(),0);await page.getByRole('button',{name:'Đóng',exact:true}).click();
 const viewer=await browser.newContext();const vp=await viewer.newPage();await vp.goto(base+'/login');await vp.getByRole('button',{name:'Viewer',exact:true}).click();await vp.getByRole('button',{name:'Đăng nhập',exact:true}).click();await vp.getByRole('heading',{name:'Nhà của tôi',exact:true}).waitFor();await vp.goto(base+'/app#control');
 await vp.getByRole('heading',{name:'Nhà của tôi',exact:true}).waitFor();assert.equal(await vp.locator('[data-r-action]').count(),0);
 const token=await (await viewer.request.get(base+'/api/auth/me')).json();const forbidden=await viewer.request.post(base+'/api/devices/node-01/commands',{headers:{'X-CSRF-Token':token.csrfToken},data:{actuator:'fan',value:true,channel:'voice'}});assert.equal(forbidden.status(),403);
 assert.deepEqual(errors,[]);console.log('Remote browser passed: separate controls, mocked speech preview/confirm/cancel, denied microphone, unsupported command, ACK, offline, mobile and viewer scope. Real microphone still needs phone testing.');
}finally{await browser?.close();await app.close();await t.database.stop();}
