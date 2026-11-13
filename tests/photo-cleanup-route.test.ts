import { beforeEach, afterEach, expect, it, vi } from "vitest";
const run = vi.hoisted(() => vi.fn());
vi.mock("@/lib/photo-cleanup-worker", () => ({ runPhotoCleanupBatch: run }));
import { GET } from "@/app/api/maintenance/photo-cleanup/route";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("CRON_SECRET", "s".repeat(64)); });
afterEach(() => vi.unstubAllEnvs());
it("never runs without scheduler configuration or a valid server-only bearer credential", async () => {
  expect((await GET(new Request("https://example.test/api/maintenance/photo-cleanup"))).status).toBe(401);
  expect((await GET(new Request("https://example.test/api/maintenance/photo-cleanup", { headers: { Authorization: "Bearer wrong" } }))).status).toBe(401);
  vi.stubEnv("CRON_SECRET", ""); expect((await GET(new Request("https://example.test/api/maintenance/photo-cleanup"))).status).toBe(503);
  expect(run).not.toHaveBeenCalled();
});
it("returns counts only and reports failed maintenance without leaking upstream errors", async () => {
  const request = () => new Request("https://example.test/api/maintenance/photo-cleanup", { headers: { Authorization: "Bearer " + "s".repeat(64) } });
  run.mockResolvedValueOnce({ removed: 2, failed: 1, pendingInNextBatch: 1 });
  const result = await GET(request()); expect(result.status).toBe(200); expect(await result.json()).toEqual({ removed: 2, failed: 1, pendingInNextBatch: 1 });
  run.mockRejectedValueOnce(Error("sensitive-upstream-value")); const failed = await GET(request()); expect(failed.status).toBe(503); expect(await failed.text()).not.toContain("sensitive-upstream-value");
});
