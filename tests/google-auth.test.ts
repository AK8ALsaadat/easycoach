import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  user: null as null | { user_metadata: Record<string, unknown> },
  exchangeError: null as null | Error,
  updateUser: vi.fn(),
  signInWithOAuth: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.jar.has(name) ? { name, value: state.jar.get(name) } : undefined),
    set: (name: string, value: string) => void state.jar.set(name, value),
    delete: (input: string | { name: string }) => void state.jar.delete(typeof input === "string" ? input : input.name),
  }),
}));
vi.mock("@/lib/server", () => ({
  localMode: () => false,
  safeNext: (value: unknown) => (typeof value === "string" && /^\/(coach|me|invite\/[a-f0-9]{64})$/.test(value) ? value : "/coach"),
  readableError: (error: { message?: string }) => error.message ?? "خطأ",
  supabase: async () => ({
    auth: {
      exchangeCodeForSession: async () => ({ data: { user: state.user }, error: state.exchangeError }),
      updateUser: state.updateUser,
      signInWithOAuth: state.signInWithOAuth,
    },
  }),
}));
import { NextRequest } from "next/server";
import { GET } from "@/app/auth/callback/route";
import { googleLoginAction } from "@/app/actions";

const callback = (query: string) => GET(new NextRequest("https://coach.example/auth/callback?" + query));

beforeEach(() => {
  state.jar.clear();
  state.user = null;
  state.exchangeError = null;
  state.updateUser.mockReset();
  state.signInWithOAuth.mockReset();
  vi.stubEnv("APP_URL", "https://coach.example");
  vi.stubEnv("AUTH_GOOGLE_ENABLED", "true");
});

it("gives a new Google account the role chosen before sign-in and its Google name", async () => {
  state.jar.set("ec_oauth_role", "coach");
  state.user = { user_metadata: { full_name: "سارة المدربة", email: "sara@example.test" } };
  const response = await callback("code=abc&next=%2Fcoach");
  expect(response.headers.get("location")).toBe("https://coach.example/coach");
  expect(state.updateUser).toHaveBeenCalledWith({ data: { role: "coach", display_name: "سارة المدربة" } });
  expect(state.jar.has("ec_oauth_role")).toBe(false);
});

it("never changes the role of an existing account", async () => {
  state.jar.set("ec_oauth_role", "coach");
  state.user = { user_metadata: { role: "trainee", display_name: "متدرب" } };
  await callback("code=abc&next=%2Fme");
  expect(state.updateUser).not.toHaveBeenCalled();
});

it("defaults a new account without a chosen role to trainee", async () => {
  state.user = { user_metadata: { name: "x" } };
  await callback("code=abc");
  expect(state.updateUser).toHaveBeenCalledWith({ data: { role: "trainee" } });
});

it("returns to login with a Google-specific message when sign-in is cancelled", async () => {
  const response = await callback("error=access_denied");
  expect(response.headers.get("location")).toBe("https://coach.example/login?error=oauth");
});

it("starts Google sign-in with a safe callback and remembers the role", async () => {
  state.signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.com/o/oauth2" }, error: null });
  const token = "a".repeat(64);
  const result = await googleLoginAction({ next: "/invite/" + token });
  expect(result).toMatchObject({ ok: true, url: "https://accounts.google.com/o/oauth2" });
  expect(state.jar.get("ec_oauth_role")).toBe("trainee");
  expect(state.signInWithOAuth.mock.calls[0][0]).toMatchObject({
    provider: "google",
    options: { redirectTo: `https://coach.example/auth/callback?next=${encodeURIComponent("/invite/" + token)}`, skipBrowserRedirect: true },
  });
});

it("refuses unknown roles and stays off until enabled", async () => {
  expect((await googleLoginAction({ role: "admin" })).ok).toBe(false);
  vi.stubEnv("AUTH_GOOGLE_ENABLED", "false");
  const off = await googleLoginAction({});
  expect(off).toMatchObject({ ok: false, message: "الدخول بحساب Google غير مفعّل حاليًا" });
  expect(state.signInWithOAuth).not.toHaveBeenCalled();
});
