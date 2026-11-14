// Read-only connectivity/authentication checks. Never creates an invoice or charge.
import { mkdir, writeFile } from "node:fs/promises";
const report = { checkedAt: new Date().toISOString(), invoicesCreated: 0, liveChargeAttempted: false, checks: [] };
for (const [name, url, options] of [
  ["sandbox authentication with Paylink's published test credentials", "https://restpilot.paylink.sa/api/auth", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiId: "APP_ID_1123453311", secretKey: "0662abb5-13c7-38ab-cd12-236e58f43766", persistToken: false }),
  }],
  ["production API reachability only", "https://restapi.paylink.sa/api/auth", { method: "GET" }],
]) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => null);
    report.checks.push({ name, status: response.status, authenticated: response.ok && Boolean(data?.id_token) });
  } catch (error) { report.checks.push({ name, error: error.name, authenticated: false }); }
}
await mkdir("artifacts/policy-release", { recursive: true });
await writeFile("artifacts/policy-release/paylink-readiness.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
