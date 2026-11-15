// Visual and functional QA on a synthetic, isolated database. No merchant credentials.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { openDatabase, rpcLocal, passwordHash } from "../lib/local-db.ts";
const scratch=await mkdtemp(path.join(os.tmpdir(),"easycoach-experience-"));
const base="http://127.0.0.1:3206",id="88888888-8888-4888-8888-888888888888",token="d".repeat(64);
const db=await openDatabase(path.join(scratch,"db"));
try{
  await db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at)values($1,'experience@example.test',$2,now())",[id,passwordHash("SyntheticTest!2026")]);
  await rpcLocal(db,id,"init_profile",{display_name:"سارة المدربة",requested_role:"coach"});
  await db.query("insert into private.local_sessions(token_hash,user_id,expires_at)values($1,$2,now()+interval '2 hours')",[createHash("sha256").update(token).digest("hex"),id]);
}finally{await db.close();}
await mkdir("artifacts/experience",{recursive:true});
const log=createWriteStream(path.join(scratch,"next.log"));
const next=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","-H","127.0.0.1","-p","3206"],{env:{...process.env,NODE_ENV:"development",LOCAL_DB_PATH:path.join(scratch,"db"),EASYCOACH_EVIDENCE_DIST_DIR:".next-preview-experience",APP_URL:base,PAYMENTS_ENABLED:"false",PAYLINK_VERIFIED:"false",PAYLINK_API_ID:"",PAYLINK_API_SECRET:"",PAYLINK_WEBHOOK_SECRET:"",VAT_REGISTERED:"",VAT_NUMBER:"",VAT_RATE:""},windowsHide:true,stdio:["ignore","pipe","pipe"]});
next.stdout.pipe(log);next.stderr.pipe(log);
let browser;
try{
  let ready=false;for(let i=0;i<120;i++){if(next.exitCode!==null)throw Error("QA server exited: "+path.join(scratch,"next.log"));try{if((await fetch(base+"/api/session")).status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert(ready);
  browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1050}});
  const page=await context.newPage();page.setDefaultTimeout(60000);
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  async function shot(name){await page.waitForTimeout(750);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+" overflow");await page.screenshot({path:`artifacts/experience/${name}.png`,fullPage:true});}
  await page.goto(base);await page.getByRole("heading",{name:/وقتك للتدريب/}).waitFor();await shot("home-light-desktop");
  await context.addCookies([{name:"ec_theme",value:"dark",url:base}]);await page.reload();await shot("home-dark-desktop");
  await page.setViewportSize({width:390,height:844});await shot("home-dark-mobile");
  await page.goto(base+"/login?register=1");await page.getByRole("heading",{name:"أول خطوة لشغل أرتب.",exact:true}).waitFor();
  assert.equal(await page.locator('input:not([type="hidden"]):not([type="checkbox"])').count(),3);
  assert.equal(await page.locator('[name="mobile"]').count(),0);await shot("register-dark-mobile");
  await page.getByLabel("إظهار كلمة المرور",{exact:true}).click();assert.equal(await page.locator("#auth-password").getAttribute("type"),"text");
  await context.addCookies([{name:"ec_theme",value:"light",url:base}]);await page.reload();await page.setViewportSize({width:1440,height:1050});await shot("register-light-desktop");
  await context.addCookies([{name:"ec_session",value:token,url:base}]);
  await page.goto(base+"/start");await page.getByRole("button",{name:"ابدأ 14 يومًا مجانًا الآن",exact:true}).waitFor();assert.equal(await page.locator('[name="mobile"]').count(),0);await shot("trial-start-desktop");
  await page.locator('[name="terms_acceptance"]').check();await page.getByRole("button",{name:"ابدأ 14 يومًا مجانًا الآن",exact:true}).click();await page.waitForURL("**/coach?trial=started");
  await page.getByRole("heading",{name:"يوم جديد. أثر أكبر.",exact:true}).waitFor();assert.equal(await page.locator('.stat-strip').count(),0);await shot("workspace-light-desktop");
  await page.goto(base+"/coach/library");assert(!page.url().includes("/pricing"));await shot("library-light-desktop");
  await page.goto(base+"/pricing");await shot("pricing-light-desktop");
  await context.addCookies([{name:"ec_theme",value:"dark",url:base}]);await page.goto(base+"/coach");await page.setViewportSize({width:390,height:844});await shot("workspace-dark-mobile");
  assert.deepEqual(errors,[]);
  console.log("PASS: home/register in light/dark and mobile/desktop; three-field signup; one-click trial without phone, tax or merchant; workspace and paid-feature access; no overflow or runtime errors.");
}finally{await browser?.close();next.kill();log.end();}
