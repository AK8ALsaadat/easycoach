import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const base=process.env.TEST_BASE_URL;
assert.equal(new URL(base).hostname,"127.0.0.1");
const browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(60000);
 await page.goto(base+"/login");await page.waitForLoadState("networkidle");
 await page.locator("#auth-email").fill("trial@example.test");await page.locator("#auth-password").fill("CoachPreview!2026");
 await page.locator('button[type="submit"]').click();await page.waitForURL("**/coach");
 await page.goto(base+"/subscription/confirm");await page.waitForLoadState("networkidle");
 assert.equal(await page.getByRole("button",{name:"ابدأ 14 يومًا مجانًا الآن",exact:true}).count(),0);
 assert.equal(await page.getByRole("button",{name:"ادفع الفترة الأولى",exact:true}).count(),0);
 if(process.env.QA_PAYMENTS_DISABLED==="true")assert(await page.getByText("الدفع معطل حاليًا من إعدادات المنصة",{exact:true}).isVisible());
 assert(await page.getByRole("heading",{name:"باقة الاحترافية",exact:true}).isVisible());
 if(process.env.QA_TAX_UNCONFIGURED==="true"){
  assert(await page.getByText("بانتظار ضبط الضريبة",{exact:true}).isVisible());
  assert(await page.getByText("لم تُحدد إعدادات التسجيل الضريبي للمشغّل",{exact:true}).first().isVisible());
 }
 const result=await page.request.post(base+"/api/platform/checkout",{headers:{origin:base},data:{plan:"pro",total:49900,mobile:"0501234567",terms:"2026-11-15.4"}});
 assert.equal(result.status(),503);
 const payload=await result.json();assert.equal(payload.code,process.env.QA_TAX_UNCONFIGURED==="true"?"TAX_NOT_CONFIGURED":"PROVIDER_NOT_READY");
 await page.screenshot({path:`artifacts/platform-billing/disabled-${process.env.QA_PAYMENTS_DISABLED==="true"?"flag":"tax"}.png`,fullPage:true});
 console.log("PASS: disabled trial/subscribe UI and protected API",payload.code);
}finally{await browser.close();}
