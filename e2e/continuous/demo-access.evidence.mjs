import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {expect,test} from '@playwright/test';
test('test username works on normal login and dedicated demo login with an isolated demo identity',async({page,context},info)=>{
  expect(process.env.EASYCOACH_EVIDENCE_LAB).toBe('1');
  await page.goto('/login');await expect(page.locator('.auth-demo-entry')).toHaveAttribute('href','/demo');await page.locator('#auth-email').fill('test');await page.locator('#auth-password').fill('wrong');expect(await page.locator('#auth-email').evaluate(el=>el.checkValidity())).toBe(true);await page.locator('button[type=submit]').click();await expect(page.locator('form').getByRole('alert')).toContainText('test / test');
  await page.locator('#auth-password').fill('test');await page.locator('button[type=submit]').click();await page.waitForURL('**/coach');let data=await (await context.request.get('/api/export')).json();expect(data.demo).toBe(true);expect(data.profile.name).toBe('test');const manifest=JSON.parse(await readFile(path.join(process.env.EASYCOACH_LAB_DIR,'manifest.json'),'utf8'));expect(manifest.personas.some(p=>p.userId===data.profile.id)).toBe(false);
  await context.clearCookies();await page.goto('/demo');await page.locator('#demo-username').fill('test');await page.locator('#demo-password').fill('test');await page.locator('button[type=submit]').click();await page.waitForURL('**/coach');data=await(await context.request.get('/api/export')).json();expect(data.demo).toBe(true);
  const screenshot=info.outputPath('demo-access.png');await page.screenshot({path:screenshot,fullPage:true});const dir=path.join(process.env.EASYCOACH_LAB_DIR,'journey-evidence');await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'demo-access.json'),JSON.stringify({id:'journey:demo-username-login',status:'pass',detail:{normalLoginAlias:true,wrongPasswordRejected:true,dedicatedDemoLogin:true,separateDemoIdentity:true,screenshot}}));
});
