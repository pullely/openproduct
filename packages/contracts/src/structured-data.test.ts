// What a crawler reads off a listing page (openproduct-commons DS4).
//
// MOST OF THIS FILE IS ABOUT WHAT IS NOT IN THE DOCUMENT. Structured data is
// the one place in this product where inventing a number is nearly free and
// immediately rewarded — `aggregateRating` buys stars in a search result and
// nobody who sees them can check — so the prohibitions are the part worth
// pinning. Everything the document DOES carry is either the listing's
// identity or somebody's own words, and those are easy.

import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_JSONLD_FIELDS,
  NO_RATING_NOTE,
  breadcrumbJsonLd,
  collectionPageJsonLd,
  listingJsonLd,
} from "./structured-data.js";
import type { PublicProfile } from "./index.js";
import { authoredMedia } from "./media.js";

function profile(over: Partial<PublicProfile> = {}): PublicProfile {
  return {
    slug: "atlas-notes",
    workspaceRef: null,
  followers: 0,
  launches: [],
    tagline: "A calm place to keep what you read",
    pitch: null,
    pitchDigest: null,
    // PV2 — most listings have no install line, so the fixture's default is
    // the common case rather than the interesting one.
    installLine: null,
    // PV3 — most listings have too few upvotes to check, so `false` is the
    // ordinary case and the fixture's default.
    cleanVotes: false,
    media: [],
    // PV4 — `null` is "no baseline yet", which is every listing until the
    // sweep has run twice. Not `[]`, which would mean "compared, nothing
    // moved".
    changes: null,
    stack: ["TypeScript", "SQLite"],
    stackCanonical: ["typescript", "sqlite"],
    category: "productivity",
    hosting: "self-hosted",
    pricing: null,
    repoUrl: "https://github.com/example/atlas-notes",
    liveUrl: "https://atlas-notes.example.com",
    licence: "AGPL-3.0",
    observedAt: null,
    language: null,
    lastCommitAt: null,
    openIssues: null,
    indexable: true,
    publishedAt: "2026-08-14T09:00:00.000Z",
    components: null,
    maintainers: [
      { subjectId: "usr_abc", displayName: "Ada Iyer", roleLabel: "maintainer", handle: "ada" },
    ],
    roleOpenings: [],
    metrics: [
      // A DISTINCTIVE value, so "no observed number reached the document" can
      // be asserted by searching for it rather than by listing field names
      // somebody could add to.
      { key: "merges.7d", value: 987654, observedAt: "2026-08-25T06:00:00.000Z", state: "fresh" },
    ],
    ...over,
  };
}

const APEX = "https://openproduct.live";

describe("the listing record carries no rating, and no way to grow one", () => {
  it("has no aggregateRating, ratingValue, reviewCount or interactionStatistic", () => {
    const doc = listingJsonLd(profile(), APEX);
    const serialised = JSON.stringify(doc);
    for (const forbidden of [
      "aggregateRating",
      "ratingValue",
      "reviewCount",
      "ratingCount",
      "interactionStatistic",
      "review",
    ]) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it("carries NO observed or derived number at all", () => {
    // The stronger rule, and the reason it holds: a derived value owes a
    // reader the formula that produced it (OPC-4), and JSON-LD has nowhere to
    // put one. So the document carries identity and authored words only —
    // which is checkable, because the fixture HAS an observed metric and none
    // of it may appear.
    const serialised = JSON.stringify(listingJsonLd(profile(), APEX));
    expect(serialised).not.toContain("merges");
    expect(serialised).not.toContain("987654");
    expect(serialised).not.toContain("observedAt");
    expect(serialised).not.toContain("2026-08-25");
  });

  it("says WHY, where the next author will be standing", () => {
    // An absence is only a rule if the reason is written down beside it.
    expect(NO_RATING_NOTE).toMatch(/no ratings/i);
    expect(NO_RATING_NOTE).toMatch(/not a score/i);
  });
});

describe("the listing record carries identity and authored words", () => {
  it("names the listing, its address, and its own id", () => {
    const doc = listingJsonLd(profile(), APEX);
    expect(doc["@type"]).toBe("SoftwareSourceCode");
    expect(doc.name).toBe("atlas-notes");
    expect(doc.url).toBe("https://openproduct.live/atlas-notes");
    expect(doc["@id"]).toBe("https://openproduct.live/atlas-notes");
  });

  it("resolves the SPDX licence to its canonical page", () => {
    expect(listingJsonLd(profile(), APEX).license).toBe(
      "https://spdx.org/licenses/AGPL-3.0.html",
    );
  });

  it("omits every URL rather than emitting a relative one when there is no apex", () => {
    // A relative `@id` in a document whose whole purpose is to be consumed
    // away from the page is worse than no `@id` at all.
    const doc = listingJsonLd(profile(), null);
    expect(doc.url).toBeUndefined();
    expect(doc["@id"]).toBeUndefined();
    // The listing's OWN links are still absolute and still fine.
    expect(doc.codeRepository).toBe("https://github.com/example/atlas-notes");
  });

  it("omits every field the listing has not answered, rather than emitting null", () => {
    const bare = listingJsonLd(
      profile({
        tagline: null,
        licence: null,
        repoUrl: null,
        liveUrl: null,
        stack: [],
        category: null,
        publishedAt: null,
        maintainers: [],
      }),
      APEX,
    );
    for (const key of [
      "description",
      "license",
      "codeRepository",
      "installUrl",
      "programmingLanguage",
      "applicationCategory",
      "datePublished",
      "author",
    ]) {
      expect(Object.keys(bare)).not.toContain(key);
    }
    // What remains is the identity, which is always true.
    expect(bare.name).toBe("atlas-notes");
  });
});

describe("nobody is named here who did not name themselves (OPC-5)", () => {
  it("emits a maintainer who wrote a name, and links it when it resolves", () => {
    // CG4 — XP-5's machine-readable half. A crawler that can follow the author
    // to their profile can connect a person's work across listings, which is
    // the graph this page is part of.
    const doc = listingJsonLd(profile(), APEX);
    expect(doc.author).toEqual([
      { "@type": "Person", name: "Ada Iyer", url: `${APEX}/@ada` },
    ]);
  });

  it("emits NO url where the handle does not resolve", () => {
    // `handle` is null exactly when `/@handle` would 404 — the read applies
    // both of the profile's own gates. A `Person.url` pointing at nothing is a
    // dead link no reader will ever see and every crawler will.
    const doc = listingJsonLd(
      profile({
        maintainers: [
          { subjectId: "usr_abc", displayName: "Ada Iyer", roleLabel: null, handle: null },
        ],
      }),
      APEX,
    );
    expect(doc.author).toEqual([{ "@type": "Person", name: "Ada Iyer" }]);
    // The LISTING's own url is still there — it is the document's subject, and
    // narrowing this to the author is the point.
    expect(doc.url).toBe(`${APEX}/atlas-notes`);
  });

  it("emits NO url when no public origin is configured", () => {
    // This document is consumed AWAY FROM THE PAGE, so a relative `/@ada`
    // would resolve against whichever host quoted it. The listing's own `@id`
    // is withheld for the same reason.
    const doc = listingJsonLd(profile(), null);
    expect(doc.author).toEqual([{ "@type": "Person", name: "Ada Iyer" }]);
  });

  it("omits a maintainer who did not, rather than emitting the page's fallback", () => {
    // The page renders "A maintainer" where nobody wrote a name, which is
    // right for a reader. Emitting that string as a `Person.name` would put a
    // placeholder into a machine-readable record of who made something, and a
    // machine has no way to tell it is one.
    const doc = listingJsonLd(
      profile({
        maintainers: [
          { subjectId: "usr_a", displayName: null, roleLabel: null, handle: null },
          { subjectId: "usr_b", displayName: "   ", roleLabel: null, handle: null },
          { subjectId: "usr_c", displayName: "Bo", roleLabel: null, handle: null },
        ],
      }),
      APEX,
    );
    expect(doc.author).toEqual([{ "@type": "Person", name: "Bo" }]);
    expect(JSON.stringify(doc)).not.toContain("A maintainer");
  });

  it("never carries a subject id", () => {
    // The join key is on the wire in `PublicMaintainer` because the page
    // needs it as a React key. It has no business in a document published for
    // machines to keep.
    const serialised = JSON.stringify(listingJsonLd(profile(), APEX));
    expect(serialised).not.toContain("usr_");
    expect(serialised).not.toContain("subjectId");
  });

  it("omits `author` entirely rather than emitting an empty list", () => {
    const doc = listingJsonLd(profile({ maintainers: [] }), APEX);
    expect(Object.keys(doc)).not.toContain("author");
  });
});

describe("the trail above a page (RE1)", () => {
  const TRAIL = [
    { name: "Topics", path: "/topics" },
    { name: "Developer tools", path: "/topics/devtools" },
  ] as const;

  it("names each rung and addresses it absolutely", () => {
    const doc = breadcrumbJsonLd(TRAIL, "https://openproduct.live") as Record<string, unknown>;
    expect(doc["@type"]).toBe("BreadcrumbList");
    expect(doc.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Topics",
        item: "https://openproduct.live/topics",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Developer tools",
        item: "https://openproduct.live/topics/devtools",
      },
    ]);
  });

  it("emits nothing without an origin", () => {
    // A relative `item` in a document consumed away from the page resolves
    // against whatever host quoted it. `null` is the honest answer on a
    // preview deployment that does not know its own public address.
    expect(breadcrumbJsonLd(TRAIL, null)).toBeNull();
  });

  it("emits nothing for a trail with one rung", () => {
    // A breadcrumb of one is not a trail, and a `BreadcrumbList` containing
    // only the page it is on tells a crawler nothing it did not have.
    expect(breadcrumbJsonLd([{ name: "Topics", path: "/topics" }], "https://openproduct.live")).toBeNull();
  });
});

describe("a page that is a list of pages (RE1)", () => {
  const PAGE = {
    name: "Developer tools",
    description: "Things developers install.",
    path: "/topics/devtools",
    paths: ["/my-product", "/my-project"],
  } as const;

  it("counts the list it was given, and has nothing else to count", () => {
    // WC-7 in the machine-readable layer: `numberOfItems` is `paths.length`,
    // not a number passed in beside them, so it cannot disagree with the
    // items — the way to make a counter honest is to give it nothing else to
    // count.
    const doc = collectionPageJsonLd(PAGE, "https://openproduct.live") as Record<string, unknown>;
    const list = doc.mainEntity as Record<string, unknown>;
    expect(list["@type"]).toBe("ItemList");
    expect(list.numberOfItems).toBe(2);
    expect((list.itemListElement as unknown[]).length).toBe(2);
  });

  it("addresses every item absolutely, in the page's own order", () => {
    const doc = collectionPageJsonLd(PAGE, "https://openproduct.live") as Record<string, unknown>;
    const items = (doc.mainEntity as Record<string, unknown>).itemListElement as Array<
      Record<string, unknown>
    >;
    expect(items.map((i) => i.url)).toEqual([
      "https://openproduct.live/my-product",
      "https://openproduct.live/my-project",
    ]);
    expect(items.map((i) => i.position)).toEqual([1, 2]);
  });

  it("emits nothing without an origin", () => {
    expect(collectionPageJsonLd(PAGE, null)).toBeNull();
  });
});

describe("no document this product emits carries a rating", () => {
  // THE RULE HAD TO GROW A WAY OF COVERING TYPES THAT DO NOT EXIST YET. It was
  // written against `SoftwareSourceCode`, which was the only type there was;
  // RE1 added two, and a leaderboard is the single most tempting place on this
  // site to emit `aggregateRating` — it is literally a ranked list with
  // numbers beside it. The numbers are endorsements, an endorsement is not a
  // review, and nothing here is out of five.
  const documents = () => [
    listingJsonLd(
      {
        slug: "my-product",
        tagline: "A tiny CLI",
        licence: "MIT",
        repoUrl: "https://example.invalid/repo",
        liveUrl: null,
        stack: ["typescript"],
        category: "devtools",
        publishedAt: "2026-09-03T00:00:00.000Z",
        maintainers: [{ displayName: "Ada", handle: "ada" }],
        // OSD3 — a logo, so the walk covers a document that carries `image`.
        media: [
          authoredMedia({ id: "m1", kind: "logo", ref: `${"c".repeat(64)}.png`, alt: "Mark", width: 256, height: 256, position: 0 }),
        ],
      } as never,
      "https://openproduct.live",
      "https://api.openproduct.live",
    ),
    breadcrumbJsonLd(
      [
        { name: "Topics", path: "/topics" },
        { name: "Developer tools", path: "/topics/devtools" },
      ],
      "https://openproduct.live",
    ),
    collectionPageJsonLd(
      {
        name: "This week",
        description: "Ranked by upvotes.",
        path: "/leaderboard",
        paths: ["/my-product"],
      },
      "https://openproduct.live",
    ),
  ];

  it("finds no forbidden field anywhere in any of them", () => {
    const serialised = JSON.stringify(documents());
    const found = FORBIDDEN_JSONLD_FIELDS.filter((field) => serialised.includes(field));
    expect(found).toEqual([]);
  });

  it("walks documents that actually have content, so an empty set cannot pass", () => {
    const docs = documents();
    expect(docs.filter(Boolean).length).toBe(3);
    expect(JSON.stringify(docs).length).toBeGreaterThan(400);
  });

  it("keeps the reason written down beside the rule", () => {
    // An absence is only a rule if the reason is written down beside it.
    expect(NO_RATING_NOTE).toMatch(/not a score/);
    expect(FORBIDDEN_JSONLD_FIELDS).toContain("aggregateRating");
    expect(FORBIDDEN_JSONLD_FIELDS).toContain("interactionStatistic");
  });
});

describe("the logo is the listing's image (openproduct-studio OSD3)", () => {
  const API = "https://api.example.test/";
  const HASH = "a".repeat(64);
  const logo = authoredMedia({ id: "m1", kind: "logo", ref: `${HASH}.png`, alt: "Mark", width: 256, height: 256, position: 0 });
  const hero = authoredMedia({ id: "m2", kind: "hero", ref: `${"b".repeat(64)}.jpg`, alt: "Hero", width: 1200, height: 630, position: 0 });

  it("carries the logo's original as `image` when there is one", () => {
    const doc = listingJsonLd(profile({ media: [hero, logo] }), APEX, API);
    expect(doc.image).toBe(`https://api.example.test/v1/media/${HASH}.png`);
  });

  it("never promotes the hero, and emits no image without a logo", () => {
    expect(listingJsonLd(profile({ media: [hero] }), APEX, API)).not.toHaveProperty("image");
    expect(listingJsonLd(profile(), APEX, API)).not.toHaveProperty("image");
  });

  it("emits no image without an absolute media origin", () => {
    expect(listingJsonLd(profile({ media: [logo] }), APEX)).not.toHaveProperty("image");
  });
});
