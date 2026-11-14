// The worker's cache posture, as committed (openproduct-performance OPP13).
//
// `incremental-cache.test.ts` proves the two overrides behave; this file
// proves they are WIRED, because an override that is written and not
// configured is the exact shape this epic keeps finding — `withTimings` was
// exported and called by nobody for a week (OPP6). Source-level, stated as
// such: the lane is module-level, and the behavioural half was verified under
// workerd on 2026-09-09 (a `STALE` serve at 19 ms and a fresh `HIT` two
// seconds later, recorded in IMPLEMENTATION-STATUS.md).

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(__dirname, "../../../web");
const CORE = resolve(__dirname, "../../../core");
const read = (file: string) => readFileSync(resolve(WEB, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const jsonc = (text: string) => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));

describe("open-next.config.ts", () => {
  const config = code("open-next.config.ts");

  it("caches in the Workers Cache API — no binding, so D8 stays untouched", () => {
    expect(config).toContain("createCacheApiIncrementalCache(");
    expect(config).toContain("open: openWorkersCache");
    expect(config).toContain("incrementalCache: incrementalCache");
    expect(config).not.toMatch(/kvIncrementalCache|r2IncrementalCache|NEXT_INC_CACHE/);
  });

  it("re-renders a stale document in the background, in-process", () => {
    expect(config).toContain("createInProcessQueue(");
    expect(config).toContain("self: registeredSelfFetch");
    expect(config).toContain("queue: queue");
    // Neither OpenNext queue that needs `WORKER_SELF_REFERENCE`.
    expect(config).not.toMatch(/memoryQueue|doQueue|memory-queue|do-queue/);
  });

  it("serves a stored document without running Next", () => {
    expect(config).toContain("enableCacheInterception: true");
  });

  it("keys the store by build, so a deploy never reads the previous build's pages", () => {
    expect(config).toContain("process.env.NEXT_BUILD_ID");
  });
});

describe("worker.ts", () => {
  const worker = code("worker.ts");
  const wrangler = read("wrangler.jsonc");

  it("is the worker's entry, and wraps the generated one", () => {
    expect(jsonc(wrangler).main).toBe("worker.ts");
    expect(worker).toContain('from "./.open-next/worker.js"');
    expect(worker).toContain("registerSelfFetch(");
    expect(worker).toContain("export default");
  });

  it("keeps the Durable Object classes the generated entry exports", () => {
    for (const name of ["DOQueueHandler", "DOShardedTagCache", "BucketCachePurge"]) {
      expect(worker).toContain(name);
    }
  });

  it("binds nothing new — the store needs none, and the census relies on that", () => {
    const parsed = jsonc(wrangler) as Record<string, unknown>;
    for (const key of ["services", "kv_namespaces", "r2_buckets", "durable_objects", "queues", "d1_databases"]) {
      expect([key, parsed[key] ?? null]).toEqual([key, null]);
    }
    expect(parsed.cache).toEqual({ enabled: true });
  });
});

describe("the one streamed public route has a skeleton", () => {
  it("/search draws its shape the moment the router takes the click", () => {
    const loading = read("src/app/search/loading.tsx");
    expect(loading).toContain("LoadingAnnouncement");
    expect(loading).toContain("export default function SearchLoading");
    // The same frame as the page — board `Search`'s 760px column, named once
    // in `search/frame.ts` (it was the shared `PAGE` column before OPR1) — so
    // nothing moves when the results land.
    expect(loading).toContain("<main className={SEARCH_COLUMN}>");
    expect(read("src/app/search/page.tsx")).toContain("<main className={SEARCH_COLUMN}>");
    expect(read("src/app/search/frame.ts")).toMatch(/export const SEARCH_COLUMN =\s*"[^"]*max-w-\[760px\]/);
  });
});

describe("the database-facing worker runs near the database", () => {
  it("openproduct-worker's placement names the database's AWS region", () => {
    const template = readFileSync(resolve(CORE, "wrangler.template.jsonc"), "utf-8");
    const parsed = jsonc(template.replace(/@@wiring\([^)]*\)@@/g, "x")) as {
      placement?: { mode?: string; hint?: string; region?: string };
    };
    // `infra/supabase/component.yaml` pins the database's region, and the
    // placement names that region and nothing else. It is the documented
    // `region` form: the openproduct account refuses the monorepo's
    // `{ mode: "smart", hint: "apac" }` (code 10023, OPN-8's first deploy).
    const supabase = readFileSync(
      resolve(__dirname, "../../../infra/supabase/component.yaml"),
      "utf-8",
    );
    const region = /supabaseRegion:\s*([a-z0-9-]+)/.exec(supabase)?.[1];
    expect(region).toBe("ap-southeast-1");
    expect(parsed.placement).toEqual({ region: `aws:${region}` });
  });
});

describe("the build is never replayed from the turbo cache", () => {
  // OpenNext imports `@vercel/og`'s wasm and font (the share cards draw an
  // ImageResponse) by the absolute path of the run that built the bundle, so a
  // bundle replayed into another run's work dir fails wrangler with ENOENT
  // (CI runs 38552109858 and 38553877234). The build always runs.
  it("apps/openproduct/web/turbo.json turns the build's cache off", () => {
    const turbo = JSON.parse(read("turbo.json")) as { tasks: { build: { cache?: boolean } } };
    expect(turbo.tasks.build.cache).toBe(false);
  });
});
