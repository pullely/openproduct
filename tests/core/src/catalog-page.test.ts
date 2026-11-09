// The catalogue, one page at a time (openproduct-scale OS1).
//
// What the wire carries: `next` on every page (null on the last, never
// absent), `total` as a count over the catalogue and not the page, a
// bounded `limit`, and a cursor this API did not issue refused rather than
// quietly served as a first page.

import {
  CATALOG_PAGE_KEYS,
  DIRECTORY_PAGE_KEYS,
  FRESHNESS_WINDOW_MS,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  decodeCursor,
  encodeCursor,
} from "@openproduct/contracts";
import type { OpenproductRepository, ProfileCardRecord } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { PublicHandlerDeps } from "@openproduct-worker/handlers/public";

const ENV = { ENVIRONMENT: "test" } as Env;
const NOW = new Date("2026-09-10T12:00:00.000Z");
const CATALOG = "https://openproduct.internal/internal/public/openproduct/catalog/products";
const DIRECTORY = "https://openproduct.internal/internal/public/openproduct/projects";

const cardRow = (slug: string, publishedAt: string): ProfileCardRecord =>
  ({
    slug,
    tagline: `About ${slug}`,
    stack: [],
    stackCanonical: [],
    category: null,
    hosting: null,
    pricing: null,
    licence: "MIT",
    roleOpeningCount: 0,
    openCommitments: [],
    hasLiveUrl: false,
    publishedAt,
    language: null,
    lastCommitAt: null,
    openIssues: null,
    observedAt: null,
    indexable: true,
  }) as unknown as ProfileCardRecord;

const ROWS = [cardRow("alpha", "2026-09-01T00:00:00.000Z"), cardRow("beta", "2026-08-01T00:00:00.000Z"), cardRow("gamma", "2026-07-01T00:00:00.000Z")];

interface Seen {
  cursor: unknown;
  limit: number;
  mergesSince: string;
  endorsementsSince: string;
}

function deps(seen: Seen[] = []): PublicHandlerDeps {
  return {
    now: () => NOW,
    repo: {
      async listPublicCardsPage(input: { cursor: { slug: string } | null; limit: number; mergesSince: string; endorsementsSince: string }) {
        seen.push({ cursor: input.cursor, limit: input.limit, mergesSince: input.mergesSince, endorsementsSince: input.endorsementsSince });
        const start = input.cursor === null ? 0 : ROWS.findIndex((r) => r.slug === input.cursor!.slug) + 1;
        const cards = ROWS.slice(start, start + input.limit);
        const last = cards[cards.length - 1];
        const more = start + input.limit < ROWS.length;
        return { cards, next: more && last ? { activity: null, publishedAt: last.publishedAt, slug: last.slug } : null };
      },
      async countPublishedWindows() {
        return { today: 0, week: 1, month: 3, total: 1204 };
      },
      // OS5 — never computed by default: the fakes below are the live join,
      // and a page served from it says so with a null moment.
      async listCataloguePage() {
        return { computedAt: null, cards: [], metrics: new Map(), media: new Map(), next: null, windows: { today: 0, week: 0, month: 0, total: 0 } };
      },
      async latestMetricsForSlugs() {
        return new Map();
      },
      async listPublicMediaForSlugs() {
        return new Map();
      },
      async countFollowers() {
        return new Map();
      },
    } as unknown as OpenproductRepository,
  } as PublicHandlerDeps;
}

const get = (url: string) => new Request(url, { headers: { "x-request-id": "req_page" } });

describe("GET /v1/products — one page", () => {
  it("carries exactly the page's keys, with `next` present and `total` the catalogue's count", async () => {
    const res = await route(get(`${CATALOG}?limit=2`), ENV, undefined, deps());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(Object.keys(body.data).sort()).toEqual([...CATALOG_PAGE_KEYS].sort());
    expect((body.data.products as unknown[]).length).toBe(2);
    expect(typeof body.data.next).toBe("string");
    expect(body.data.total).toBe(1204);
    expect(decodeCursor(body.data.next as string)).toEqual({ activity: null, publishedAt: "2026-08-01T00:00:00.000Z", slug: "beta" });
  });

  it("listing 3 is reachable in two requests, and the last page says so with null", async () => {
    const first = (await (await route(get(`${CATALOG}?limit=2`), ENV, undefined, deps())).json()) as { data: { next: string } };
    const res = await route(get(`${CATALOG}?limit=2&cursor=${encodeURIComponent(first.data.next)}`), ENV, undefined, deps());
    const body = (await res.json()) as { data: { products: Array<{ slug: string }>; next: string | null } };
    expect(body.data.products.map((p) => p.slug)).toEqual(["gamma"]);
    expect(body.data.next).toBeNull();
    expect("next" in body.data).toBe(true);
  });

  it("bounds the page size and defaults it, and hands the repository the freshness rule's cutoff", async () => {
    const seen: Seen[] = [];
    await route(get(`${CATALOG}?limit=100000`), ENV, undefined, deps(seen));
    await route(get(CATALOG), ENV, undefined, deps(seen));
    await route(get(`${CATALOG}?limit=-3`), ENV, undefined, deps(seen));
    expect(seen.map((s) => s.limit)).toEqual([PAGE_SIZE_MAX, PAGE_SIZE_DEFAULT, PAGE_SIZE_DEFAULT]);
    expect(seen[0]!.mergesSince).toBe(new Date(NOW.getTime() - 2 * FRESHNESS_WINDOW_MS.merges).toISOString());
    // OB3 — and the upvotes' floor beside it, by the same rule.
    expect(seen[0]!.endorsementsSince).toBe(new Date(NOW.getTime() - 2 * FRESHNESS_WINDOW_MS.endorsements).toISOString());
  });

  it("refuses a cursor it did not issue — 422, never a first page under a wrong address", async () => {
    const seen: Seen[] = [];
    for (const bad of ["garbage", encodeURIComponent(btoa("[1]")), "%00"]) {
      const res = await route(get(`${CATALOG}?cursor=${bad}`), ENV, undefined, deps(seen));
      expect([bad, res.status]).toEqual([bad, 422]);
    }
    expect(seen).toEqual([]);
    // A well-formed cursor for a listing that is not there is simply the end.
    const gone = encodeCursor({ activity: null, publishedAt: "1970-01-01T00:00:00.000Z", slug: "zzz" });
    const res = await route(get(`${CATALOG}?cursor=${gone}`), ENV, undefined, deps());
    expect(res.status).toBe(200);
  });
});

describe("GET /v1/public/openproduct/projects — the website's page", () => {
  it("carries exactly the directory page's keys — the same `next` and `total`, beside the strip", async () => {
    const res = await route(get(`${DIRECTORY}?limit=2`), ENV, undefined, deps());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(Object.keys(body.data).sort()).toEqual([...DIRECTORY_PAGE_KEYS].sort());
    expect((body.data.projects as unknown[]).length).toBe(2);
    expect(typeof body.data.next).toBe("string");
    expect(body.data.total).toBe(1204);
  });

  it("refuses a cursor it did not issue, like the API", async () => {
    expect((await route(get(`${DIRECTORY}?cursor=nope!`), ENV, undefined, deps())).status).toBe(422);
  });
});

describe("OS5 — the page reads the materialised catalogue first", () => {
  const MOMENT = "2026-09-10T11:50:00.000Z";
  const METRIC = { profileId: "p-alpha", metric: "merges", window: "7d", value: 7, source: "linked_repo" as const, observedAt: "2026-09-10T11:00:00.000Z" };

  function builtDeps(seen: string[]): PublicHandlerDeps {
    const live = deps();
    const repo = live.repo as unknown as Record<string, unknown>;
    // Every live read records itself, so the test can say which source served.
    for (const name of ["listPublicCardsPage", "countPublishedWindows", "latestMetricsForSlugs", "listPublicMediaForSlugs"]) {
      const inner = repo[name] as (...args: unknown[]) => unknown;
      repo[name] = (...args: unknown[]) => {
        seen.push(name);
        return inner(...args);
      };
    }
    repo.listCataloguePage = async (input: { cursor: { slug: string } | null; limit: number }) => {
      seen.push("listCataloguePage");
      const start = input.cursor === null ? 0 : ROWS.findIndex((r) => r.slug === input.cursor!.slug) + 1;
      const cards = ROWS.slice(start, start + input.limit);
      const last = cards[cards.length - 1];
      const more = start + input.limit < ROWS.length;
      return {
        computedAt: MOMENT,
        cards,
        metrics: new Map([["alpha", [METRIC]]]),
        media: new Map(),
        next: more && last ? { activity: null, publishedAt: last.publishedAt, slug: last.slug } : null,
        windows: { today: 1, week: 2, month: 3, total: 3 },
      };
    };
    return live;
  }

  it("serves the API from the catalogue in ONE read — its own census, its own observations, and the moment on the page", async () => {
    const seen: string[] = [];
    const res = await route(get(`${CATALOG}?limit=2`), ENV, undefined, builtDeps(seen));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { products: Array<{ slug: string; metrics: Record<string, { value: number }> }>; next: string | null; total: number; computedAt: string | null } };
    expect(seen).toEqual(["listCataloguePage"]);
    expect(body.data.computedAt).toBe(MOMENT);
    expect(body.data.total).toBe(3);
    expect(body.data.products.map((p) => p.slug)).toEqual(["alpha", "beta"]);
    expect(body.data.products[0]!.metrics["merges.7d"]!.value).toBe(7);
    expect(body.data.next).not.toBeNull();
  });

  it("serves the directory the same way, with the strip's counts from the stamp and the moment beside them", async () => {
    const seen: string[] = [];
    const res = await route(get(`${DIRECTORY}?limit=2`), ENV, undefined, builtDeps(seen));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { projects: Array<{ slug: string }>; total: number; computedAt: string | null; freshness: unknown } };
    expect(seen).toEqual(["listCataloguePage"]);
    expect(body.data.computedAt).toBe(MOMENT);
    expect(body.data.total).toBe(3);
    // The strip's window is chosen from the stamped census, never counted again.
    expect(body.data.freshness).toBeDefined();
    expect(body.data.projects.map((p) => p.slug)).toEqual(["alpha", "beta"]);
  });

  it("before the first sweep the page is the live join, and says so with a null moment on both documents", async () => {
    const api = (await (await route(get(`${CATALOG}?limit=2`), ENV, undefined, deps())).json()) as { data: { computedAt: unknown; total: number } };
    expect(api.data.computedAt).toBeNull();
    expect(api.data.total).toBe(1204);
    const directory = (await (await route(get(`${DIRECTORY}?limit=2`), ENV, undefined, deps())).json()) as { data: { computedAt: unknown } };
    expect(directory.data.computedAt).toBeNull();
  });
});
