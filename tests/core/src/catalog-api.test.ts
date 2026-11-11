// The public catalog API v1 (openproduct-commons CT2).
//
// INVARIANT I8 lives here: every field the website renders is returnable by
// the API, and every field the API returns is named in the OpenAPI document.
// That pair is what makes "OpenRouter for products" a checkable claim rather
// than a positioning statement — and it is why the document is GENERATED from
// the same literals the handlers import rather than written beside them.

import {
  CATALOG_CARD_KEYS,
  CATALOG_PRODUCT_KEYS,
  FACETS,
  FORMULAS,
  PUBLIC_PROFILE_CARD_KEYS,
  PUBLIC_PROFILE_KEYS,
  buildOpenApiDocument,
  type CatalogCard,
  type CatalogProduct,
} from "@openproduct/contracts";
import type { OpenproductRepository, ProductMediaRecord, ProfileRecord } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { PublicHandlerDeps } from "@openproduct-worker/handlers/public";

const ENV = { ENVIRONMENT: "test" } as Env;
const PROFILE_UUID = "55555555-5555-4555-8555-555555555555";
const BASE = "https://openproduct.internal/internal/public/openproduct/catalog";

function storedProfile(overrides: Partial<ProfileRecord> = {}): ProfileRecord {
  return {
    id: PROFILE_UUID,
    orgId: "11111111-1111-4111-8111-111111111111",
    projectId: "33333333-3333-4333-8333-333333333333",
    slug: "acme-thing",
    visibility: "public",
    tagline: "A thing, built in the open",
    pitchBody: "We are building a thing.",
    pitchDigest: "sha256:abc",
    // PV2 — most listings have no install line, and the fixture's default is
    // the common case rather than the interesting one.
    installLine: null,
    // PV3 — most listings have too few upvotes to check, so `false` is the
    // ordinary case and the fixture's default.
    cleanVotes: false,
    repoUrl: "https://github.com/acme/thing",
    liveUrl: null,
    stack: ["typescript", "Hand-rolled CRDT"],
    stackCanonical: ["typescript"],
    category: "dev-tools",
    hosting: "self-hosted",
    pricing: null,
    repoVisibility: "public",
    repoLicence: "MIT",
    repoCheckedAt: "2026-08-01T00:00:00.000Z",
    // IN2 — observed from the linked repository, never authored. `null` is
    // "not observed", which is what a fixture that never ran a check holds.
    repoName: null,
    repoDescription: null,
    repoTopics: null,
    // PV0 — the rest of the observed row. `null` is "not observed".
    repoLanguage: null,
    repoPushedAt: null,
    repoOpenIssues: null,
    reviewedAt: "2026-08-01T00:00:00.000Z",
    reviewedBy: "usr_op",
    publishedAt: "2026-08-12T09:00:00.000Z",
    indexable: true,
    // TS3 — the estate's own axis, on every fixture: a listing nobody has
    // acted on. Kept separate from `visibility` above, which is the
    // maintainer's switch and says nothing about moderation.
    moderationState: "visible" as const,
    moderatedAt: null,
    moderationActId: null,
    components: [{ name: "kettle-core", kind: "worker" }],
    linkGrant: null,
    createdBy: "usr_a",
    updatedBy: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

const NOW = new Date("2026-08-25T12:00:00.000Z");

function deps(
  metrics: Array<Record<string, unknown>> = [],
  // MD0 — a listing's media rows. Defaulted to none, which is every listing
  // today: MD1 owns the store and is gated on WC-C.
  media: ProductMediaRecord[] = [],
): PublicHandlerDeps {
  const profile = storedProfile();
  return {
    repo: {
      async listPublicCards() {
        return [
          {
            slug: profile.slug,
            tagline: profile.tagline,
            stack: profile.stack,
            stackCanonical: profile.stackCanonical,
            category: profile.category,
            hosting: profile.hosting,
            pricing: profile.pricing,
            licence: profile.repoLicence,
            roleOpeningCount: 1,
            openCommitments: ["a few hours a week · async"],
            hasLiveUrl: true,
            publishedAt: profile.publishedAt,
          },
        ];
      },
      async listPublicCardsPage(input: { cursor: unknown; limit: number }) {
        // OS1 — the same cards the whole-set fake answers, as one page.
        const cards = input.cursor === null ? await (this as unknown as { listPublicCards(): Promise<never[]> }).listPublicCards() : [];
        return { cards, next: null };
      },
      // OS5 — never computed by default: the fakes below are the live join,
      // and a page served from it says so with a null moment.
      async listCataloguePage() {
        return { computedAt: null, cards: [], metrics: new Map(), media: new Map(), next: null, windows: { today: 0, week: 0, month: 0, total: 0 } };
      },
      async countPublishedWindows() {
        return { today: 1, week: 1, month: 1, total: 1 };
      },
      async getPublicProfile() {
        return profile;
      },
      async latestSnapshotBefore() {
        return null;
      },
      async listPublicRoleOpenings() {
        return [
          {
            id: "77777777-7777-4777-8777-777777777777",
            profileId: PROFILE_UUID,
            title: "Someone who has run a queue in anger",
            description: "Read the scheduler.",
            commitment: "a few hours a week",
            status: "open" as const,
            joinLinkRef: "jl_demo",
            sortOrder: 0,
          },
        ];
      },
      async listPublicMaintainers() {
        return [{ subjectId: "usr_a", displayName: "Ada Fenwick", roleLabel: "maintainer" }];
      },
      async latestMetrics() {
        return metrics as never;
      },
      async latestMetricsForSlugs() {
        return new Map([["acme-thing", metrics as never]]);
      },
      // MD0 — the media plane's two reads. EMPTY by default, and that is the
      // truthful default rather than a shortcut: MD1 (the store) is gated on
      // WC-C, so no listing has media today and every card's array is `[]`.
      async listPublicMedia() {
        return media;
      },
      async listPublicMediaForSlugs() {
        return new Map([["acme-thing", media]]);
      },
      now: () => NOW,
      // UV1 — the placement's two reads. Empty by default: a listing that
      // has never launched is the common case, and the ABSENT `launch` key is
      // what the pinned key set asserts.
      async listLaunchesForProfile() {
        return [];
      },
      async readBoardRanks() {
        return [];
      },
    // FL0 — the follower count and the handle it is keyed by. Counted here so
    // the projection can carry a number; nothing lists followers anywhere.
    async getSubjectsForHandles(handles: readonly string[]) {
      return new Map(handles.map((h) => [h, `sub_${h}`]));
    },
    async countFollowers() {
      return new Map<string, number>();
    },
    } as unknown as OpenproductRepository,
    now: () => NOW,
  } as unknown as PublicHandlerDeps;
}

function get(path: string): Request {
  return new Request(`${BASE}${path}`, { headers: { "x-request-id": "req_cat" } });
}

async function card(metrics: Array<Record<string, unknown>> = []): Promise<CatalogCard> {
  const res = await route(get("/products"), ENV, undefined, deps(metrics));
  const body = (await res.json()) as { data: { products: CatalogCard[] } };
  return body.data.products[0]!;
}

async function product(media: ProductMediaRecord[] = []): Promise<CatalogProduct> {
  const res = await route(get("/products/acme-thing"), ENV, undefined, deps([], media));
  const body = (await res.json()) as { data: { product: CatalogProduct } };
  return body.data.product;
}

/** MD0 — a media row as the repository hands one over. */
function mediaRow(over: Partial<ProductMediaRecord> = {}): ProductMediaRecord {
  return {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    kind: "hero",
    storageRef: "op-media/abc",
    alt: "The kettle dashboard, showing a queue at rest",
    width: 1200,
    height: 630,
    position: 0,
    observedAt: null,
    ...over,
  };
}

describe("MD0 — the media plane reaches the wire", () => {
  it("returns the key on every card, empty, rather than omitting it", async () => {
    // PRESENT AND EMPTY. Every listing's array is `[]` until MD1 gives a maker
    // somewhere to put a picture, and a key that arrived later would make
    // every client branch on its presence — the same reason `launch` is null
    // rather than absent.
    expect((await card()).media).toEqual([]);
    expect((await product()).media).toEqual([]);
  });

  it("carries a hero as AUTHORED, with no moment anywhere on it", async () => {
    const [hero] = (await product([mediaRow()])).media;
    expect(hero!.value.kind).toBe("hero");
    expect(hero!.provenance).toEqual({ class: "authored", by: "maintainer" });
    // The whole of WC-3 at the wire: there is nowhere on an authored image to
    // put a date, so no consumer can read one as a freshness claim.
    expect(JSON.stringify(hero)).not.toContain("observedAt");
  });

  it("carries a capture as OBSERVED, from `declared_url`, with its moment", async () => {
    const at = "2026-08-20T00:00:00.000Z";
    const [shot] = (
      await product([mediaRow({ id: "s", kind: "screenshot", alt: "An automated capture", observedAt: at })])
    ).media;
    expect(shot!.provenance).toEqual({ class: "observed", source: "declared_url", observedAt: at });
  });

  it("gives each row its OWN provenance, which is why it is a list of facts", async () => {
    // The reason `media` is the one field here that is a list of facts rather
    // than a fact about a list: a hero and a capture do not share a class, and
    // one wrapper would have to claim one of them for both.
    const media = (
      await product([
        mediaRow(),
        mediaRow({ id: "s", kind: "screenshot", alt: "A capture", observedAt: "2026-08-20T00:00:00.000Z" }),
      ])
    ).media;
    expect(media.map((m) => m.provenance.class)).toEqual(["authored", "observed"]);
  });

  it("DROPS a capture with no moment rather than substituting one", async () => {
    // The database refuses to store one (1820's provenance CHECK), so reaching
    // this branch means the constraint is gone — and the safe answer to "we
    // have a capture and do not know when" is not to publish it. An undated
    // screenshot is the exact artefact the observed frame exists to prevent.
    const media = (
      await product([mediaRow({ id: "s", kind: "screenshot", alt: "A capture", observedAt: null })])
    ).media;
    expect(media).toEqual([]);
  });

  it("hands a machine the dimensions, so a client can reserve the box too", async () => {
    // Not only our renderer's problem. A consumer laying out a card needs the
    // same numbers, and the model has nowhere to put an image without them.
    const [hero] = (await product([mediaRow()])).media;
    expect([hero!.value.width, hero!.value.height]).toEqual([1200, 630]);
    expect(hero!.value.alt.length).toBeGreaterThan(0);
  });
});

describe("I8 — the API returns everything the website shows", () => {
  it("carries the observed row's moment on every observed fact (PV0)", async () => {
    // The website's `observedAt` is one moment for one frame. The API's is
    // per fact, which is where it belongs: provenance is a property of a
    // value, not of a page's layout.
    const card = await product();
    for (const key of ["licence", "language", "lastCommitAt", "openIssues"] as const) {
      const fact = card[key] as { provenance: { class: string; observedAt?: string } };
      expect([key, fact.provenance.class]).toEqual([key, "observed"]);
      expect([key, typeof fact.provenance.observedAt]).toEqual([key, "string"]);
    }
  });

  it("every field of the OD3 projection has a home in the catalog API", async () => {
    // The website renders PUBLIC_PROFILE_KEYS. If the API cannot answer for
    // one of them, the "machine-readable catalog" claim has a hole in it.
    const catalog = new Set(CATALOG_PRODUCT_KEYS);
    // Two are renamed rather than absent, and the rename is the reviewable act.
    const renamed: Record<string, string> = {
      roleOpenings: "openings",
      maintainers: "maintainers",
    };
    for (const key of PUBLIC_PROFILE_KEYS) {
      // PV0 — `observedAt` HAS A HOME AND IT IS NOT A TOP-LEVEL KEY. The
      // website carries one moment for the whole observed row because it
      // renders one frame; the API carries it inside EVERY observed fact's
      // provenance, which is the stronger shape — it survives the day two
      // signals come from different reads, where a single top-level moment
      // would quietly start lying. Asserted below rather than waved through.
      if (key === "observedAt") continue;
      const target = renamed[key] ?? key;
      expect(catalog.has(target) || target === "openRoles").toBe(true);
    }
    for (const key of PUBLIC_PROFILE_CARD_KEYS) {
      if (key === "roleOpeningCount") {
        expect(catalog.has("openRoles")).toBe(true);
        continue;
      }
      // MD3 — the row's `thumbnail` is the hero's asset, DERIVED from the
      // rows the API already carries in full as `media`: a consumer laying
      // out a card reads `media[].value.kind === "hero"` and has the same
      // four numbers. The API is not narrowed to the website's convenience.
      if (key === "thumbnail") {
        expect(catalog.has("media")).toBe(true);
        continue;
      }
      expect(catalog.has(key)).toBe(true);
    }
  });

  it("the OpenAPI document names every key the API serializes", () => {
    const doc = buildOpenApiDocument("https://api.test") as {
      components: { schemas: Record<string, { required?: string[] }> };
    };
    expect(doc.components.schemas.CatalogCard!.required!.sort()).toEqual([...CATALOG_CARD_KEYS]);
    expect(doc.components.schemas.CatalogProduct!.required!.sort()).toEqual([
      ...CATALOG_PRODUCT_KEYS,
    ]);
  });

  it("serializes exactly its literal, both shapes", async () => {
    expect(Object.keys(await card()).sort()).toEqual([...CATALOG_CARD_KEYS]);
    expect(Object.keys(await product()).sort()).toEqual([...CATALOG_PRODUCT_KEYS]);
  });
});

describe("I7 — every derived field resolves to published prose", () => {
  it("the document enumerates the formula ids, and each has a sentence", () => {
    const doc = buildOpenApiDocument(null) as {
      components: { schemas: { Fact: { properties: { provenance: { oneOf: Array<Record<string, never>> } } } } };
    };
    const derivedSchema = doc.components.schemas.Fact.properties.provenance.oneOf[2] as unknown as {
      properties: { formula: { enum: string[] } };
    };
    expect(derivedSchema.properties.formula.enum.sort()).toEqual(Object.keys(FORMULAS).sort());
    for (const id of derivedSchema.properties.formula.enum) {
      expect((FORMULAS as Record<string, { sentence: string }>)[id]!.sentence.length).toBeGreaterThan(24);
    }
  });

  it("every derived value on the wire carries a formula the docs page renders", async () => {
    const c = await card();
    for (const fact of [c.openRoles, c.stackCanonical]) {
      expect(fact.provenance.class).toBe("derived");
      if (fact.provenance.class === "derived") {
        expect(Object.keys(FORMULAS)).toContain(fact.provenance.formula);
      }
    }
  });
});

describe("OPC-2 — every field says where it came from", () => {
  it("authored fields say a person wrote them", async () => {
    const p = await product();
    for (const fact of [p.tagline, p.pitch, p.stack, p.repoUrl]) {
      expect(fact.provenance.class).toBe("authored");
    }
    // A maintainer's display name is AUTHORED, not a platform identity claim
    // (OD3's lesson). The API says so rather than leaving a reader to assume.
    expect(p.maintainers[0]!.displayName.provenance.class).toBe("authored");
  });

  it("the licence is observed, and carries the moment it was", async () => {
    const c = await card();
    expect(c.licence.provenance.class).toBe("observed");
    if (c.licence.provenance.class === "observed") {
      expect(c.licence.provenance.observedAt).toBeTruthy();
    }
  });
});

describe("OPC-C / OPC-7 — a metric is absent, never zero", () => {
  it("omits a metric nobody has observed", async () => {
    expect(await card().then((c) => c.metrics)).toEqual({});
  });

  it("returns a fresh metric with its moment", async () => {
    const c = await card([
      {
        profileId: PROFILE_UUID,
        metric: "merges",
        window: "7d",
        value: 38,
        source: "linked_repo",
        observedAt: "2026-08-25T10:00:00.000Z",
      },
    ]);
    expect(c.metrics["merges.7d"]!.value).toBe(38);
    expect(c.metrics["merges.7d"]!.provenance.class).toBe("observed");
  });

  it("EN2 — a count WE COMPUTED is `derived`, not `observed` (OPC-2, I7)", async () => {
    // The distinction OPC-2 asks the wrapper to carry, at the point it is
    // easiest to get wrong. `merges.7d` is something we watched happen on a
    // repository. `endorsements.total` is something we computed from our own
    // rows, by a rule published at /docs/formulas — and calling it `observed`
    // would tell a machine reader somebody measured it, which is false, and
    // would leave the number with no formula to resolve to, which is I7.
    const c = await card([
      {
        profileId: PROFILE_UUID,
        metric: "endorsements",
        window: "total",
        value: 214,
        source: "operator",
        observedAt: "2026-08-25T10:00:00.000Z",
      },
    ]);
    const fact = c.metrics["endorsements.total"]!;
    expect(fact.value).toBe(214);
    expect(fact.provenance.class).toBe("derived");
    // AND THE FORMULA ID IS THE METRIC KEY. That is why the window is called
    // `total` rather than `all`: one string is both what the wire calls the
    // number and what the docs call the rule, so a reader following the id
    // lands on the sentence and nothing has to be kept in step by hand.
    expect((fact.provenance as { formula: string }).formula).toBe("endorsements.total");
    expect(FORMULAS["endorsements.total"].sentence).toMatch(/integrity discount/);
  });

  it("EN2 — a ZERO total is published, unlike every other metric", async () => {
    // The one honest zero in the product. An unobserved METRIC means nobody
    // looked; an endorsement total of zero means we read a complete record —
    // the endorsements table, all of it — and found nobody. "No one has
    // endorsed this yet" is true and useful; absence here would be a coyness
    // that helps nobody (EN0's ENDORSEMENT_EMPTY_NOTE).
    const c = await card([
      {
        profileId: PROFILE_UUID,
        metric: "endorsements",
        window: "total",
        value: 0,
        source: "operator",
        observedAt: "2026-08-25T10:00:00.000Z",
      },
    ]);
    expect(c.metrics["endorsements.total"]).toBeDefined();
    expect(c.metrics["endorsements.total"]!.value).toBe(0);
  });

  it("DROPS a metric that has gone stale past twice its window", async () => {
    // Not present-with-a-zero, and not present-with-an-old-number: absent.
    // A consumer asking for a missing key gets undefined, which is a much
    // harder thing to accidentally render as "0" than a 0 would be.
    const c = await card([
      {
        profileId: PROFILE_UUID,
        metric: "merges",
        window: "7d",
        value: 38,
        source: "linked_repo",
        observedAt: "2026-08-01T10:00:00.000Z",
      },
    ]);
    expect(c.metrics["merges.7d"]).toBeUndefined();
    expect(Object.keys(c.metrics)).toEqual([]);
  });
});

describe("the catalog is anonymous, and answers nothing about drafts", () => {
  it("404s an unknown slug exactly as it would a private one", async () => {
    const res = await route(get("/products/nope"), ENV, undefined, {
      repo: {
        async getPublicProfile() {
          return null;
        },
      },
    } as unknown as PublicHandlerDeps);
    expect(res.status).toBe(404);
  });

  it("refuses a slug shape the router should never have matched", async () => {
    const res = await route(get("/products/..%2Fetc"), ENV, undefined, deps());
    expect(res.status).toBe(404);
  });

  it("serves the taxonomy without touching a database", async () => {
    // The facets are a contract constant, so this answers even when the
    // database is unreachable — which is the right failure mode for the
    // document that describes the catalog.
    const res = await route(get("/facets"), ENV, undefined, {
      repo: {},
    } as unknown as PublicHandlerDeps);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { facets: Array<{ id: string }> } };
    expect(body.data.facets.map((f) => f.id)).toEqual(FACETS.map((f) => f.id));
  });
});
