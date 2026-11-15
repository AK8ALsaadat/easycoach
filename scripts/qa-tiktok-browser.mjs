import {chromium} from "@playwright/test";
import assert from "node:assert/strict";
const base=process.env.TEST_BASE_URL;
assert.equal(new URL(base).hostname,"127.0.0.1");
const browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});
try{
 const context=await browser.newContext();
 // Never transmit synthetic conversions to TikTok, even with a fictional ID.
 await context.route("https://**.tiktok.com/**",route=>route.fulfill({status:200,contentType:"application/javascript",body:"/* synthetic QA: TikTok network blocked */"}));
 const page=await context.newPage();page.setDefaultTimeout(60000);
 const count=type=>page.evaluate(type=>(window.ttq??[]).filter(item=>Array.isArray(item)&&item[0]===type).length,type);
 const eventCount=name=>page.evaluate(name=>(window.ttq??[]).filter(item=>Array.isArray(item)&&item[0]==="track"&&item[1]===name).length,name);
 await page.goto(base+"/pricing?utm_source=tiktok&utm_campaign=first&utm_content=video&ttclid=qa_click");
 await page.waitForFunction(()=>window.__ecTikTokLoaded===true);await page.waitForLoadState("networkidle");
 assert.equal(await count("page"),1);
 assert.equal(await page.locator('script[src*="analytics.tiktok.com/i18n/pixel/events.js"]').count(),1);
 await page.locator('a[href="/terms"]').last().click();await page.waitForURL("**/terms");
 await page.waitForFunction(()=>(window.ttq??[]).filter(item=>Array.isArray(item)&&item[0]==="page").length===2);
 assert.equal(await page.locator('script[src*="analytics.tiktok.com/i18n/pixel/events.js"]').count(),1);
 const cookie=(await context.cookies()).find(c=>c.name==="ec_first_touch");assert(cookie?.httpOnly);
 let parsed=cookie.value;for(let i=0;i<3&&typeof parsed==="string";i++){try{parsed=JSON.parse(parsed);}catch{parsed=decodeURIComponent(parsed);}}
 assert.equal(parsed.utm_campaign,"first");assert.equal(parsed.ttclid,"qa_click");
 await page.goto(base+"/payments/paylink/callback?paid=1&transactionNo=fake");await page.waitForLoadState("networkidle");
 assert.equal(await eventCount("Subscribe"),0);
 await page.goto(base+"/login");await page.waitForLoadState("networkidle");
 await page.locator("#auth-email").fill("pixel-new@example.test");await page.locator("#auth-password").fill("CoachPreview!2026");
 await page.locator('button[type="submit"]').click();await page.waitForURL("**/coach");
 await page.waitForFunction(()=>(window.ttq??[]).some(item=>Array.isArray(item)&&item[0]==="track"&&item[1]==="CompleteRegistration"));
 assert.equal(await eventCount("CompleteRegistration"),1);
 await page.reload();await page.waitForLoadState("networkidle");
 assert.equal(await eventCount("CompleteRegistration"),0,"Reload must not repeat a claimed new-account conversion");
 assert.equal(await eventCount("Subscribe"),0);
 // A second browser uses a separately queued, newly-created Google account.
 // Provider identity is prepared in the synthetic DB; no real Google login.
 const googleContext=await browser.newContext();
 const googlePage=await googleContext.newPage();
 googlePage.setDefaultTimeout(60000);
 await googleContext.route("https://**.tiktok.com/**",route=>route.fulfill({status:200,contentType:"application/javascript",body:"/* synthetic QA */"}));
 await googlePage.goto(base+"/login");
 await googlePage.locator("#auth-email").fill("pixel-google@example.test");
 await googlePage.locator("#auth-password").fill("CoachPreview!2026");
 await googlePage.locator('button[type="submit"]').click();
 await googlePage.waitForURL("**/coach");
 await googlePage.waitForFunction(()=>(window.ttq??[]).filter(item=>Array.isArray(item)&&item[0]==="track"&&item[1]==="CompleteRegistration").length===1);
 await googlePage.reload();await googlePage.waitForLoadState("networkidle");
 assert.equal(await googlePage.evaluate(()=>(window.ttq??[]).filter(item=>Array.isArray(item)&&item[0]==="track"&&item[1]==="CompleteRegistration").length),0);
 await googleContext.close();
 console.log("PASS TikTok: base once, SPA page views once, first-touch cookie, registration once across reload, no redirect-based subscription; TikTok network blocked");
}finally{await browser.close();}
