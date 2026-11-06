import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, existsSync } from 'node:fs';
import { createApplication } from '../src/app.js';
import { startTestDatabase } from './helpers/mongodb.js';

const {database,config}=await startTestDatabase('nodo_browser_test');
const application=await createApplication(config);
await new Promise(resolve=>application.server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${application.server.address().port}`;
const executablePath=[process.env.BROWSER_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>p&&existsSync(p));
mkdirSync('.artifacts',{recursive:true});
let browser;
try{
  browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1050},deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];
  async function waitForDevice(predicate) {
    const deadline=Date.now()+12000;
    while(Date.now()<deadline){
      const response=await context.request.get(base+'/api/devices/qa-node');
      if(response.ok()&&predicate(await response.json()))return;
      await new Promise(resolve=>setTimeout(resolve,150));
    }
    throw new Error('Timed out waiting for the QA node state.');
  }
  page.setDefaultTimeout(12000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.url().includes('/api/')&&response.status()>=400)console.error('HTTP error:',response.status(),new URL(response.url()).pathname);});
  await page.goto(base+'/login');
  await page.getByRole('button',{name:'Admin',exact:true}).click();
  await page.screenshot({path:'.artifacts/login-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await page.getByRole('heading',{name:'Tổng quan hệ thống'}).waitFor();
  await page.waitForFunction(()=>document.querySelector('#connection-label')?.textContent==='Live');
  await page.waitForFunction(()=>typeof Chart!=='undefined'&&Chart.getChart(document.querySelector('#environment-chart')));
  await page.screenshot({path:'.artifacts/dashboard-desktop.png',fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'.artifacts/dashboard-mobile.png',fullPage:true,animations:'disabled'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile page must not overflow horizontally');
  await page.setViewportSize({width:1440,height:1050});
  for(const [route,title]of[['devices','Quản lý thiết bị'],['users','Quản lý người dùng'],['telemetry','Dữ liệu cảm biến'],['commands','Lịch sử điều khiển'],['alerts','Cảnh báo & sự kiện'],['audit','Nhật ký hệ thống'],['settings','Cài đặt không gian'],['guide','Phạm vi quản trị & tích hợp']]){
    await page.goto(base+'/#'+route);await page.getByRole('heading',{name:title,exact:true}).waitFor();
  }
  await page.goto(base+'/#users');await page.getByRole('button',{name:'Thêm người dùng',exact:true}).click();
  await page.getByLabel('Họ và tên').fill('Người dùng QA');await page.getByLabel('Email',{exact:true}).fill('qa@nodo.local');await page.locator('#user-form [name="password"]').fill('Testing@12345');
  await page.getByRole('button',{name:'Tạo tài khoản',exact:true}).click();await page.getByText('qa@nodo.local',{exact:true}).waitFor();
  await page.goto(base+'/#devices');await page.getByRole('button',{name:'Đăng ký thiết bị',exact:true}).click();
  await page.getByLabel('Device ID').fill('qa-node');await page.getByLabel('Tên thiết bị',{exact:true}).fill('Node kiểm thử UI');
  await page.locator('#device-form').getByRole('button',{name:'Đăng ký thiết bị',exact:true}).click();
  const card=()=>page.locator('article').filter({hasText:'Node kiểm thử UI'});
  await card().getByRole('button',{name:'Chi tiết thiết bị',exact:true}).click();
  await page.getByRole('button',{name:'Cấp quyền kết nối',exact:true}).click();await page.getByRole('heading',{name:'Thông tin kết nối mới',exact:true}).waitFor();
  await page.getByRole('button',{name:'Đóng hộp thoại',exact:true}).click();
  await card().getByRole('button',{name:'Chi tiết thiết bị',exact:true}).click();
  const activateResponse=page.waitForResponse(r=>r.url().endsWith('/api/devices/qa-node/lifecycle')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Kích hoạt',exact:true}).click();assert.equal((await activateResponse).status(),200);
  await page.locator('#modal .badge.green').filter({hasText:'Hoạt động'}).waitFor();
  await page.getByRole('button',{name:'Đóng hộp thoại',exact:true}).click();
  await waitForDevice(d=>d.connection==='online');
  await card().getByRole('button',{name:'Chi tiết thiết bị',exact:true}).click();await page.getByRole('button',{name:'Cấu hình & Auto/Manual',exact:true}).click();
  await page.locator('#config-form [name="mode"]').selectOption('MANUAL');
  const configResponse=page.waitForResponse(r=>r.url().endsWith('/api/devices/qa-node/config')&&r.request().method()==='PATCH');
  await page.getByRole('button',{name:'Gửi cấu hình xuống node',exact:true}).click();assert.equal((await configResponse).status(),202);
  await page.locator('#modal').waitFor({state:'hidden'});
  await waitForDevice(d=>d.config.mode==='MANUAL');
  await card().getByRole('button',{name:'Chi tiết thiết bị',exact:true}).click();await page.getByRole('switch',{name:'Quạt',exact:true}).click();
  await waitForDevice(d=>d.reported_state.fan===true);
  await page.goto(base+'/#commands');await page.locator('td .badge').filter({hasText:'Đã áp dụng'}).first().waitFor();
  await page.goto(base+'/#alerts');await page.getByRole('button',{name:'Xác nhận',exact:true}).first().click();await page.locator('.alert-item .badge').filter({hasText:'Đã xác nhận'}).first().waitFor();
  await page.goto(base+'/#telemetry');const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Xuất CSV',exact:true}).click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'nodo-telemetry.csv');
  await page.setViewportSize({width:390,height:844});await page.goto(base+'/#overview');await page.getByRole('heading',{name:'Tổng quan hệ thống'}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile page must not overflow horizontally');
  await page.getByRole('button',{name:'Mở điều hướng',exact:true}).click();await page.getByRole('link',{name:/Tài liệu & phạm vi admin/}).click();await page.getByRole('heading',{name:'Phạm vi quản trị & tích hợp'}).waitFor();
  await page.setViewportSize({width:1440,height:1050});await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();await page.getByRole('button',{name:'Viewer',exact:true}).click();await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.getByRole('heading',{name:'Tổng quan hệ thống'}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Người dùng',exact:true}).count(),0);
  assert.deepEqual(errors,[],'Browser must not report uncaught JS errors');
  console.log('Browser QA passed: 9 pages, user creation, onboarding, provisioning, activation, config ACK, actuator ACK, alert acknowledgment, CSV download, mobile navigation, viewer permissions, WebSocket.');
  console.log('Screenshots: .artifacts/login-desktop.png, dashboard-desktop.png, dashboard-mobile.png');
}catch(error){
  const page=browser?.contexts()[0]?.pages()[0];
  if(page){await page.screenshot({path:'.artifacts/browser-failure.png',fullPage:true});console.error('Visible form errors:',await page.locator('.form-error:visible').allTextContents());}
  const node=await application.models.Device.findById('qa-node').select('lifecycle last_seen config').lean();
  console.error('QA node state:',node,'Commands:',await application.models.Command.find({device_id:'qa-node'}).select('kind status result').lean());
  throw error;
}finally{if(browser)await browser.close();await application.close();await database.stop();}
