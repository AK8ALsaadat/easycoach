import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ adminClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: state.adminClient }));
import { emailHasAccount } from "@/lib/registered-email";

/** One "profiles" read: select(...).in(...).limit(...) resolves to the result. */
function profiles(result: unknown) {
  const query = { select: () => query, in: vi.fn(() => query), limit: () => Promise.resolve(result) };
  state.adminClient.mockReturnValue({ from: () => query });
  return query;
}

beforeEach(() => { state.adminClient.mockReset(); vi.spyOn(console, "error").mockImplementation(() => {}); });

it("reports an address that already has an account", async () => {
  const query = profiles({ data: [{ id: "owner" }], error: null });
  expect(await emailHasAccount("Owner@Example.Test")).toBe(true);
  // The stored address is normalized; the exact spelling covers older rows.
  expect(query.in).toHaveBeenCalledWith("email", ["owner@example.test", "Owner@Example.Test"]);
});

it("reports a free address without a second lookup spelling", async () => {
  const query = profiles({ data: [], error: null });
  expect(await emailHasAccount("new@example.test")).toBe(false);
  expect(query.in).toHaveBeenCalledWith("email", ["new@example.test"]);
});

it("never blocks registration when the lookup is unavailable or fails", async () => {
  state.adminClient.mockImplementation(() => { throw new Error("Admin credentials are not configured"); });
  expect(await emailHasAccount("new@example.test")).toBe(false);
  profiles({ data: null, error: { code: "42501", message: "permission denied" } });
  expect(await emailHasAccount("new@example.test")).toBe(false);
});

it("treats an empty address as free instead of querying for it", async () => {
  expect(await emailHasAccount("   ")).toBe(false);
  expect(state.adminClient).not.toHaveBeenCalled();
});
