import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {test,expect} from '@playwright/test';
import ExcelJS from 'exceljs';

test('Excel preview shows all sheets and fields without applying or mutating account data',async({page,context},testInfo)=>{
 const base=process.env.TEST_BASE_URL,lab=process.env.EASYCOACH_LAB_DIR;
 assert.equal(base,'http://127.0.0.1:3210');assert.equal(process.env.EASYCOACH_EVIDENCE_LAB,'1');assert(lab);
 const manifest=JSON.parse(await readFile(path.join(lab,'manifest.json'),'utf8'));
 const persona=manifest.personas.find(p=>p.id==='excel');assert(persona?.email.endsWith('@continuous.example.test'));
 await page.goto('/login');await page.locator('#auth-email').fill(persona.email);
 await page.locator('#auth-password').fill('LocalEvidence!2026');await page.locator('button[type=submit]').click();await page.waitForURL('**/coach');
 const snapshot=async()=>{const r=await context.request.get(`${base}/api/export`);expect(r.status()).toBe(200);const {exported_at,...account}=await r.json();assert(Number.isFinite(Date.parse(exported_at)),'export metadata must contain a valid timestamp');return account;};
 const before=await snapshot();let applyRequests=0;
 page.on('request',request=>{if(request.method()!=='GET'&&new URL(request.url()).pathname!=='/api/import')applyRequests++;});
 const workbook=new ExcelJS.Workbook();
 for(const [name,headers] of [['Clients',['name','email','preview_note']],['Measurements',['email','date','weight']],['NutritionLogs',['email','calories','protein','carbs','fat']]]){
  const sheet=workbook.addWorksheet(name);sheet.addRow(headers);
  for(let i=1;i<=80;i++){
   const email=`preview-${i}@continuous.example.test`;
   if(name==='Clients')sheet.addRow([`Synthetic ${i}`,email,'Unmapped preview note']);
   else if(name==='Measurements')sheet.addRow([email,'2026-11-01',i===1?70.1:i===2?0:i===3?'':i===4?'<img src=x onerror=alert(1)>':70+i/10]);
   else sheet.addRow([email,...(i===1?[2200,150,250,65]:i===2?[0,0,0,0]:i===3?['','','','']:i===4?['<script>alert(1)</script>',150,250,65]:[2200,150,250,65])]);
  }
 }
 const file=Buffer.from(await workbook.xlsx.writeBuffer());
 await page.goto('/coach/clients');await page.getByRole('button',{name:'استيراد ملف',exact:true}).click();await expect(page.locator('#import-file')).toBeVisible();await page.locator('#import-file').setInputFiles({name:'preview.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:file});
 const upload=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/import'&&r.request().method()==='POST');
 await page.getByRole('button',{name:'قراءة ومعاينة',exact:true}).click();expect((await upload).status()).toBe(200);
 const summary=page.getByTestId('import-sheet-summary');await expect(summary).toBeVisible();
 await expect(summary.getByTestId('import-sheet-summary-item')).toHaveCount(3);
 await expect(summary.getByTestId('import-sheet-row-count')).toHaveText(['80','80','80']);
 await expect(page.getByTestId('import-total-rows')).toContainText('240');await expect(summary).toContainText('weight');await expect(summary).toContainText('protein');
 const next=page.getByTestId('import-preview-next');
 const previewRow=index=>page.getByTestId('import-preview-row').filter({has:page.getByText(`preview-${index}@continuous.example.test`,{exact:true})});
 await next.click();
 const measurement=previewRow(1);
 await expect(measurement.getByTestId('import-mapped-value-summary')).toHaveText('الوزن: 70.1 كجم');
 const zeroWeight=previewRow(2);
 await expect(zeroWeight.getByTestId('import-mapped-value-summary')).toHaveText('الوزن: 0 كجم');
 const missingWeight=previewRow(3);
 await expect(missingWeight.getByTestId('import-mapped-value-summary')).toHaveCount(0);
 const invalidWeight=previewRow(4);
 await expect(invalidWeight.getByTestId('import-mapped-value-summary')).toContainText('<img src=x onerror=alert(1)>');
 await expect(invalidWeight.locator('.text-red-700')).toBeVisible();await expect(invalidWeight.locator('img')).toHaveCount(0);
 await next.click();await next.click();
 const nutrition=previewRow(1);
 await expect(nutrition.getByTestId('import-mapped-value-summary')).toHaveText('2200 kcal · P 150 · C 250 · F 65');
 const zeroNutrition=previewRow(2);
 await expect(zeroNutrition.getByTestId('import-mapped-value-summary')).toHaveText('0 kcal · P 0 · C 0 · F 0');
 const missingNutrition=previewRow(3);
 await expect(missingNutrition.getByTestId('import-mapped-value-summary')).toHaveCount(0);
 const invalidNutrition=previewRow(4);
 await expect(invalidNutrition.getByTestId('import-mapped-value-summary')).toContainText('<script>alert(1)</script> kcal · P 150 · C 250 · F 65');
 await expect(invalidNutrition.locator('.text-red-700')).toBeVisible();await expect(invalidNutrition.locator('script')).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});
 expect(await nutrition.getByTestId('import-mapped-value-summary').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
 await expect(page.getByTestId('apply-full-import')).toBeDisabled();
 const screenshot=testInfo.outputPath('excel-preview.png');await page.screenshot({path:screenshot,fullPage:true});await testInfo.attach('preview',{path:screenshot,contentType:'image/png'});
 assert.deepEqual(await snapshot(),before,'preview must preserve the complete isolated account');assert.equal(applyRequests,0);
 const directory=path.join(lab,'journey-evidence');await mkdir(directory,{recursive:true});
 await writeFile(path.join(directory,'excel-preview.json'),JSON.stringify({id:'journey:excel-preview-without-apply',status:'pass',detail:{sheets:3,rowsPerSheet:[80,80,80],totalRows:240,fields:['weight','calories','protein','carbs','fat'],mappedValues:{weight:'70.1',calories:'2200',protein:'150',carbs:'250',fat:'65'},zeroValuesVisible:true,missingValuesHidden:true,invalidValuesEscapedWithError:true,mobileSummaryWrapped:true,snapshotUnchanged:true,snapshotExcludedFields:['exported_at (export request metadata only)'],applied:false,applyRequests,applyDisabled:true,screenshot}},null,2));
});
