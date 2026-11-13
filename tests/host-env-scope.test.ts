import { expect, it } from "vitest";
import { hostEnvironmentPlan } from "../scripts/host-env-scope.mjs";
const production = { APP_URL: "https://production.example.test", NEXT_PUBLIC_SUPABASE_URL: "https://prod-project.supabase.co", DATABASE_URL: "synthetic-db-value", SUPABASE_SERVICE_ROLE_KEY: "synthetic-only" };
const preview = { ...production, APP_URL: "https://preview.example.test", NEXT_PUBLIC_SUPABASE_URL: "https://preview-project.supabase.co" };
it("never fans production configuration out to preview or development", () => {
  const plan = hostEnvironmentPlan(production);
  expect(plan.every(variable => variable.target.length === 1 && variable.target[0] === "production")).toBe(true);
  expect(plan.find(variable => variable.key === "DATABASE_URL")?.type).toBe("encrypted");
  expect(plan.find(variable => variable.key === "SUPABASE_SERVICE_ROLE_KEY")?.type).toBe("encrypted");
});
it("refuses a non-production target sharing production data or app origin", () => {
  expect(() => hostEnvironmentPlan(production, "preview", production)).toThrow("separate Supabase");
  expect(() => hostEnvironmentPlan({ ...preview, NEXT_PUBLIC_SUPABASE_URL: production.NEXT_PUBLIC_SUPABASE_URL + "/" }, "development", production)).toThrow("separate Supabase");
  expect(() => hostEnvironmentPlan({ ...preview, APP_URL: production.APP_URL }, "preview", production)).toThrow("separate application");
  expect(() => hostEnvironmentPlan(preview, "preview")).toThrow("Production reference");
});
it("allows an explicitly separated single test target and rejects unknown targets", () => {
  expect(hostEnvironmentPlan(preview, "preview", production).every(variable => variable.target[0] === "preview")).toBe(true);
  expect(() => hostEnvironmentPlan(preview, "all", production)).toThrow("one deployment");
});
