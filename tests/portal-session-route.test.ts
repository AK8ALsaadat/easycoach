import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { openDatabase, rpcLocal, LOCAL_IDS } from "@/lib/local-db";
const context = vi.hoisted(() => ({ db: null as import("@electric-sql/pglite").PGlite | null }));
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server", () => ({
  hash: (value: string) => createHash("sha256").update(value).digest("hex"),
  rpc: (name: string, args: Record<string, unknown>) => rpcLocal(context.db!, null, name, args),
  localMode: () => true, readableError: () => "طلب غير صالح",
}));
import { POST } from "@/app/api/portal-session/route";
import { sessionCookieName } from "@/lib/portal-credentials";
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
const request = (body: unknown, origin = "http://127.0.0.1:3217") => new Request("http://127.0.0.1:3217/api/portal-session", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
it("exchanges a body credential for an HttpOnly session, never putting it in the response URL", async () => {
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
