import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { openDatabase, rpcLocal, LOCAL_IDS } from "@/lib/local-db";
const context = vi.hoisted(() => ({ db: null as import("@electric-sql/pglite").PGlite | null, databaseUnavailable: false }));
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server", () => ({
  hash: (value: string) => createHash("sha256").update(value).digest("hex"),
  rpc: (name: string, args: Record<string, unknown>) => rpcLocal(context.db!, null, name, args),
  localMode: () => true, localGuard: async () => {}, readableError: () => "طلب غير صالح",
}));
vi.mock("@/lib/local-db", async (original) => ({
  ...await original<typeof import("@/lib/local-db")>(),
  getLocalDatabase: async () => {
    if (context.databaseUnavailable) throw Error("Private database detail");
    return context.db!;
  },
}));
import { POST } from "@/app/api/portal-session/route";
import { sessionCookieName } from "@/lib/portal-credentials";
import { portalExchangeRateKey, portalExchangeRetryAfter } from "@/lib/portal-exchange-limit";
let portalId: string, token: string;
beforeAll(async () => {
  vi.stubEnv("APP_URL", "http://127.0.0.1:3217");
  context.db = await openDatabase();
  const uid = LOCAL_IDS.coach;
  await context.db.query("insert into auth.users values($1,'coach@example.test','synthetic',now())", [uid]);
  await rpcLocal(context.db, uid, "init_profile", { display_name: "مدرب اختبار", requested_role: "coach" });
  const client = await rpcLocal<{ id: string }>(context.db, uid, "app_command", { command: "client_save", payload: { name: "عميل خاص", email: "private@example.test", phone: "" } });
  token = randomBytes(32).toString("hex");
  portalId = (await rpcLocal<{ id: string }>(context.db, uid, "bearer_portal_create", { client_id: client.id, token_hash: hash(token), proof_hash: hash("EasyCoach/bearer/v1:" + token) })).id;
});
afterAll(async () => { await context.db?.close(); vi.unstubAllEnvs(); });
beforeEach(async () => {
  context.databaseUnavailable = false;
  vi.stubEnv("VERCEL", "1");
  await context.db!.exec("delete from private.portal_exchange_limits");
});
const request = (body: unknown, origin = "http://127.0.0.1:3217", ip = "192.0.2.10") => new Request("http://127.0.0.1:3217/api/portal-session", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
it("exchanges a body credential for an HttpOnly session, never putting it in the response URL", async () => {
  expect(await portalExchangeRetryAfter(request({}))).toBe(0);
  const response = await POST(request({ id: portalId, token }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, url: "/trainee/" + portalId });
  const cookie = response.cookies.get(sessionCookieName(portalId))!;
  expect(cookie.value).toMatch(/^[a-f0-9]{64}$/);
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/", maxAge: 604800 });
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("set-cookie")).not.toContain(token);
  const sessions = await context.db!.query<{ session_hash: string }>("select session_hash from private.trainee_portal_sessions");
  expect(sessions.rows.some(s => s.session_hash === hash(cookie.value))).toBe(true);
});
it("rejects cross-origin, malformed, oversized and wrong credentials without private data or cookies", async () => {
  const cross = await POST(request({ id: portalId, token }, "https://attacker.example"));
  expect(cross.status).toBe(403); expect(cross.headers.get("set-cookie")).toBeNull();
  const missing = await POST(request({ id: portalId, token: "bad" })); expect(missing.status).toBe(400);
  const oversized = await POST(request({ text: "x".repeat(1000) })); expect(oversized.status).toBe(400);
  const wrong = await POST(request({ id: portalId, token: "0".repeat(64) })); expect(wrong.status).toBe(403);
  expect(await wrong.text()).not.toContain("private@example.test");
  expect(wrong.headers.get("set-cookie")).toBeNull();
});

it("throttles repeated invalid exchanges durably with 429, no private data/cookies, and an actionable retry time", async () => {
  for (let i = 0; i < 30; i++)
    expect((await POST(request({ id: portalId, token: "0".repeat(64) }))).status).toBe(403);
  const blocked = await POST(request({ id: portalId, token }));
  expect(blocked.status).toBe(429);
  expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  expect(Number(blocked.headers.get("retry-after"))).toBeLessThanOrEqual(900);
  expect(blocked.headers.get("set-cookie")).toBeNull();
  expect(blocked.headers.get("cache-control")).toContain("no-store");
  expect(await blocked.text()).not.toContain("private@example.test");
  expect((await POST(request({ id: portalId, token }, undefined, "192.0.2.11"))).status).toBe(200);
  const stored = await context.db!.query("select * from private.portal_exchange_limits");
  expect(JSON.stringify(stored.rows)).not.toContain("192.0.2.");
  expect(JSON.stringify(stored.rows)).not.toContain(token);
});

it("resets expired windows, removes stale keys and prevents direct anonymous/account rate-table access", async () => {
  await POST(request({ id: portalId, token }));
  await context.db!.exec("update private.portal_exchange_limits set window_start=now()-interval '16 minutes',attempts=31");
  expect((await POST(request({ id: portalId, token }))).status).toBe(200);
  await context.db!.exec("update private.portal_exchange_limits set window_start=now()-interval '2 days'");
  await POST(request({}, undefined, "192.0.2.12"));
  expect((await context.db!.query("select * from private.portal_exchange_limits")).rows).toHaveLength(1);
  for (const user of [null, LOCAL_IDS.coach]) {
    await expect(rpcLocal(context.db!, user, "portal_exchange_rate_limit", { key_hash: "a".repeat(64) })).rejects.toThrow();
    await expect(context.db!.transaction(async tx => {
      await tx.exec(`set local role ${user ? "authenticated" : "anon"}`);
      await tx.exec("select * from private.portal_exchange_limits");
    })).rejects.toThrow();
  }
});

it("uses only validated Vercel edge IPs and ignores spoofable headers on other hosts", () => {
  expect(portalExchangeRateKey(request({}, undefined, "192.0.2.10")))
    .not.toBe(portalExchangeRateKey(request({}, undefined, "192.0.2.11")));
  expect(portalExchangeRateKey(request({}, undefined, "192.0.2.10, 192.0.2.11")))
    .toBe(portalExchangeRateKey(request({}, undefined, "spoofed")));
  vi.stubEnv("VERCEL", "");
  expect(portalExchangeRateKey(request({}, undefined, "192.0.2.10")))
    .toBe(portalExchangeRateKey(request({}, undefined, "192.0.2.11")));
});

it("fails closed with a retryable service error when the durable limiter is unavailable", async () => {
  context.databaseUnavailable = true;
  const response = await POST(request({ id: portalId, token }));
  expect(response.status).toBe(503);
  expect(response.headers.get("retry-after")).toBe("30");
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(await response.text()).not.toContain("Private database detail");
});
