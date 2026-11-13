import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync} from 'node:fs';
import {createApplication} from '../backend/src/app.js';
import {startTestDatabase} from './helpers/mongodb.js';
import {localLoginTime} from '../backend/src/ai/login-model.js';
const {database,config}=await startTestDatabase('nodo_ai_browser'),app=await createApplication(config);
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${app.server.address().port}`;
const now=new Date(),normalHour=(Math.floor(localLoginTime(now).minute/60)+12)%24;
const events=[];
for(let day=1;day<=12;day++)for(const hour of [normalHour,(normalHour+3)%24])events.push({user_id:'user-operator',occurred_at:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-day,hour-7,12)),status:'normal',source:'test_fixture',expires_at:new Date(Date.now()+120*86400_000)});
await app.models.LoginEvent.insertMany(events);
const end=Math.floor(Date.now()/10000)*10000;
await app.models.Telemetry.insertMany(Array.from({length:600},(_,i)=>({device_id:'node-01',source:'demo',boot_id:'ai-ui-fixture',seq:i,recorded_at:new Date(end-(600-i)*10000),temperature:27+Math.sin(i/25),humidity:64+3*Math.cos(i/28)})));
const executablePath=[process.env.BROWSER_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>p&&existsSync(p));
let browser;const errors=[];mkdirSync('.artifacts',{recursive:true});
try{
  browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  async function login(page,role){await page.goto(base+'/login');await page.getByRole('button',{name:role,exact:true}).click();await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL(role==='Admin'?base+'/':base+'/app');}
  await login(page,'Operator');await page.getByRole('heading',{name:'Nhà của tôi',exact:true}).waitFor();
  await page.locator('.ai-security-banner').waitFor();await page.locator('#side-nav').getByRole('link',{name:'AI & bảo mật',exact:true}).click();await page.getByRole('heading',{name:'AI & bảo mật',exact:true}).waitFor();
  const sensor=page.locator('.ai-card').filter({has:page.getByRole('heading',{name:'Trạm môi trường',exact:true})});
  await sensor.getByRole('button',{name:'Huấn luyện RNN',exact:true}).click();
  await page.locator('[data-ai-form="train"] [name="confirmedNormal"]').check();await page.locator('[data-ai-form="train"] [name="includeDemo"]').check();
  await page.getByRole('button',{name:'Bắt đầu huấn luyện',exact:true}).click();await page.locator('#ai-dialog').waitFor({state:'hidden'});
  const deadline=Date.now()+15000;let ready=false;
  while(Date.now()<deadline){const data=await (await context.request.get(base+'/api/ai/devices/node-01')).json();if(data.model?.status==='ready'){ready=true;break;}if(data.model?.status==='failed')throw new Error(data.model.error);await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,'Worker must finish training');await page.getByRole('button',{name:'Làm mới',exact:true}).click();
  await page.screenshot({path:'.artifacts/ai-operator-desktop.png',fullPage:true,animations:'disabled'});
  await sensor.getByRole('button',{name:'Kết quả & đánh giá',exact:true}).click();await page.locator('#ai-loss-chart').waitFor();
  assert.ok(await page.evaluate(()=>!!Chart.getChart(document.querySelector('#ai-loss-chart'))));
  await page.screenshot({path:'.artifacts/ai-training-report.png',fullPage:true,animations:'disabled'});await page.getByRole('button',{name:'Đóng AI',exact:true}).click();
  await page.getByRole('button',{name:'Đây là tôi',exact:true}).click();await page.getByText('Chủ tài khoản xác nhận là mình',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Xem lịch sử của tôi',exact:true}).click();await page.getByRole('heading',{name:'Lịch sử đăng nhập của tôi',exact:true}).waitFor();await page.getByRole('button',{name:'Đóng AI',exact:true}).click();
  const viewerContext=await browser.newContext({viewport:{width:390,height:844}}),viewer=await viewerContext.newPage();viewer.on('pageerror',e=>errors.push(e.message));
  await login(viewer,'Viewer');await viewer.goto(base+'/app#ai');await viewer.getByRole('heading',{name:'AI & bảo mật',exact:true}).waitFor();
  assert.equal(await viewer.getByRole('button',{name:'Huấn luyện RNN',exact:true}).count(),0);assert.equal(await viewer.getByRole('button',{name:'Đây là tôi',exact:true}).count(),0);
  assert.equal(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await viewer.screenshot({path:'.artifacts/ai-viewer-mobile.png',fullPage:true,animations:'disabled'});
  const adminContext=await browser.newContext(),admin=await adminContext.newPage();admin.on('pageerror',e=>errors.push(e.message));await login(admin,'Admin');await admin.goto(base+'/#ai');await admin.getByRole('heading',{name:'AI & bảo mật',exact:true}).waitFor();await admin.getByRole('heading',{name:'Cảnh báo đăng nhập toàn hệ thống',exact:true}).waitFor();
  assert.equal(await admin.getByRole('button',{name:'Đây là tôi',exact:true}).count(),0);assert.deepEqual(errors,[]);
  console.log('AI browser QA passed: real worker training, labelled demo model/report/charts, unusual login banner, owner review, private history, viewer read-only, admin overview, mobile layout.');
}catch(error){const page=browser?.contexts()[0]?.pages()[0];if(page){await page.screenshot({path:'.artifacts/ai-browser-failure.png',fullPage:true});console.error('Visible AI errors:',await page.locator('.ai-error:visible').allTextContents());}throw error;}
finally{if(browser)await browser.close();await app.close();await database.stop();}
