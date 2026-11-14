import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const base=process.env.TEST_BASE_URL??"http://127.0.0.1:3215";
assert(["127.0.0.1","localhost"].includes(new URL(base).hostname),"Local synthetic QA only");
const dir="artifacts/platform-subscriptions";
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:"reduce"});
 const page=await context.newPage();const errors=[];
 page.on("pageerror",error=>errors.push(error.message));
 page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(120000);
 await page.goto(base+"/pricing");await page.locator("article").first().waitFor();
 assert.equal(await page.locator("article").count(),4);
 assert.equal(await page.locator("del").count(),0,"Inactive campaign must not show crossed-out prices");
 await page.screenshot({path:dir+"/pricing-desktop.png",fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),"Mobile pricing overflows");
 await page.screenshot({path:dir+"/pricing-mobile.png",fullPage:true});
 assert.equal((await page.request.post(base+"/api/platform/checkout")).status(),401);
 await page.goto(base+"/login");
 await page.locator("#auth-email").fill("coach@example.test");
 await page.locator("#auth-password").fill("CoachPreview!2026");
 await page.locator('button[type="submit"]').click();await page.waitForURL("**/coach");
 await page.goto(base+"/subscription");await page.locator("h1").waitFor();
 await page.screenshot({path:dir+"/subscription-mobile.png",fullPage:true});
 assert.equal((await page.request.post(base+"/api/platform/checkout")).status(),503);
 for(const path of ["/organization","/attendance","/reports","/subscription/confirm?plan=starter"]){
  const response=await page.goto(base+path);assert.equal(response.status(),200,path);await page.locator("h1").waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),path+" overflows");
 }
 await page.screenshot({path:dir+"/confirmation-mobile.png",fullPage:true});
 if(process.env.EXERCISE_PLATFORM_ROLES==="true"){
  async function login(email){
   const context=await browser.newContext({viewport:{width:1280,height:1000},reducedMotion:"reduce"});
   const screen=await context.newPage();screen.setDefaultTimeout(30000);screen.setDefaultNavigationTimeout(120000);
   screen.on("pageerror",error=>errors.push(error.message));
   await screen.goto(base+"/login");await screen.locator("#auth-email").fill(email);await screen.locator("#auth-password").fill("CoachPreview!2026");
   await screen.locator('button[type="submit"]').click();await screen.waitForURL("**/coach");return screen;
  }
  const free=await login("free@example.test");
  await free.goto(base+"/coach/library");await free.getByText("هذه الميزة متاحة ابتداءً",{exact:false}).waitFor();
  assert.equal((await free.request.get(base+"/api/export")).status(),403);
  await free.goto(base+"/coach/clients?add=1");
  const form=free.locator('form:has(input[name="email"])');await form.locator('input[name="name"]').fill("Over quota fictional client");await form.locator('input[name="email"]').fill("sixth@example.test");
  await form.locator('button[type="submit"]').click();await free.getByText(/حد المتدربين النشطين/).waitFor();
  await page.setViewportSize({width:1280,height:1000});await page.goto(base+"/organization");
  const invite=page.locator('form:has(input[name="email_address"])');await invite.locator('input[name="email_address"]').fill("coach2@example.test");await invite.locator('select[name="member_role"]').selectOption("trainer");await invite.locator('button').click();
  await page.getByText("بانتظار القبول",{exact:false}).first().waitFor();
  const member=await login("coach2@example.test");await member.goto(base+"/organization");await member.getByRole("button",{name:"قبول الانضمام للفريق",exact:true}).click();
  await member.getByRole("button",{name:"قبول الانضمام للفريق",exact:true}).waitFor({state:"hidden"});
  await page.reload();const assignment=page.locator('li form:has(select[name="member"])').first();
  await assignment.locator('select[name="member"]').selectOption("22222222-2222-4222-8222-222222222222");await assignment.locator('button').click();await assignment.getByRole("status").filter({hasText:"تم الحفظ"}).waitFor();
  await member.goto(base+"/organization?owner=11111111-1111-4111-8111-111111111111");await member.locator('a[href$="/program"]').first().click();
  await member.locator("#plan-name").fill("Fictional team QA program");await member.getByText("تم حفظ مسودة الفريق",{exact:true}).waitFor();
  await member.getByRole("button",{name:"نشر للمتدرب",exact:true}).click();await member.getByText("تم النشر. المتدرب يرى هذه النسخة الآن.",{exact:true}).waitFor();
  await page.goto(base+"/subscription");const color=page.locator('form:has(input[name="color"])');await color.locator('input[name="color"]').fill("#1d4ed8");await color.locator('button').click();await color.getByRole("status").filter({hasText:"تم الحفظ"}).waitFor();
  await page.goto(base+"/reports");await page.getByRole("heading",{name:"مقارنة المدربين",exact:true}).waitFor();
  await page.screenshot({path:dir+"/coach-comparison-desktop.png",fullPage:true});
  console.log("PASS: Free quota/export denial; accepted team invitation; assigned program save/publication; portal color; coach comparison.");
 }
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({pricingCards:4,mobileOverflow:false,uncaughtErrors:0,anonymousCheckout:401,disabledCheckout:503,screenshots:dir}));
}finally{await browser.close();}
