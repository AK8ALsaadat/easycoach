import { expect, it, vi } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const signIn = vi.hoisted(() => vi.fn(async () => ({ error: { message: "Invalid login credentials" } })));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/server", () => ({
  localMode: () => false,
  loginLocal: vi.fn(),
  safeNext: () => "/coach",
  snapshot: vi.fn(),
  readableError: (error: { message?: string }) => error.message ?? "خطأ",
  supabase: async () => ({ auth: { signInWithPassword: signIn } }),
  actor: vi.fn(), hash: vi.fn(), rpc: vi.fn(),
}));
import { loginAction } from "@/app/actions";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

it("rejects test/test at the login form before reaching authentication", async () => {
  const result = await loginAction(form({ email: "test", password: "test", next: "/coach" }));
  expect(result.ok).toBe(false);
  expect(signIn).not.toHaveBeenCalled();
});

it("has no demo route, demo action or demo credentials anywhere in the app", () => {
  expect(existsSync("app/demo")).toBe(false);
  expect(existsSync("app/demo-actions.ts")).toBe(false);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(tsx?|mjs|json|css)$/.test(name)) files.push(full);
    }
  };
  ["app", "components", "lib", "proxy.ts"].forEach((entry) => (statSync(entry).isDirectory() ? walk(entry) : files.push(entry)));
  const forbidden = /test@demo|DEMO_AUTH_PASSWORD|APP_MODE|demoLogin|href="\/demo"|حساب تجريبي|اسم المستخدم: test|مسودة للمراجعة/;
  expect(files.filter((file) => forbidden.test(readFileSync(file, "utf8")))).toEqual([]);
});
