import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server", () => ({
  hash: (value: string) => createHash("sha256").update(value).digest("hex"),
  localMode: () => false,
  localGuard: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ adminSupportClient: () => ({ rpc: mocks.rpc }) }));
import { portalExchangeRetryAfter } from "@/lib/portal-exchange-limit";

beforeEach(() => { vi.clearAllMocks(); });
const request = () => new Request("https://example.test/api/portal-session");

it("uses the privileged rate RPC with only a hash and returns its delay", async () => {
  mocks.rpc.mockResolvedValue({ data: 87, error: null });
  expect(await portalExchangeRetryAfter(request())).toBe(87);
  expect(mocks.rpc).toHaveBeenCalledWith("portal_exchange_rate_limit", { key_hash: expect.stringMatching(/^[a-f0-9]{64}$/) });
});

it("propagates infrastructure failures and rejects malformed limiter responses", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: Error("outage") });
  await expect(portalExchangeRetryAfter(request())).rejects.toThrow("outage");
  for (const data of [null, "0", -1, 901, 0.5]) {
    mocks.rpc.mockResolvedValueOnce({ data, error: null });
    await expect(portalExchangeRetryAfter(request())).rejects.toThrow("Invalid rate limit response");
  }
});
