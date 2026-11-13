import { beforeEach, describe, expect, it, vi } from "vitest";
import { passwordStrength, registrationPasswordIssue } from "@/lib/password";

const state = vi.hoisted(() => ({ signUp: vi.fn(), signOut: vi.fn(), beginPendingSignup: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/pending-signup", () => ({ beginPendingSignup: state.beginPendingSignup }));
vi.mock("@/lib/server", () => ({
  localMode: () => false,
  safeNext: () => "/coach",
  readableError: (error: unknown) => (error instanceof Error ? error.message : "تحقق من البيانات المدخلة"),
  supabase: async () => ({ auth: { signUp: state.signUp, signOut: state.signOut } }),
}));
import { registerAction } from "@/app/actions";

beforeEach(() => {
  state.signUp.mockReset().mockResolvedValue({ error: null });
  state.beginPendingSignup.mockReset();
  state.signOut.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("APP_URL", "https://coach.example");
});

function form(password: string, confirmation?: string) {
  const result = new FormData();
  for (const [key, value] of Object.entries({ name: "حساب اختبار", email: "registration@example.test", role: "coach", password })) result.set(key, value);
  if (confirmation !== undefined) result.set("password_confirmation", confirmation);
  return result;
}

describe("server registration password policy", () => {
  it.each([
    ["Abcdef!", "Abcdef!"],
    ["abcdefg!", "abcdefg!"],
    ["Abcdefgh", "Abcdefgh"],
    ["Abcdefg ", "Abcdefg "],
    ["Abcdefg!", "Abcdefg?"],
    ["Abcdefg!", ""],
    ["Abcdefg!", undefined],
    ["A!" + "a".repeat(127), "A!" + "a".repeat(127)],
  ])("rejects invalid or unconfirmed passwords before contacting Auth", async (password, confirmation) => {
    expect((await registerAction(form(password, confirmation))).ok).toBe(false);
    expect(state.signUp).not.toHaveBeenCalled();
  });

  it("accepts exactly eight characters, an uppercase letter and a symbol without demanding digits", async () => {
    state.signUp.mockResolvedValue({ data: { user: { id: "unverified" }, session: null }, error: null });
    expect(await registerAction(form("Abcdefg!", "Abcdefg!"))).toMatchObject({ ok: true, url: "/verify-email" });
    expect(state.signUp).toHaveBeenCalledTimes(1);
    expect(state.signUp.mock.calls[0][0]).toMatchObject({ password: "Abcdefg!", email: "registration@example.test" });
    expect(state.signUp.mock.calls[0][0]).not.toHaveProperty("password_confirmation");
    expect(state.beginPendingSignup).toHaveBeenCalledWith("registration@example.test", null);
  });

  it("surfaces the live server's weak-password rejection instead of a generic failure", async () => {
    state.signUp.mockResolvedValue({ data: {}, error: { status: 422, code: "weak_password", message: "Password should be at least 12 characters." } });
    const result = await registerAction(form("Abcdefg!", "Abcdefg!"));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("شروط الخادم");
    expect(state.beginPendingSignup).not.toHaveBeenCalled();
  });

  it("explains a confirmation-email delivery failure instead of a generic failure", async () => {
    state.signUp.mockResolvedValue({ data: {}, error: { status: 500, code: "unexpected_failure", message: "Error sending confirmation email" } });
    const result = await registerAction(form("Abcdefg!", "Abcdefg!"));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("رسالة التأكيد");
  });

  it("fails closed and clears an unexpected signup session when Confirm email is disabled", async () => {
    state.signUp.mockResolvedValue({ data: { user: { id: "test" }, session: { access_token: "synthetic" } }, error: null });
    expect((await registerAction(form("Abcdefg!", "Abcdefg!"))).ok).toBe(false);
    expect(state.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(state.beginPendingSignup).not.toHaveBeenCalled();
  });

  it("compares the exact passwords without trimming or normalizing them", () => {
    expect(registrationPasswordIssue("Abcdef! ", "Abcdef!")).toBe("كلمتا المرور غير متطابقتين");
  });
});

it("changes the strength estimate with policy compliance, length and variety", () => {
  expect(passwordStrength("").score).toBe(0);
  expect(passwordStrength("abcdefgh").score).toBe(1);
  expect(passwordStrength("Abcdefg!").score).toBe(2);
  expect(passwordStrength("Abcdefghijk!").score).toBe(3);
  expect(passwordStrength("Abcdefghijk1234!").score).toBe(4);
});
