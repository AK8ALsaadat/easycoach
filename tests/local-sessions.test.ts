import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { openDatabase, passwordHash, LOCAL_IDS } from "@/lib/local-db";
const context = vi.hoisted(() => ({
  db: null as import("@electric-sql/pglite").PGlite | null,
  host: "127.0.0.1:3200", ip: "session-test", jar: new Map<string, string>(),
  options: {} as Record<string, unknown>,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: context.host, "x-forwarded-for": context.ip }),
  cookies: async () => ({
    get: (name: string) => context.jar.has(name) ? { value: context.jar.get(name) } : undefined,
    set: (name: string, value: string, options: Record<string, unknown>) => { context.jar.set(name, value); context.options = options; },
  }),
}));
vi.mock("@/lib/local-db", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/local-db")>();
  return { ...actual, getLocalDatabase: async () => context.db! };
});
import { actor, hash, loginLocal } from "@/lib/server";

beforeAll(async () => {
  vi.stubEnv("APP_MODE", "local");
  context.db = await openDatabase();
  await context.db.query("insert into auth.users values($1,$2,$3,now())", [LOCAL_IDS.coach, "sessions@example.test", passwordHash("Synthetic!2026")]);
});
afterAll(async () => { await context.db?.close(); vi.unstubAllEnvs(); });

it("authenticates real local credentials, hashes the session and sets protected cookies", async () => {
  await loginLocal("sessions@example.test", "Synthetic!2026");
  const token = context.jar.get("ec_session")!;
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  const result = await context.db!.query<{ token_hash: string }>("select token_hash from private.local_sessions");
  expect(result.rows[0].token_hash).toBe(hash(token));
  expect(result.rows[0].token_hash).not.toBe(token);
  expect(context.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 604800 });
  expect((await actor())?.id).toBe(LOCAL_IDS.coach);
});

it("replaces the previous local session and denies expired, deleted and malformed sessions", async () => {
  const previous = context.jar.get("ec_session")!;
  await loginLocal("sessions@example.test", "Synthetic!2026");
  expect(context.jar.get("ec_session")).not.toBe(previous);
  expect((await context.db!.query("select 1 from private.local_sessions where token_hash=$1", [hash(previous)])).rows).toHaveLength(0);
  await context.db!.exec("update private.local_sessions set expires_at=now()-interval '1 second'");
  expect(await actor()).toBeNull();
  await context.db!.exec("delete from private.local_sessions");
  expect(await actor()).toBeNull();
  context.jar.set("ec_session", "not-a-session");
  expect(await actor()).toBeNull();
});

it("throttles wrong-password retries without issuing a session", async () => {
  context.ip = "isolated-throttle-test"; context.jar.clear();
  for (let i = 0; i < 10; i++) await expect(loginLocal("sessions@example.test", "WrongPassword!2026")).rejects.toThrow("غير صحيحة");
  await expect(loginLocal("sessions@example.test", "Synthetic!2026")).rejects.toThrow("محاولات كثيرة");
  expect(context.jar.has("ec_session")).toBe(false);
  await context.db!.exec("update private.rate_limits set window_start=now()-interval '16 minutes'");
  await loginLocal("sessions@example.test", "Synthetic!2026");
  expect((await actor())?.id).toBe(LOCAL_IDS.coach);
});

it("never exposes local synthetic sessions from a public host", async () => {
  context.host = "public.example.test";
  await expect(actor()).rejects.toThrow("على الجهاز فقط");
  await expect(loginLocal("sessions@example.test", "Synthetic!2026")).rejects.toThrow("على الجهاز فقط");
});
