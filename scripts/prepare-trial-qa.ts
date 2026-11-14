import { openDatabase, seedDatabase, rpcLocal, passwordHash } from "../lib/local-db.ts";
import path from "node:path";
import os from "node:os";
// A fresh managed Free coach for the card-less trial journey, in an isolated
// local database only (temp folder or an explicit *-qa / scratch copy).
const directory = path.resolve(process.argv[2] ?? "");
const allowed = directory.startsWith(path.join(os.tmpdir(), "easycoach-")) || /[\\/](scratchpad|easycoach-[a-z-]*qa[a-z-]*)[\\/]/i.test(directory) || /scratchpad/i.test(directory);
if (!allowed) throw Error("Only an isolated QA database directory is allowed");
const db = await openDatabase(directory);
try {
  await seedDatabase(db);
  const owner = "66666666-6666-4666-8666-666666666666";
  const exists = await db.query("select 1 from auth.users where id=$1", [owner]);
  if (!exists.rows.length) {
    await db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,$3,now())", [owner, "trial@example.test", passwordHash("CoachPreview!2026")]);
    await rpcLocal(db, owner, "init_profile", { display_name: "Fictional trial QA coach", requested_role: "coach" });
    await rpcLocal(db, owner, "app_command", { command: "client_save", payload: { name: "Fictional trial client", email: "trial-client@example.test", phone: "" } });
  }
  const state = await rpcLocal<{ mode: string; status: string }>(db, owner, "ec_subscription");
  console.log("trial@example.test ready:", state.mode, state.status);
} finally { await db.close(); }
