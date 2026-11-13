// Private inputs (.vercel/deploy-env.private.json) are prepared by the operator, never checked into Git.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { hostEnvironmentPlan } from "./host-env-scope.mjs";
const target = process.env.EASYCOACH_HOST_TARGET ?? "production";
const production = JSON.parse(await readFile(".vercel/deploy-env.private.json", "utf8"));
if (target !== "production" && !process.env.EASYCOACH_HOST_ENV_FILE)
  throw Error("A separate private environment file is required for preview/development");
const environment = JSON.parse(
  await readFile(process.env.EASYCOACH_HOST_ENV_FILE ?? ".vercel/deploy-env.private.json", "utf8"),
);
const repository = JSON.parse(await readFile(".vercel/repo.json", "utf8"));
const linked = repository.projects.find((p) => p.name === "easycoach");
if (!linked) throw new Error("The expected Vercel project is not linked");
const project = { projectId: linked.id };
const cli =
  process.env.VERCEL_CLI_PATH ??
  "C:/Users/aboaz/AppData/Roaming/npm/node_modules/vercel/dist/index.js";
function call(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "",
      err = "";
    child.stdout.on("data", (b) => (out += b));
    child.stderr.on("data", (b) => (err += b));
    child.on("close", (code) => {
      if (code) {
        let safe = err;
        for (const value of Object.values(environment))
          safe = safe.replaceAll(String(value), "[redacted]");
        reject(Error("Host configuration failed: " + safe.slice(-500)));
      } else resolve(out);
    });
    child.stdin.end(JSON.stringify(input) + "\n");
  });
}
const variables = hostEnvironmentPlan(environment, target, production);
for (const variable of variables)
  await call(
    [
      "api",
      `/v10/projects/${project.projectId}/env?upsert=true`,
      "-X",
      "POST",
      "--input",
      "-",
      "--raw",
    ],
    variable,
  );
await call(
  [
    "api",
    `/v9/projects/${project.projectId}`,
    "-X",
    "PATCH",
    "--input",
    "-",
    "--raw",
  ],
  { framework: "nextjs", ssoProtection: { deploymentType: "all" } },
);
console.log(
  `Configured ${target} environment only, and Vercel Authentication for all deployments. Secret values were not printed.`,
);
