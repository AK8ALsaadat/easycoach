import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(".") } },
  test: {
    // Existing regression suites exercise the fully restored commercial mode.
    env: { BILLING_ENABLED: "true" },
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    reporters: ["verbose"],
    testTimeout: 30000,
  },
});
