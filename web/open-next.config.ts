// OpenNext Cloudflare adapter config for @openproduct/web.
//
// ─── BEFORE OPP13 ─────────────────────────────────────────────────────────
//
// Every override was "dummy": the component binds no R2/KV/D1, so the
// incremental cache, the tag cache and the queue cached, tagged and queued
// nothing. `revalidate = 60` on the public pages was therefore per-isolate at
// best; the real freshness guarantee was Workers Caching in front of this
// worker (`wrangler.jsonc`, OPP5), and a miss there — once per data centre per
// minute per route and per RSC variant, and every request after the sixty
// seconds because Cloudflare revalidates synchronously — was a full render.
// Measured in production on 2026-09-09: 1.7–2.5 s to first byte on a miss
// against 0.2–0.65 s on a hit.
//
// ─── AFTER ────────────────────────────────────────────────────────────────
//
// Three overrides, none of which needs a binding (D8 stays untouched):
//
//   incrementalCache   the Workers Cache API, shared across every isolate in
//                      a data centre — `src/opennext/cache-api-incremental-cache.ts`
//   queue              a background re-render through this worker's own
//                      handler — `src/opennext/in-process-queue.ts`, registered
//                      by `worker.ts`
//   cache interception a stored document is served WITHOUT running Next at
//                      all; Next runs only to render a document nobody in this
//                      data centre has rendered in the last five minutes
//
// Together they are stale-while-revalidate where it actually executes: a
// stale document leaves immediately from the Cache API and its replacement
// renders after the response. The tag cache stays "dummy" — nothing calls
// `revalidateTag`/`revalidatePath`, and OpenNext's tag lookups return "not
// revalidated" without one, which is the truthful answer.
//
// The public pages keep `revalidate = 60` and their `s-maxage=60` (OD-H, D2):
// this changes what a miss COSTS, not how stale a document may be.
import type { IncrementalCache, Queue } from "@opennextjs/aws/types/overrides.js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { defineCloudflareConfig } from "@opennextjs/cloudflare/config";

import {
  createCacheApiIncrementalCache,
  openWorkersCache,
} from "./src/opennext/cache-api-incremental-cache";
import { createInProcessQueue, registeredSelfFetch } from "./src/opennext/in-process-queue";

const incrementalCache = createCacheApiIncrementalCache({
  open: openWorkersCache,
  now: () => Date.now(),
  buildId: () => process.env.NEXT_BUILD_ID ?? "no-build-id",
});

const queue = createInProcessQueue({
  self: registeredSelfFetch,
  context: () => {
    try {
      const { env, ctx } = getCloudflareContext();
      return { env, ctx };
    } catch {
      return null;
    }
  },
  previewModeId: () => process.env.NEXT_PREVIEW_MODE_ID ?? "",
  log: (message) => console.warn(`[opennext-queue] ${message}`),
});

export default defineCloudflareConfig({
  // The two factories implement OpenNext's contracts structurally, without
  // importing its types, so the jest lane can drive them; this is the one
  // place the shapes meet, and `open-next.config.test.ts` pins the contract.
  incrementalCache: incrementalCache as unknown as IncrementalCache,
  queue: queue as unknown as Queue,
  enableCacheInterception: true,
});
