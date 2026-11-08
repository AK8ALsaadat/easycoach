import type { PGlite } from "@electric-sql/pglite";
import { passwordHash, rpcLocal } from "./local-db";
import { DEMO_EMAIL } from "./demo-config";
export const LOCAL_DEMO_PASSWORD = "Local-demo-internal-only!2026";
export async function ensureLocalDemo(db: PGlite) {
  await db.query(
    "insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,$3,now()) on conflict(email) do nothing",
    [
      "55555555-5555-4555-8555-555555555555",
      DEMO_EMAIL,
      passwordHash(LOCAL_DEMO_PASSWORD),
    ],
  );
  const result = await db.query<{ id: string }>(
    "select id from auth.users where email=$1",
    [DEMO_EMAIL],
  );
  const id = result.rows[0].id;
  await rpcLocal(db, id, "init_profile", {
    display_name: "test",
    requested_role: "coach",
  });
  return id;
}
