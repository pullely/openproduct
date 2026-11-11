// The walk: what the synthetic fetches, in what order, as whom (OO1).
//
// AS AN ANONYMOUS VISITOR (OO-4). No cookie, no bearer, nothing that would
// make this a second class of reader; the page it sees is the byte-identical
// page everybody sees (I6), and it can never be the reason a page stops
// caching. It does say who it is in `user-agent`, because an honest reader
// identifies itself and because somebody reading the request log deserves to
// know which five requests every five minutes are ours.
//
// THE ORDER, and why:
//
//   1. /health on the gateway    — the instrument RS1 built; whether each
//                                  phase ran. Unreachable here is the first
//                                  and loudest finding and the rest waits.
//   2. /  with `no-cache`        — OO-B: the synthetic is most of a quiet
//                                  site's traffic and would keep the document
//                                  warm; this read refreshes the colo copy
//                                  so the NEXT read measures the cache rather
//                                  than the synthetic's own footprint.
//   3. /  plain                  — the sample: `cf-cache-status`, the title.
//   4. /v1/products?limit=1      — a seeded slug: the catalogue's first card,
//                                  and when it was published, so the search
//                                  promise has something concrete to check.
//   5. /v1/search?q=<slug>       — does search answer for it.
//   6. /<slug>                   — the listing page answers and is titled.
//
// Every fetch is bounded by a timeout and every failure is a fact in the
// observation rather than an exception: a walk that threw on its first hop
// would report nothing about the other five.

import type { SweepPhase } from "@openproduct/contracts";

import type { Env } from "./env.js";

export const FETCH_TIMEOUT_MS = 10_000;
export const USER_AGENT = "openproduct-synthetic/1 (the reader of /health; openproduct-operations OO1)";

export interface PhaseSeen {
  readonly healthy: boolean;
  readonly reason: string | null;
  /** When the phase last ran, as /health says; OO3 holds a deploy to it. */
  readonly lastRunAt: string | null;
}

/** OO3 — which build answered /health. */
export interface BuildSeen {
  readonly version: string | null;
  readonly deployedAt: string | null;
}

/**
 * OO3 — RS4's four signed findings, re-walked every cycle. `null` is "could
 * not be asked" (no slug to upvote, the site down), never a verdict.
 *
 *   upvoteGate    a signed-out upvote is refused: POST /me/endorse with
 *                 `accept: application/json` answers 401 (P0·02)
 *   signinOwned   /signin is openproduct's own page, titled as such (P0·03)
 *
 * The other two — the front page carries the brand, search answers for the
 * seeded slug — are already in `front.titled` and `search.found`.
 */
export interface Rs4Seen {
  readonly upvoteGate: boolean | null;
  readonly signinOwned: boolean | null;
}

export interface Observation {
  readonly health: {
    /** The gateway answered 2xx with a document. */
    readonly reachable: boolean;
    readonly status: number | null;
    /** `null` when the gateway answered but could not ask core (`sweep.reachable: false`). */
    readonly phases: Partial<Record<SweepPhase, PhaseSeen>> | null;
    readonly build: BuildSeen;
  };
  readonly rs4: Rs4Seen;
  readonly front: {
    readonly reachable: boolean;
    readonly status: number | null;
    /** The plain read's `cf-cache-status`, upper-cased; `null` when absent. */
    readonly cacheStatus: string | null;
    /** `<title>` carries the brand. */
    readonly titled: boolean;
  };
  readonly seeded: {
    readonly reachable: boolean;
    readonly slug: string | null;
    readonly publishedAt: string | null;
  };
  readonly search: {
    /** `null` when there was no slug to search for. */
    readonly reachable: boolean | null;
    readonly found: boolean | null;
  };
  readonly listing: {
    readonly reachable: boolean;
    readonly status: number | null;
    readonly titled: boolean;
  } | null;
  readonly durationMs: number;
}

type Fetched =
  | { ok: true; status: number; headers: Headers; text: string }
  | { ok: false; status: number | null };

async function read(fetchImpl: typeof fetch, url: string, extra: Record<string, string> = {}, method: "GET" | "POST" = "GET"): Promise<Fetched> {
  try {
    const res = await fetchImpl(url, {
      method,
      headers: { "user-agent": USER_AGENT, accept: "application/json, text/html;q=0.9", ...extra },
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, status: res.status, headers: res.headers, text: await res.text() };
  } catch {
    return { ok: false, status: null };
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function titled(html: string): boolean {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return m !== null && /openproduct/i.test(m[1] ?? "");
}

interface HealthDocument {
  data?: {
    build?: { version?: unknown; deployedAt?: unknown };
    checks?: { sweep?: { reachable?: boolean; phases?: Array<{ phase?: string; healthy?: boolean; reason?: string | null; lastRunAt?: string | null }> } };
  };
}

const NO_BUILD: BuildSeen = { version: null, deployedAt: null };

function buildOf(doc: unknown): BuildSeen {
  const build = (doc as HealthDocument)?.data?.build;
  if (!build || typeof build.version !== "string" || build.version.length === 0) return NO_BUILD;
  return { version: build.version, deployedAt: typeof build.deployedAt === "string" ? build.deployedAt : null };
}

function phasesOf(doc: unknown): Partial<Record<SweepPhase, PhaseSeen>> | null {
  const sweep = (doc as HealthDocument)?.data?.checks?.sweep;
  if (!sweep || sweep.reachable === false || !Array.isArray(sweep.phases)) return null;
  const out: Partial<Record<SweepPhase, PhaseSeen>> = {};
  for (const p of sweep.phases) {
    if (typeof p.phase !== "string" || typeof p.healthy !== "boolean") continue;
    out[p.phase as SweepPhase] = {
      healthy: p.healthy,
      reason: typeof p.reason === "string" ? p.reason : null,
      lastRunAt: typeof p.lastRunAt === "string" ? p.lastRunAt : null,
    };
  }
  return out;
}

export async function walk(
  env: Pick<Env, "API_ORIGIN" | "SITE_ORIGIN">,
  fetchImpl: typeof fetch,
  now: () => number = Date.now,
): Promise<Observation> {
  const startedAt = now();
  const api = (env.API_ORIGIN ?? "").replace(/\/$/, "");
  const site = (env.SITE_ORIGIN ?? "").replace(/\/$/, "");

  // 1. the instrument
  const health = await read(fetchImpl, `${api}/health`);
  const healthDoc = health.ok ? parseJson(health.text) : null;
  const healthSeen = health.ok
    ? { reachable: true, status: health.status, phases: phasesOf(healthDoc), build: buildOf(healthDoc) }
    : { reachable: false, status: health.status, phases: null, build: NO_BUILD };

  // 2. refresh the colo copy; 3. the sample
  await read(fetchImpl, `${site}/`, { "cache-control": "no-cache" });
  const front = await read(fetchImpl, `${site}/`);
  const frontSeen = front.ok
    ? {
        reachable: true,
        status: front.status,
        cacheStatus: front.headers.get("cf-cache-status")?.toUpperCase() ?? null,
        titled: titled(front.text),
      }
    : { reachable: false, status: front.status, cacheStatus: null, titled: false };

  // 4. a seeded slug
  const products = await read(fetchImpl, `${api}/v1/products?limit=1`);
  const card = products.ok
    ? ((parseJson(products.text) as { data?: { products?: Array<{ slug?: unknown; publishedAt?: unknown }> } })?.data?.products?.[0] ?? null)
    : null;
  const slug = typeof card?.slug === "string" && /^[a-z0-9-]+$/.test(card.slug) ? card.slug : null;
  const seeded = {
    reachable: products.ok,
    slug,
    publishedAt: typeof card?.publishedAt === "string" ? card.publishedAt : null,
  };

  // 5. does search answer for it; 6. does the page
  let search: Observation["search"] = { reachable: null, found: null };
  let listing: Observation["listing"] = null;
  if (slug) {
    const found = await read(fetchImpl, `${api}/v1/search?q=${encodeURIComponent(slug)}&limit=10`);
    const results = found.ok
      ? ((parseJson(found.text) as { data?: { results?: Array<{ kind?: unknown; entityId?: unknown }> } })?.data?.results ?? [])
      : [];
    search = {
      reachable: found.ok,
      found: found.ok ? results.some((r) => r.kind === "product" && r.entityId === slug) : null,
    };
    const page = await read(fetchImpl, `${site}/${slug}`);
    listing = page.ok
      ? { reachable: true, status: page.status, titled: titled(page.text) }
      : { reachable: false, status: page.status, titled: false };
  }

  // 7. RS4's door: /signin is openproduct's own page. 8. RS4's gate: a
  //    signed-out upvote is refused, and with `accept: application/json` the
  //    refusal is a 401 rather than a redirect to follow. Both only when the
  //    site answered at all — a down site is `unreachable`, not a failed walk.
  let rs4: Rs4Seen = { upvoteGate: null, signinOwned: null };
  if (frontSeen.reachable) {
    const signin = await read(fetchImpl, `${site}/signin`);
    const signinOwned = signin.ok ? titled(signin.text) : false;
    let upvoteGate: boolean | null = null;
    if (slug) {
      try {
        const res = await fetchImpl(`${site}/me/endorse?slug=${encodeURIComponent(slug)}`, {
          method: "POST",
          headers: { "user-agent": USER_AGENT, accept: "application/json" },
          redirect: "manual",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        upvoteGate = res.status === 401;
      } catch {
        upvoteGate = false;
      }
    }
    rs4 = { upvoteGate, signinOwned };
  }

  return { health: healthSeen, front: frontSeen, seeded, search, listing, rs4, durationMs: Math.max(0, now() - startedAt) };
}
