import { chromium } from '@playwright/test';
import fs from 'node:fs';
import sharp from 'sharp';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3200';
const fixture=JSON.parse(fs.readFileSync('artifacts/program-qa/fixture.json','utf8'));
const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
const errors=[];
async function session(email,width=390){
 console.log('OPEN '+email);
 const context=await browser.newContext({viewport:{width,height:900},hasTouch:true,reducedMotion:'reduce',extraHTTPHeaders:{'x-forwarded-for':`qa-program-${crypto.randomUUID()}`}});
 const page=await context.newPage();page.setDefaultTimeout(60000);page.setDefaultNavigationTimeout(120000);
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/login');await page.locator('#auth-email').fill(email);await page.locator('#auth-password').fill('CoachPreview!2026');await page.locator('button[type=submit]').click();await page.waitForURL(email==='coach@example.test'||email==='coach2@example.test'?'**/coach':'**/me');
 await page.locator('h1').waitFor();
 await page.getByRole('button',{name:'مو الحين',exact:true}).waitFor({timeout:3000}).then(()=>page.getByRole('button',{name:'مو الحين',exact:true}).click()).catch(error=>{if(error.name!=='TimeoutError')throw error;});
 return {context,page};
}
async function snapshot(context){return (await context.request.get(base+'/api/export')).json();}
async function noOverflow(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow: '+page.url());}
async function until(check,message){for(let n=0;n<60;n++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,250));}throw Error(message);}
async function editorFlows(){
 for(const width of [390,1440]){
  const {context,page}=await session('coach@example.test',width);
  await page.goto(`${base}/coach/clients/${fixture.main}/edit`);
  const before=await snapshot(context),publishedBefore=before.programs.find(p=>p.client_id===fixture.main&&p.published_at);
  await page.locator('.program-day-item').nth(2).click();
  while(await page.locator('[data-testid=program-exercise-row]').count()) await page.getByRole('button',{name:'حذف التمرين 1',exact:true}).click();
  await page.getByRole('button',{name:'حفظ المسودة',exact:true}).click();
  await until(async()=>await page.locator('.program-save-state').getAttribute('data-state')==='saved','Empty day draft saved');
  let release,started,finished;
  const held=new Promise(resolve=>started=resolve);
  const fulfilled=new Promise(resolve=>finished=resolve);
  let delay=true;
  await page.route('**/coach/clients/**/edit',async route=>{
   if(route.request().method()!=='POST'||!delay)return route.continue();
   delay=false;const response=await route.fetch();started();await new Promise(resolve=>release=resolve);await route.fulfill({response});finished();
  });
  await page.locator('#custom-exercise-name').fill('قبل الحفظ '+width);await page.locator('#custom-exercise-name').press('Enter');
  await held;
  await page.locator('#ex-0-name').fill('أثناء الحفظ '+width);
  const scrollBefore=await page.evaluate(()=>scrollY);
  release();
  await fulfilled;
  await page.unroute('**/coach/clients/**/edit');
  await until(async()=>{const s=await snapshot(context);return s.programs.find(p=>p.client_id===fixture.main&&!p.published_at)?.content.days[2].exercises[0]?.name==='أثناء الحفظ '+width;},'Draft retains edits made during save');
  assert.equal(await page.locator('.program-day-item[aria-pressed=true]').getAttribute('aria-label'),'يوم قديم فارغ');
  assert.equal(await page.locator('#ex-0-name').inputValue(),'أثناء الحفظ '+width);
  assert(Math.abs(await page.evaluate(()=>scrollY)-scrollBefore)<=3,'Saving keeps the scroll position');
  await page.locator('#custom-exercise-name').fill('آخر القائمة '+width);await page.locator('#custom-exercise-name').press('Enter');
  await page.locator('[data-testid=program-exercise-row]').first().getByRole('button',{name:'نسخ التمرين',exact:true}).click();
  await page.locator('#ex-1-name').fill('نسخة مباشرة '+width);
  assert.equal(await page.locator('#ex-2-name').inputValue(),'آخر القائمة '+width);
  await page.getByRole('button',{name:'تنزيل التمرين 1',exact:true}).click();
  assert.equal(await page.locator('#ex-0-name').inputValue(),'نسخة مباشرة '+width);
  await page.getByRole('combobox',{name:'نقل التمرين 1 إلى يوم',exact:true}).selectOption('0');
  await page.getByRole('button',{name:'حذف التمرين 2',exact:true}).click();
  await page.getByRole('button',{name:'إضافة يوم',exact:true}).click();
  assert.equal(await page.locator('.program-day-item').count(),4);
  await page.getByRole('button',{name:'تكرار اليوم',exact:true}).click();
  await page.getByRole('dialog').getByRole('textbox').fill('نسخة يوم QA '+width);
  await page.getByRole('button',{name:'إضافة النسخة للجدول',exact:true}).click();
  assert.equal(await page.locator('.program-day-item').count(),5);
  const removeSelected=async()=>{
   const row=page.locator('.program-day-row').filter({has:page.locator('[aria-pressed=true]')});
   await row.locator('.program-day-delete').click();
   assert.equal(await page.getByRole('dialog').count(),1);
   await page.getByRole('button',{name:'احذف اليوم',exact:true}).click();
  };
  await removeSelected();assert.equal(await page.locator('.program-day-item').count(),4);
  await page.getByRole('button',{name:'تراجع',exact:true}).click();assert.equal(await page.locator('.program-day-item').count(),5);
  await removeSelected();await page.locator('.program-day-item').last().click();await removeSelected();
  await page.getByRole('button',{name:'حفظ المسودة',exact:true}).click();
  await until(async()=>await page.locator('.program-save-state').getAttribute('data-state')==='saved','Draft saved');
  const draftSnapshot=await snapshot(context);
  const publishedUnchanged=draftSnapshot.programs.find(p=>p.id===publishedBefore.id);
  assert.deepEqual(publishedUnchanged.content,publishedBefore.content,'Draft changes remain private');
  await page.getByRole('button',{name:'نشر للمتدرب',exact:true}).click();
  await until(async()=>{const s=await snapshot(context);return s.programs.some(p=>p.client_id===fixture.main&&p.published_at&&p.publication_number>publishedBefore.publication_number);},'Publication exists');
  const after=await snapshot(context),publishedAfter=after.programs.find(p=>p.client_id===fixture.main&&p.published_at);
  assert.equal(publishedAfter.publication_number,publishedBefore.publication_number+1);
  assert.equal(await page.locator('[data-last-published]').getAttribute('data-last-published'),publishedAfter.published_at);
  await page.goto(`${base}/me?client=${fixture.main}`);await page.waitForURL('**/preview');
  assert.equal(await page.locator('[data-program-day]').count(),3);
  assert.equal(await page.getByRole('button',{name:'سجّل هذه الحصة',exact:true}).count(),0);
  await context.close();console.log(`PASS editor actions and publication ${width}`);
 }
}
async function recordsFlow(){
 const {context,page}=await session('trainee@example.test');
 const marker=String(Date.now());
 const card=page.locator('[data-program-day="0"]');await page.locator('[data-day-jump="0"]').tap();
 await card.getByRole('button',{name:'سجّل هذه الحصة',exact:true}).click();
 const form=page.locator('[data-testid=session-form]');
 await form.locator('[name="reps-0-0"]').fill('9');await form.locator('[name="weight-0-0"]').fill('52.5');
 await form.getByRole('button',{name:'حفظ الحصة',exact:true}).click();
 await until(async()=>{const s=await snapshot(context);return s.management.records.some(r=>r.kind==='workout_log'&&r.payload.exercises[0]?.set_logs?.[0]?.weight===52.5);},'Per-set workout saved');
 await page.getByRole('tab',{name:'القياسات والتقدم',exact:true}).click();
  await page.locator('[data-testid=measurement-entry]>summary').click();
 const measurements=page.locator('[data-record-kind=measurement]');await measurements.locator('[name=waist]').fill('91');await measurements.getByRole('button',{name:/حفظ/}).click();
 await until(async()=>{const s=await snapshot(context);return s.management.records.some(r=>r.kind==='measurement'&&r.payload.waist===91);},'Measurement saved');
 await page.getByRole('tab',{name:'الماكروز الفعلية',exact:true}).click();
 const macros=page.locator('[data-record-kind=nutrition_log]');for(const [key,value]of Object.entries({calories:2100,protein:130,carbs:200,fat:60}))await macros.locator(`[name=${key}]`).fill(String(value));await macros.getByRole('button',{name:/حفظ/}).click();
 await until(async()=>{const s=await snapshot(context);return s.management.records.some(r=>r.kind==='nutrition_log'&&r.payload.calories===2100);},'Macros saved');
 await page.getByRole('tab',{name:'المراجعات الأسبوعية',exact:true}).click();
 const checkin=page.locator('[data-record-kind=checkin]');for(const key of ['sleep','energy','hunger','stress'])await checkin.locator(`input[name=${key}][value="4"]`).check();for(const key of ['training_adherence','nutrition_adherence'])await checkin.locator(`[name=${key}]`).press('End');await checkin.locator('[name=feedback]').fill('مراجعة QA '+marker);await checkin.getByRole('button',{name:/حفظ/}).click();
 await until(async()=>{const s=await snapshot(context);return s.management.records.some(r=>r.kind==='checkin'&&r.payload.feedback==='مراجعة QA '+marker);},'Weekly review saved');
 await page.getByRole('tab',{name:'المراسلات',exact:true}).click();const message=page.locator('[data-record-kind=message]');await message.locator('textarea').fill('رسالة QA '+marker);await message.getByRole('button',{name:'إرسال',exact:true}).click();
 await until(async()=>{const s=await snapshot(context);return s.management.records.some(r=>r.kind==='message'&&r.payload.text==='رسالة QA '+marker);},'Message saved');
 await page.getByRole('button',{name:'طلب تجديد الاشتراك',exact:true}).click();await page.getByRole('button',{name:'تم إرسال طلب التجديد',exact:true}).waitFor();
 const weight=page.locator('.weight-entry-form');await weight.getByRole('textbox',{name:'الوزن بالكيلوجرام',exact:true}).fill('77.4');await weight.getByRole('button').filter({hasText:/تصحيح الوزن|تسجيل الوزن/}).click();
 await until(async()=>{const s=await snapshot(context);return s.weights.some(r=>r.client_id===fixture.main&&Number(r.weight)===77.4);},'Weight saved');
 const visibleDate=weight.locator('.date-input-wrap input[type=text]');assert.match(await visibleDate.inputValue(),/^\d{2}\/\d{2}\/\d{4}$/);
 await page.getByRole('tab',{name:'صور التقدم',exact:true}).click();
 const enable=page.getByRole('button',{name:'تفعيل صور التقدم',exact:true});if(await enable.isVisible()){await enable.click();await page.getByRole('button',{name:'موافق، أبي أرفع صور',exact:true}).click();}
 const buffer=await sharp({create:{width:640,height:800,channels:3,background:'#286b79'}}).png().toBuffer();const files=page.locator('input[id^=progress-photo-]');await files.first().waitFor({state:'attached'});
 for(let index=0;index<3;index++)await files.nth(index).setInputFiles({name:`qa-${index}.png`,mimeType:'image/png',buffer});
 await page.getByRole('button',{name:'رفع الصور المختارة',exact:true}).click();
 await page.getByText('تم حفظ الصور. يمكنك إضافة زاوية أخرى أو العودة لاحقًا.',{exact:true}).waitFor();
 const exportLink=page.getByRole('link',{name:'تصدير بياناتي إلى Excel',exact:true});if(await exportLink.count()){
  const downloadPromise=page.waitForEvent('download');await exportLink.click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/\.xlsx$/);await download.saveAs('artifacts/program-qa/trainee-export.xlsx');
 }else{assert.equal((await context.request.get(base+'/api/export')).status(),200);}
 await noOverflow(page);await context.close();
 const coach=await session('coach@example.test',1440);await coach.page.goto(`${base}/coach/clients/${fixture.main}?tab=tracking`);await coach.page.getByRole('tab',{name:/^المراجعات الأسبوعية/}).click();await coach.page.locator('p').filter({hasText:'مراجعة QA '+marker}).first().waitFor();
 await coach.page.getByRole('button',{name:'حفظ الرد ووضع تمت المراجعة',exact:true}).first().click();
 await coach.context.close();console.log('PASS workout sets, measurements, macros, review/coaching queue, messages, renewal, weight, 3 photos and export');
}
async function mediaAndTemplates(){
 const {context,page}=await session('coach@example.test',1440);
 const marker=String(Date.now());
 await page.goto(base+'/coach/library');await page.getByRole('tab',{name:'تماريني الخاصة',exact:true}).click();
 const data=await page.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=240;canvas.height=420;const ctx=canvas.getContext('2d');const stream=canvas.captureStream(15);const recorder=new MediaRecorder(stream,{mimeType:'video/webm'});const chunks=[];
  return await new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=async()=>{stream.getTracks().forEach(track=>track.stop());const buffer=await new Blob(chunks,{type:'video/webm'}).arrayBuffer();resolve(btoa(String.fromCharCode(...new Uint8Array(buffer))));};recorder.start();let frame=0;const timer=setInterval(()=>{ctx.fillStyle='#17404e';ctx.fillRect(0,0,240,420);ctx.fillStyle='#ffffff';ctx.fillRect(20+(frame++%80),120,80,100);},50);setTimeout(()=>{clearInterval(timer);recorder.stop();},800);});
 });
 const video={name:'portrait-qa.webm',mimeType:'video/webm',buffer:Buffer.from(data,'base64')};
 const panel=page.locator('#library-panel-exercises');
 await panel.getByLabel('اسم التمرين',{exact:true}).fill('رفع مكتبي QA '+marker);
 const started=Date.now();await panel.locator('input[type=file]').setInputFiles(video);await panel.locator('form video').waitFor();console.log('Desktop upload completion ms',Date.now()-started);
 await panel.getByRole('button',{name:'إضافة إلى مكتبتي',exact:true}).click();await until(async()=>{const s=await snapshot(context);return s.exercises.some(e=>e.name==='رفع مكتبي QA '+marker&&e.media_id);},'Desktop exercise media saved');
 await until(async()=>await panel.getByLabel('اسم التمرين',{exact:true}).inputValue()==='','Desktop form cleared before the next entry');
 await panel.getByLabel('اسم التمرين',{exact:true}).fill('رفع QR QA '+marker);
 await panel.getByRole('button',{name:'من الجوال · QR',exact:true}).click();
 const url=await page.getByRole('link',{name:'افتح رابط الرفع',exact:true}).getAttribute('href');
 const phone=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});const upload=await phone.newPage();upload.setDefaultTimeout(30000);await upload.goto(url);await upload.locator('input[type=file]').setInputFiles(video);await upload.getByRole('heading',{name:'وصل الفيديو.',exact:true}).waitFor();await page.getByRole('dialog',{name:'رفع من الجوال'}).waitFor({state:'hidden'});await phone.close();
 await panel.getByRole('button',{name:'إضافة إلى مكتبتي',exact:true}).click();await until(async()=>{const s=await snapshot(context);return s.exercises.some(e=>e.name==='رفع QR QA '+marker&&e.media_id);},'QR exercise saved');
 await until(async()=>await panel.getByLabel('اسم التمرين',{exact:true}).inputValue()==='','Custom form cleared after save');
 await page.getByRole('tab',{name:'قوالب البرامج',exact:true}).click();
 const create=page.getByRole('button',{name:/قالب جديد|إنشاء قالب/}).first();await create.click();await page.locator('#template-name-input').fill('قالب تحقق QA '+marker);await page.getByRole('button',{name:'إنشاء القالب',exact:true}).click();await page.waitForURL('**/coach/library?tab=templates&template=*');await page.locator('#plan-name').waitFor();await page.waitForLoadState('networkidle');await page.getByRole('button',{name:'إضافة يوم',exact:true}).click();await until(async()=>await page.locator('.program-day-item').count()===2,'New template day added');await page.getByRole('button',{name:'حفظ المسودة',exact:true}).click();await until(async()=>{const s=await snapshot(context);return s.templates.some(t=>t.name==='قالب تحقق QA '+marker&&t.content.days.length===2&&t.content.days.some(d=>!d.exercises.length));},'Template accepts empty days');
 await page.goto(`${base}/coach/clients/${fixture.main}/edit`);const whatsapp=page.getByRole('link',{name:/مشاركة عبر واتساب/});const href=await whatsapp.getAttribute('href');assert.match(href,/https:\/\/wa\.me\//);assert(decodeURIComponent(href).includes('/me?client='+fixture.main));
 // Inspect the prepared link only; do not send a message to anyone.
 await page.getByRole('link',{name:'معاينة كمتدرب',exact:true}).click();await page.locator('[data-testid=weekly-program]').waitFor();
 await context.close();
 const other=await session('coach2@example.test');const denied=await other.page.goto(`${base}/coach/clients/${fixture.main}/preview`);assert([200,404].includes(denied.status()));assert.equal(await other.page.locator('[data-testid=weekly-program]').count(),0);assert(await other.page.getByText(/404|not found|غير موجود/).first().isVisible());await other.context.close();
 console.log('PASS desktop portrait upload, QR phone upload/polling, templates, prepared WhatsApp link and owner-only preview');
}
async function firstInvitation(){
 const coach=await session('coach@example.test',1440);
 await coach.page.goto(base+'/coach/clients?add=1');
 await coach.page.locator('main form input[name=email]').fill('pending-qa@example.test');await coach.page.locator('main form input[name=name]').fill('دعوة أولى QA');await coach.page.locator('main form input[name=phone]').fill('0501234567');await coach.page.locator('main form button[type=submit]').click();await coach.page.waitForURL(/\/coach\/clients\/[a-f0-9-]+$/);
 const id=coach.page.url().split('/').at(-1);
 await coach.page.goto(`${base}/coach/clients/${id}?tab=profile`);await coach.page.getByRole('button',{name:'ربط حساب اختياري',exact:true}).click();const link=await coach.page.locator('#generated-invite').inputValue();await coach.context.close();
 const trainee=await session('pending-qa@example.test');await trainee.page.goto(link);await trainee.page.getByRole('button',{name:'قبول الدعوة وربط حسابي',exact:true}).click();await trainee.page.waitForURL('**/me');await trainee.page.getByText('برنامجك قيد التجهيز',{exact:true}).waitFor();
 assert((await snapshot(trainee.context)).clients.some(c=>c.id===id));await trainee.context.close();console.log('PASS first invitation accepts and navigates directly to linked trainee portal');
}
async function touchPosition(){
 const {context,page}=await session('trainee@example.test');
 for(const width of [390,768,1440]){
  await page.setViewportSize({width,height:900});await page.goto(base+'/me');await page.locator('[data-day-jump="0"]').tap();await page.waitForTimeout(450);
  const header=await page.locator('.trainee-header').boundingBox(),summary=await page.locator('[data-program-day="0"]>.weekly-day-heading').boundingBox();assert(summary.y>=header.y+header.height-1,'Day heading clears the sticky header');
  assert.equal(await page.locator('.weekly-exercise img,.weekly-exercise video,.weekly-exercise iframe').count(),0,'Closed exercises do not mount media');
  await page.locator('[data-program-day="0"] .weekly-exercise>summary').first().tap();const image=page.locator('[data-program-day="0"] .exercise-photo-crop img').first();await image.scrollIntoViewIfNeeded();await image.evaluate(image=>image.decode());await page.screenshot({path:`artifacts/program-qa/touch-photo-${width}.png`});
  await page.locator('[data-program-day="0"]>.weekly-day-heading').tap();assert.equal(await page.locator('[data-program-day="0"]').evaluate(e=>e.open),false);await page.locator('[data-day-jump="0"]').tap();assert(await page.locator('[data-program-day="0"]').evaluate(e=>e.open));
 }
 await context.close();console.log('PASS touch open/close and day headings below sticky header at 390/768/1440');
}
async function inspectDetails(){
 const {context,page}=await session('coach@example.test',1440);
 await page.goto(`${base}/coach/clients/${fixture.main}/edit`);
 await page.locator('.program-day-settings>summary').click();const name=page.getByRole('textbox',{name:'اسم اليوم',exact:true});const original=await name.inputValue();await name.fill('اليوم الثاني');await page.getByText('اسم اليوم مكرر؛ اختر اسمًا يميزه عن بقية الأيام.',{exact:true}).waitFor();await name.fill(original);
 await page.getByRole('button',{name:'اختيار التمارين',exact:true}).click();const picker=page.locator('.exercise-picker-backdrop');assert.match(await picker.locator('.picker-day-tabs button').first().innerText(),/الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت/);
 await picker.locator('[data-picker-search]').fill('ضغط صدر');const first=picker.locator('.picker-card strong').first();await first.waitFor();assert((await first.innerText()).includes('ضغط صدر'));console.log('Top chest press result:',await first.innerText());await page.getByRole('button',{name:'إغلاق اختيار التمارين',exact:true}).click();
 await until(async()=>await page.locator('.program-save-state').getAttribute('data-state')==='saved','Restored day name saved');await page.goto(`${base}/coach/clients/${fixture.main}`);
 const chart=page.getByRole('region',{name:'تاريخ تغير هدف السعرات',exact:true});await chart.locator('.interactive-chart svg').waitFor();const labels=await chart.locator('.interactive-chart svg text').allTextContents();const ticks=labels.map(text=>text.replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[,٬]/g,'')).filter(text=>/^\d+(\.\d+)?$/.test(text)).map(Number);assert(ticks.length>=2&&Math.max(...ticks)-Math.min(...ticks)>=100,'Calorie axis has a meaningful range');await chart.screenshot({path:'artifacts/program-qa/calorie-axis.png'});
 await context.close();console.log('PASS duplicate-day warning, picker weekday, name-first search and meaningful calorie axis');
}
async function matrix(){
 for(const email of process.argv.includes('--coach')?['coach@example.test']:['trainee@example.test','coach@example.test']){
  const {context,page}=await session(email);
  const expected=(await snapshot(context)).programs.find(p=>p.client_id===fixture.main&&p.published_at);
  for(const width of [390,768,1440])for(const theme of ['dark','light'])for(const language of ['ar','en']){
   await context.addCookies([{name:'ec_theme',value:theme,url:base},{name:'ec_language',value:language,url:base}]);
   await page.setViewportSize({width,height:950});await page.goto(base+(email.startsWith('coach')?`/coach/clients/${fixture.main}/edit`:'/me'));
   await page.locator(email.startsWith('coach')?'.program-day-nav':'[data-testid=weekly-program]').waitFor();
   await noOverflow(page);
   if(email.startsWith('coach')){
    const fields=await page.locator('.program-exercise-notes textarea').evaluateAll(es=>es.map(e=>({width:e.getBoundingClientRect().width,parent:e.closest('.program-exercise-card').getBoundingClientRect().width})));
    assert(fields.every(e=>e.width>e.parent*.65),'Coach notes span the card');
    assert.equal(await page.locator('.program-savebar').evaluate(e=>getComputedStyle(e).position),'static');
    assert((await page.locator('.program-day-item').first().boundingBox()).height<150,'Day names are readable, not vertical');
   }else{
    assert.equal(await page.locator('[data-program-day]').count(),3);
    for(let day=0;day<3;day++){
     await page.locator(`[data-day-jump="${day}"]`).tap();
     const card=page.locator(`[data-program-day="${day}"]`);
     assert(await card.evaluate(e=>e.open));
     assert(await card.locator('.weekly-day-content').isVisible());
     assert.equal(await card.locator('[data-workout-exercise]').count(),expected.content.days[day].exercises.length);
    }
    await page.locator('[data-program-day="0"] .weekly-exercise > summary').first().tap();
    assert(await page.locator('[data-program-day="0"] .weekly-exercise-body').first().isVisible());
    assert.equal(await page.locator('[data-program-day="0"] bdi').filter({hasText:'3-1-1-0'}).first().getAttribute('dir'),'ltr');
    const image=page.locator('[data-program-day="0"] .exercise-photo-crop img').first();await image.scrollIntoViewIfNeeded();await image.evaluate(image=>image.decode());
   }
   await page.screenshot({path:`artifacts/program-qa/${email.startsWith('coach')?'editor':'trainee'}-${width}-${theme}-${language}.png`,fullPage:true});
   console.log(`PASS ${email} ${width} ${theme} ${language}`);
  }
  await context.close();
 }
}
async function scenarios(){
 for(const scenario of ['rest','unscheduled','pending','invite']){
  const {context,page}=await session(`${scenario}-qa@example.test`);
  if(scenario==='invite'){
   await page.goto(base+'/invite/'+fixture.inviteToken);
   await page.getByRole('button',{name:/قبول|ربط/}).click();
   await page.waitForURL('**/me');
   await page.getByRole('button',{name:'مو الحين',exact:true}).waitFor({timeout:3000}).then(()=>page.getByRole('button',{name:'مو الحين',exact:true}).click()).catch(()=>{});
  }
  if(scenario==='pending')assert(await page.getByText('حسابك جاهز، وينتظر ربطه بمدربك',{exact:true}).isVisible());
  else{
   await page.locator('[data-testid=weekly-program]').waitFor();
   assert.equal(await page.locator('[data-program-day]').count(),2);
   if(scenario==='rest')assert.equal(await page.locator('[data-program-day][open]').count(),0);
   for(let index=0;index<2;index++){
    await page.locator(`[data-day-jump="${index}"]`).tap();
    assert(await page.locator(`[data-program-day="${index}"] [data-workout-exercise]`).first().isVisible());
   }
  }
  console.log('PASS scenario '+scenario);await context.close();
 }
}
try {
 if(process.argv.includes('--inspect'))await inspectDetails();else if(process.argv.includes('--touch'))await touchPosition();else if(process.argv.includes('--template-direct')){const s=await session('coach@example.test',1440);const t=(await snapshot(s.context)).templates.find(t=>t.name.startsWith('قالب تحقق QA'));await s.page.goto(`${base}/coach/library?tab=templates&template=${t.id}`);console.log('TEMPLATE DIRECT',s.page.url(),await s.page.locator('#plan-name').count(),await s.page.locator('#plan-name').isVisible());await s.page.screenshot({path:'artifacts/program-qa/template-direct.png',fullPage:true});await s.context.close();}
 else
 if(process.argv.includes('--invite'))await firstInvitation();else if(process.argv.includes('--media'))await mediaAndTemplates();else if(process.argv.includes('--records'))await recordsFlow();else if(process.argv.includes('--editor'))await editorFlows();else if(process.argv.includes('--scenarios'))await scenarios();else await matrix();
 assert.deepEqual(errors,[]);console.log('PASS no React/browser errors');
 }catch(error){
  for(const context of browser.contexts())for(const page of context.pages()){
   console.log('FAILED PAGE',page.url());console.log('STATUS',await page.getByRole('status').allTextContents());console.log('ALERT',await page.getByRole('alert').allTextContents());
   await page.screenshot({path:'artifacts/program-qa/failure.png',fullPage:true}).catch(()=>{});
  }
  throw error;
 }finally{await browser.close();}
