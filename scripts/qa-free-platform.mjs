// Isolated browser acceptance: no production users, merchant calls, or mail.
import { chromium } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { openDatabase, rpcLocal, passwordHash } from "../lib/local-db.ts";
const scratch=await mkdtemp(path.join(os.tmpdir(),"easycoach-free-"));
const base="http://127.0.0.1:3207",dist=".next-preview-free-qa";
const coach="88888888-8888-4888-8888-888888888888",trainee="99999999-9999-4999-8999-999999999999";
const password="SyntheticTest!2026";
const db=await openDatabase(path.join(scratch,"db"));
let client;
try {
  for (const [id,role,name] of [[coach,"coach","سارة المدربة"],[trainee,"trainee","نورة المتدربة"]]) {
    await db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at)values($1,$2,$3,now())",[id,`${role}@free.example.test`,passwordHash(password)]);
    await rpcLocal(db,id,"init_profile",{display_name:name,requested_role:role});
  }
  client=(await rpcLocal(db,coach,"app_command",{command:"client_save",payload:{name:"نورة المتدربة",email:"trainee@free.example.test",phone:""}})).id;
  await db.query("update public.clients set trainee_user_id=$1 where id=$2",[trainee,client]);
  await rpcLocal(db,coach,"app_command",{command:"subscription_create",payload:{client_id:client,name:"باقة اختبار لا تظهر",start_date:"2026-01-01",end_date:"2026-12-31",price:499}});
  // Expired account must retain the full training tools.
  await db.query("update public.ec_accounts set status='expired',trial_used_at=now()-interval '20 days',trial_end=now()-interval '6 days' where owner_id=$1",[coach]);
} finally { await db.close(); }
await mkdir("artifacts/free-platform",{recursive:true});
const log=createWriteStream(path.join(scratch,"next.log"));
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","-H","127.0.0.1","-p","3207"],{
  env:{...process.env,NODE_ENV:"development",BILLING_ENABLED:"false",LOCAL_DB_PATH:path.join(scratch,"db"),EASYCOACH_EVIDENCE_DIST_DIR:dist,APP_URL:base,CRON_SECRET:"synthetic-only-cron-secret-32-characters",PAYMENTS_ENABLED:"true"},
  windowsHide:true,stdio:["ignore","pipe","pipe"],
});
server.stdout.pipe(log);server.stderr.pipe(log);
let browser;
const forbidden=/\b(?:price|pricing|plans?|subscribe|subscription|billing|checkout|paylink|payment|invoice|upgrade|trial|SAR)\b|اشتراك|[بالب]?باق(?:ة|ات)|خطة|ترقية|تجريبي|تجربة مجانية|فاتورة|فواتير|الدفع|للدفع|ريال|شهري|سنوي|يومًا متبقية|(?:^|\s)سعر(?:\s|$)/i;
try {
  let ready=false;
  for(let i=0;i<120;i++) {
    if(server.exitCode!==null)throw Error("QA server exited: "+path.join(scratch,"next.log"));
    try {if((await fetch(base+"/api/session")).status===401){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert(ready,"QA server ready");
  browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1050}});
  const page=await context.newPage();page.setDefaultTimeout(60000);
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("console",message=>{if(message.type()==="error")errors.push(message.text()+" "+message.location().url);});
  async function audit(route,shot) {
    await page.goto(base+route);await page.waitForTimeout(500);
    const text=await page.locator("body").innerText();
    assert(!forbidden.test(text),`${route}: visible commercial copy: ${text.match(forbidden)?.[0]}`);
    assert.equal(await page.locator('a[href*="pricing"],a[href*="subscription"],a[href*="checkout"],a[href*="paylink"],a[href*="finance"]').count(),0,route+" billing links");
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route+" overflow");
    if(shot)await page.screenshot({path:`artifacts/free-platform/${shot}.png`,fullPage:true});
  }
  await audit("/","landing-desktop");
  assert.equal(await page.getByText("المنصة مجانية لفترة محدودة",{exact:true}).count(),1);
  for (const route of ["/login","/login?register=1","/terms","/privacy","/contact"]) await audit(route);
  for (const route of ["/pricing","/subscription","/subscription/confirm?plan=pro","/start","/payments/paylink/callback","/payments/paylink/cancel"]) {
    const response=await fetch(base+route,{redirect:"manual"});assert.equal(response.status,307,route);assert.equal(new URL(response.headers.get("location"),base).pathname,"/");
  }
  for (const route of ["/api/platform/checkout","/api/platform/coupon","/api/payments/paylink/create-invoice","/api/payments/paylink/checkout","/api/payments/paylink/webhook"]) assert.equal((await fetch(base+route,{method:"POST"})).status,404,route);
  assert.deepEqual(await (await fetch(base+"/api/maintenance/subscriptions",{headers:{Authorization:"Bearer synthetic-only-cron-secret-32-characters"}})).json(),{skipped:true});
  async function login(role) {
    await page.goto(base+"/login");await page.locator('#auth-email').fill(`${role}@free.example.test`);await page.locator('#auth-password').fill(password);
    await page.getByRole("button",{name:"الدخول إلى مساحتك",exact:true}).click();await page.waitForURL(role==="coach"?"**/coach":"**/me");
  }
  await login("coach");
  for (const [route,shot] of [["/coach","coach-desktop"],["/coach/clients"],[`/coach/clients/${client}`],[`/coach/clients/${client}/edit`],[`/coach/clients/${client}/edit?tab=nutrition`],[`/coach/clients/${client}?tab=profile`],[`/coach/clients/${client}?tab=tracking`],["/coach/library"],["/coach/library?tab=templates"],["/coach/settings"],["/organization"],["/attendance"],["/reports"]]) await audit(route,shot);
  await audit("/coach");assert.equal(await page.getByText("المنصة مجانية لفترة محدودة",{exact:true}).count(),1);
  await context.addCookies([{name:"ec_theme",value:"dark",url:base}]);await page.setViewportSize({width:390,height:844});await audit("/coach","coach-mobile-dark");
  await context.clearCookies();await page.setViewportSize({width:1440,height:1050});await login("trainee");await audit("/me","trainee-desktop");
  await context.addCookies([{name:"ec_theme",value:"dark",url:base}]);await page.setViewportSize({width:390,height:844});await audit("/me","trainee-mobile-dark");
  assert.deepEqual(errors,[],"browser runtime/console errors");
  console.log("PASS: free landing, login/signup, coach, expired-account tools, trainee, reports, direct payment URLs, scheduler, responsive layout, and console audit.");
} finally {
  await browser?.close();
  if(server.pid)try{if(process.platform==="win32")execFileSync("taskkill",["/PID",String(server.pid),"/T","/F"],{windowsHide:true,stdio:"ignore"});else server.kill();}catch{}
  log.end();
  const source=await readFile("tsconfig.json","utf8"),config=JSON.parse(source);
  config.include=config.include.filter(value=>!value.startsWith(dist+"/"));
  await writeFile("tsconfig.json",JSON.stringify(config,null,2)+"\n");
}
