import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {expect,test} from '@playwright/test';

async function login(page) {
  expect(process.env.EASYCOACH_EVIDENCE_LAB).toBe('1');
  expect(process.env.TEST_BASE_URL).toBe('http://127.0.0.1:3210');
  const manifest=JSON.parse(await readFile(path.join(process.env.EASYCOACH_LAB_DIR,'manifest.json'),'utf8'));
  const persona=manifest.personas.find(p=>p.id==='personal');
  await page.goto('/login');
  await page.locator('#auth-email').fill(persona.email);
  await page.locator('#auth-password').fill('LocalEvidence!2026');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/coach');
  return persona;
}

test('trainer directory shows actionable rows, filters, pagination and mobile cards',async({page,context},info)=>{
  const persona=await login(page);await page.goto('/coach/clients');
  await expect(page.locator('.roster-row')).toHaveCount(persona.clients);await expect(page.locator('.client-board')).toHaveCount(0);
  const ids=await page.locator('.roster-row').evaluateAll(nodes=>nodes.map(node=>node.dataset.clientId));expect(new Set(ids).size).toBe(persona.clients);
  const row=page.locator('[data-client-id="'+persona.clientIds[0]+'"]');await expect(row).toContainText('برنامج منشور');await expect(row.locator('.roster-calories')).toContainText('سعرة');
  await expect(row.locator('.roster-person-link')).toHaveAttribute('href','/coach/clients/'+persona.clientIds[0]);
  await expect(row.locator('.roster-inline-link')).toHaveAttribute('href','/coach/clients/'+persona.clientIds[0]+'/edit');
  await expect(row.locator('.roster-calories')).toHaveAttribute('href','/coach/clients/'+persona.clientIds[0]+'/edit?tab=nutrition');
  const search=page.getByRole('textbox',{name:'البحث عن عميل',exact:true});await search.fill('  Client personal 2 ');await expect(page.locator('.roster-row')).toHaveCount(1);
  await search.fill('does-not-exist');await expect(page.getByText('لا توجد نتائج مطابقة للبحث والتصفية.',{exact:true})).toBeVisible();await page.locator('.roster-empty button').click();await expect(page.locator('.roster-row')).toHaveCount(persona.clients);
  await page.getByRole('button',{name:/بانتظار برنامج/}).click();await expect(page.locator('.roster-row')).toHaveCount(persona.clients-1);await expect(page.locator('.roster-row').first().locator('.roster-primary-action')).toHaveAttribute('href',/\/edit$/);
  await page.getByRole('button',{name:'مسح البحث والتصفية',exact:true}).click();
  const desktop=info.outputPath('roster-desktop.png');await page.screenshot({path:desktop,fullPage:true});await page.getByRole('button',{name:'تفعيل الوضع الداكن',exact:true}).click();const dark=info.outputPath('roster-dark.png');await page.screenshot({path:dark,fullPage:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const screenshot=info.outputPath('roster-mobile.png');await page.screenshot({path:screenshot,fullPage:true});
  await page.getByRole('button',{name:'فلاتر إضافية',exact:true}).click();await expect(page.getByRole('combobox',{name:'تصفية حالة العملاء',exact:true})).toBeVisible();
  const manifest=JSON.parse(await readFile(path.join(process.env.EASYCOACH_LAB_DIR,'manifest.json'),'utf8')),online=manifest.personas.find(p=>p.id==='online');
  await context.clearCookies();await page.setViewportSize({width:1440,height:1000});await page.goto('/login');await page.locator('#auth-email').fill(online.email);await page.locator('#auth-password').fill('LocalEvidence!2026');await page.locator('button[type=submit]').click();await page.waitForURL('**/coach');await page.goto('/coach/clients');await expect(page.locator('.roster-row')).toHaveCount(20);
  const firstPage=await page.locator('.roster-row').evaluateAll(nodes=>nodes.map(n=>n.dataset.clientId));await page.getByRole('button',{name:'التالي',exact:true}).click();await expect(page.locator('.roster-row')).toHaveCount(20);const secondPage=await page.locator('.roster-row').evaluateAll(nodes=>nodes.map(n=>n.dataset.clientId));expect(secondPage.some(id=>firstPage.includes(id))).toBe(false);
  await page.getByRole('textbox',{name:'البحث عن عميل',exact:true}).fill('online Client 120');await expect(page.locator('.roster-row')).toHaveCount(1);await expect(page.locator('.roster-row')).toContainText('online Client 120');
  const archivedId=await page.locator('.roster-row').getAttribute('data-client-id');await page.goto(`/coach/clients/${archivedId}?tab=tracking`);await page.getByRole('tab',{name:'الملف الشخصي',exact:true}).click();page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'أرشفة العميل',exact:true}).click();await expect.poll(async()=>((await(await context.request.get('/api/export')).json()).clients.find(c=>c.id===archivedId)?.archived)).toBe(true);
  await page.goto('/coach/clients?filter=archived');await expect(page.locator('.roster-row')).toHaveCount(1);await expect(page.locator('.roster-row a[href^="/coach/clients/"]')).toHaveCount(0);await page.getByRole('button',{name:'إعادة التفعيل',exact:true}).click();await expect.poll(async()=>((await(await context.request.get('/api/export')).json()).clients.find(c=>c.id===archivedId)?.archived)).toBe(false);
  const dir=path.join(process.env.EASYCOACH_LAB_DIR,'journey-evidence');await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'coach-directory.json'),JSON.stringify({id:'journey:actionable-trainer-directory',status:'pass',detail:{uniqueRows:true,search:true,filterCounts:true,programAndCaloriesLinks:true,pagination:true,archiveAndRestore:true,noDeadArchiveLinks:true,mobile:true,desktop,dark,screenshot}}));
});

test('exercise photo recovers after a transient error in the detail dialog',async({page},info)=>{
  await login(page);
  await page.goto('/coach/library');
  const search=page.getByRole('textbox',{name:'ابحث في التمارين',exact:true});
  await search.fill('Pullups');
  const card=page.locator('.picker-card[data-catalog-id="Pullups"]');
  await expect(card).toHaveCount(1);
  await card.locator('img').evaluate(img=>img.decode());
  await page.route('**/exercises/Pullups.webp',route=>route.abort());
  await card.locator('.picker-preview').click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('button',{name:'إعادة تحميل الصورة',exact:true})).toBeVisible();
  await page.unroute('**/exercises/Pullups.webp');
  await dialog.getByRole('button',{name:'إعادة تحميل الصورة',exact:true}).click();
  await expect(dialog.locator('img')).toBeVisible();
  await expect.poll(()=>dialog.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  await page.route('**/api/exercise-media/Pullups?*',route=>route.abort());
  await dialog.getByRole('button',{name:'شاهد أداء الحركة',exact:true}).click();
  await expect(dialog.getByText('تعذر تشغيل الفيديو؛ يمكنك إعادة المحاولة.',{exact:true})).toBeVisible();
  await expect(dialog.locator('img')).toBeVisible();
  await dialog.getByRole('button',{name:'إعادة تشغيل الفيديو',exact:true}).click({trial:true});
  const screenshot=info.outputPath('exercise-photo-recovery.png');await page.screenshot({path:screenshot,fullPage:true});
  const dir=path.join(process.env.EASYCOACH_LAB_DIR,'journey-evidence');await mkdir(dir,{recursive:true});
  await writeFile(path.join(dir,'exercise-recovery.json'),JSON.stringify({id:'journey:exercise-photo-recovery',status:'pass',detail:{photoRetry:true,videoFailurePreservesPhoto:true,screenshot}}));
});
