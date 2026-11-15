// Real app routes and SQL, fictional owners and a local Paylink simulator only.
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.TEST_BASE_URL;
assert.equal(new URL(base).hostname,"127.0.0.1");
const invoices = new Map(); let seq=Date.now(), loseNext=false;
const simulator=createServer(async(req,res)=>{
 res.setHeader("Content-Type","application/json");
 if(req.url==="/api/auth") return res.end(JSON.stringify({id_token:"fictional-token"}));
 if(req.url==="/api/addInvoice") {
  let raw="";for await(const chunk of req) raw+=chunk;
  const data=JSON.parse(raw),tx=String(++seq);
  invoices.set(tx,{transactionNo:tx,orderStatus:"Pending",amount:data.amount,gatewayOrderRequest:{orderNumber:data.orderNumber,currency:data.currency},paymentErrors:[]});
  await new Promise(r=>setTimeout(r,200));
  if(loseNext){loseNext=false;return req.socket.destroy();}
  return res.end(JSON.stringify({success:true,transactionNo:tx,url:`http://127.0.0.1:4017/pay/${tx}`}));
 }
 const invoice=invoices.get(req.url?.split('/').at(-1));
 res.statusCode=invoice?200:404;res.end(JSON.stringify(invoice??{}));
});
await new Promise(r=>simulator.listen(4017,"127.0.0.1",r));
const browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});
const passed=[];let lastPage;
async function login(email){
 const context=await browser.newContext({viewport:{width:390,height:844},extraHTTPHeaders:{"x-forwarded-for":`qa-${crypto.randomUUID()}`}});
 const page=await context.newPage();lastPage=page;page.setDefaultTimeout(60000);
 await page.goto(base+"/login");await page.waitForLoadState("networkidle");
 await page.locator('#auth-email').fill(email);await page.locator('#auth-password').fill("CoachPreview!2026");
 await page.locator('button[type="submit"]').click();await page.waitForURL(email.startsWith("trainee")?"**/me":"**/coach");return page;
}
const checkout=(page,origin=base)=>page.request.post(base+"/api/platform/checkout",{headers:{origin},data:{plan:"pro",total:49900,mobile:"0501234567",terms:"2026-11-15.3"}});
const webhook=(page,tx,secret="qa-local-webhook")=>page.request.post(base+"/api/payments/paylink/webhook",{headers:{authorization:`Bearer ${secret}`},data:{transactionNo:tx,merchantOrderNumber:invoices.get(tx).gatewayOrderRequest.orderNumber,orderStatus:"Paid",amount:0}});
const callback=(tx)=>`${base}/payments/paylink/callback?transactionNo=${tx}&orderNumber=${invoices.get(tx).gatewayOrderRequest.orderNumber}`;
try {
 await mkdir("artifacts/platform-billing",{recursive:true});
 const legacy=await login("coach@example.test");
 const originalLedger=await (await legacy.request.get(base+"/api/export")).json();
 await legacy.goto(base+"/coach/settings");await legacy.waitForLoadState("networkidle");
 assert.equal(await legacy.getByRole('heading',{name:"الدفع الإلكتروني (Paylink)",exact:true}).count(),0);
 const trainee=await login("trainee@example.test");
 assert.equal((await checkout(trainee)).status(),403);
 assert.equal((await trainee.request.post(base+"/api/payments/paylink/checkout",{data:{subscription_id:crypto.randomUUID()}})).status(),410);
 assert.equal(await trainee.getByRole('button',{name:"ادفع الآن",exact:true}).count(),0);
 passed.push("No coach merchant setup or trainee checkout; old endpoint retired");
 const owner=await login("billing7@example.test");
 assert.equal((await checkout(owner,"https://attacker.example")).status(),403);
 await owner.goto(base+"/subscription/confirm?plan=pro");await owner.waitForLoadState("networkidle");
 for(const width of [390,1440])for(const theme of ["light","dark"]){
  await owner.setViewportSize({width,height:1000});await owner.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.classList.toggle("dark",theme==="dark");},theme);
  assert(await owner.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),"Billing page overflows");
  await owner.screenshot({path:`artifacts/platform-billing/confirm-${width}-${theme}.png`,fullPage:true});
 }
 await owner.getByRole('button',{name:"اشترك وادفع عبر Paylink"}).click();
 assert.equal(invoices.size,0,"Missing mobile/consent must not create an invoice");
 await owner.getByRole('textbox',{name:"رقم جوالك لفاتورة اشتراك المنصة"}).fill("0501234567");
 await owner.locator('input[type="checkbox"]').check();
 await owner.getByRole('button',{name:"اشترك وادفع عبر Paylink"}).click();
 await owner.waitForURL("http://127.0.0.1:4017/pay/**");
 assert.equal(invoices.size,1);
 const [tx,remote]=[...invoices][0];
 assert.equal(remote.amount,499);assert(remote.gatewayOrderRequest.orderNumber.startsWith("ECP-"));
 const duplicate=await checkout(owner);assert.equal(duplicate.status(),200);assert.equal(invoices.size,1);
 assert.equal((await webhook(owner,tx,"wrong")).status(),401);
 assert.equal((await webhook(owner,tx)).status(),200);
 await owner.goto(callback(tx));await owner.getByTestId("paylink-result-pending").waitFor();
 passed.push("Reviewed total, required consent, hosted checkout, pending verification and duplicate reuse");
 remote.orderStatus="Paid";
 assert.equal((await webhook(owner,tx)).status(),200);
 await owner.goto(callback(tx));await owner.getByTestId("paylink-result-paid").waitFor();
 assert.equal((await webhook(owner,tx)).status(),200);
 await owner.getByRole('link',{name:"الرجوع لاشتراكي",exact:true}).click();await owner.waitForURL(base+"/subscription");
 await owner.getByText("اشتراك نشط",{exact:true}).waitFor();
 assert.equal((await checkout(owner)).status(),409);
 await owner.screenshot({path:"artifacts/platform-billing/active.png",fullPage:true});
 passed.push("Verified payment activates the owner's plan once, with manual monthly renewal");
 const recovery=await login("billing8@example.test");loseNext=true;
 assert.equal((await checkout(recovery)).status(),503);assert.equal(invoices.size,2);
 assert.equal((await checkout(recovery)).status(),409);assert.equal(invoices.size,2);
 const recoveryTx=[...invoices.keys()][1];invoices.get(recoveryTx).orderStatus="Paid";
 assert.equal((await webhook(recovery,recoveryTx)).status(),200);
 await recovery.goto(callback(recoveryTx));await recovery.getByTestId("paylink-result-paid").waitFor();
 passed.push("A lost create response cannot charge twice and authenticated webhook recovers it");
 const review=await login("billing9@example.test");assert.equal((await checkout(review)).status(),200);
 const reviewTx=[...invoices.keys()][2];invoices.get(reviewTx).orderStatus="Paid";invoices.get(reviewTx).amount=1;
 assert.equal((await webhook(review,reviewTx)).status(),200);
 await review.goto(callback(reviewTx));await review.getByTestId("paylink-result-review").waitFor();
 await review.goto(base+"/subscription");await review.getByRole("heading",{name:"المزايا المدفوعة متوقفة",exact:true}).waitFor();
 const finalLedger=await (await legacy.request.get(base+"/api/export")).json();
 assert.deepEqual(finalLedger.payments,originalLedger.payments);
 passed.push("Amount mismatch requires platform review and no trainee ledger changes");
 await writeFile("artifacts/platform-billing/result.json",JSON.stringify({syntheticLocalOnly:true,passed,remoteInvoices:invoices.size},null,2));
 console.log("PLATFORM PAYLINK QA PASSED",passed);
}catch(error){await lastPage?.screenshot({path:"artifacts/platform-billing/failure.png",fullPage:true}).catch(()=>{});throw error;}
finally{await browser.close();await new Promise(r=>simulator.close(r));}
