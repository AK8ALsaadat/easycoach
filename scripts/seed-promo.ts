import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import bcrypt from "bcryptjs";
import { buildPromoDataset, promoId } from "./promo-dataset.ts";
import { PROMO_PROJECT, PROMO_RUN, promoSeedSql, promoCleanupSql, type PromoAccount } from "./promo-seed-sql.ts";

type Credentials = { project: string; owner: string; date: string; accounts: (PromoAccount & { name: string; password: string })[] };
const local = path.resolve(".local-dev/promo");
const cli = path.resolve("node_modules/supabase/dist/supabase.js");

export function queryPromo(sqlFile: string, readOnly = false) {
  const args = [cli, "db", "query", "--remote=" + PROMO_PROJECT, "--file", sqlFile, "--output", "json", ...(readOnly ? ["--read-only"] : ["--yes"])];
  // Never forward a failed SQL query to the terminal: it can contain Auth hashes.
  try {
    const stdout = execFileSync(process.execPath, args, { encoding: "utf8", maxBuffer: 24 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    return JSON.parse(stdout);
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    const combined = String(failure.stdout ?? "") + "\n" + String(failure.stderr ?? "");
    const log = path.join(local, "query-error.private.log");
    // Detailed diagnostic stays in the ignored directory; no plaintext passwords are in SQL.
    writeFileSync(log, combined, { mode: 0o600 });
    throw Error("Database command failed; private diagnostic: " + log);
  }
}

export async function runPromo(args: string[]) {
  const ownerIndex = args.indexOf("--owner");
  const owner = (args[ownerIndex + 1] ?? "").toLowerCase();
  if (ownerIndex < 0 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner)) throw Error("Provide --owner with the verified coach email");
  const apply = args.includes("--apply");
  const cleanup = args.includes("--cleanup");
  const dateIndex = args.indexOf("--date");
  const today = dateIndex >= 0 ? args[dateIndex + 1] : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  await mkdir(local, { recursive: true });
  const linked = JSON.parse(await readFile(".vercel/project.json", "utf8"));
  if (linked.projectName !== "easycoach") throw Error("Run from the EasyCoach repository");
  let sql: string;
  let credentials: Credentials | undefined;
  if (cleanup) {
    sql = promoCleanupSql(owner, !apply);
  } else {
    const dataset = buildPromoDataset(today);
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run / transaction rollback", project: PROMO_PROJECT, owner, run: PROMO_RUN, ...dataset.summary }, null, 2));
    // Refuse to create credentials unless Git explicitly ignores both files.
    for (const file of ["seed-credentials.md", "seed-credentials.json"])
      execFileSync("git", ["check-ignore", "--quiet", file], { stdio: "ignore" });
    try { credentials = JSON.parse(await readFile("seed-credentials.json", "utf8")); } catch { /* First run. */ }
    if (credentials && (credentials.owner !== owner || credentials.date !== today || credentials.project !== PROMO_PROJECT)) throw Error("Existing credentials belong to another seed; preserve/review them before a new run");
    if (!credentials) {
      const accounts: Credentials["accounts"] = [];
      for (const client of dataset.clients.filter(c => c.accountRequested)) {
        const password = randomBytes(24).toString("base64url") + "!aA9";
        accounts.push({ id: promoId("auth:" + client.id), clientId: client.id, name: client.name, email: client.email, password, passwordHash: await bcrypt.hash(password, 12), createdAt: client.joined + "T09:00:00Z" });
      }
      credentials = { owner, project: PROMO_PROJECT, date: today, accounts };
      await writeFile("seed-credentials.json", JSON.stringify(credentials, null, 2), { mode: 0o600, flag: "wx" });
    }
    await writeFile("seed-credentials.md", credentialsMarkdown(credentials, false), { mode: 0o600 });
    sql = promoSeedSql(dataset, credentials.accounts.map(({ id, clientId, email, passwordHash, createdAt }) => ({ id, clientId, email, passwordHash, createdAt })), owner, !apply);
  }
  const sqlFile = path.join(local, cleanup ? "cleanup.private.sql" : "seed.private.sql");
  await writeFile(sqlFile, sql, { mode: 0o600 });
  console.log(`${cleanup ? "Cleanup" : "Seed"}: ${apply ? "COMMIT" : "DRY RUN — ROLLBACK"}; SQL ${(Buffer.byteLength(sql) / 1024).toFixed(0)} KiB`);
  const result = queryPromo(sqlFile);
  await writeFile(path.join(local, `${cleanup ? "cleanup" : "seed"}-${apply ? "applied" : "dry-run"}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result.rows ?? result, null, 2));
  if (credentials && apply) await writeFile("seed-credentials.md", credentialsMarkdown(credentials, true), { mode: 0o600 });
}

function credentialsMarkdown(credentials: Credentials, applied: boolean) {
  return `# بيانات دخول تصوير EasyCoach — خاص، مستبعد من Git\n\nالمالك: ${credentials.owner}\nالمشروع: ${credentials.project}\nالعلامة: ${PROMO_RUN}\nالحالة: ${applied ? "أُنشئت الحسابات فعليًا" : "معاينة؛ لم تُحفظ الحسابات بعد"}\n\nهذه شخصيات ونتائج اصطناعية للتوضيح، وليست شهادات نجاح حقيقية. لا تُرسل رسائل إلى عناوينها.\n\nرابط الدخول: https://easycoach-livid.vercel.app/login\n\n| المتدرب | البريد | كلمة المرور |\n|---|---|---|\n${credentials.accounts.map(a => `| ${a.name} | ${a.email} | \`${a.password}\` |`).join("\n")}\n\nالحذف الآمن (معاينة افتراضية):\n\n\`\`\`powershell\nnode --experimental-strip-types scripts/cleanup-promo.ts --owner ${credentials.owner}\n# أضف --apply فقط عند الرغبة بحذف هذه البيانات فعليًا\n\`\`\`\n\nلا تشارك هذا الملف ولا تضع كلمات المرور في التصوير.\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  runPromo(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : "Promo seed failed"); process.exitCode = 1; });
