import { openDatabase, rpcLocal, passwordHash } from "../lib/local-db.ts";
import path from "node:path";
import os from "node:os";
const directory = path.resolve(process.argv[2] ?? "");
if (!directory.startsWith(path.join(os.tmpdir(), "easycoach-platform-design-"))) throw Error("Synthetic isolated billing QA only");
const db = await openDatabase(directory);
try {
  // Fictional tax/merchant approval, never written to the real platform database.
  await db.exec("update public.ec_config set provider_verified=true,tax_mode='not_registered'");
  if(process.env.QA_TAX_UNCONFIGURED==="true")await db.exec("update public.ec_config set tax_mode='unconfigured'");
  for (const digit of ["7", "8", "9"]) {
    const id = `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
    await db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,$3,now())", [id, `billing${digit}@example.test`, passwordHash("CoachPreview!2026")]);
    await rpcLocal(db,id,"init_profile",{display_name:"Fictional platform billing owner",requested_role:"coach"});
    await db.query("update public.ec_accounts set lifecycle_enabled=true,subscription_state='SUSPENDED',billing_mobile='0501234567',billing_name='Fictional owner',billing_plan='pro',mode='managed',status='expired',trial_used_at=now()-interval '30 days',trial_start=now()-interval '30 days',trial_end=now()-interval '16 days' where owner_id=$1",[id]);
  }
} finally { await db.close(); }
