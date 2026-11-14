import {chromium} from 'playwright';
import {existsSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createApplication} from '../backend/src/app.js';
import {startTestDatabase} from './helpers/mongodb.js';
const {database,config}=await startTestDatabase('nodo_gas_ui');
const app=await createApplication(config);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${app.server.address().port}`;
const executablePath=[process.env.BROWSER_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>p&&existsSync(p));
let browser;
try{
 browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1050}});page.setDefaultTimeout(12000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await app.iot.ingest('node-01',{deviceId:'node-01',bootId:'gas-ui',seq:1,timestamp:new Date().toISOString(),readings:{temperature:25,humidity:60,gasRaw:1600}});
 const ready=Date.now()+8000;
 while(!await app.models.Command.exists({device_id:'node-01',source:'gas_rule',status:'applied'})){if(Date.now()>ready)throw Error('Gas command not acknowledged');await new Promise(r=>setTimeout(r,100));}
 await page.goto(base+'/login');await page.getByRole('button',{name:'Admin',exact:true}).click();await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await page.getByRole('heading',{name:'Tổng quan hệ thống'}).waitFor();await page.goto(base+'/#devices');
 await page.locator('.gas-panel.gas-danger').getByText('CẢNH BÁO',{exact:true}).waitFor();
 const node=page.locator('article').filter({hasText:'Trạm môi trường'});
 await node.getByRole('button',{name:'Chi tiết thiết bị',exact:true}).click();await page.getByRole('button',{name:'Cấu hình & Auto/Manual',exact:true}).click();
 await page.getByLabel('Ngưỡng cảnh báo gas (ADC)',{exact:true}).fill('1800');
 await page.getByLabel('Kết thúc cảnh báo gas khi ≤ (ADC)',{exact:true}).fill('1100');
 await page.getByRole('button',{name:'Gửi cấu hình xuống node',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});
 await page.goto(base+'/#telemetry');await page.getByLabel('Chọn node').selectOption('node-01');
 await page.getByRole('columnheader',{name:'Gas (ADC raw)',exact:false}).waitFor();
 assert.ok(await page.locator('.telemetry-table').innerText().then(t=>t.includes('1600')));
 await page.goto(base+'/app#overview');await page.locator('.gas-panel').first().waitFor();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 mkdirSync('.artifacts',{recursive:true});await page.screenshot({path:'.artifacts/gas-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1050});
 await page.locator('[data-action="logout"]').first().click();
 await page.getByRole('button',{name:'Viewer',exact:true}).click();await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await page.locator('.gas-panel').first().waitFor();assert.equal(await page.getByRole('button',{name:'Cấu hình & chế độ',exact:true}).count(),0);
 assert.deepEqual(errors,[]);console.log('Gas browser passed: admin threshold config, telemetry/chart, Home mobile and viewer read-only.');
}finally{await browser?.close();await app.close();await database.stop();}
