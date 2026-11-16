import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { pricingSignupHref } from "@/lib/pricing-signup";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), platformQuote: vi.fn(), platformState: vi.fn() }));
vi.mock("@/lib/server", () => ({ actor: mocks.actor }));
vi.mock("@/lib/platform/server", () => ({ platformQuote: mocks.platformQuote, platformState: mocks.platformState }));
vi.mock("@/components/plan-cards", () => ({ PlanCards: () => null, TrialHero: () => null }));
vi.mock("@/lib/runtime", () => ({ localPreview: () => true }));
import PricingPage from "@/app/pricing/page";
import { proxy } from "@/proxy";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it("serves /pricing without a redirect in free mode and captures first-touch attribution", async () => {
  vi.stubEnv("BILLING_ENABLED", "false");
  const response = await proxy(new NextRequest("https://easycoach.space/pricing?utm_source=tiktok&utm_campaign=launch&utm_medium=paid_social&utm_id=ad123"));
  expect(response.status).toBe(200);
  expect(response.headers.get("location")).toBeNull();
  expect(response.cookies.has("ec_first_touch")).toBe(true);
});

it("renders a public Arabic free plan and one signup CTA without querying the account or paid plans", async () => {
  vi.stubEnv("BILLING_ENABLED", "false");
  const params = { utm_source: "tiktok", utm_campaign: "إطلاق + تدريب", utm_medium: "paid_social", utm_id: "123" };
  const html = renderToStaticMarkup(await PricingPage({ searchParams: Promise.resolve(params) }));
  expect(html).toContain('dir="rtl"');
  expect(html).toContain('lang="ar"');
  expect(html).toContain("مجاناً لفترة محدودة");
  expect(html).toContain("خطة إيزي كوتش المجانية");
  expect(html).toContain("ريال حاليًا");
  const ctas = [...html.matchAll(/href="([^"]+)"[^>]*>ابدأ مجاناً/g)];
  expect(ctas).toHaveLength(1);
  const url = new URL(ctas[0][1].replaceAll("&amp;", "&"), "https://easycoach.space");
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("register")).toBe("1");
  for (const [key, value] of Object.entries(params)) expect(url.searchParams.get(key)).toBe(value);
  expect(mocks.actor).not.toHaveBeenCalled();
  expect(mocks.platformQuote).not.toHaveBeenCalled();
  expect(mocks.platformState).not.toHaveBeenCalled();
});

it("preserves repeated, empty and non-UTM query values while forcing registration mode", () => {
  const href = pricingSignupHref({ utm_campaign: ["first", "second"], utm_id: "", ttclid: "a_b-12", custom: "a+b & ع", register: "0", absent: undefined });
  const params = new URL(href, "https://easycoach.space").searchParams;
  expect(params.getAll("utm_campaign")).toEqual(["first", "second"]);
  expect(params.get("utm_id")).toBe("");
  expect(params.get("ttclid")).toBe("a_b-12");
  expect(params.get("custom")).toBe("a+b & ع");
  expect(params.getAll("register")).toEqual(["1"]);
  expect(params.has("absent")).toBe(false);
});

it("keeps closed subscription pages and checkout APIs protected", async () => {
  vi.stubEnv("BILLING_ENABLED", "false");
  expect((await proxy(new NextRequest("https://easycoach.space/subscription"))).status).toBe(307);
  expect((await proxy(new NextRequest("https://easycoach.space/api/platform/checkout"))).status).toBe(404);
});
