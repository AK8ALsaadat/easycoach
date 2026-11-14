import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PlanCards } from "@/components/plan-cards";
import { planCodes, type PlatformQuote, type PlatformState } from "@/lib/platform/plans";
const quotes: PlatformQuote[] = planCodes.map((plan, index) => ({
  plan, limits: { clients: index === 3 ? null : [5, 30, 50][index], coaches: [1, 1, 3, 10][index], templates: index > 1 ? null : index === 0 ? 0 : 10 },
  base_halalas: [0, 29900, 49900, 69900][index], net_halalas: [0, 29900, 49900, 69900][index],
  vat_halalas: null, total_halalas: null, tax_mode: "unconfigured", discount: false, campaign_active: false,
  trial_available: plan !== "free", trial_campaign_active: true, trial_campaign_end: "2099-12-31T20:59:59Z",
  trial_days: 14, trial_used: false, provider_ready: false, server_now: "2026-11-14T12:00:00Z",
}));
const freeState: PlatformState = {
  mode: "managed", status: "free", billing_plan: "free", effective_plan: "free", cancel_at_period_end: false,
  trial_end: null, period_end: null, trial_used_at: null, locked_price_halalas: null, total_halalas: null, currency: "SAR",
  usage: { clients: 0, templates: 0, coaches: 1 }, limits: quotes[0].limits, billing_limits: quotes[0].limits,
  locked_clients: null, locked_templates: null, features: [], server_now: quotes[0].server_now,
};
it("sends an eligible owner to plan review, without starting a trial or collecting card data on the pricing card", () => {
  const html = renderToStaticMarkup(createElement(PlanCards, { quotes, state: freeState, signedIn: true, context: "pricing" }));
  for (const plan of ["starter", "pro", "business"]) expect(html).toContain(`/subscription/confirm?plan=${plan}`);
  expect(html).not.toContain("<form");
  expect(html).not.toContain('name="card');
});
it("does not offer coach trial actions to a signed-in account without an owner subscription", () => {
  const html = renderToStaticMarkup(createElement(PlanCards, { quotes, state: null, signedIn: true, context: "pricing" }));
  expect(html).not.toContain("/subscription/confirm");
  expect(html).not.toContain("register=1");
  expect(html).toContain("عرض خيارات حسابك");
});
it("preserves a guest's chosen plan through registration and discloses tax uncertainty", () => {
  const html = renderToStaticMarkup(createElement(PlanCards, { quotes, state: null, signedIn: false, context: "pricing" }));
  for (const plan of ["starter", "pro", "business"]) expect(html).toContain(encodeURIComponent(`/start?plan=${plan}`));
  expect(html).toContain("يُعرض الإجمالي بعد تحديد الضريبة وقبل أي دفع");
  expect(html).not.toContain("2099");
});
