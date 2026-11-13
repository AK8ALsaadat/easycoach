import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function worker(fetcher: typeof fetch) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const entries = new Map<string, Response>();
  const cache = {
    put: async (key: string, value: Response) => { entries.set(key, value); },
    match: async (key: string) => entries.get(key),
    delete: async (key: string) => entries.delete(key),
  };
  const caches = { open: async () => cache, delete: async () => { entries.clear(); return true; } };
  const self = {
    location: { href: "https://app.example/sw.js?v=test", origin: "https://app.example" },
    addEventListener: (type: string, fn: (event: unknown) => void) => { handlers[type] = fn; },
  };
  vm.runInNewContext(await readFile("public/sw.js", "utf8"), { self, URL, caches, fetch: fetcher, Response });
  async function request(path: string, method = "GET") {
    let response: Promise<Response> | undefined;
    const pending: Promise<unknown>[] = [];
    handlers.fetch({ request: new Request("https://app.example" + path, { method }), respondWith: (r: Promise<Response>) => { response = r; }, waitUntil: (p: Promise<unknown>) => pending.push(p) });
    await Promise.all(pending);
    return response;
  }
  return { entries, request };
}

it("clears a previous trainee's plan on direct login or logout requests", async () => {
  const w = await worker(fetch);
  w.entries.set("/api/offline-plan", new Response("previous trainee"));
  await w.request("/logout", "POST");
  expect(w.entries.size).toBe(0);
  w.entries.set("/api/offline-plan", new Response("previous trainee"));
  await w.request("/login");
  expect(w.entries.size).toBe(0);
});

it("does not let an in-flight old-account request refill the cache after login", async () => {
  let resolve!: (r: Response) => void;
  const remote = new Promise<Response>(r => { resolve = r; });
  const w = await worker((() => remote) as typeof fetch);
  const oldRequest = w.request("/api/offline-plan");
  await new Promise(r => setTimeout(r, 0));
  await w.request("/login");
  resolve(new Response('{"plans":["previous trainee"]}', { headers: { "Content-Type": "application/json" } }));
  await oldRequest;
  expect(w.entries.size).toBe(0);
});
