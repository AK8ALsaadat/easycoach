import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeEmailOtp, validEmailOtp } from "@/lib/email-otp";
const state = vi.hoisted(() => ({
  pending: null as null | { email: string; next: string; resendAt: number; expiresAt: number },
  verify: vi.fn(), resend: vi.fn(), actor: vi.fn(), snapshot: vi.fn(), write: vi.fn(), clear: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server", () => ({
  localMode: () => false,
  safeNext: (next: unknown) => typeof next === "string" && /^\/(coach|me|invite\/[a-f0-9]{64})$/.test(next) ? next : "/coach",
  actor: state.actor, snapshot: state.snapshot,
  supabase: async () => ({ auth: { verifyOtp: state.verify, resend: state.resend } }),
}));
vi.mock("@/lib/pending-signup", () => ({ readPendingSignup: async () => state.pending, writePendingSignup: state.write, clearPendingSignup: state.clear }));
import { resendSignupCode, verifySignupCode } from "@/app/signup-verification-actions";

const codeForm = (code: string) => { const form = new FormData(); form.set("code", code); return form; };
beforeEach(() => {
  vi.clearAllMocks();
  state.pending = { email: "otp@example.test", next: "/coach", resendAt: 0, expiresAt: Date.now() + 86400000 };
  state.verify.mockReset().mockResolvedValue({ data: { session: { access_token: "synthetic" }, user: { email: "otp@example.test", email_confirmed_at: "2026-11-14T00:00:00Z" } }, error: null });
  state.resend.mockReset().mockResolvedValue({ error: null });
  state.actor.mockReset().mockResolvedValue({ id: "test", email: "otp@example.test" });
  state.snapshot.mockReset().mockResolvedValue({ profile: { role: "coach" } });
});

it("normalizes pasted Arabic/Persian digits and whitespace, retaining leading zeros", () => {
  expect(normalizeEmailOtp("٠٠١٢ ٣٤٥٦")).toBe("00123456");
  expect(normalizeEmailOtp("۰۰۱۲۳۴۵۶")).toBe("00123456");
  expect(validEmailOtp("001234")).toBe(true);
  expect(validEmailOtp("00123456")).toBe(false);
});

it("verifies the cookie's email with type email, then requires a verified server identity", async () => {
  const result = await verifySignupCode(codeForm("٠٠١٢٣٤"));
  expect(state.verify).toHaveBeenCalledWith({ email: "otp@example.test", token: "001234", type: "email" });
  expect(result).toMatchObject({ ok: true, url: "/coach" });
  expect(state.actor).toHaveBeenCalledTimes(1);
  expect(state.clear).toHaveBeenCalledTimes(1);
});

describe("OTP rejection paths", () => {
  it.each(["invalid", "expired", "already-used"])("does not establish application access for a %s provider rejection", async () => {
    state.verify.mockResolvedValue({ data: {}, error: { status: 403, code: "otp_expired" } });
    expect((await verifySignupCode(codeForm("001234"))).ok).toBe(false);
    expect(state.snapshot).not.toHaveBeenCalled();
    expect(state.clear).not.toHaveBeenCalled();
  });
  it("does not call the provider for missing context or incorrect code length", async () => {
    expect((await verifySignupCode(codeForm("12345"))).ok).toBe(false);
    state.pending = null;
    expect((await verifySignupCode(codeForm("001234"))).ok).toBe(false);
    expect(state.verify).not.toHaveBeenCalled();
  });
  it("never treats a returned user without a session as verification success", async () => {
    state.verify.mockResolvedValue({ data: { session: null, user: { email_confirmed_at: "yes" } }, error: null });
    expect((await verifySignupCode(codeForm("001234"))).ok).toBe(false);
    expect(state.snapshot).not.toHaveBeenCalled();
  });
  it("denies a mismatched email or an unverified server identity", async () => {
    state.actor.mockResolvedValue(null);
    expect((await verifySignupCode(codeForm("001234"))).ok).toBe(false);
    state.actor.mockResolvedValue({ email: "other@example.test" });
    expect((await verifySignupCode(codeForm("001234"))).ok).toBe(false);
    expect(state.snapshot).not.toHaveBeenCalled();
  });
  it("preserves safe invitation redirects, denies external redirects, and routes trainees to me", async () => {
    state.pending!.next = "https://attacker.example";
    expect(await verifySignupCode(codeForm("001234"))).toMatchObject({ url: "/coach" });
    state.snapshot.mockResolvedValue({ profile: { role: "trainee" } });
    expect(await verifySignupCode(codeForm("001234"))).toMatchObject({ url: "/me" });
    state.pending!.next = "/invite/" + "a".repeat(64);
    expect(await verifySignupCode(codeForm("001234"))).toMatchObject({ url: state.pending!.next });
  });
  it("handles verification throttling and network failure without reflecting provider payloads", async () => {
    state.verify.mockResolvedValue({ data: {}, error: { status: 429 } });
    expect(await verifySignupCode(codeForm("001234"))).toMatchObject({ ok: false, message: expect.stringContaining("محاولات") });
    state.verify.mockRejectedValue(new Error("synthetic private provider details"));
    expect(JSON.stringify(await verifySignupCode(codeForm("001234")))).not.toContain("private provider");
  });
});

describe("signup resend", () => {
  it("calls resend signup, never passwordless sign-in, and persists the cooldown", async () => {
    expect(await resendSignupCode()).toMatchObject({ ok: true, retryAt: expect.any(Number) });
    expect(state.resend).toHaveBeenCalledWith({ type: "signup", email: "otp@example.test" });
    expect(state.write).toHaveBeenCalledWith(expect.objectContaining({ email: "otp@example.test", resendAt: expect.any(Number) }));
  });
  it("denies duplicate resend attempts during the server cookie cooldown", async () => {
    state.pending!.resendAt = Date.now() + 60000;
    expect((await resendSignupCode()).ok).toBe(false);
    expect(state.resend).not.toHaveBeenCalled();
  });
  it.each([429, 500])("does not report success when the provider fails (%s)", async status => {
    state.resend.mockResolvedValue({ error: { status } });
    expect((await resendSignupCode()).ok).toBe(false);
  });
  it("does not report success during network failure", async () => {
    state.resend.mockRejectedValue(new Error("network"));
    expect((await resendSignupCode()).ok).toBe(false);
  });
});
