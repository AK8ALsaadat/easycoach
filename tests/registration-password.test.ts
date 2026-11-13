import { beforeEach, describe, expect, it, vi } from "vitest";
import { passwordStrength, registrationPasswordIssue } from "@/lib/password";

const state = vi.hoisted(() => ({ signUp: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server", () => ({
  localMode: () => false,
  safeNext: () => "/coach",
  readableError: () => "تحقق من البيانات المدخلة",
  supabase: async () => ({ auth: { signUp: state.signUp } }),
}));
import { registerAction } from "@/app/actions";

beforeEach(() => {
  state.signUp.mockReset().mockResolvedValue({ error: null });
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
    expect(await registerAction(form("Abcdefg!", "Abcdefg!"))).toMatchObject({ ok: true });
    expect(state.signUp).toHaveBeenCalledTimes(1);
    expect(state.signUp.mock.calls[0][0]).toMatchObject({ password: "Abcdefg!", email: "registration@example.test" });
    expect(state.signUp.mock.calls[0][0]).not.toHaveProperty("password_confirmation");
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
