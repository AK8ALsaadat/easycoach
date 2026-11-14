// Repeatable local release checks against fictional data in a fresh database.
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";

const directory = await mkdtemp(path.join(os.tmpdir(), "easycoach-platform-design-"));
const dist = ".local-dev/design-release";
const port = await new Promise(resolve => {
  const socket = net.createServer();
  socket.listen(0, "127.0.0.1", () => { const port = socket.address().port; socket.close(() => resolve(port)); });
});
const base = `http://127.0.0.1:${port}`;
const allScripts = ["qa-design-browser.mjs", "qa-policy-dialogs.mjs", "qa-import-browser.mjs", "qa-session-photos.mjs", "qa-paylink-browser-check.mjs", "qa-platform-subscriptions.mjs", "qa-coach-journey.mjs"];
const selectedScripts = process.argv.length > 2 ? process.argv.slice(2) : allScripts;
if (selectedScripts.some(script => ![...allScripts, "qa-subscribe-actions.mjs"].includes(script))) throw Error("Unknown QA script");
const env = {
  ...process.env, LOCAL_DB_PATH: directory, EASYCOACH_EVIDENCE_DIST_DIR: dist,
  APP_URL: base, TEST_BASE_URL: base,
  PAYLINK_BASE_URL: "http://127.0.0.1:4017", PAYLINK_ENV_COACH_ID: "11111111-1111-4111-8111-111111111111",
  PAYLINK_API_ID: "synthetic-qa", PAYLINK_SECRET_KEY: "synthetic-qa", PAYLINK_WEBHOOK_SECRET: "qa-local-webhook",
};
function command(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: "inherit", windowsHide: true });
    child.on("error", reject);
    child.on("close", code => code ? reject(Error(`${args.join(" ")} exited ${code}`)) : resolve());
  });
}
let server, stopping = false;
try {
  await mkdir("artifacts/design-release", { recursive: true });
  await command(["--experimental-strip-types", "scripts/prepare-platform-qa.ts", directory]);
  await command(["--experimental-strip-types", "scripts/prepare-trial-qa.ts", directory]);
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "-H", "127.0.0.1", "-p", String(port)], {
    env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let logs = "";
  for (const stream of [server.stdout, server.stderr]) stream.on("data", data => { logs = (logs + data).slice(-6000); });
  server.on("exit", code => { if (code && !stopping) console.error("QA server exited:", code, logs); });
  const deadline = Date.now() + 180000;
  let ready = false;
  while (Date.now() < deadline) {
    try { if ((await fetch(base + "/login", { signal: AbortSignal.timeout(10000) })).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw Error("Isolated server failed: " + logs);
  console.log("Isolated design QA: " + base);
  for (const script of selectedScripts) {
    console.log("Running " + script);
    await command(["scripts/" + script]);
  }
  console.log("DESIGN RELEASE QA PASSED");
} finally {
  stopping = true;
  if (server?.pid) {
    try {
      if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      else server.kill("SIGTERM");
    } catch {}
  }
  const source = await readFile("tsconfig.json", "utf8"), config = JSON.parse(source);
  config.include = config.include.filter(value => !value.startsWith(dist + "/"));
  await writeFile("tsconfig.json", JSON.stringify(config, null, 2) + "\n");
}
