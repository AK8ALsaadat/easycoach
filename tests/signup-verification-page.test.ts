import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

const state = vi.hoisted(() => ({ actor: vi.fn(), snapshot: vi.fn(), pending: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("@/lib/server", () => ({ actor: state.actor, snapshot: state.snapshot, safeNext: (next?: string) => next || "/coach" }));
vi.mock("@/lib/pending-signup", () => ({ readPendingSignup: state.pending }));
vi.mock("@/components/brand", () => ({ Brand: () => null }));
vi.mock("@/components/legal-links", () => ({ LegalLinks: () => null }));
vi.mock("@/app/signup-verification-actions", () => ({ signOutForSignupVerification: async () => {} }));
vi.mock("@/components/signup-verification", () => ({ SignupVerification: ({ email }: { email: string }) => createElement("input", { id: "signup-otp", "data-email": email }) }));
import VerifyEmailPage from "@/app/verify-email/page";

beforeEach(() => {
  vi.clearAllMocks();
  state.pending.mockResolvedValue({ email: "new@example.test", next: "/coach", resendAt: 0 });
  state.actor.mockResolvedValue(null);
  state.snapshot.mockResolvedValue({ profile: { role: "coach" } });
});

it("keeps a new signup on verification when a different account is still signed in", async () => {
  state.actor.mockResolvedValue({ email: "previous@example.test" });
  const html = renderToStaticMarkup(await VerifyEmailPage());
  expect(html).toContain("new@example.test");
  expect(html).toContain("previous@example.test");
  expect(html).toContain("تسجيل الخروج وإكمال التحقق");
  expect(html).not.toContain('id="signup-otp"');
  expect(state.snapshot).not.toHaveBeenCalled();
});

it("shows the code input for the pending email without a previous session", async () => {
  const html = renderToStaticMarkup(await VerifyEmailPage());
  expect(html).toContain('data-email="new@example.test"');
  expect(html).toContain('id="signup-otp"');
  expect(state.snapshot).not.toHaveBeenCalled();
});

it("continues onboarding only when the signed-in email matches the pending email", async () => {
  state.actor.mockResolvedValue({ email: "NEW@example.test" });
  await expect(VerifyEmailPage()).rejects.toThrow("redirect:/start");
});

it("asks for registration again if the pending signup expired and nobody is signed in", async () => {
  state.pending.mockResolvedValue(null);
  await expect(VerifyEmailPage()).rejects.toThrow("redirect:/login?register=1");
});

it("preserves the destination for an already verified session without a pending signup", async () => {
  state.pending.mockResolvedValue(null);
  state.actor.mockResolvedValue({ email: "previous@example.test" });
  await expect(VerifyEmailPage()).rejects.toThrow("redirect:/start");
});
