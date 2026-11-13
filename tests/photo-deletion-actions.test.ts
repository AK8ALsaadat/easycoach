import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ cleanup: vi.fn(), rpc: vi.fn(), credential: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/server", () => ({ rpc: mocks.rpc, localMode: () => true, readableError: (error: unknown) => (error as Error).message }));
vi.mock("@/lib/deleted-photo-cleanup", () => ({ cleanDeletedPhoto: mocks.cleanup }));
vi.mock("@/lib/portal-credentials", () => ({ resolvePortalCredential: mocks.credential }));
import { deleteProgressPhoto } from "@/app/photo-actions";
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks(); mocks.cleanup.mockReset(); mocks.rpc.mockResolvedValue({ id }); mocks.credential.mockResolvedValue({ key: "a".repeat(64), proof: "b".repeat(64) });
});
it("removes portal metadata then immediately removes authorized bytes", async () => {
  mocks.cleanup.mockResolvedValueOnce({ found: false, pending: false }).mockResolvedValueOnce({ found: true, pending: false });
  expect(await deleteProgressPhoto(id, "session:synthetic")).toMatchObject({ ok: true, cleanupPending: false });
  expect(mocks.rpc).toHaveBeenCalledWith("portal_management", expect.objectContaining({ command: "photo_delete", payload: { id } }), true);
  expect(mocks.cleanup.mock.invocationCallOrder[1]).toBeGreaterThan(mocks.rpc.mock.invocationCallOrder[0]);
});
it("reports pending physical deletion honestly without undoing the inaccessible metadata", async () => {
  mocks.cleanup.mockResolvedValueOnce({ found: false, pending: false }).mockRejectedValueOnce(Error("storage unavailable"));
  expect(await deleteProgressPhoto(id)).toMatchObject({ ok: true, cleanupPending: true });
});
it("recovers a response-lost deletion from its authorized queue without a second row deletion", async () => {
  mocks.cleanup.mockResolvedValueOnce({ found: true, pending: false });
  expect(await deleteProgressPhoto(id)).toMatchObject({ ok: true, cleanupPending: false });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("does not delete bytes when the authoritative metadata deletion is denied", async () => {
  mocks.cleanup.mockResolvedValueOnce({ found: false, pending: false }); mocks.rpc.mockRejectedValueOnce(Error("forbidden"));
  expect((await deleteProgressPhoto(id)).ok).toBe(false); expect(mocks.cleanup).toHaveBeenCalledTimes(1);
});
