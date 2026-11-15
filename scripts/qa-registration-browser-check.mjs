import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const base=process.env.TEST_BASE_URL??"http://127.0.0.1:3218";
assert(["127.0.0.1","easycoach.space"].includes(new URL(base).hostname),"Only local QA or the official site; no registration is submitted");
const browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:900}});page.setDefaultTimeout(60000);
 await page.goto(base+"/login?register=1");await page.waitForLoadState("networkidle");
 assert.equal(await page.locator('input:not([type="hidden"]):not([type="checkbox"])').count(),3);
 const password=page.locator("#auth-password"),confirmation=page.locator('[name="password_confirmation"]'),acceptance=page.locator('[name="terms_acceptance"]');
 assert(await acceptance.evaluate(input=>input.required&&!input.checked&&input.validity.valueMissing));
 await password.fill("Abcdefgh123!");assert.equal(await confirmation.inputValue(),"Abcdefgh123!");assert.equal(await confirmation.getAttribute("type"),"hidden");
 await page.getByRole("button",{name:"إظهار كلمة المرور",exact:true}).click();assert.equal(await password.getAttribute("type"),"text");
 await page.getByRole("button",{name:"إخفاء كلمة المرور",exact:true}).click();assert.equal(await password.getAttribute("type"),"password");
 assert(await page.locator('a[href="/terms"]').count()>0);assert(await page.locator('a[href="/privacy"]').count()>0);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:"artifacts/registration-password-mobile.png",fullPage:true});
 await page.getByRole("button",{name:"تسجيل الدخول",exact:true}).click();assert.equal(await confirmation.count(),0);assert.equal(await password.inputValue(),"");
 console.log("PASS: three-field signup, password reveal, hidden confirmation, required policy and login switching; no account submitted");
}finally{await browser.close();}
