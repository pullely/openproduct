// The logo on every surface (openproduct-studio OSD3).
//
// OSD2 put the logo on the feed's rows. This milestone puts it on every other
// row that draws a product's tile — the board, the leaderboard, search, a
// maker's rows and header, a collection, saved, the studio list — and each
// handler here is held to the same three things:
//
//   1. a listing WITH a logo carries it as `thumbnail`;
//   2. a listing without one (a hero is not a logo) carries `null`;
//   3. the media is read ONCE per request, never once per row.

import type { OpenproductRepository, ProductMediaRecord } from "@openproduct/db";
import type { Env } from "@openproduct-worker/env";
import { handleBoardDay } from "@openproduct-worker/handlers/board";
import { handleCollection } from "@openproduct-worker/handlers/collections";
import { handleLeaderboard } from "@openproduct-worker/handlers/leaderboard";
import { handleMakerTab } from "@openproduct-worker/handlers/maker";
import { handleListMyListings, handleListSaved } from "@openproduct-worker/handlers/me";
import { handlePublicContributor } from "@openproduct-worker/handlers/public";
import { handleSearch } from "@openproduct-worker/handlers/search";

const ENV = { ENVIRONMENT: "test" } as Env;
const ACTOR = { subjectId: "usr_ada", subjectType: "user" };
const LOGO_REF = `${"a".repeat(64)}.png`;
const LOGO = { ref: LOGO_REF, alt: "The mark", width: 256, height: 256 };

function media(id: string, kind: ProductMediaRecord["kind"], ref: string): ProductMediaRecord {
  return {
    id,
    kind,
    storageRef: ref,
    alt: kind === "logo" ? "The mark" : "A picture",
    width: kind === "logo" ? 256 : 1200,
    height: kind === "logo" ? 256 : 630,
    position: 0,
    observedAt: null,
  };
}

/** `logoed` has a logo (and a hero); `heroed` has only a hero; `plain` has nothing. */
function mediaRepo() {
  const reads: string[][] = [];
  const bySlug = new Map<string, ProductMediaRecord[]>([
    ["logoed", [media("h1", "hero", `${"b".repeat(64)}.jpg`), media("l1", "logo", LOGO_REF)]],
    ["heroed", [media("h2", "hero", `${"c".repeat(64)}.jpg`)]],
  ]);
  return {
    reads,
    async listPublicMediaForSlugs(slugs: string[]) {
      reads.push([...slugs]);
      return new Map([...bySlug].filter(([slug]) => slugs.includes(slug)));
    },
  };
}

async function data(res: Response): Promise<Record<string, unknown>> {
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: Record<string, unknown> }).data;
}

function pairs(rows: unknown, key = "slug"): Array<[string, unknown]> {
  return (rows as Array<Record<string, unknown>>).map((r) => [r[key] as string, r.thumbnail]);
}

const EXPECTED: Array<[string, unknown]> = [
  ["logoed", LOGO],
  ["heroed", null],
  ["plain", null],
];

describe("the launch board", () => {
  it("carries each row's logo, null without one, from one read", async () => {
    const m = mediaRepo();
    const rank = (slug: string, counted: number) => ({
      launchId: `l-${slug}`,
      slug,
      tagline: null,
      versionLabel: "1.0",
      launchedAt: "2026-09-01T09:00:00.000Z",
      counted,
      ineligible: 0,
      observedAt: "2026-09-01T10:00:00.000Z",
    });
    const repo = { ...m, async readBoardRanks() { return [rank("logoed", 3), rank("heroed", 2), rank("plain", 1)]; } };
    const res = await handleBoardDay(ENV, new Request("https://x/"), "2026-09-01", "req", {
      repo: repo as unknown as OpenproductRepository,
      now: () => Date.parse("2026-09-05T00:00:00.000Z"),
    });
    expect(pairs((await data(res)).board)).toEqual(EXPECTED);
    expect(m.reads).toHaveLength(1);
  });
});

describe("the leaderboard", () => {
  it("carries each row's logo, null without one, from one read", async () => {
    const m = mediaRepo();
    const row = (slug: string, rank: number) => ({
      launchId: `l-${slug}`,
      profileId: `p-${slug}`,
      slug,
      tagline: null,
      versionLabel: "1.0",
      launchedAt: "2026-09-04T09:00:00.000Z",
      day: "2026-09-04",
      rank,
      counted: 10 - rank,
      ineligible: 0,
      licence: null,
      category: null,
      stack: [],
      roleOpeningCount: 0,
      commentCount: 0,
    });
    const repo = {
      ...m,
      async listFeedLaunches() { return [row("logoed", 1), row("heroed", 2), row("plain", 3)]; },
      async listRostersFor() { return new Map(); },
    };
    const res = await handleLeaderboard(ENV, new Request("https://x/leaderboard"), "req", {
      repo: repo as unknown as OpenproductRepository,
      now: () => Date.parse("2026-09-05T12:00:00.000Z"),
    });
    expect(pairs((await data(res)).entries)).toEqual(EXPECTED);
    expect(m.reads).toHaveLength(1);
  });
});

describe("search", () => {
  it("carries a product hit's logo after the rank, and reads only the ranked hits' slugs", async () => {
    const m = mediaRepo();
    const hit = (entityId: string) => ({ kind: "product", entityId, title: `${entityId} tool`, summary: null, terms: ["tool"], facets: {} });
    const repo = {
      ...m,
      async searchCandidates() { return [hit("logoed"), hit("heroed"), hit("plain")]; },
      async searchPublicContributors() { return []; },
    };
    const res = await handleSearch(ENV, new URL("https://x/search?q=tool"), "req", {
      repo: repo as unknown as OpenproductRepository,
    });
    const results = (await data(res)).results;
    expect(new Map(pairs(results, "entityId"))).toEqual(new Map(EXPECTED));
    expect(m.reads).toHaveLength(1);
  });

  it("a failed media read is a monogram, never a failed search", async () => {
    const repo = {
      async listPublicMediaForSlugs() { throw new Error("down"); },
      async searchCandidates() {
        return [{ kind: "product", entityId: "logoed", title: "logoed", summary: null, terms: ["logoed"], facets: {} }];
      },
      async searchPublicContributors() { return []; },
    };
    const res = await handleSearch(ENV, new URL("https://x/search?q=logoed"), "req", {
      repo: repo as unknown as OpenproductRepository,
    });
    expect(pairs((await data(res)).results, "entityId")).toEqual([["logoed", null]]);
  });
});

describe("a maker's page", () => {
  const contributor = {
    handle: "ada",
    displayName: "Ada",
    bio: null,
    githubUrl: null,
    siteUrl: null,
    openToProject: false,
    publishedAt: "2026-08-01T00:00:00.000Z",
    maintains: [{ slug: "logoed", tagline: null }, { slug: "heroed", tagline: null }],
    contributesTo: [{ slug: "plain", tagline: null }],
  };

  it("carries the logo on every tab's rows AND on the header's listings, from one read each", async () => {
    const m = mediaRepo();
    const launch = (slug: string) => ({ launchId: `l-${slug}`, slug, tagline: null, versionLabel: "1.0", day: "2026-09-01", rank: 1, counted: 1 });
    const repo = {
      ...m,
      async getPublicContributor() { return contributor; },
      async getSubjectsForHandles() { return new Map([["ada", "usr_ada"]]); },
      async countFollowers() { return new Map(); },
      async countMakerActivity() { return { launched: 3, upvotesGiven: 0, comments: 0 }; },
      async listMakerLaunches() { return [launch("logoed"), launch("heroed"), launch("plain")]; },
      async firstMakerLaunchDay() { return null; },
      async countMakerCleanVoteListings() { return 0; },
    };
    const res = await handleMakerTab(ENV, new Request("https://x/"), "req", "ada", "launched", {
      repo: repo as unknown as OpenproductRepository,
    });
    const body = await data(res);
    expect(pairs(body.rows)).toEqual(EXPECTED);
    const header = body.contributor as { maintains: unknown; contributesToListings: unknown };
    expect(pairs(header.maintains)).toEqual(EXPECTED.slice(0, 2));
    expect(pairs(header.contributesToListings)).toEqual(EXPECTED.slice(2));
    expect(m.reads).toHaveLength(2);
  });

  it("the bare profile carries the same logos on its listings", async () => {
    const m = mediaRepo();
    const repo = {
      ...m,
      async getPublicContributor() { return contributor; },
      async getSubjectsForHandles() { return new Map([["ada", "usr_ada"]]); },
      async countFollowers() { return new Map(); },
    };
    const res = await handlePublicContributor(ENV, "req", "ada", { repo: repo as unknown as OpenproductRepository });
    const header = (await data(res)).contributor as { maintains: unknown; contributesToListings: unknown };
    expect([...pairs(header.maintains), ...pairs(header.contributesToListings)]).toEqual(EXPECTED);
    expect(m.reads).toHaveLength(1);
  });
});

describe("a collection", () => {
  it("fills each item's card with its logo, in the curator's order", async () => {
    const m = mediaRepo();
    const card = (slug: string) => ({ slug, tagline: null, stack: [], roleOpeningCount: 0, publishedAt: null });
    const repo = {
      ...m,
      async getPublicCollection() {
        return {
          slug: "picks",
          title: "Picks",
          blurb: null,
          curatorHandle: "ada",
          publishedAt: "2026-09-01T00:00:00.000Z",
          items: ["logoed", "heroed", "plain"].map((slug) => ({ card: card(slug), note: null })),
        };
      },
    };
    const res = await handleCollection(ENV, new Request("https://x/"), "picks", "req", {
      repo: repo as unknown as OpenproductRepository,
    });
    const items = ((await data(res)).collection as { items: Array<{ card: unknown }> }).items;
    expect(pairs(items.map((i) => i.card))).toEqual(EXPECTED);
    expect(m.reads).toHaveLength(1);
  });
});

describe("the signed-in lists", () => {
  it("saved products carry each card's logo, from one read", async () => {
    const m = mediaRepo();
    const card = (slug: string) => ({ slug, tagline: null, stack: [], roleOpeningCount: 0, publishedAt: null });
    const repo = { ...m, async listSavedPublicCards() { return [card("logoed"), card("heroed"), card("plain")]; } };
    const res = await handleListSaved(ENV, "req", ACTOR, { repo: repo as unknown as OpenproductRepository });
    expect(pairs((await data(res)).products)).toEqual(EXPECTED);
    expect(m.reads).toHaveLength(1);
  });

  it("the studio list carries each listing's logo, a DRAFT's included, from one read by profile id", async () => {
    const ids = {
      logoed: "11111111-1111-4111-8111-111111111111",
      heroed: "22222222-2222-4222-8222-222222222222",
      plain: "33333333-3333-4333-8333-333333333333",
    };
    const reads: string[][] = [];
    const profile = (slug: keyof typeof ids) => ({
      id: ids[slug],
      orgId: "44444444-4444-4444-8444-444444444444",
      projectId: "55555555-5555-4555-8555-555555555555",
      slug,
      // A draft: the public media read would never see it.
      visibility: "private",
      tagline: null,
      publishedAt: null,
      reviewedAt: null,
      repoVisibility: null,
      linkGrant: null,
    });
    const repo = {
      async listProfilesMaintainedBy() { return [profile("logoed"), profile("heroed"), profile("plain")]; },
      async listMediaForProfiles(profileIds: string[]) {
        reads.push([...profileIds]);
        return new Map([
          [ids.logoed, [media("l1", "logo", LOGO_REF)]],
          [ids.heroed, [media("h2", "hero", `${"c".repeat(64)}.jpg`)]],
        ]);
      },
    };
    const res = await handleListMyListings(ENV, "req", ACTOR, { repo: repo as unknown as OpenproductRepository });
    expect(pairs((await data(res)).listings)).toEqual(EXPECTED);
    expect(reads).toEqual([[ids.logoed, ids.heroed, ids.plain]]);
  });
});
