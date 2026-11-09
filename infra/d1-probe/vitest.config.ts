import { defineConfig } from "vitest/config";

// One file, one local Worker: the tests share the bundle and the miniflare
// instance (beforeAll), and run in order — they reset the database between
// them, so they must not run concurrently.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
