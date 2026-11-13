import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {expect,test} from '@playwright/test';
import {ensurePhotoConsent} from '../../scripts/photo-consent-helper.mjs';

test('client click opens private progress overview with independent nutrition and plan editing',async({page,context,browser},info)=>{
  expect(process.env.EASYCOACH_EVIDENCE_LAB).toBe('1');expect(process.env.TEST_BASE_URL).toBe('http://127.0.0.1:3210');
  const lab=process.env.EASYCOACH_LAB_DIR;const manifest=JSON.parse(await readFile(path.join(lab,'manifest.json'),'utf8'));const persona=manifest.personas.find(p=>p.id==='personal');const id=persona.clientIds[0];
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const offset=amount=>{const day=new Date(`${today}T12:00:00Z`);day.setUTCDate(day.getUTCDate()+amount);return day.toISOString().slice(0,10);};
  const login=async(surface,email)=>{await surface.goto('/login');await surface.locator('#auth-email').fill(email);await surface.locator('#auth-password').fill('LocalEvidence!2026');await surface.locator('button[type=submit]').click();};
  await login(page,persona.email);await page.waitForURL('**/coach');
  const snapshot=async()=>{const response=await context.request.get('/api/export');expect(response.status()).toBe(200);return response.json();};const before=await snapshot();
  await page.goto('/coach/clients');await page.locator('.roster-person-link').filter({hasText:'personal Client 1'}).click();
  await expect(page).toHaveURL(new RegExp(`/coach/clients/${id}$`));await expect(page.getByTestId('client-overview')).toBeVisible();await expect(page.locator('#plan-name')).toHaveCount(0);
  await page.goto(`/coach/clients/${id}?tab=profile`);
  const profile=page.locator('form').filter({has:page.locator('input[type=email]')});await profile.getByLabel('الجوال (اختياري)',{exact:true}).fill('0501234567');await profile.getByRole('button',{name:'حفظ',exact:true}).click();
  await expect.poll(async()=>((await snapshot()).clients.find(c=>c.id===id)?.phone)).toBe('0501234567');
  await page.goto(`/coach/clients/${id}?tab=progress`);
  for(const [date,weight] of [[offset(-1),'80'],[today,'79.5']]){
    await page.getByRole('textbox',{name:'تاريخ الوزن',exact:true}).or(page.getByLabel('تاريخ الوزن',{exact:true})).fill(date);
    await page.getByLabel('الوزن بالكيلوجرام',{exact:true}).fill(weight);await page.locator('.weight-panel form button').click();
    await expect.poll(async()=>((await snapshot()).weights.find(w=>w.client_id===id&&w.entry_date===date)?.weight)).toBe(Number(weight));
    await expect(page.getByLabel('الوزن بالكيلوجرام',{exact:true})).toBeEnabled();
    await expect(page.getByLabel('الوزن بالكيلوجرام',{exact:true})).toHaveValue('');
  }
  const setTarget=async(calories,date)=>{
    await page.goto(`/coach/clients/${id}/edit?tab=nutrition`);const editor=page.getByTestId('nutrition-target-editor');
    const caloriesSwitch=editor.getByRole('switch',{name:'احسب السعرات تلقائيًا من الماكروز'});if((await caloriesSwitch.getAttribute('aria-checked'))==='true')await caloriesSwitch.click();await editor.getByLabel('السعرات (kcal)',{exact:true}).fill('');await editor.getByLabel('السعرات (kcal)',{exact:true}).fill(String(calories));await editor.getByLabel('تاريخ سريان السعرات',{exact:true}).fill(date);
    await editor.getByRole('button',{name:'حفظ السعرات للمتدرب',exact:true}).click();
    await expect.poll(async()=>((await snapshot()).management.records.some(r=>r.client_id===id&&r.kind==='nutrition_target'&&r.entry_date===date&&r.payload.calories===calories))).toBe(true);
    await expect(editor.getByRole('status')).toHaveText('تم الحفظ');
  };
  await setTarget(2350,offset(-1));await setTarget(2400,today);await setTarget(2600,offset(1));
  expect((await snapshot()).programs).toEqual(before.programs);
  await page.goto(`/coach/clients/${id}?tab=tracking`);await page.getByRole('tab',{name:'الماكروز الفعلية',exact:true}).click();
  for(const [date,calories] of [[offset(-1),'2100'],[today,'2300']]){
    const form=page.locator('form[data-record-kind="nutrition_log"]');await form.locator('[name=entry_date]').fill(date);
    for(const [key,value] of Object.entries({calories,protein:'150',carbs:'250',fat:'60'}))await form.locator(`[name=${key}]`).fill(value);
    await form.locator('button').click();await expect.poll(async()=>((await snapshot()).management.records.some(r=>r.client_id===id&&r.kind==='nutrition_log'&&r.entry_date===date))).toBe(true);
    await expect(form.locator('[name=calories]')).toBeEnabled();await expect(form.locator('[name=calories]')).toHaveValue('');
  }
  await page.goto(`/coach/clients/${id}`);const overview=page.getByTestId('client-overview');
  const metrics=overview.locator('.client-insight-metrics');await expect(metrics).toContainText('79.5');await expect(metrics).toContainText('-0.5');await expect(metrics).toContainText('2400');await expect(metrics).toContainText('2200');
  await expect(page.getByRole('region',{name:'تطور الوزن',exact:true}).locator('svg circle')).toHaveCount(2);
  await expect(page.getByRole('region',{name:'السعرات الفعلية المسجلة',exact:true}).locator('svg circle')).toHaveCount(2);
  await expect(page.getByRole('region',{name:'تاريخ تغير هدف السعرات',exact:true})).not.toContainText('2600');
  await expect(page.getByRole('link',{name:'فتح واتساب 0501234567',exact:true})).toHaveAttribute('href','https://wa.me/966501234567');
  // Only the trainee can grant progress-photo consent; the coach upload is blocked until then.
  const traineeContext=await browser.newContext();try{const traineePage=await traineeContext.newPage();await login(traineePage,'trainee@continuous.example.test');await traineePage.waitForURL(/\/me(?:\?|$)/);await ensurePhotoConsent(traineePage);}finally{await traineeContext.close();}
  await page.reload();
  const knownPhotos=new Set((await snapshot()).management.progress_photos.filter(p=>p.client_id===id).map(p=>p.id));
  const photoBuffer=await page.screenshot();await page.getByLabel('صورة تقدم خاصة',{exact:true}).setInputFiles({name:'synthetic-progress.png',mimeType:'image/png',buffer:photoBuffer});
  await page.getByRole('button',{name:'رفع صورة',exact:true}).click();
  await expect.poll(async()=>((await snapshot()).management.progress_photos.filter(p=>p.client_id===id).length)).toBe(knownPhotos.size+1);
  const photo=(await snapshot()).management.progress_photos.find(p=>p.client_id===id&&!knownPhotos.has(p.id));const image=overview.locator(`img[src="/api/progress-photos/${photo.id}"]`);await image.scrollIntoViewIfNeeded();await expect(image).toBeVisible();await expect.poll(()=>image.evaluate(element=>element.complete&&element.naturalWidth>0)).toBe(true);
  const desktop=info.outputPath('client-overview-desktop.png');await page.screenshot({path:desktop,fullPage:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const screenshot=info.outputPath('client-overview-mobile.png');await page.screenshot({path:screenshot,fullPage:true});
  await overview.getByRole('link',{name:'تعديل الجدول',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/coach/clients/${id}/edit$`));await expect(page.locator('#plan-name')).toBeVisible();
  await page.getByLabel('أضف تمرينك الخاص',{exact:true}).fill('تمرين إضافي للمتابعة');await page.getByRole('button',{name:'إضافة التمرين',exact:true}).click();
  await expect(page.getByText('المسودة محفوظة',{exact:true})).toBeVisible();await page.getByRole('button',{name:'نشر للمتدرب',exact:true}).click();
  await expect.poll(async()=>((await snapshot()).programs.find(p=>p.client_id===id&&p.published_at)?.content.nutrition.calories)).toBe(2400);
  const after=await snapshot();expect(after.programs.filter(p=>p.client_id!==id)).toEqual(before.programs.filter(p=>p.client_id!==id));
  const other=await browser.newContext({baseURL:process.env.TEST_BASE_URL});
  try{const otherPage=await other.newPage();await login(otherPage,manifest.personas.find(p=>p.id==='online').email);await otherPage.waitForURL('**/coach');expect((await other.request.get(`/api/progress-photos/${photo.id}`)).status()).toBe(404);await otherPage.goto(`/coach/clients/${id}/edit`);await expect(otherPage.locator('#plan-name')).toHaveCount(0);await expect(otherPage.getByTestId('client-overview')).toHaveCount(0);}finally{await other.close();}
  await context.clearCookies();expect((await context.request.get(`/api/progress-photos/${photo.id}`)).status()).toBe(404);
  await login(page,'trainee@continuous.example.test');await page.waitForURL(/\/me(?:\?|$)/);expect((await context.request.get(`/api/progress-photos/${photo.id}`)).status()).toBe(200);
  const dir=path.join(lab,'journey-evidence');await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'client-overview.json'),JSON.stringify({id:'journey:client-overview-private-progress-editing',status:'pass',detail:{defaultOverview:true,weightPoints:2,actualCaloriePoints:2,currentCalories:2400,futureTargetExcluded:true,privatePhoto:true,deniesOtherCoachAndAnonymous:true,linkedTraineePhotoAllowed:true,whatsappNormalized:true,independentNutritionSave:true,workoutPublishPreservesNutrition:true,otherProgramsUnchanged:true,mobile:true,desktop,screenshot}}));
});
