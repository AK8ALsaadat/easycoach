import { beforeEach, expect, it, vi } from "vitest";
import path from "node:path";
const state = vi.hoisted(() => ({
  user: "11111111-1111-4111-8111-111111111111" as string | null,
  ticket: "33333333-3333-4333-8333-333333333333",
  file: "22222222-2222-4222-8222-222222222222",
  read: vi.fn(async () => Buffer.from([255, 216, 255, 217])),
}));
vi.mock("node:fs/promises", () => ({ readFile: state.read }));
vi.mock("@/lib/server", () => ({ actor: async () => state.user ? { id: state.user } : null, localMode: () => true, rpc: vi.fn() }));
vi.mock("@/lib/local-db", () => ({ getLocalDatabase: async () => ({ query: async (_sql: string, values: unknown[]) => ({
  rows: values[0] === state.ticket && values[1] === "11111111-1111-4111-8111-111111111111"
    ? [{ id: state.ticket, attachment_path: `11111111-1111-4111-8111-111111111111/${state.file}` }] : [],
}) }) }));
vi.mock("@/lib/supabase/admin", () => ({ adminSupportClient: vi.fn() }));
vi.mock("@/lib/progress-photos", () => ({ validPhoto: (bytes: Uint8Array, mime: string) => mime === "image/jpeg" && bytes[0] === 255 }));
import { GET } from "@/app/api/support/attachments/[id]/route";
beforeEach(() => { state.user = "11111111-1111-4111-8111-111111111111"; state.read.mockClear(); });
it("reads the saved attachment UUID instead of the unrelated ticket UUID", async () => {
  const response = await GET(new Request("http://localhost/api/support/attachments/" + state.ticket), { params: Promise.resolve({ id: state.ticket }) });
  expect(response.status).toBe(200);
  expect(state.read).toHaveBeenCalledWith(path.join(process.cwd(), "data/support-attachments", state.file));
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("does not read a file for another author or an anonymous request", async () => {
  state.user = "44444444-4444-4444-8444-444444444444";
  expect((await GET(new Request("http://localhost/api/support/attachments/" + state.ticket), { params: Promise.resolve({ id: state.ticket }) })).status).toBe(404);
  state.user = null;
  expect((await GET(new Request("http://localhost/api/support/attachments/" + state.ticket), { params: Promise.resolve({ id: state.ticket }) })).status).toBe(401);
  expect(state.read).not.toHaveBeenCalled();
});
