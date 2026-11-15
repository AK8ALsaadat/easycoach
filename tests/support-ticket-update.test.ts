import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: "11111111-1111-4111-8111-111111111111" as string | null, query: vi.fn() }));
vi.mock("@/lib/server", () => ({ actor: async () => state.user ? { id: state.user } : null, localMode: () => true }));
vi.mock("@/lib/local-db", () => ({ getLocalDatabase: async () => ({ query: state.query }) }));
vi.mock("@/lib/supabase/admin", () => ({ adminSupportClient: vi.fn() }));
import { PATCH } from "@/app/api/support/tickets/[id]/route";
import { NextRequest } from "next/server";
const owner = "11111111-1111-4111-8111-111111111111", ticket = "22222222-2222-4222-8222-222222222222";
const request = (body: string, origin = "http://localhost") => new NextRequest("http://localhost/api/support/tickets/" + ticket, { method: "PATCH", body, headers: { origin } });
beforeEach(() => { vi.stubEnv("APP_URL", "http://localhost"); vi.stubEnv("SUPPORT_OWNER_USER_ID", owner); state.user=owner; state.query.mockReset(); });
it("rejects foreign and anonymous accounts before reading or updating the target ticket", async () => {
  for (const user of [ticket, null]) {
    state.user=user;
    expect((await PATCH(request('{"status":"closed"}'), { params: Promise.resolve({ id: ticket }) })).status).toBe(403);
  }
  expect(state.query).not.toHaveBeenCalled();
});
it("rejects forged origins, malformed ids, oversized bodies and invalid JSON without a write", async () => {
  expect((await PATCH(request('{}', "https://foreign.test"), { params: Promise.resolve({ id: ticket }) })).status).toBe(403);
  for (const [id, body, status] of [["invalid", '{}', 400], [ticket, '{', 400], [ticket, '{"status":"unknown"}', 400], [ticket, "x".repeat(1025), 413]] as const) {
    expect((await PATCH(request(body), { params: Promise.resolve({ id }) })).status).toBe(status);
  }
  expect(state.query).not.toHaveBeenCalled();
});
it("allows only the configured owner to update a validated ticket with bound parameters", async () => {
  expect((await PATCH(request('{"status":"closed"}'), { params: Promise.resolve({ id: ticket }) })).status).toBe(200);
  expect(state.query).toHaveBeenCalledWith(expect.any(String), ["closed", ticket]);
});
