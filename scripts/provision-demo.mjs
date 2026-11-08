import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
const args = process.argv.slice(2),
  flag = (name) => args[args.indexOf(name) + 1];
const env = args.includes("--env-json")
  ? JSON.parse(
      (await fs.readFile(flag("--env-json"), "utf8")).replace(/^\uFEFF/, ""),
    )
  : process.env;
const ref = flag("--project-ref"),
  url = env.NEXT_PUBLIC_SUPABASE_URL;
if (
  !args.includes("--project-ref") ||
  new URL(url).hostname !== `${ref}.supabase.co`
)
  throw Error("Supply the exact target --project-ref");
const email = "test@demo.easycoach.test",
  credentialFile = ".vercel/demo-account.private.json";
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let existing;
for (let page = 1; page <= 20; page++) {
  const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (result.error) throw result.error;
  existing = result.data.users.find((u) => u.email === email);
  if (existing || result.data.users.length < 1000) break;
}
if (existing && existing.app_metadata.demo !== true)
  throw Error("Reserved email belongs to a non-demo identity; no changes made");
let saved;
try {
  saved = JSON.parse(await fs.readFile(credentialFile, "utf8"));
} catch {}
const password =
  existing && saved?.id === existing.id
    ? saved.password
    : randomBytes(48).toString("base64url");
let user = existing;
if (!user) {
  const result = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { demo: true },
    user_metadata: { display_name: "test", role: "coach" },
  });
  if (result.error) throw result.error;
  user = result.data.user;
} else if (!saved || saved.id !== user.id) {
  const result = await admin.auth.admin.updateUserById(user.id, { password });
  if (result.error) throw result.error;
}
await fs.mkdir(".vercel", { recursive: true });
await fs.writeFile(
  credentialFile,
  JSON.stringify({ id: user.id, email, password }, null, 2),
);
const client = createClient(
  url,
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const login = await client.auth.signInWithPassword({ email, password });
if (login.error) throw login.error;
const rpc = async (name, input = {}) => {
  const result = await client.rpc(name, input);
  if (result.error) throw result.error;
  return result.data;
};
await rpc("init_profile", { display_name: "test", requested_role: "coach" });
let snapshot = await rpc("management_snapshot");
for (let i = 1; i <= 3; i++) {
  const contact = `test-client-${i}@demo.easycoach.test`;
  if (!snapshot.clients.some((c) => c.email === contact))
    await rpc("app_command", {
      command: "client_save",
      payload: { name: `عميل تجريبي ${i}`, email: contact, phone: "" },
    });
}
snapshot = await rpc("management_snapshot");
if (
  snapshot.clients.some((c) => c.coach_id !== user.id) ||
  snapshot.profile.id !== user.id
)
  throw Error("Demo tenant isolation check failed");
if (args.includes("--configure-vercel")) {
  const repo = JSON.parse(await fs.readFile(".vercel/repo.json", "utf8")),
    project = repo.projects.find((p) => p.name === "easycoach");
  if (!project) throw Error("Vercel project not linked");
  await fs.writeFile(
    ".vercel/project.json",
    JSON.stringify({
      projectId: project.id,
      orgId: project.orgId,
      projectName: project.name,
    }),
  );
  const cli = path.join(
    process.env.APPDATA,
    "npm/node_modules/vercel/dist/index.js",
  );
  await fs.access(cli);
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        cli,
        "env",
        "add",
        "DEMO_AUTH_PASSWORD",
        "production",
        "--sensitive",
        "--yes",
        "--force",
        "--scope",
        project.orgId,
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (v) => (output += v));
    child.stderr.on("data", (v) => (output += v));
    child.on("error", reject);
    child.on("exit", (code) => {
      process.stdout.write(output.replaceAll(password, "[redacted]"));
      if (code) reject(Error("Vercel demo environment configuration failed"));
      else resolve();
    });
    child.stdin.end(password);
  });
}
await client.auth.signOut();
console.log(
  JSON.stringify({
    demoUserId: user.id,
    username: "test",
    demoClients: snapshot.clients.length,
    tenantIsolation: "verified",
    route: "/demo",
  }),
);
