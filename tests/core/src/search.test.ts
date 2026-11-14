// Search (openproduct-commons DS0).
//
// Three claims, and each is the kind that is easy to state and easy to quietly
// stop being true:
//
//   DS-1  the index cannot contain anything the public read would not return,
//         because it is BUILT FROM the public projection rather than from a
//         query of its own;
//   OPC-4 the order is a published formula, not a black box — which is why
//         `ts_rank` is not used anywhere in this subsystem;
//   OPC-1 the query resolves no actor, so one visitor's results are every
//         visitor's results and the answer is cacheable.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CATALOG_CARD_KEYS,
  FORMULAS,
  MAX_QUERY_TERMS,
  MAX_SEARCH_LIMIT,
  buildProductIndex,
  queryTerms,
  rankSearch,
  tokenise,
  type CatalogCard,
  type Candidate,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import { REBUILD_FLOOR_MS } from "@openproduct-worker/handlers/search";

const NOW = Date.parse("2026-08-26T12:00:00.000Z");
const BASE = "https://openproduct.internal";

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

function get(path: string): Request {
  return new Request(`${BASE}${path}`, { headers: { "x-request-id": "req_ds0" } });
}

interface Harness {
  deps: unknown;
  calls: string[];
  /** SR0 — the people the live read would return. */
  people: Array<{ handle: string; displayName: string | null; bio: string | null }>;
  /** SR0 — a people read that fails, to prove it does not fail the search. */
  peopleThrows: boolean;
  /** LI1a — what the replace throws, when it throws. */
  replaceThrows: unknown;
  /** OPN-11 — when a clean check was last recorded, and what recording it throws. */
  checkedAt: string | null;
  checkThrows: unknown;
  index: Array<{
    kind: string;
    entityId: string;
    title: string;
    summary: string | null;
    terms: readonly string[];
    facets: Readonly<Record<string, readonly string[]>>;
  }>;
  state: { builtAt: string | null; dirtyAt: string | null };
  cards: Array<{
    slug: string;
    tagline: string | null;
    stack: string[];
    stackCanonical: string[];
    category: string | null;
    hosting: string | null;
    pricing: string | null;
    licence: string | null;
    roleOpeningCount: number;
    openCommitments: string[];
    hasLiveUrl: boolean;
    publishedAt: string | null;
  }>;
}

function harness(): Harness {
  const calls: string[] = [];
  const h: Harness = {
    deps: null,
    calls,
    index: [],
    people: [{ handle: "ada", displayName: "Ada Fenwick", bio: "Builds queues." }],
    peopleThrows: false,
    replaceThrows: undefined,
    checkedAt: null,
    checkThrows: undefined,
    state: { builtAt: null, dirtyAt: "2026-08-26T11:00:00.000Z" },
    cards: [
      {
        slug: "kettleworks",
        tagline: "A self-hosted job queue on one Postgres table",
        stack: ["TypeScript", "Postgres"],
        stackCanonical: ["typescript", "postgres"],
        category: "infrastructure",
        hosting: "self-hosted",
        pricing: null,
        licence: "Apache-2.0",
        roleOpeningCount: 2,
        openCommitments: ["A few hours a week"],
        hasLiveUrl: true,
        publishedAt: "2026-08-12T09:00:00.000Z",
      },
      {
        slug: "quietmail",
        tagline: "Transactional email where the delivery ledger is yours",
        stack: ["Go"],
        stackCanonical: ["go"],
        category: "communication",
        hosting: "self-hosted",
        pricing: null,
        licence: "MPL-2.0",
        roleOpeningCount: 0,
        openCommitments: [],
        hasLiveUrl: false,
        publishedAt: "2026-08-19T09:00:00.000Z",
      },
    ],
  };
  const repo = {
    async listPublicCards() {
      calls.push("listPublicCards");
      return h.cards;
    },
    // OS1 — the rebuild walks the catalogue by page, the read `/v1/products` serves.
    async listPublicCardsPage(input: { cursor: unknown }) {
      calls.push("listPublicCardsPage");
      return { cards: input.cursor === null ? h.cards : [], next: null };
    },
    // OS5 — never computed in this harness, so the walk falls to the live join.
    async listCataloguePage() {
      calls.push("listCataloguePage");
      return { computedAt: null, cards: [], metrics: new Map(), media: new Map(), next: null, windows: { today: 0, week: 0, month: 0, total: 0 } };
    },
    async countPublishedWindows() {
      calls.push("countPublishedWindows");
      return { today: 0, week: 0, month: 0, total: h.cards.length };
    },
    async latestMetricsForSlugs() {
      calls.push("latestMetricsForSlugs");
      return new Map();
    },
    // MD0 — the index is built from `catalogCards`, the API's own function
    // (DS-1), so the harness's dependency list widens with the document's.
    // That is the shape working as intended rather than a chore: an index
    // that could be built from fewer reads than the API makes would be an
    // index that could contain a field the API would not return.
    async listPublicMediaForSlugs() {
      calls.push("listPublicMediaForSlugs");
      return new Map();
    },
    async replaceSearchIndex(kind: string, documents: Harness["index"], builtAt: string) {
      calls.push(`replaceSearchIndex:${kind}:${documents.length}`);
      if (h.replaceThrows !== undefined) throw h.replaceThrows;
      h.index = [...documents];
      h.state = { builtAt, dirtyAt: null };
      return documents.length;
    },
    async searchCandidates(terms: readonly string[], limit: number) {
      calls.push(`searchCandidates:${[...terms].join("|")}:${limit}`);
      return h.index.filter((d) => terms.some((t) => d.terms.includes(t)));
    },
    async getSearchIndexState() {
      calls.push("getSearchIndexState");
      return h.state;
    },
    async markSearchIndexDirty(at: string) {
      calls.push("markSearchIndexDirty");
      h.state = { ...h.state, dirtyAt: h.state.dirtyAt ?? at };
    },
    async markSearchIndexChecked(at: string) {
      calls.push("markSearchIndexChecked");
      if (h.checkThrows !== undefined) throw h.checkThrows;
      if (h.state.dirtyAt === null) h.checkedAt = at;
    },
    // FL0 — the follower count and the handle it is keyed by. Counted here so
    // the projection can carry a number; nothing lists followers anywhere.
    async getSubjectsForHandles(handles: readonly string[]) {
      return new Map(handles.map((h) => [h, `sub_${h}`]));
    },
    async countFollowers() {
      return new Map<string, number>();
    },
    // SR0 — makers, read LIVE. The stub applies the same shape the real read
    // does (handle, name, bio) so the handler's attribution is exercised;
    // the ELIGIBILITY rule it enforces is pinned against a live engine in
    // packages/db, because it is SQL and nothing else can prove it.
    async searchPublicContributors(needle: string, limit: number) {
      calls.push(`searchPublicContributors:${needle}:${limit}`);
      if (h.peopleThrows) throw new Error("people are unavailable");
      const n = needle.trim().toLowerCase();
      return h.people
        .filter(
          (p) =>
            p.handle.toLowerCase().includes(n) ||
            (p.displayName ?? "").toLowerCase().includes(n) ||
            (p.bio ?? "").toLowerCase().includes(n),
        )
        .slice(0, limit);
    },
  } as unknown as OpenproductRepository;
  h.deps = { repo, now: () => NOW };
  return h;
}

describe("DS-1 — the index is a projection of the public document, not a query of its own", () => {
  it("the builder's INPUT is the public projection, so a private field is not in scope to leak", () => {
    // This is the assertion the whole safety argument rests on. It is a TYPE
    // claim expressed as a value claim: every key the builder reads has to be
    // a key the catalog document publishes. A future edit that reached for
    // `pitchBody` or `orgId` would have nothing to reach for.
    const card: CatalogCard = {
      slug: "kettleworks",
      tagline: { value: "A job queue", provenance: { class: "authored", by: "maintainer" } },
      stackCanonical: {
        value: ["typescript"],
        provenance: { class: "derived", formula: "facet.count", inputs: [], computedAt: "x" },
      },
    } as unknown as CatalogCard;
    const [doc] = buildProductIndex([card]);
    for (const key of ["kind", "entityId", "title", "summary", "terms", "facets"] as const) {
      expect(doc![key]).toBeDefined();
    }
    // Everything the document carries traces back to a published key.
    expect(CATALOG_CARD_KEYS).toContain("slug");
    expect(CATALOG_CARD_KEYS).toContain("tagline");
    expect(CATALOG_CARD_KEYS).toContain("stackCanonical");
  });

  it("drops a listing with no terms rather than indexing it empty", () => {
    const blank = {
      slug: "!!",
      tagline: null,
      stackCanonical: { value: [] },
      category: null,
      hosting: null,
      pricing: null,
      licence: null,
    } as unknown as CatalogCard;
    // An entity that can never match is a row that costs storage and returns
    // nothing — and the migration's CHECK refuses it anyway.
    expect(buildProductIndex([blank])).toEqual([]);
  });

  it("the rebuild reads the CATALOG DOCUMENT and never the profiles table", async () => {
    const h = harness();
    const res = await route(
      new Request(`${BASE}/internal/openproduct/search/rebuild`, {
        method: "POST",
        headers: { "x-request-id": "req_ds0" },
      }),
      env(),
      h.deps as never,
    );
    expect(res.status).toBe(200);
    // `listPublicCards` is the public read's own method — the one that filters
    // `visibility = 'public'` in SQL. There is no second query here with a
    // second copy of that predicate to get wrong.
    expect(h.calls).toContain("listPublicCardsPage");
    expect(h.calls).toContain("replaceSearchIndex:product:2");
    expect(h.index.map((d) => d.entityId).sort()).toEqual(["kettleworks", "quietmail"]);
  });

  it("a listing that leaves the document leaves the index, with nobody remembering", async () => {
    const h = harness();
    await route(new Request(`${BASE}/internal/openproduct/search/rebuild`, { method: "POST" }), env(), h.deps as never);
    expect(h.index.map((d) => d.entityId)).toContain("quietmail");

    // quietmail is unpublished, so the next document does not contain it.
    h.cards = h.cards.filter((c) => c.slug !== "quietmail");
    h.state = { builtAt: null, dirtyAt: "2026-08-26T11:00:00.000Z" };
    await route(new Request(`${BASE}/internal/openproduct/search/rebuild`, { method: "POST" }), env(), h.deps as never);
    expect(h.index.map((d) => d.entityId)).toEqual(["kettleworks"]);
  });
});

describe("OPC-4 — the order is published, which is why ts_rank is not used", () => {
  it("`search.relevance` exists and names every clause the ranker implements", () => {
    const formula = FORMULAS["search.relevance"];
    expect(formula.computedBy).toBe("DS0");
    for (const clause of ["exact name", "starts with", "contains", "stack or category", "tagline"]) {
      expect(formula.sentence.toLowerCase()).toContain(clause.toLowerCase());
    }
    // The two things the sentence PROMISES are absent must be absent.
    expect(formula.sentence).toContain("Nothing about who is searching");
    expect(formula.sentence).toContain("no popularity signal");
  });

  it("orders by clause, strongest first — and says which clause it was", () => {
    const candidates: Candidate[] = [
      candidate("queue-runner", "A tool", ["queue", "runner"], {}, null),
      candidate("kettleworks", "A job queue on Postgres", ["kettleworks", "job", "queue"], {}, null),
      candidate("queue", "The exact thing", ["queue"], {}, null),
      candidate("tarpit", "A rate limiter", ["tarpit"], { stack: ["queue"] }, null),
    ];
    const results = rankSearch(candidates, ["queue"]);
    expect(results.map((r) => [r.entityId, r.matched])).toEqual([
      ["queue", "exact-name"],
      ["queue-runner", "name-prefix"],
      ["tarpit", "facet-value"],
      ["kettleworks", "summary-contains"],
    ]);
  });

  it("breaks ties by activity, and an UNOBSERVED listing sorts last rather than as zero", () => {
    const candidates: Candidate[] = [
      candidate("alpha-queue", "x", ["alpha", "queue"], {}, null),
      candidate("bravo-queue", "x", ["bravo", "queue"], {}, 3),
      candidate("delta-queue", "x", ["delta", "queue"], {}, 40),
    ];
    // All three match at the same clause, so the tiebreak decides. Never
    // observed is not the same claim as observed to be quiet — the same rule
    // SN2 applies to the directory's order.
    const results = rankSearch(
      candidates.map((c) => ({ ...c, title: "queue-thing" })),
      ["queue"],
    );
    expect(results.map((r) => r.entityId)).toEqual(["delta-queue", "bravo-queue", "alpha-queue"]);
  });

  it("drops a candidate that satisfies no clause rather than ranking it last", () => {
    // Two words, each matching a DIFFERENT document: the overlap query
    // returns both, and neither satisfies the whole query. Noise at the
    // bottom of a short list is still noise.
    const candidates: Candidate[] = [
      candidate("alpha", "postgres", ["alpha", "postgres"], {}, null),
      candidate("bravo", "redis", ["bravo", "redis"], {}, null),
    ];
    expect(rankSearch(candidates, ["postgres", "redis"])).toEqual([]);
  });

  it("takes no subject, no session and no history — the signature is the guarantee", () => {
    // Not a lint. `rankSearch` has nowhere to PUT a visitor, and that is the
    // structural half of OPC-1: a personalised order would end the shared
    // cacheable document, and adding one would have to widen this signature,
    // which this assertion makes a visible change rather than a quiet one.
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../../packages/contracts/src/search.ts"),
      "utf-8",
    );
    const signature = /export function rankSearch\(([\s\S]*?)\): SearchResult\[\]/.exec(source)![1]!;
    const params = signature
      .split("\n")
      .map((line) => /^\s*(\w+)\s*[:?]/.exec(line)?.[1])
      .filter((name): name is string => Boolean(name));
    expect(params).toEqual(["candidates", "terms", "limit"]);
    // And no CODE in the module reaches for one. Comments are stripped first,
    // deliberately: an earlier version of this guard matched the raw text and
    // so failed on the module's own explanation of why it resolves no actor —
    // which would pressure the next author to stop writing the reason down.
    // The rule is about what the code does, so match what the code says.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    expect(code).not.toMatch(/subjectId|session|actor|viewer|history/i);
  });
});

describe("the tokeniser is shared, so build and query cannot disagree", () => {
  it("splits the same way on both sides", () => {
    // `Next.js` indexed as one thing and queried as another is how a search
    // box silently stops matching documents it built itself.
    expect(tokenise("Next.js")).toEqual(["next", "js"]);
    expect(queryTerms("Next.js")).toEqual(["next", "js"]);
    expect(tokenise("AGPL-3.0")).toEqual(["agpl"]);
    expect(tokenise("a I x")).toEqual([]);
    expect(tokenise("queue queue Queue")).toEqual(["queue"]);
  });

  it("caps the query's terms — a hundred words is not a search", () => {
    const many = Array.from({ length: MAX_QUERY_TERMS + 20 }, (_, i) => `w${i}`).join(" ");
    expect(queryTerms(many)).toHaveLength(MAX_QUERY_TERMS);
  });
});

describe("the query resolves no actor and answers on the public branch (OPC-1)", () => {
  it("answers a search with results and echoes the terms it actually used", async () => {
    const h = harness();
    await route(new Request(`${BASE}/internal/openproduct/search/rebuild`, { method: "POST" }), env(), h.deps as never);

    const res = await route(get("/internal/public/openproduct/search?q=Postgres"), env(), h.deps as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { query: string; results: Array<{ entityId: string }> } };
    expect(body.data.query).toBe("postgres");
    expect(body.data.results.map((r) => r.entityId)).toEqual(["kettleworks"]);
  });

  it("an empty query is an empty result, not every product", async () => {
    const h = harness();
    for (const q of ["", "   ", "a"]) {
      const res = await route(get(`/internal/public/openproduct/search?q=${encodeURIComponent(q)}`), env(), h.deps as never);
      const body = (await res.json()) as { data: { results: unknown[] } };
      // "Show me everything" is what the directory is for. Answering it here
      // would make the most expensive query the easiest to send by accident.
      expect([q, body.data.results]).toEqual([q, []]);
    }
    expect(h.calls).not.toContain("searchCandidates");
  });

  it("bounds the limit however it is asked", async () => {
    const h = harness();
    await route(new Request(`${BASE}/internal/openproduct/search/rebuild`, { method: "POST" }), env(), h.deps as never);
    for (const raw of ["9999", "-1", "abc", ""]) {
      const res = await route(get(`/internal/public/openproduct/search?q=queue&limit=${raw}`), env(), h.deps as never);
      const body = (await res.json()) as { data: { results: unknown[] } };
      expect(body.data.results.length).toBeLessThanOrEqual(MAX_SEARCH_LIMIT);
    }
  });

  it("reads no actor header — a request carrying one is served identically", async () => {
    const h = harness();
    await route(new Request(`${BASE}/internal/openproduct/search/rebuild`, { method: "POST" }), env(), h.deps as never);

    const anonymous = await route(get("/internal/public/openproduct/search?q=queue"), env(), h.deps as never);
    const withActor = await route(
      new Request(`${BASE}/internal/public/openproduct/search?q=queue`, {
        headers: {
          "x-request-id": "req_ds0",
          "x-actor-subject-id": "usr_0123456789abcdef0123456789abcdef",
          "x-actor-subject-type": "user",
        },
      }),
      env(),
      h.deps as never,
    );
    // Byte-identical, which is what makes the answer cacheable: one visitor's
    // results are every visitor's results.
    expect(await withActor.text()).toBe(await anonymous.text());
  });
});

describe("the rebuild floor", () => {
  it("builds when the index has NEVER been built, floor or no floor", async () => {
    const h = harness();
    h.state = { builtAt: null, dirtyAt: new Date(NOW).toISOString() };
    const res = await route(new Request(`${BASE}/internal/openproduct/search/rebuild`, { method: "POST" }), env(), h.deps as never);
    // An empty index answers everything with nothing, and nothing reads to a
    // visitor as "this commons is empty" rather than "the index is warming".
    expect(((await res.json()) as { data: { rebuilt: boolean } }).data.rebuilt).toBe(true);
  });

  it("does not rebuild inside the floor — and says why, at 200", async () => {
    const h = harness();
    h.state = { builtAt: new Date(NOW - 1000).toISOString(), dirtyAt: new Date(NOW).toISOString() };
    const res = await route(new Request(`${BASE}/internal/openproduct/search/rebuild`, { method: "POST" }), env(), h.deps as never);
    const body = (await res.json()) as { data: { rebuilt: boolean; reason: string } };
    // Not an error: the caller is a sweep on its own cadence with no way to
    // know. Turning "nothing to do" into a failure fills the log with the
    // system working correctly.
    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ rebuilt: false, reason: "within-floor" });
  });

  it("does not rebuild a CLEAN index even long past the floor", async () => {
    const h = harness();
    h.state = { builtAt: new Date(NOW - 10 * REBUILD_FLOOR_MS).toISOString(), dirtyAt: null };
    const res = await route(new Request(`${BASE}/internal/openproduct/search/rebuild`, { method: "POST" }), env(), h.deps as never);
    expect(((await res.json()) as { data: { reason: string } }).data.reason).toBe("clean");
    expect(h.calls).not.toContain("listPublicCards");
    expect(h.calls).not.toContain("listPublicCardsPage");
  });

  // OPN-11. The standalone deploy went live on 11 Nov with an empty
  // catalogue: the index was built once at 23:00Z, nothing ever dirtied it,
  // every tick since declined `clean`, and `/health` read the frozen
  // `built_at` as a phase that had stopped — degraded on stage and prod.
  it("RECORDS a clean decline as a check, without touching the build (OPN-11)", async () => {
    const h = harness();
    const builtAt = "2026-08-23T23:00:00.000Z";
    h.state = { builtAt, dirtyAt: null };
    const res = await route(new Request(`${BASE}/internal/openproduct/search/rebuild`, { method: "POST" }), env(), h.deps as never);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { rebuilt: boolean; reason: string } }).data).toMatchObject({
      rebuilt: false,
      reason: "clean",
    });
    expect(h.checkedAt).toBe(new Date(NOW).toISOString());
    // A check is not a build: the floor and the index stay as they were.
    expect(h.state.builtAt).toBe(builtAt);
    expect(h.calls.some((c) => c.startsWith("replaceSearchIndex"))).toBe(false);
  });

  it("does NOT record a check inside the floor — a dirty index is not current", async () => {
    const h = harness();
    h.state = { builtAt: new Date(NOW - 1000).toISOString(), dirtyAt: new Date(NOW).toISOString() };
    await route(new Request(`${BASE}/internal/openproduct/search/rebuild`, { method: "POST" }), env(), h.deps as never);
    expect(h.calls).not.toContain("markSearchIndexChecked");
    expect(h.checkedAt).toBeNull();
  });

  it("does NOT record a check beside a rebuild — the build is the run", async () => {
    const h = harness();
    h.state = { builtAt: null, dirtyAt: new Date(NOW).toISOString() };
    await route(new Request(`${BASE}/internal/openproduct/search/rebuild`, { method: "POST" }), env(), h.deps as never);
    expect(h.calls).not.toContain("markSearchIndexChecked");
    expect(h.state.builtAt).toBe(new Date(NOW).toISOString());
  });

  it("an unrecorded check is a refusal naming its class, so the sweep records it as failed", async () => {
    const h = harness();
    h.state = { builtAt: "2026-08-23T23:00:00.000Z", dirtyAt: null };
    h.checkThrows = Object.assign(new Error('column "checked_at" does not exist'), {
      name: "PostgresError",
      code: "42703",
    });
    const res = await route(new Request(`${BASE}/internal/openproduct/search/rebuild`, { method: "POST" }), env(), h.deps as never);
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).toContain("Search index check failed (42703)");
    expect(text).not.toContain("checked_at");
  });

  it("rebuilds a dirty index past the floor", async () => {
    const h = harness();
    h.state = {
      builtAt: new Date(NOW - REBUILD_FLOOR_MS - 1).toISOString(),
      dirtyAt: new Date(NOW - 100).toISOString(),
    };
    const res = await route(new Request(`${BASE}/internal/openproduct/search/rebuild`, { method: "POST" }), env(), h.deps as never);
    expect(((await res.json()) as { data: { rebuilt: boolean } }).data.rebuilt).toBe(true);
  });

  it("the rebuild is not a public route, and not a GET", async () => {
    const h = harness();
    // A read that writes is a read somebody can turn into a write amplifier
    // by holding down refresh.
    expect((await route(get("/internal/public/openproduct/search/rebuild"), env(), h.deps as never)).status).toBe(404);
    expect((await route(get("/internal/openproduct/search/rebuild"), env(), h.deps as never)).status).toBe(405);
  });
});

function candidate(
  entityId: string,
  summary: string | null,
  terms: string[],
  facets: Record<string, string[]>,
  activity: number | null,
): Candidate {
  return { kind: "product", entityId, title: entityId, summary, terms, facets, activity };
}

describe("EN0 — the object ships dormant, and nothing is routed", () => {
  it("no endorsement path is reachable on any branch", async () => {
    const h = harness();
    // EN0's done-when. The shapes exist so EN3's integrity model has
    // something agreed to fit; the ACT is EN1's and the NUMBERS are EN2's.
    for (const path of [
      "/internal/public/openproduct/endorsements",
      "/internal/public/openproduct/projects/acme-thing/endorsements",
    ]) {
      const res = await route(get(path), env(), h.deps as never);
      expect([path, res.status]).toEqual([path, 404]);
    }
    // On the authenticated plane the actor check comes FIRST, so an
    // anonymous caller gets 401 rather than being told which paths exist.
    // Either way it is not 200, which is what "nothing is routed" means.
    const authed = await route(get("/internal/openproduct/me/endorsements"), env(), h.deps as never);
    expect(authed.status).toBe(401);
  });

  it("no public projection carries an endorsement count yet", async () => {
    const h = harness();
    const res = await route(get("/internal/public/openproduct/catalog/products"), env(), h.deps as never);
    // A count rendered before EN2 would be a zero standing in for "we have
    // not built this", which is exactly the shape SN2 spent a milestone
    // refusing.
    expect(await res.text()).not.toMatch(/endorse/i);
  });
});

describe("SR0 — three sections, three mechanisms", () => {
  const url = (q: string) =>
    new URL(`https://openproduct.internal/internal/public/openproduct/search?q=${encodeURIComponent(q)}`);

  async function answer(h: Harness, q: string) {
    await route(
      new Request("https://openproduct.internal/internal/openproduct/search/rebuild", {
        method: "POST",
        headers: { "x-request-id": "req_sr0" },
      }),
      env(),
      h.deps as never,
    );
    const res = await route(
      new Request(url(q), { headers: { "x-request-id": "req_sr0" } }),
      env(),
      h.deps as never,
    );
    return (await res.json()) as {
      data: {
        query: string;
        results: Array<{ entityId: string }>;
        makers: Array<{ handle: string; displayName: string | null; matched: string }>;
        topics: Array<{ value: string }>;
      };
    };
  }

  it("answers launches, makers and topics in one document", async () => {
    const h = harness();
    const body = await answer(h, "kettleworks");
    expect(body.data.results.map((r) => r.entityId)).toContain("kettleworks");
    expect(Object.keys(body.data).sort()).toEqual(["makers", "query", "results", "topics"]);
  });

  it("reads people LIVE rather than from the index", async () => {
    // The whole SR0 decision. An index entry about a person is a cached answer
    // to "is this profile public", and its staleness is unbounded — the
    // rebuild is sweep-driven. A live read is stale by the same 60 seconds as
    // `/@handle` itself.
    const h = harness();
    await answer(h, "ada");
    expect(h.calls.some((c) => c.startsWith("searchPublicContributors:ada:"))).toBe(true);
    // And nothing put a person INTO the index.
    expect(h.index.every((d) => d.kind === "product")).toBe(true);
    expect(h.calls.filter((c) => c.startsWith("replaceSearchIndex:")).every((c) => c.includes(":product:"))).toBe(true);
  });

  it("says WHY each person is in the list", async () => {
    const h = harness();
    h.people = [
      { handle: "ada", displayName: "Ada Fenwick", bio: "Builds queues." },
      { handle: "bob", displayName: "Ada Nakamura", bio: "Writes." },
      { handle: "cee", displayName: "Cee Bright", bio: "Worked with ada once." },
    ];
    const body = await answer(h, "ada");
    expect(body.data.makers).toEqual([
      { handle: "ada", displayName: "Ada Fenwick", matched: "handle" },
      { handle: "bob", displayName: "Ada Nakamura", matched: "name" },
      { handle: "cee", displayName: "Cee Bright", matched: "bio" },
    ]);
  });

  it("drops a person whose match cannot be attributed, rather than labelling them vaguely", async () => {
    // The only way this happens is a query that matched through SQL folding
    // the contract's pure function does not do. "We found you but cannot say
    // why" is not a sentence worth shipping.
    const h = harness();
    h.people = [{ handle: "zed", displayName: "Zed", bio: "Nothing relevant." }];
    const body = await answer(h, "kettleworks");
    expect(body.data.makers).toEqual([]);
  });

  it("carries NOTHING about a person beyond what their page already shows", async () => {
    // The projection is narrower than the directory card, which is narrower
    // than the page. Each surface narrows again (OD3).
    const h = harness();
    const body = await answer(h, "ada");
    expect(Object.keys(body.data.makers[0]!).sort()).toEqual(["displayName", "handle", "matched"]);
    // Never a subject id — that is an internal identifier, one bad projection
    // away from a browser.
    expect(JSON.stringify(body.data.makers)).not.toContain("usr_");
    expect(JSON.stringify(body.data.makers)).not.toContain("sub_");
  });

  it("does NOT fail the whole search when the people read fails", async () => {
    // Products are what most queries are for. A page that 500s because one
    // section could not be answered is worse than a page with one section
    // missing.
    const h = harness();
    h.peopleThrows = true;
    const body = await answer(h, "kettleworks");
    expect(body.data.results.map((r) => r.entityId)).toContain("kettleworks");
    expect(body.data.makers).toEqual([]);
  });

  it("answers topics with NO read at all", async () => {
    const h = harness();
    const before = h.calls.length;
    const body = await answer(h, "infrastructure");
    expect(body.data.topics.map((t) => t.value)).toContain("infrastructure");
    // The only reads were the index's and the people one — nothing asked the
    // database about topics.
    const after = h.calls.slice(before);
    expect(after.some((c) => c.toLowerCase().includes("topic"))).toBe(false);
  });

  it("gives an empty query the SAME KEYS as a real answer", async () => {
    // A caller that had to check whether `makers` exists before reading it
    // would be a caller that eventually forgets, and the symptom is a page
    // that crashes on an empty search box.
    const h = harness();
    const res = await route(
      new Request(url(""), { headers: { "x-request-id": "req_sr0" } }),
      env(),
      h.deps as never,
    );
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(Object.keys(body.data).sort()).toEqual(["makers", "query", "results", "topics"]);
    expect(body.data.makers).toEqual([]);
    expect(body.data.topics).toEqual([]);
  });

  it("still resolves no actor, with people in the answer", async () => {
    // Widening the endpoint must not have made it personal. The same query
    // gives the same bytes to everybody (OPC-1, I6).
    const h = harness();
    const signedOut = await answer(harness(), "ada");
    const withActor = await route(
      new Request(url("ada"), {
        headers: {
          "x-request-id": "req_sr0",
          "x-actor-subject-id": "usr_0123456789abcdef0123456789abcdef",
          "x-actor-subject-type": "user",
        },
      }),
      env(),
      h.deps as never,
    );
    expect(((await withActor.json()) as { data: unknown }).data).toEqual(signedOut.data);
  });
});

describe("a refused rebuild names its class, never its message (openproduct-worldclass-v2 LI1a)", () => {
  it("carries the driver's SQLSTATE when there is one", async () => {
    const h = harness();
    h.state = { builtAt: null, dirtyAt: new Date(NOW).toISOString() };
    h.replaceThrows = Object.assign(new Error("cannot call jsonb_to_recordset on a non-array: {\"slug\":\"acme\"}"), {
      name: "PostgresError",
      code: "22023",
    });
    const res = await route(new Request(`${BASE}/internal/openproduct/search/rebuild`, { method: "POST" }), env(), h.deps as never);
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).toContain("Search index rebuild failed (22023)");
    expect(text).not.toContain("acme");
    expect(text).not.toContain("jsonb_to_recordset");
  });

  it("falls back to the error's name, and to unknown for a non-error", async () => {
    const h = harness();
    h.state = { builtAt: null, dirtyAt: new Date(NOW).toISOString() };
    h.replaceThrows = new TypeError("x is not iterable");
    const named = await route(new Request(`${BASE}/internal/openproduct/search/rebuild`, { method: "POST" }), env(), h.deps as never);
    expect(await named.text()).toContain("Search index rebuild failed (TypeError)");

    h.replaceThrows = "a string";
    const bare = await route(new Request(`${BASE}/internal/openproduct/search/rebuild`, { method: "POST" }), env(), h.deps as never);
    expect(await bare.text()).toContain("Search index rebuild failed (unknown)");
  });
});
