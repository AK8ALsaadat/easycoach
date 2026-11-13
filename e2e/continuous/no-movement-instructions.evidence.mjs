import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {expect,test} from '@playwright/test';

test('movement explanations are absent from the picker, editor and trainee program',async({page,context},info)=>{
  expect(process.env.EASYCOACH_EVIDENCE_LAB).toBe('1');expect(process.env.TEST_BASE_URL).toBe('http://127.0.0.1:3210');
  const lab=process.env.EASYCOACH_LAB_DIR,manifest=JSON.parse(await readFile(path.join(lab,'manifest.json'),'utf8'));const persona=manifest.personas.find(p=>p.id==='personal'),id=persona.clientIds[0];
  const login=async email=>{await page.goto('/login');await page.locator('#auth-email').fill(email);await page.locator('#auth-password').fill('LocalEvidence!2026');await page.locator('button[type=submit]').click();};
  await login(persona.email);await page.waitForURL('**/coach');
  await page.goto(`/coach/clients/${id}/edit`);await expect(page.locator('.program-instructions')).toHaveCount(0);await expect(page.locator('textarea[id*="description"]')).toHaveCount(0);
  await page.getByRole('button',{name:'اختيار التمارين',exact:true}).click();const picker=page.getByRole('dialog');await picker.getByRole('textbox',{name:'ابحث في التمارين',exact:true}).fill('Bodyweight Squat');
  await expect(picker.getByText('طريقة أداء التمرين',{exact:true})).toHaveCount(0);await expect(picker.getByText('شرح الحركة',{exact:true})).toHaveCount(0);
  await picker.locator('[data-catalog-id="Bodyweight_Squat"] .picker-card-select').click();await picker.getByRole('button',{name:'إضافة المحدد (1)',exact:true}).click();
  await expect(page.getByText('المسودة محفوظة',{exact:true})).toBeVisible();await page.getByRole('button',{name:'نشر للمتدرب',exact:true}).click();
  const snapshot=async()=>{const r=await context.request.get('/api/export');expect(r.status()).toBe(200);return r.json();};
  await expect.poll(async()=>((await snapshot()).programs.some(p=>p.client_id===id&&p.published_at&&p.content.days.some(d=>d.exercises.some(e=>e.catalogId==='Bodyweight_Squat'))))).toBe(true);
  await context.clearCookies();await login('trainee@continuous.example.test');await page.waitForURL(/\/me(?:\?|$)/);await page.goto(`/me?client=${id}`);
  await expect(page.locator('[data-exercise-id="Bodyweight_Squat"]')).toBeVisible();await expect(page.locator('.program-instructions,.exercise-instructions')).toHaveCount(0);
  for(const text of ['طريقة أداء التمرين','شرح أداء التمرين بالعربية','تعليمات individual-program'])await expect(page.getByText(text,{exact:true})).toHaveCount(0);
  const screenshot=info.outputPath('program-without-explanations.png');await page.screenshot({path:screenshot,fullPage:true});const dir=path.join(lab,'journey-evidence');await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'no-movement-instructions.json'),JSON.stringify({id:'journey:movement-explanations-removed',status:'pass',detail:{picker:true,coachEditor:true,traineeView:true,published:true,catalogImagePreserved:true,screenshot}}));
});
