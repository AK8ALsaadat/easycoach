import { beforeEach, expect, it, vi } from "vitest";
import { POLICY_VERSION } from "@/lib/legal";
const state = vi.hoisted(() => ({ actor: vi.fn(), start: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw Error("redirect:" + url); } }));
vi.mock("@/lib/server", () => ({
  actor: state.actor, rpc: vi.fn(), requireCoachIdentity: vi.fn(), readableError: () => "تعذر الحفظ",
  isSessionExpired: (error: { code?: string }) => error?.code === "session_expired",
}));
vi.mock("@/lib/platform/server", () => ({ startPlatformTrial: state.start }));
import { startTrialAction } from "@/app/platform-actions";
function form(accepted = true) {
  const value = new FormData(); value.set("plan", "starter");
  if (accepted) value.set("terms_acceptance", POLICY_VERSION);
  return value;
}
beforeEach(() => { vi.clearAllMocks(); state.actor.mockResolvedValue({ id: "owner" }); state.start.mockReset().mockResolvedValue({ status: "trialing" }); });
it("returns missing acceptance to the same plan's review and never starts a trial", async () => {
  await expect(startTrialAction(form(false))).rejects.toThrow("redirect:/subscription/confirm?plan=starter&error=terms");
  expect(state.start).not.toHaveBeenCalled();
});
it("shows a visible review error on a failed trial request instead of navigating silently to the dashboard", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  state.start.mockRejectedValue(Object.assign(Error("private database detail"), { code: "XX000" }));
  await expect(startTrialAction(form())).rejects.toThrow("redirect:/subscription/confirm?plan=starter&error=start");
  expect(state.revalidate).not.toHaveBeenCalled();
});
it("starts the selected plan once and opens the successful workspace", async () => {
  await expect(startTrialAction(form())).rejects.toThrow("redirect:/coach?trial=started");
  expect(state.start).toHaveBeenCalledExactlyOnceWith("starter");
  expect(state.revalidate).toHaveBeenCalledWith("/", "layout");
});
it("preserves the chosen plan when login is required", async () => {
  state.actor.mockResolvedValue(null);
  await expect(startTrialAction(form())).rejects.toThrow("redirect:/login?register=1&next=%2Fstart%3Fplan%3Dstarter");
  expect(state.start).not.toHaveBeenCalled();
});
it("recovers an expired session without exposing provider errors", async () => {
  state.start.mockRejectedValue(Object.assign(Error("private auth detail"), { code: "session_expired" }));
  await expect(startTrialAction(form())).rejects.toThrow("redirect:/login?next=%2Fstart%3Fplan%3Dstarter");
});
