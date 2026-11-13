// Shared PWA constants. public/sw.js keeps its own copies (it cannot import
// modules); tests/pwa.test.ts checks they stay in sync.
export const PWA_THEME = { dark: "#0b1220", light: "#f0f2f3" } as const;
/** Cache holding only the trainee's latest program and nutrition plan. */
export const PLAN_CACHE = "ec-plan-v1";
export const OFFLINE_PLAN_URL = "/api/offline-plan";
export const SW_URL = "/sw.js";
