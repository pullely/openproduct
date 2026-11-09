import { defineConfig } from "vitest/config";

// OV3 — the pg suite's template is built once per run (src/pg/global-setup.ts)
// and restored per test; every other file is untouched by this config.
export default defineConfig({
  test: {
    globalSetup: ["src/pg/global-setup.ts"],
  },
});
