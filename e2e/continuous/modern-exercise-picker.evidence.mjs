import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {expect,test} from '@playwright/test';

test('batch exercise picker keeps selection through search and adds only after confirmation',async({page,context},info)=>{
  expect(process.env.EASYCOACH_EVIDENCE_LAB).toBe('1');expect(process.env.TEST_BASE_URL).toBe('http://127.0.0.1:3210');
  const lab=process.env.EASYCOACH_LAB_DIR,manifest=JSON.parse(await readFile(path.join(lab,'manifest.json'),'utf8'));const persona=manifest.personas.find(p=>p.id==='expert'),id=persona.clientIds[1];
  await page.goto('/login');await page.locator('#auth-email').fill(persona.email);await page.locator('#auth-password').fill('LocalEvidence!2026');await page.locator('button[type=submit]').click();await page.waitForURL('**/coach');
  const snapshot=async()=>{const r=await context.request.get('/api/export');expect(r.status()).toBe(200);return r.json();};const before=await snapshot();
  await page.goto(`/coach/clients/${id}/edit`);await page.locator('#plan-name').fill('برنامج باختيار متعدد');await page.getByRole('button',{name:'إضافة يوم',exact:true}).click();
  const open=async()=>{await page.getByRole('button',{name:'اختيار التمارين',exact:true}).click();const picker=page.getByRole('dialog',{name:'اختيار التمارين',exact:true});await expect(picker.getByRole('textbox',{name:'ابحث في التمارين',exact:true})).toBeFocused();return picker;};
  let picker=await open();let search=picker.getByRole('textbox',{name:'ابحث في التمارين',exact:true});
  await search.fill('Pullups');await picker.locator('[data-catalog-id="Pullups"] .picker-card-select').click();await picker.getByRole('button',{name:'إغلاق اختيار التمارين',exact:true}).click();
  await expect(page.getByTestId('program-exercise-row')).toHaveCount(0);expect((await snapshot()).programs).toEqual(before.programs);
  picker=await open();search=picker.getByRole('textbox',{name:'ابحث في التمارين',exact:true});await search.fill('Pullups');await picker.locator('[data-catalog-id="Pullups"] .picker-card-select').click();
  await search.fill('Barbell Squat');await picker.locator('[data-catalog-id="Barbell_Squat"] .picker-card-select').click();
  await search.fill('does-not-exist');await expect(picker.getByText('التمارين المحددة: 2',{exact:true})).toBeVisible();
  await expect(picker.getByRole('button',{name:'إضافة المحدد (2)',exact:true})).toBeEnabled();await search.fill('Barbell Squat');
  await page.setViewportSize({width:1440,height:1000});const desktop=info.outputPath('picker-desktop.png');await page.screenshot({path:desktop,fullPage:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const box=await picker.boundingBox();expect(box.x).toBe(0);expect(box.width).toBe(390);const screenshot=info.outputPath('picker-mobile.png');await page.screenshot({path:screenshot,fullPage:true});
  expect((await snapshot()).programs).toEqual(before.programs);await picker.getByRole('button',{name:'إضافة المحدد (2)',exact:true}).click();await expect(picker).toHaveCount(0);await expect(page.getByTestId('program-exercise-row')).toHaveCount(2);
  await page.getByRole('button',{name:'اليوم الأول',exact:true}).click();picker=await open();await picker.getByRole('textbox',{name:'ابحث في التمارين',exact:true}).fill('Pushups');await picker.locator('[data-catalog-id="Pushups"] .picker-card-select').click();await picker.getByRole('button',{name:'إضافة المحدد (1)',exact:true}).click();
  await expect(page.getByText('المسودة محفوظة',{exact:true})).toBeVisible();const draft=(await snapshot()).programs.find(p=>p.client_id===id&&!p.published_at);expect(draft.content.days).toHaveLength(2);expect(draft.content.days[1].exercises.map(e=>e.catalogId)).toEqual(['Pullups','Barbell_Squat']);expect(draft.content.days[0].exercises[0].catalogId).toBe('Pushups');
  expect(new Set(draft.content.days.flatMap(d=>d.exercises.map(e=>e.rowId))).size).toBe(3);
  await page.getByRole('button',{name:'نشر للمتدرب',exact:true}).click();await expect.poll(async()=>((await snapshot()).programs.some(p=>p.id===draft.id&&p.published_at))).toBe(true);
  await page.reload();await page.getByRole('button',{name:'اليوم 2',exact:true}).click();await expect(page.getByTestId('program-exercise-row')).toHaveCount(2);
  const after=await snapshot();expect(after.programs.filter(p=>p.client_id!==id)).toEqual(before.programs.filter(p=>p.client_id!==id));
  const dir=path.join(lab,'journey-evidence');await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'modern-picker.json'),JSON.stringify({id:'journey:modern-batch-exercise-picker',status:'pass',detail:{cancelPreservesData:true,selectionAcrossSearch:true,explicitConfirmation:true,chosenOrder:true,correctTargetDay:true,publishedAndReloaded:true,mobile:true,desktop,screenshot}}));
});
