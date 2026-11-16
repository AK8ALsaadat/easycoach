// Real browser interaction against synthetic accounts in an isolated local DB.
import { chromium } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { openDatabase, rpcLocal, passwordHash } from "../lib/local-db.ts";

const scratch=await mkdtemp(path.join(os.tmpdir(),"easycoach-market-"));
const quality = process.argv.includes("--quality");
const base="http://127.0.0.1:3219", dist=".next-preview-market", dir=quality ? "artifacts/quality-release" : "artifacts/market-readiness";
const password="SyntheticTest!2026", coach="88888888-8888-4888-8888-888888888888", trainee="99999999-9999-4999-8999-999999999999", other="77777777-7777-4777-8777-777777777777";
let client, foreign;
const db=await openDatabase(path.join(scratch,"db"));
try {
  await db.query("select public.ec_billing_runtime(false)");
  for(const [id,role,name] of [[coach,"coach","سارة المدربة"],[trainee,"trainee","نورة المتدربة"],[other,"coach","مدرب آخر"]]) {
    await db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at)values($1,$2,$3,now())",[id,`${id}@market.example.test`,passwordHash(password)]);
    await rpcLocal(db,id,"init_profile",{display_name:name,requested_role:role});
  }
  client=(await rpcLocal(db,coach,"app_command",{command:"client_save",payload:{name:"نورة المتدربة",email:`${trainee}@market.example.test`,phone:""}})).id;
  await db.query("update public.clients set trainee_user_id=$1 where id=$2",[trainee,client]);
  foreign=(await rpcLocal(db,other,"app_command",{command:"client_save",payload:{name:"متدرب الحساب الآخر",email:"foreign@market.example.test",phone:""}})).id;
} finally { await db.close(); }
await mkdir(dir,{recursive:true});
const log=createWriteStream(path.join(scratch,"next.log"));
const originalTsconfig=await readFile("tsconfig.json","utf8");
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","-H","127.0.0.1","-p","3219"],{
  env:{...process.env,NODE_ENV:"development",BILLING_ENABLED:"false",LOCAL_DB_PATH:path.join(scratch,"db"),EASYCOACH_EVIDENCE_DIST_DIR:dist,APP_URL:base,NEXT_PUBLIC_TIKTOK_PIXEL_ID:""},windowsHide:true,stdio:["ignore","pipe","pipe"],
});
server.stdout.pipe(log);server.stderr.pipe(log);
let browser;
const results=[],errors=[],accessibility=[];
try {
  let ready=false;
  for(let i=0;i<120;i++) {
    if(server.exitCode!==null)throw Error("QA server exited: "+path.join(scratch,"next.log"));
    try { if((await fetch(base+"/api/session")).status===401){ready=true;break;} }catch{}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert(ready,"Local QA server ready: "+scratch);
  browser=await chromium.launch({headless:true,...(process.platform==="win32"?{channel:"msedge"}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:"reduce"});
  if (quality) await context.addInitScript({ path: createRequire(import.meta.url).resolve("axe-core/axe.min.js") });
  const page=await context.newPage(); page.setDefaultTimeout(60000);page.setDefaultNavigationTimeout(120000);
  page.on("pageerror",error=>errors.push(error.message));
  const snap=async()=>{const response=await page.request.get(base+"/api/export");assert.equal(response.status(),200);return response.json();};
  const until=async(check,label)=>{for(let i=0;i<60;i++){if(await check())return;await page.waitForTimeout(300);}throw Error(label);};
  async function audit(route,name) {
    const response=await page.goto(base+route);assert.equal(response.status(),200,route);
    await page.waitForLoadState("networkidle");
    if(route==="/me") {
      const later=page.getByRole("button",{name:"مو الحين",exact:true});
      if(await later.isVisible())await later.click();
    }
    const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,elements:Array.from(document.querySelectorAll("body *")).filter(element=>{const r=element.getBoundingClientRect();return !element.closest(".portal-sidebar")&&r.width>0&&(r.right>innerWidth+1||r.left< -1)&&getComputedStyle(element).position!=="fixed";}).slice(0,15).map(element=>({tag:element.tagName,class:element.className,width:element.getBoundingClientRect().width,text:element.textContent.slice(0,60)}))}));
    if(overflow.scroll>overflow.width){await page.screenshot({path:`${dir}/overflow.png`,fullPage:true});throw Error(route+" horizontal overflow "+JSON.stringify(overflow));}
    assert.equal(await page.locator('a[href*="pricing"],a[href*="subscription"],a[href*="checkout"],a[href*="paylink"]').count(),0,route+" billing links");
    if(name)await page.screenshot({path:`${dir}/${name}.png`,fullPage:true});
    if (quality) {
      const violations = await page.evaluate(async () => {
        const report = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
        return report.violations.map(({id, impact, description, nodes}) => ({ id, impact, description, nodes: nodes.map(({target, failureSummary}) => ({target, failureSummary})) }));
      });
      accessibility.push({ route, name, width: page.viewportSize().width, violations });
      await writeFile(`${dir}/accessibility.json`,JSON.stringify(accessibility,null,2));
      console.log(`Audited ${name ?? route}: ${violations.length} accessibility rules failing`);
    }
  }
  async function login(id,target) {
    await page.goto(base+"/login");await page.locator("#auth-email").fill(`${id}@market.example.test`);await page.locator("#auth-password").fill(password);
    await page.getByRole("button",{name:"الدخول إلى مساحتك",exact:true}).click();await page.waitForURL(base+target);
  }
  await audit("/","landing-desktop");
  assert.equal(await page.locator('meta[property="og:image"]').count(),1);
  assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"),"index, follow");
  for(const route of ["/robots.txt","/sitemap.xml","/manifest.webmanifest"])assert.equal((await page.request.get(base+route)).status(),200);
  await page.goto(base+"/login");await page.locator("#auth-email").fill("broken");await page.locator("#auth-password").focus();
  await page.locator("#auth-email[aria-invalid=true]").waitFor();assert((await page.locator(".field-error").first().innerText()).includes("إيميل"));
  await page.locator("#auth-email").fill(`${coach}@market.example.test`);assert.equal(await page.locator("#auth-email").getAttribute("aria-invalid"),null);
  results.push("Landing metadata, manifest/crawler routes and accessible inline validation");
  if (quality) {
    for (const width of [1440, 360]) for (const theme of ["light", "dark"]) {
      await context.addCookies([{ name: "ec_theme", value: theme, url: base }]);
      await page.setViewportSize({ width, height: 900 });
      for (const [index, route] of ["/login", "/login?register=1", "/privacy", "/terms", "/contact"].entries()) await audit(route, `public-${width}-${theme}-${index}`);
    }
  }
  await login(coach,"/coach");
  await page.goto(base+"/coach/clients?add=1");
  const form=page.locator('form:has(input[name="email"])');
  await form.locator('[name="name"]').fill("متدرب جديد للتحقق");await form.locator('[name="email"]').fill("new@market.example.test");
  assert.equal(await form.locator('[name="phone"]').getAttribute("inputmode"),"tel");
  await form.locator('button[type="submit"]').click();await until(async()=>(await snap()).clients.some(c=>c.email==="new@market.example.test"),"Client did not persist");
  results.push("Coach login and create trainee through the actual form");
  await page.goto(base+"/coach/library?tab=templates");
  await page.getByRole("button",{name:"تخصيص القالب",exact:true}).first().click();
  const dialog=page.getByRole("dialog");await dialog.getByRole("button",{name:"إنشاء القالب",exact:true}).click();
  await until(async()=>(await snap()).templates.some(t=>t.name==="تأسيس الجسم كاملًا"&&t.content.days.length===3),"Starter program did not persist");
  await page.waitForURL(url=>url.searchParams.has("template"));
  await page.waitForLoadState("networkidle");
  results.push("Ready program template copied to an independent coach draft");
  await page.goto(`${base}/coach/clients/${client}/edit`);await page.waitForLoadState("networkidle");
  const exerciseName="تمرين التحقق من رحلة المتدرب";
  await page.locator("#custom-exercise-name").fill(exerciseName);await page.getByRole("button",{name:"إضافة التمرين",exact:true}).click();
  await page.getByRole("button",{name:"حفظ المسودة",exact:true}).click();
  await until(async()=>(await snap()).programs.some(p=>p.client_id===client&&!p.published_at&&p.content.days.some(d=>d.exercises.some(e=>e.name===exerciseName))),"Draft not saved");
  await page.getByRole("button",{name:"نشر للمتدرب",exact:true}).click();
  await until(async()=>(await snap()).programs.some(p=>p.client_id===client&&p.published_at&&p.content.days.some(d=>d.exercises.some(e=>e.name===exerciseName))),"Program not published");
  results.push("Create, save and publish a trainee program through the real editor");
  if (quality) {
    await page.goto(`${base}/coach/clients/${client}/edit?tab=nutrition`);
    const editor = page.getByTestId("nutrition-target-editor");
    const protein = editor.getByLabel("البروتين (غ)", { exact: true });
    for (const raw of ["-25", "1..2", "12abc", "150.25"]) {
      await protein.fill(raw);
      assert.equal(await protein.inputValue(), raw, "Do not silently rewrite numeric input");
      assert.equal(await protein.getAttribute("aria-invalid"), "true", raw);
      assert(await protein.getAttribute("aria-describedby"), "Numeric error must be associated with its field");
    }
    await protein.fill("١٢٥٫٥");
    assert.equal(await protein.getAttribute("aria-invalid"), "false");
    await editor.getByLabel("الكارب (غ)", { exact: true }).fill("200");
    await editor.getByLabel("الدهون (غ)", { exact: true }).fill("60");
    const date = editor.locator('input[placeholder="DD/MM/YYYY"]').first();
    const original = await date.inputValue();
    await date.fill("31/02/2026"); await date.press("Tab");
    assert.equal(await date.getAttribute("aria-invalid"), "true");
    assert.equal(await date.evaluate(input => input.validity.valid), false);
    await date.fill(original); await date.press("Tab");
    assert.equal(await date.evaluate(input => input.validity.valid), true);
    await editor.getByRole("button", { name: "حفظ السعرات للمتدرب", exact: true }).click();
    await until(async () => (await snap()).management.records.some(r => r.client_id === client && r.kind === "nutrition_target" && r.payload.protein === 125.5 && r.payload.calories === 1842), "Valid Arabic macros did not persist");
    await editor.locator("summary").click();
    await editor.getByLabel("السعرات المستهدفة", { exact: true }).fill("2,000");
    await editor.getByLabel("بروتين ٪", { exact: true }).fill("abc");
    assert.equal(await editor.getByRole("button", { name: "احسب الجرامات", exact: true }).isEnabled(), false, "Invalid split must not use an older percentage");
    results.push("Nutrition: preserve and reject negative/malformed/overprecision values; Arabic decimals persist; invalid dates and stale calculator percentages rejected");
  }
  assert.equal((await page.request.get(`${base}/api/export?type=client-json&client=${foreign}`)).status(),404);
  await page.goto(`${base}/coach/clients/${foreign}`);assert(!(await page.locator("body").innerText()).includes("متدرب الحساب الآخر"));
  results.push("Foreign-client IDOR rejected by export and coach page");
  const routes=["/coach","/coach/clients","/coach/library?tab=templates","/coach/settings",`/coach/clients/${client}`,`/coach/clients/${client}/edit`,"/organization","/attendance","/reports"];
  for(const width of [1440,360])for(const theme of ["light","dark"]) {
    await context.addCookies([{name:"ec_theme",value:theme,url:base}]);await page.setViewportSize({width,height:900});
    for(const [index,route]of routes.entries())await audit(route,`coach-${width}-${theme}-${index}`);
    if(width===360){await audit("/coach");assert(await page.locator(".coach-bottom-nav").isVisible());}
  }
  results.push("Coach primary pages and editor at 360px/1440px in both themes, no horizontal overflow");
  for(const route of ["/pricing","/subscription","/payments/paylink/callback"])assert.equal((await page.request.get(base+route,{maxRedirects:0})).status(),307);
  for(const route of ["/api/platform/checkout","/api/payments/paylink/create-invoice"])assert.equal((await page.request.post(base+route)).status(),404);
  await context.clearCookies();await login(trainee,"/me");
  for(const width of [1440,360])for(const theme of ["light","dark"]) {
    await context.addCookies([{name:"ec_theme",value:theme,url:base}]);await page.setViewportSize({width,height:900});await audit("/me",`trainee-${width}-${theme}`);
    assert((await page.locator("body").innerText()).includes(exerciseName));
  }
  results.push("Trainee login and published program visible on mobile/desktop, light/dark; billing stays hidden");
  if (quality) {
    const blocking = accessibility.flatMap(report => report.violations.filter(issue => issue.impact === "critical" || issue.impact === "serious").map(issue => ({name:report.name,id:issue.id,nodes:issue.nodes.length})));
    assert.deepEqual(blocking, [], "Serious/critical accessibility issues; see accessibility.json");
  }
  assert.deepEqual(errors,[],"Browser runtime errors");
  await writeFile(`${dir}/results.json`,JSON.stringify({passed:true,results,errors,viewports:[360,1440]},null,2));
  console.log("PASS\n"+results.join("\n"));
} catch(error) {
  await writeFile(`${dir}/results.json`,JSON.stringify({passed:false,results,errors,error:String(error),log:path.join(scratch,"next.log")},null,2));
  throw error;
} finally {
  await browser?.close();
  if(server.pid)try{if(process.platform==="win32")execFileSync("taskkill",["/PID",String(server.pid),"/T","/F"],{windowsHide:true,stdio:"ignore"});else server.kill();}catch{}
  log.end();
  // Remove only this preview's generated includes, preserving concurrent user edits.
  const current=await readFile("tsconfig.json","utf8");
  if(current!==originalTsconfig){const config=JSON.parse(current);config.include=config.include.filter(value=>!value.startsWith(dist+"/"));await writeFile("tsconfig.json",JSON.stringify(config,null,2)+"\n");}
}
