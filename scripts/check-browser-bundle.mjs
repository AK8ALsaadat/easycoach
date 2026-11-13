import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
async function walk(dir) {
  return (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map((e) =>
        e.isDirectory()
          ? walk(path.join(dir, e.name))
          : [path.join(dir, e.name)],
      ),
    )
  ).flat();
}
const patterns = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "scryptSync",
  "encrypted_password",
];
let secrets = [];
try {
  const privateEnv = JSON.parse(
    await readFile(".vercel/deploy-env.private.json", "utf8"),
  );
  if (privateEnv.SUPABASE_SERVICE_ROLE_KEY)
    secrets.push(privateEnv.SUPABASE_SERVICE_ROLE_KEY);
} catch {}
let count = 0;
for (const file of await walk(path.join(process.env.EASYCOACH_EVIDENCE_DIST_DIR || ".next", "static"))) {
  const text = await readFile(file, "utf8");
  if ([...patterns, ...secrets].some((v) => text.includes(v)))
    throw Error("Server-only content detected in a browser artifact: " + file);
  count++;
}
console.log(
  `PASS: ${count} static browser artifacts checked; no admin key, database URL, password hash or server-only credential names found.`,
);
