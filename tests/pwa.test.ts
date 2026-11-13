import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/font/google", () => ({ IBM_Plex_Sans_Arabic: () => ({ className: "" }) }));
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import sharp from "sharp";
import manifest from "@/app/manifest";
import { GET as offlinePage } from "@/app/offline/route";
import { metadata } from "@/app/layout";
import { OFFLINE_PLAN_URL, PLAN_CACHE } from "@/lib/pwa";
import { offlinePlan } from "@/lib/offline-plan";
import { blankContent, type Snapshot } from "@/lib/model";
import { flushQueue, queueWeight, readQueue } from "@/lib/offline-queue";

const root = process.cwd();

describe("web app manifest", () => {
  const m = manifest();
  it("is installable, Arabic and right-to-left, starting at the trainee portal", () => {
    expect(m).toMatchObject({ name: "إيزي كوتش", short_name: "إيزي كوتش", start_url: "/me", scope: "/", display: "standalone", dir: "rtl", lang: "ar" });
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it("ships 192, 512 and maskable icons with matching pixel sizes", async () => {
    const icons = m.icons ?? [];
    expect(icons.some((i) => i.sizes === "192x192")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
    for (const icon of icons) {
      const meta = await sharp(path.join(root, "public", icon.src)).metadata();
      expect(`${meta.width}x${meta.height}`).toBe(icon.sizes);
    }
    const apple = await sharp(path.join(root, "public/icons/apple-touch-icon.png")).metadata();
    expect(apple.width).toBe(180);
  });
  it("adds the iOS home-screen tags", () => {
    expect(metadata.appleWebApp).toMatchObject({ capable: true });
    expect(metadata.other?.["apple-mobile-web-app-capable"]).toBe("yes");
    expect(JSON.stringify(metadata.icons)).toContain("apple-touch-icon");
  });
});

describe("service worker", () => {
  async function loadWorker() {
    const source = await readFile(path.join(root, "public/sw.js"), "utf8");
    const self: Record<string, unknown> = { location: { href: "https://app.example/sw.js?v=test", origin: "https://app.example" }, addEventListener: () => undefined };
    vm.runInNewContext(source, { self, URL, caches: {}, fetch, Response });
    return { source, route: self.__easycoachRoute as (url: URL, request: { method: string; mode?: string; headers: Headers }) => string };
  }
  const request = (method = "GET", mode = "cors", headers: Record<string, string> = {}) => ({ method, mode, headers: new Headers(headers) });
  const at = (p: string) => new URL(p, "https://app.example");

  it("stays in sync with the app constants", async () => {
    const { source } = await loadWorker();
    expect(source).toContain(`const PLAN_CACHE = "${PLAN_CACHE}"`);
    expect(source).toContain(`const OFFLINE_PLAN_URL = "${OFFLINE_PLAN_URL}"`);
  });
  it("caches build assets first and the plan network-first", async () => {
    const { route } = await loadWorker();
    expect(route(at("/_next/static/chunks/app.js"), request())).toBe("static");
    expect(route(at("/icons/icon-192.png"), request())).toBe("static");
    expect(route(at(OFFLINE_PLAN_URL), request())).toBe("plan");
    expect(route(at("/me"), request("GET", "navigate"))).toBe("navigate");
  });
  it("never caches coach pages, auth, other APIs, personal links or progress photos", async () => {
    const { route, source } = await loadWorker();
    for (const p of ["/coach", "/coach/clients", "/api/progress-photos/abc", "/api/export", "/api/media/x", "/login", "/auth/callback", "/access/1", "/p/token", "/invite/abc", "/upload/t"])
      expect(route(at(p), request()), p).toBe("bypass");
    expect(route(at("/me"), request("POST"))).toBe("bypass");
    expect(route(at("/me?_rsc=1"), request())).toBe("bypass");
    expect(route(new URL("https://cdn.example/x.js"), request())).toBe("bypass");
    // Navigations go to the network only; the worker never stores page HTML.
    const navigate = source.slice(source.indexOf("async function navigate"), source.indexOf('self.addEventListener("fetch"'));
    expect(navigate).not.toContain("cache.put");
    expect(source).toContain('"CLEAR_PRIVATE"');
  });
  it("serves an Arabic offline page without external scripts", async () => {
    const response = offlinePage();
    const html = await response.text();
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("أنت غير متصل بالإنترنت الآن");
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toContain("innerHTML");
  });
});

describe("offline plan", () => {
  it("keeps only the program and nutrition, never personal or financial data", () => {
    const content = structuredClone(blankContent);
    content.days[0].exercises[0].name = "قرفصاء";
    const data = {
      profile: { id: "t", role: "trainee", name: "متدرب", email: "secret@example.test" },
      clients: [{ id: "c", coach_id: "k", trainee_user_id: "t", archived: false, name: "متدرب سري", email: "secret@example.test", phone: "0500000000" }],
      programs: [{ id: "p", client_id: "c", name: "برنامج", published_at: "2026-11-01T10:00:00Z", content }],
      weights: [{ client_id: "c", entry_date: "2026-11-01", weight: 93.7 }],
      payments: [{ amount: 777 }],
      coach_branding: [{ coach_id: "k", name: "المدرب" }],
      management: { records: [{ client_id: "c", kind: "message", payload: { text: "رسالة خاصة" }, entry_date: "2026-11-01", created_at: "2026-11-01" }] },
    } as unknown as Snapshot;
    const plan = offlinePlan(data);
    const text = JSON.stringify(plan);
    expect(plan.plans[0].program?.days[0].exercises[0].name).toBe("قرفصاء");
    for (const secret of ["secret@example.test", "0500000000", "93.7", "777", "رسالة خاصة", "متدرب سري"]) expect(text).not.toContain(secret);
  });
});

describe("offline weight queue", () => {
  const original = globalThis.window;
  afterEach(() => Object.defineProperty(globalThis, "window", { configurable: true, value: original }));
  function fakeWindow() {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) }, dispatchEvent: () => true },
    });
  }
  it("keeps one pending value per day and sends it when the connection returns", async () => {
    fakeWindow();
    queueWeight({ client_id: "c", entry_date: "2026-11-12", weight: 80 });
    queueWeight({ client_id: "c", entry_date: "2026-11-12", weight: 80.4 });
    queueWeight({ client_id: "c", entry_date: "2026-11-13", weight: 80.1 });
    expect(readQueue().map((q) => q.weight)).toEqual([80.4, 80.1]);
    let offline = true;
    const sent: number[] = [];
    const send = async (item: { weight: number }) => {
      if (offline) throw new TypeError("Failed to fetch");
      sent.push(item.weight);
      return { ok: true };
    };
    expect(await flushQueue(send)).toMatchObject({ sent: 0, pending: 2 });
    offline = false;
    expect(await flushQueue(send)).toMatchObject({ sent: 2, pending: 0 });
    expect(sent).toEqual([80.4, 80.1]);
  });
  it("drops an entry the server rejected and reports why", async () => {
    fakeWindow();
    queueWeight({ client_id: "c", entry_date: "2020-01-01", weight: 80 });
    const result = await flushQueue(async () => ({ ok: false, message: "اختر يومًا خلال السنة الماضية" }));
    expect(result).toMatchObject({ sent: 0, pending: 0, errors: ["اختر يومًا خلال السنة الماضية"] });
  });
});
