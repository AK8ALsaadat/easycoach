import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  jar: new Map<string, string>(), options: [] as Record<string, unknown>[], confirmed: true,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "coach.example" }),
  cookies: async () => ({
    get: (name: string) => state.jar.has(name) ? { name, value: state.jar.get(name) } : undefined,
    getAll: () => [...state.jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options: Record<string, unknown>) => { state.jar.set(name, value); state.options.push(options); },
    delete: (name: string) => state.jar.delete(name),
  }),
}));
import { actor, supabase } from "@/lib/server";
import { beginPendingSignup, clearPendingSignup, readPendingSignup } from "@/lib/pending-signup";

const user = () => ({ id: "33333333-3333-4333-8333-333333333333", email: "otp@example.test", aud: "authenticated", role: "authenticated", user_metadata: { role: "trainee" }, app_metadata: { provider: "email" }, created_at: "2026-11-14T00:00:00Z", email_confirmed_at: state.confirmed ? "2026-11-14T00:00:00Z" : null });
const jwt = () => [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ sub: user().id, exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), aud: "authenticated", role: "authenticated" })).toString("base64url"),
  "synthetic-test-signature",
].join(".");

beforeEach(() => {
  state.jar.clear(); state.options = []; state.confirmed = true;
  vi.stubEnv("LOCAL_DB_PATH", "");
  vi.stubEnv("APP_URL", "https://coach.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://auth.example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "synthetic-public-key");
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname;
    if (path === "/auth/v1/verify") return Response.json({ access_token: jwt(), refresh_token: "synthetic-refresh", token_type: "bearer", expires_in: 3600, user: user() });
    if (path === "/auth/v1/user") return Response.json(user());
    return Response.json({ error: "unexpected local test endpoint" }, { status: 400 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("persists verified OTP sessions through the real Supabase SSR cookie adapter and a fresh server client", async () => {
  const result = await (await supabase()).auth.verifyOtp({ email: "otp@example.test", token: "00123456", type: "email" });
  expect(result.error).toBeNull();
  expect(state.jar.size).toBeGreaterThan(0);
  expect(state.options.every(o => o.httpOnly === true && o.secure === true && o.sameSite === "lax")).toBe(true);
  // A new client reading only the stored cookies models the next SSR request.
  expect(await actor()).toMatchObject({ id: user().id, email: "otp@example.test" });
  state.confirmed = false;
  expect(await actor()).toBeNull();
});

it("keeps refreshable pending metadata separate from authentication and excludes passwords/codes", async () => {
  await beginPendingSignup("otp@example.test", "https://attacker.example");
  const pending = await readPendingSignup();
  expect(pending).toMatchObject({ email: "otp@example.test", next: "/coach" });
  expect(Object.keys(pending!).sort()).toEqual(["email", "expiresAt", "next", "resendAt"]);
  expect(state.options[0]).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true });
  expect([...state.jar.keys()]).toEqual(["ec_pending_signup"]);
  await clearPendingSignup();
  expect(await readPendingSignup()).toBeNull();
});

it("rejects expired and malformed pending metadata", async () => {
  state.jar.set("ec_pending_signup", "invalid-json");
  expect(await readPendingSignup()).toBeNull();
  state.jar.set("ec_pending_signup", JSON.stringify({ email: "otp@example.test", next: "/coach", expiresAt: Date.now() - 1, resendAt: 0 }));
  expect(await readPendingSignup()).toBeNull();
});
