// THE EXACT-KEY-SET CONTRACT TEST (saas-openproduct OD3, design.md §4).
//
// The epic calls this its highest-value test and budgets thirty lines for it.
// What it buys: adding a field to ANY internal type cannot widen the public
// projection, because the public shape is authored rather than derived — and
// adding a field HERE requires editing a literal, which is a reviewable act
// rather than an inference.
//
// The literals live in @saas/contracts/openproduct next to the interfaces.
// This file asserts three separate things about them, because the failure this
// guards against can enter at three different points:
//
//   1. the CONTRACT's literal drifts from its interface,
//   2. the HANDLER assembles a key the contract does not name,
//   3. a field known to be dangerous appears in either.
//
// (2) is the one a type system cannot catch on its own: TypeScript is happy
// with an object that carries extra keys once it has been widened to a return
// type, and JSON.stringify will happily serialize them.

import {
  PUBLIC_MAINTAINER_KEYS,
  activityBucket,
  openingsFacetValues,
  PUBLIC_METRIC_KEYS,
  PUBLIC_PROFILE_CARD_KEYS,
  PUBLIC_LAUNCH_PLACEMENT_KEYS,
  PUBLIC_LISTING_LAUNCH_KEYS,
  PUBLIC_PROFILE_KEYS,
  PUBLIC_ROLE_OPENING_KEYS,
  type PublicProfile,
  type PublicProfileCard,
  PAGE_SIZE_MAX,
} from "@openproduct/contracts";
import type { OpenproductRepository, ProfileRecord } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { PublicHandlerDeps } from "@openproduct-worker/handlers/public";

const PROFILE_UUID = "55555555-5555-4555-8555-555555555555";
const OPENING_UUID = "77777777-7777-4777-8777-777777777777";

/**
 * A profile record carrying EVERY internal column, including the ones that
 * must never be projected. If the handler ever spreads the record instead of
 * naming fields, these are what would appear.
 */
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
    liveUrl: "https://acme.test",
    stack: ["typescript", "Hand-rolled CRDT"],
    stackCanonical: ["typescript"],
    category: "dev-tools",
    hosting: "self-hosted",
    pricing: null,
    repoVisibility: "public",
    repoLicence: "Apache-2.0",
    repoCheckedAt: "2026-08-17T11:00:00.000Z",
    // IN2 — observed from the linked repository, never authored. `null` is
    // "not observed", which is what a fixture that never ran a check holds.
    repoName: null,
    repoDescription: null,
    repoTopics: null,
    // PV0 — the rest of the observed row. `null` is "not observed".
    repoLanguage: null,
    repoPushedAt: null,
    repoOpenIssues: null,
    reviewedAt: "2026-08-17T10:00:00.000Z",
    reviewedBy: "usr_admin0000000000000000000000000",
    publishedAt: "2026-08-17T12:00:00.000Z",
    indexable: true,
    // TS3 — the estate's own axis, on every fixture: a listing nobody has
    // acted on. Kept separate from `visibility` above, which is the
    // maintainer's switch and says nothing about moderation.
    moderationState: "visible" as const,
    moderatedAt: null,
    moderationActId: null,
    components: null,
    // OX5 — the stored link grant: internal, and must never be projected.
    linkGrant: {
      doorRef: "jlt_printable_token",
      grantedBy: "usr_admin6789abcdef0123456789abcdef",
      grantedAt: "2026-08-17T11:55:00.000Z",
      workspaceVisibility: "public",
    },
    createdBy: "usr_maintainer00000000000000000000",
    updatedBy: "usr_maintainer00000000000000000000",
    createdAt: "2026-08-17T09:00:00.000Z",
    updatedAt: "2026-08-17T12:00:00.000Z",
    ...overrides,
  };
}

function publicDeps(profile: ProfileRecord | null = storedProfile()): PublicHandlerDeps {
  return {
    repo: {
      async listPublicCards() {
        return profile
          ? [
              {
                slug: profile.slug,
                tagline: profile.tagline,
                stack: profile.stack,
                // CT1 — the card now carries the canonicalised half and the
                // three facets it filters by. The authored `stack` keeps the
                // entry the vocabulary did not recognise; `stackCanonical`
                // does not, which is the property the assertion below pins.
                stackCanonical: profile.stackCanonical,
                category: profile.category,
                hosting: profile.hosting,
                pricing: profile.pricing,
                licence: profile.repoLicence,
                roleOpeningCount: 1,
                openCommitments: ["One evening a week"],
                hasLiveUrl: true,
                publishedAt: profile.publishedAt,
              },
            ]
          : [];
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
      // CB2 — raw pending counts; the handler floors them (OPC-F).
      async countOpeningDemand() {
        return [];
      },
      async latestMetrics() {
        // SN2 — one observed metric, so the widened projection is exercised
        // rather than trivially empty.
        return [
          {
            profileId: PROFILE_UUID,
            metric: "merges",
            window: "7d",
            value: 38,
            source: "linked_repo" as const,
            observedAt: new Date(Date.now() - 60_000).toISOString(),
          },
        ];
      },
      // MD3 — the rows' tiles; none on these fixtures unless a test says so.
      async listPublicMediaForSlugs() {
        return new Map();
      },
      async latestMetricsForSlugs() {
        return new Map([
          [
            "acme-thing",
            [
              {
                profileId: PROFILE_UUID,
                metric: "merges",
                window: "7d",
                value: 38,
                source: "linked_repo" as const,
                observedAt: new Date(Date.now() - 60_000).toISOString(),
              },
            ],
          ],
        ]);
      },
      async getPublicProfile() {
        return profile;
      },
      // LC2 — the strip's counts. Distinct numbers per window so a handler
      // that read the wrong one is visible rather than coincidentally right.
      async countPublishedWindows() {
        return { today: 12, week: 30, month: 60, total: 400 };
      },
      // MD2 — the media rows; none on these fixtures.
      async listPublicMedia() {
        return [];
      },
      async listPublicMaintainers() {
        return [
          {
            subjectId: "usr_aaaa0000000000000000000000000000",
            displayName: "Ada",
            roleLabel: "maintainer",
            // CG4 — non-null IF AND ONLY IF `/@handle` resolves, which is what
            // lets the page link on presence alone (XP-5). The repository
            // applies both gates; the projection just carries the answer.
            handle: "ada",
          },
        ];
      },
      // PV4 — no earlier snapshot, which is the ordinary case for a listing
      // nobody has recorded yet. `null` renders NO section rather than a diff
      // claiming every field changed on the day we started looking.
      async latestSnapshotBefore() {
        return null;
      },
      async listPublicRoleOpenings() {
        return [
          {
            id: OPENING_UUID,
            profileId: PROFILE_UUID,
            title: "Design lead",
            description: "Own the visual language",
            commitment: "a few hours a week",
            status: "open" as const,
            joinLinkRef: "jl_abc",
            sortOrder: 0,
          },
        ];
      },
      // UV1 — the placement's two reads. Empty by default, so the base
      // projection carries NO `launch` key at all: the pinned key set below
      // is what a listing that has never launched serializes, which is most
      // of them, and the key's absence is the assertion.
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
  };
}

/**
 * UV1 — a listing that launched on a day the sweep ranked, and placed second
 * of two.
 *
 * SECOND, NOT FIRST, on purpose: a fixture where the answer is 1 cannot tell
 * a real lookup from a hard-coded one, and `of: 2` is what makes the ordinal
 * scalable rather than a bare number.
 */
function placedDeps(): PublicHandlerDeps {
  const base = publicDeps();
  const LAUNCHED = "2026-08-17T09:00:00.000Z";
  return {
    ...base,
    repo: {
      ...(base.repo as unknown as Record<string, unknown>),
      async listLaunchesForProfile() {
        return [
          // A withdrawn launch, and a live one. Only the live one places, and
          // only the most recent of those — a page listing every past
          // placement would be a leaderboard of one product against itself.
          { id: "lch-old", state: "withdrawn", launchedAt: "2026-08-01T09:00:00.000Z", versionLabel: "0.9" },
          { id: "lch-live", state: "live", launchedAt: LAUNCHED, versionLabel: "1.0" },
        ];
      },
      async readBoardRanks() {
        return [
          {
            launchId: "lch-other",
            profileId: "p-other",
            slug: "other-thing",
            tagline: null,
            versionLabel: "2.0",
            launchedAt: "2026-08-17T08:00:00.000Z",
            counted: 9,
            ineligible: 0,
            observedAt: LAUNCHED,
          },
          {
            launchId: "lch-live",
            profileId: "p-acme",
            slug: "acme-thing",
            tagline: null,
            versionLabel: "1.0",
            launchedAt: LAUNCHED,
            counted: 3,
            ineligible: 1,
            observedAt: LAUNCHED,
          },
        ];
      },
      // PP5 — the history's feed read. Empty by default: a day the sweep has
      // not reached, so the one live launch lists as unranked.
      async listFeedLaunches() {
        return [];
      },
    },
  } as unknown as PublicHandlerDeps;
}

const ENV = { ENVIRONMENT: "stage" } as Env;

function get(path: string): Request {
  return new Request(`https://openproduct-worker.internal${path}`, { method: "GET" });
}

async function fetchProfile(): Promise<PublicProfile> {
  const res = await route(
    get("/internal/public/openproduct/projects/acme-thing"),
    ENV,
    undefined,
    publicDeps(),
  );
  const body = (await res.json()) as { data: { profile: PublicProfile } };
  return body.data.profile;
}

async function fetchCards(): Promise<PublicProfileCard[]> {
  const res = await route(get("/internal/public/openproduct/projects"), ENV, undefined, publicDeps());
  const body = (await res.json()) as { data: { projects: PublicProfileCard[] } };
  return body.data.projects;
}

describe("the pinned key sets (design.md §4)", () => {
  it("PublicProfileCard serializes exactly its literal", async () => {
    const [card] = await fetchCards();
    expect(Object.keys(card!).sort()).toEqual([...PUBLIC_PROFILE_CARD_KEYS]);
  });

  it("PublicProfile serializes exactly its literal, minus what it has nothing to say about", async () => {
    const profile = await fetchProfile();
    // UV1 made `launch` OPTIONAL, and that is the whole of the decision: a
    // listing with no placement carries no key rather than `launch: null`,
    // because a null would be the page saying "we looked and it placed
    // nowhere" and the two are different claims (OPC-C).
    //
    // So the literal is still the exact set of keys this shape may carry, and
    // the fixture — a listing that has never launched, which is most of them
    // — carries every one of them except that. Both halves are asserted: no
    // key outside the literal, and no key missing from it but the optional
    // one.
    const keys = Object.keys(profile).sort();
    expect(keys).toEqual([...PUBLIC_PROFILE_KEYS].filter((k) => k !== "launch"));
    expect(keys.every((k) => (PUBLIC_PROFILE_KEYS as readonly string[]).includes(k))).toBe(true);
  });

  it("UV1 — a listing that HAS placed carries the key, at its own literal", async () => {
    // The other half of the optional key: when there is something to say, the
    // shape is pinned exactly like every other one here.
    const res = await route(
      get("/internal/public/openproduct/projects/acme-thing"),
      ENV,
      undefined,
      placedDeps(),
    );
    const body = (await res.json()) as { data: { profile: PublicProfile } };
    const launch = body.data.profile.launch!;
    expect(launch).toBeDefined();
    expect(Object.keys(launch).sort()).toEqual([...PUBLIC_LAUNCH_PLACEMENT_KEYS]);
    // READ, NOT DERIVED (OL-2a): the position is where the board's own order
    // put this launch, and `of` is how many shared the day so a reader can
    // scale the ordinal.
    expect(launch).toMatchObject({ day: "2026-08-17", rank: 2, of: 2, counted: 3 });
  });

  // PP4 — the weekly standing on the placement, read from the leaderboard's
  // own build over the leaderboard's own read, and only when the launch's
  // day is inside the seven-day window.
  it("PP4 — a launch inside the week carries its leaderboard standing, from the leaderboard's own read", async () => {
    const deps = placedDeps();
    let asked: readonly string[] | null = null;
    (deps.repo as unknown as Record<string, unknown>).listFeedLaunches = async (days: readonly string[]) => {
      asked = days;
      return [
        // A busier launch on another day outranks ours on the week even
        // though ours won its own day — which is the leaderboard's whole
        // point and what makes the standing a real lookup.
        { launchId: "lch-busy", profileId: "p-busy", slug: "busy-thing", tagline: null, versionLabel: "1.0", launchedAt: "2026-08-15T09:00:00.000Z", day: "2026-08-15", rank: 1, counted: 20, ineligible: 0, licence: null, category: null, stack: [], roleOpeningCount: 0, commentCount: 0 },
        { launchId: "lch-live", profileId: "p-acme", slug: "acme-thing", tagline: null, versionLabel: "1.0", launchedAt: "2026-08-17T09:00:00.000Z", day: "2026-08-17", rank: 2, counted: 3, ineligible: 1, licence: null, category: null, stack: [], roleOpeningCount: 0, commentCount: 0 },
        // Unranked: the sweep has not reached it, so it is not on the week.
        { launchId: "lch-new", profileId: "p-new", slug: "new-thing", tagline: null, versionLabel: "1.0", launchedAt: "2026-08-18T09:00:00.000Z", day: "2026-08-18", rank: null, counted: 0, ineligible: 0, licence: null, category: null, stack: [], roleOpeningCount: 0, commentCount: 0 },
      ];
    };
    deps.now = () => new Date("2026-08-18T12:00:00Z");
    const res = await route(get("/internal/public/openproduct/projects/acme-thing"), ENV, undefined, deps);
    const body = (await res.json()) as { data: { profile: PublicProfile } };
    expect(asked).toEqual([
      "2026-08-18", "2026-08-17", "2026-08-16", "2026-08-15", "2026-08-14", "2026-08-13", "2026-08-12",
    ]);
    expect(body.data.profile.launch!.week).toEqual({ rank: 2, of: 2, from: "2026-08-12", to: "2026-08-18" });
  });

  // PP5 — the history: every live launch, newest first, each read from the
  // feed's own rows for its day; an unranked day is null, never zero.
  it("PP5 — the history lists every live launch with the board's own numbers, and says when a day is unranked", async () => {
    const deps = placedDeps();
    (deps.repo as unknown as Record<string, unknown>).listLaunchesForProfile = async () => [
      { id: "lch-old", state: "withdrawn", launchedAt: "2026-08-01T09:00:00.000Z", versionLabel: "0.9" },
      { id: "lch-v1", state: "live", launchedAt: "2026-08-10T09:00:00.000Z", versionLabel: "1.0" },
      { id: "lch-live", state: "live", launchedAt: "2026-08-17T09:00:00.000Z", versionLabel: "1.1" },
      { id: "lch-v2", state: "live", launchedAt: "2026-08-20T09:00:00.000Z", versionLabel: "2.0" },
    ];
    const asked: string[][] = [];
    (deps.repo as unknown as Record<string, unknown>).listFeedLaunches = async (days: string[]) => {
      asked.push([...days]);
      return [
        { launchId: "lch-v1", profileId: "p-acme", slug: "acme-thing", tagline: null, versionLabel: "1.0", launchedAt: "2026-08-10T09:00:00.000Z", day: "2026-08-10", rank: 1, counted: 7, ineligible: 0, licence: null, category: null, stack: [], roleOpeningCount: 0, commentCount: 4 },
        { launchId: "lch-else", profileId: "p-else", slug: "else", tagline: null, versionLabel: "1.0", launchedAt: "2026-08-10T10:00:00.000Z", day: "2026-08-10", rank: 2, counted: 2, ineligible: 0, licence: null, category: null, stack: [], roleOpeningCount: 0, commentCount: 0 },
        { launchId: "lch-live", profileId: "p-acme", slug: "acme-thing", tagline: null, versionLabel: "1.1", launchedAt: "2026-08-17T09:00:00.000Z", day: "2026-08-17", rank: 2, counted: 3, ineligible: 1, licence: null, category: null, stack: [], roleOpeningCount: 0, commentCount: 1 },
        { launchId: "lch-other", profileId: "p-other", slug: "other-thing", tagline: null, versionLabel: "2.0", launchedAt: "2026-08-17T08:00:00.000Z", day: "2026-08-17", rank: 1, counted: 9, ineligible: 0, licence: null, category: null, stack: [], roleOpeningCount: 0, commentCount: 0 },
        // The sweep has not reached the newest day.
        { launchId: "lch-v2", profileId: "p-acme", slug: "acme-thing", tagline: null, versionLabel: "2.0", launchedAt: "2026-08-20T09:00:00.000Z", day: "2026-08-20", rank: null, counted: 0, ineligible: 0, licence: null, category: null, stack: [], roleOpeningCount: 0, commentCount: 2 },
      ];
    };
    deps.now = () => new Date("2026-09-10T12:00:00Z");
    const res = await route(get("/internal/public/openproduct/projects/acme-thing"), ENV, undefined, deps);
    const body = (await res.json()) as { data: { profile: PublicProfile } };
    const history = body.data.profile.launches;
    expect(history.map((l) => Object.keys(l).sort())).toEqual(history.map(() => [...PUBLIC_LISTING_LAUNCH_KEYS]));
    expect(history).toEqual([
      { day: "2026-08-20", launchedAt: "2026-08-20T09:00:00.000Z", versionLabel: "2.0", rank: null, of: null, counted: null, commentCount: 2 },
      { day: "2026-08-17", launchedAt: "2026-08-17T09:00:00.000Z", versionLabel: "1.1", rank: 2, of: 2, counted: 3, commentCount: 1 },
      { day: "2026-08-10", launchedAt: "2026-08-10T09:00:00.000Z", versionLabel: "1.0", rank: 1, of: 2, counted: 7, commentCount: 4 },
    ]);
    // One feed read for the whole history, over exactly the launches' days.
    expect(asked.filter((days) => days.length === 3)).toEqual([["2026-08-20", "2026-08-17", "2026-08-10"]]);
  });

  it("PP5 — a listing that never launched carries an empty history, not a missing key", async () => {
    const profile = await fetchProfile();
    expect(profile.launches).toEqual([]);
  });

  it("PP4 — a launch outside the week carries `week: null` and costs no leaderboard read", async () => {
    const deps = placedDeps();
    let read = 0;
    (deps.repo as unknown as Record<string, unknown>).listFeedLaunches = async (days: string[]) => {
      // PP5's history read asks for the launch's own day; the leaderboard's
      // asks for seven. Only the second is the read this test refuses.
      if (days.length === 7) read += 1;
      return [];
    };
    deps.now = () => new Date("2026-09-10T12:00:00Z");
    const res = await route(get("/internal/public/openproduct/projects/acme-thing"), ENV, undefined, deps);
    const body = (await res.json()) as { data: { profile: PublicProfile } };
    expect(body.data.profile.launch!.week).toBeNull();
    expect(read).toBe(0);
  });

  it("OPR5 — carries the attested workspace's console ref while a link grant is held, and null without one", async () => {
    // Seam edge S12: the page renders "View workspace on Orunbase" on this
    // key alone. It is the GRANT's fact, not the row's: the record's own
    // orgId stays forbidden below, and a listing whose grant was revoked
    // (narrowing, S4) carries null and so renders no door.
    const linked = await fetchProfile();
    expect(linked.workspaceRef).toBe(`org_${storedProfile().orgId.replace(/-/g, "")}`);
    const res = await route(
      get("/internal/public/openproduct/projects/acme-thing"),
      ENV,
      undefined,
      publicDeps(storedProfile({ linkGrant: null })),
    );
    const body = (await res.json()) as { data: { profile: PublicProfile } };
    expect(body.data.profile.workspaceRef).toBeNull();
    expect(Object.keys(body.data.profile)).toContain("workspaceRef");
  });

  it("a published maintainer serializes exactly its literal", async () => {
    const profile = await fetchProfile();
    expect(Object.keys(profile.maintainers[0]!).sort()).toEqual([...PUBLIC_MAINTAINER_KEYS]);
  });

  it("a role opening serializes exactly its literal", async () => {
    const profile = await fetchProfile();
    expect(Object.keys(profile.roleOpenings[0]!).sort()).toEqual([...PUBLIC_ROLE_OPENING_KEYS]);
  });

  it("the literals are sorted and unique, so a diff on them is readable", () => {
    for (const keys of [
      PUBLIC_PROFILE_CARD_KEYS,
      PUBLIC_PROFILE_KEYS,
      PUBLIC_MAINTAINER_KEYS,
      PUBLIC_ROLE_OPENING_KEYS,
      PUBLIC_LAUNCH_PLACEMENT_KEYS,
      PUBLIC_LISTING_LAUNCH_KEYS,
    ]) {
      expect([...keys]).toEqual([...keys].sort());
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe("what the projection must never carry", () => {
  // Each of these is a real column on the record the handler was handed. If a
  // future change spreads the record rather than naming fields, this is the
  // test that fails — before anything reaches a public page.
  const FORBIDDEN = [
    "id", // the internal profile UUID
    "orgId", // which workspace owns it — tenancy structure
    "projectId",
    "visibility", // a public page saying "public" is noise; a private one leaking is not
    "reviewedAt",
    "reviewedBy", // who approved it, and when
    "createdBy",
    "updatedBy", // actor ids
    "repoVisibility",
    "repoCheckedAt", // platform bookkeeping
    "createdAt",
    "updatedAt",
  ];

  it.each(FORBIDDEN)("does not project %s", async (key) => {
    const profile = await fetchProfile();
    expect(Object.keys(profile)).not.toContain(key);
  });

  it("serializes no email anywhere in the page, at any depth", async () => {
    const profile = await fetchProfile();
    const json = JSON.stringify(profile).toLowerCase();
    expect(json).not.toContain("email");
    expect(json).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  });

  it("carries no key whose name suggests a private plane", async () => {
    const profile = await fetchProfile();
    const json = JSON.stringify(profile).toLowerCase();
    for (const word of ["secret", "token", "audit", "spend", "metering", "session", "run", "catalog"]) {
      expect(`${word}: ${json.includes(`"${word}`)}`).toBe(`${word}: false`);
    }
  });

  it("projects the licence the App observed, not a maintainer's claim", async () => {
    const profile = await fetchProfile();
    expect(profile.licence).toBe("Apache-2.0");
  });

  it("IN3 — carries no completeness figure, anywhere, at any depth", async () => {
    // WC-D's separation, asserted rather than reasoned about. The meter is
    // advice to the maker in their own studio; a number about how filled-in
    // somebody's listing is, published beside it, becomes a rating of their
    // work the first time anybody sorts by it — which is exactly the shape
    // WC-D refused when it turned down the audit's published weight.
    //
    // The FLOOR is public and that is fine: it is a rule with a published
    // sentence at `catalog.front-page-floor`, and it decides presence rather
    // than position. What must never travel is the measurement.
    const profile = await fetchProfile();
    const json = JSON.stringify(profile).toLowerCase();
    for (const word of ["completeness", "complete", "filled", "score", "meter"]) {
      expect(`${word}: ${json.includes(`"${word}`)}`).toBe(`${word}: false`);
    }
  });
});

describe("the public read cannot be talked into a private row", () => {
  it("404s an unknown slug", async () => {
    const res = await route(
      get("/internal/public/openproduct/projects/nope"),
      ENV,
      undefined,
      publicDeps(null),
    );
    expect(res.status).toBe(404);
  });

  // A private profile and a nonexistent one must be indistinguishable — the
  // repository returns null for both, and the body must match too, or the
  // difference is an existence oracle over every workspace's drafts.
  it("answers a private profile identically to a nonexistent one", async () => {
    const missing = await route(
      get("/internal/public/openproduct/projects/nope"),
      ENV,
      undefined,
      publicDeps(null),
    );
    const privateRow = await route(
      get("/internal/public/openproduct/projects/acme-thing"),
      ENV,
      undefined,
      publicDeps(null),
    );
    // Request ids differ per request by design; everything else must not.
    const strip = (body: string) => body.replace(/"requestId":"[^"]+"/, '"requestId":"<id>"');
    expect(privateRow.status).toBe(missing.status);
    expect(strip(await privateRow.text())).toBe(strip(await missing.text()));
  });

  it.each(["../../etc/passwd", "a b", "%2e%2e", "'; DROP TABLE--", "a".repeat(65)])(
    "404s the malformed slug %s without reaching the repository",
    async (slug) => {
      let reached = false;
      const deps: PublicHandlerDeps = {
        repo: {
          async getPublicProfile() {
            reached = true;
            return null;
          },
  
      // UV1 — the placement's two reads. Empty by default: a listing that has
      // never launched is the common case, and the ABSENT `launch` key is what
      // the pinned key set asserts.
      async listLaunchesForProfile() {
        return [];
      },
      async readBoardRanks() {
        return [];
      },
      } as unknown as OpenproductRepository,
      };
      const res = await route(
        get(`/internal/public/openproduct/projects/${encodeURIComponent(slug)}`),
        ENV,
        undefined,
        deps,
      );
      expect(res.status).toBe(404);
      expect(reached).toBe(false);
    },
  );

  it("clamps a hostile limit rather than passing it through", async () => {
    let seen: number | undefined;
    const deps: PublicHandlerDeps = {
      repo: {
        // OS1 — the directory is a page; the contract's ceiling is the clamp.
        async listPublicCardsPage(input: { limit: number }) {
          seen = input.limit;
          return { cards: [], next: null };
        },
        // OS5 — never computed by default: the fakes below are the live join,
        // and a page served from it says so with a null moment.
        async listCataloguePage() {
          return { computedAt: null, cards: [], metrics: new Map(), media: new Map(), next: null, windows: { today: 0, week: 0, month: 0, total: 0 } };
        },
        async countPublishedWindows() {
          return { today: 0, week: 0, month: 0, total: 0 };
        },
        async latestMetricsForSlugs() {
          return new Map();
        },
        async listPublicMediaForSlugs() {
          return new Map();
        },
      } as unknown as OpenproductRepository,
    };
    await route(get("/internal/public/openproduct/projects?limit=100000"), ENV, undefined, deps);
    expect(seen).toBe(PAGE_SIZE_MAX);
  });

  it("refuses a write method on the public path", async () => {
    const res = await route(
      new Request("https://openproduct-worker.internal/internal/public/openproduct/projects", {
        method: "POST",
      }),
      ENV,
      undefined,
      publicDeps(),
    );
    expect(res.status).toBe(405);
  });
});

// ─── openproduct-commons CT1 — what the widened record promises ───

describe("CT1 — the canonicalised half is the only one that can be counted", () => {
  it("projects BOTH halves of the stack, and they are not the same list", async () => {
    const cards = await fetchCards();
    const card = cards[0]!;
    // The maintainer wrote something the vocabulary has never heard of. It
    // stays on the page, verbatim, in their own words...
    expect(card.stack).toContain("Hand-rolled CRDT");
    // ...and it is NOT in the half that drives facets and counts. That is the
    // whole of CT-1: nobody is blocked by our vocabulary, and nothing
    // unrecognised reaches a count.
    expect(card.stackCanonical).toEqual(["typescript"]);
    expect(card.stackCanonical).not.toContain("Hand-rolled CRDT");
  });

  it("projects the assigned facets on the card and the page alike", async () => {
    const card = (await fetchCards())[0]!;
    const profile = await fetchProfile();
    for (const shape of [card, profile]) {
      expect(shape.category).toBe("dev-tools");
      expect(shape.hosting).toBe("self-hosted");
    }
  });

  it("puts the OBSERVED licence on the card, because every row shows it", async () => {
    const card = (await fetchCards())[0]!;
    // What the App reported at publish, not a claim a maintainer typed
    // (OD-F). A directory of open products whose rows do not say what they
    // are licensed under is not answering the first question a reader has.
    expect(card.licence).toBe((await fetchProfile()).licence);
  });

  it("an unassigned facet is null, and null is never rendered as a bucket", async () => {
    // Absence is an answer: this listing has not said what it is, which is
    // not the same as saying "other". The same rule SN applies to an
    // unobserved metric.
    const bare = await route(
      get("/internal/public/openproduct/projects"),
      ENV,
      undefined,
      publicDeps(storedProfile({ category: null, hosting: null, stackCanonical: [] })),
    );
    const body = (await bare.json()) as { data: { projects: PublicProfileCard[] } };
    expect(body.data.projects[0]!.category).toBeNull();
    expect(body.data.projects[0]!.hosting).toBeNull();
    expect(body.data.projects[0]!.stackCanonical).toEqual([]);
  });
});

// ─── openproduct-commons SN2 — I9 on the wire ───

describe("I9 — an observed value never reaches the wire without its moment", () => {
  it("projects a fresh metric with observedAt and its state", async () => {
    const profile = await fetchProfile();
    const merges = profile.metrics.find((m) => m.key === "merges.7d");
    expect(merges).toMatchObject({ value: 38, state: "fresh" });
    expect(Date.parse(merges!.observedAt)).not.toBeNaN();
    // The keys are pinned too: a metric is four fields and there is no fifth
    // place for a number to hide without its moment.
    expect(Object.keys(merges!).sort()).toEqual([...PUBLIC_METRIC_KEYS]);
  });

  it("DROPS a metric stale past twice its window, rather than ageing it", async () => {
    // The projection, not the renderer, is where this is enforced — so the
    // page has no code path that could print a withdrawn number.
    const stale = {
      profileId: PROFILE_UUID,
      metric: "merges",
      window: "7d",
      value: 38,
      source: "linked_repo" as const,
      observedAt: "2026-01-01T00:00:00.000Z",
    };
    const res = await route(
      get("/internal/public/openproduct/projects/acme-thing"),
      ENV,
      undefined,
      {
        repo: {
          async getPublicProfile() {
            return storedProfile();
          },
          // MD2 — the media rows; none on these fixtures.
          async listPublicMedia() {
            return [];
          },
          async listPublicMaintainers() {
            return [];
          },
          // PP1 — the follower count the profile now carries (WC2-7: a number, never a list).
          async countFollowers() {
            return new Map<string, number>();
          },
          async latestSnapshotBefore() {
            return null;
          },
          async listPublicRoleOpenings() {
            return [];
          },
          // CB2 — raw pending counts; the handler floors them (OPC-F).
          async countOpeningDemand() {
            return [];
          },
          async latestMetrics() {
            return [stale];
          },
          // MD3 — the rows' tiles; none on these fixtures unless a test says so.
          async listPublicMediaForSlugs() {
            return new Map();
          },
          async latestMetricsForSlugs() {
            return new Map();
          },
          // UV1 — the placement's two reads.
          async listLaunchesForProfile() {
            return [];
          },
          async readBoardRanks() {
            return [];
          },
        },
      } as unknown as PublicHandlerDeps,
    );
    const body = (await res.json()) as { data: { profile: PublicProfile } };
    expect(body.data.profile.metrics).toEqual([]);
  });

  it("a listing nobody could observe carries an empty list, not a zero", async () => {
    // The whole of OPC-C on the wire: absence is absence. There is no entry
    // with value 0 to be mistaken for a measurement.
    const res = await route(
      get("/internal/public/openproduct/projects/acme-thing"),
      ENV,
      undefined,
      {
        repo: {
          async getPublicProfile() {
            return storedProfile();
          },
          // MD2 — the media rows; none on these fixtures.
          async listPublicMedia() {
            return [];
          },
          async listPublicMaintainers() {
            return [];
          },
          // PP1 — the follower count the profile now carries (WC2-7: a number, never a list).
          async countFollowers() {
            return new Map<string, number>();
          },
          async latestSnapshotBefore() {
            return null;
          },
          async listPublicRoleOpenings() {
            return [];
          },
          // CB2 — raw pending counts; the handler floors them (OPC-F).
          async countOpeningDemand() {
            return [];
          },
          async latestMetrics() {
            return [];
          },
          // MD3 — the rows' tiles; none on these fixtures unless a test says so.
          async listPublicMediaForSlugs() {
            return new Map();
          },
          async latestMetricsForSlugs() {
            return new Map();
          },
          // UV1 — the placement's two reads.
          async listLaunchesForProfile() {
            return [];
          },
          async readBoardRanks() {
            return [];
          },
        },
      } as unknown as PublicHandlerDeps,
    );
    const body = (await res.json()) as { data: { profile: PublicProfile } };
    expect(body.data.profile.metrics).toEqual([]);
  });
});

describe("DS1 — the derived facets are computed in the PROJECTION, not on the page", () => {
  it("folds the authored commitment lines to facet values, and keeps what it does not know out", async () => {
    const cards = await fetchCards();
    // The fixture's opening says `One evening a week`; the vocabulary knows
    // it. An unrecognised line would stay the maintainer's words on the page
    // and simply never become a facet (CT-1) — nobody is blocked by our
    // vocabulary, and nothing unrecognised pollutes a count.
    expect(cards[0]!.openingCommitments).toEqual(["one-evening-a-week"]);
  });

  it("`none-open` is a VALUE, not an absence", () => {
    // A contributor looking for somewhere to help wants to exclude listings
    // with nothing open — and can only exclude what is a value.
    expect(openingsFacetValues([])).toEqual(["none-open"]);
    // Roles exist but none of their lines resolve: the listing holds nothing
    // and is matched by no openings filter. Honest — we genuinely do not
    // know what it is asking for, and `none-open` would be a lie.
    expect(openingsFacetValues(["whenever you fancy"])).toEqual([]);
  });

  it("`not-observed` never folds into `quiet`", () => {
    const now = Date.parse("2026-08-26T12:00:00.000Z");
    expect(activityBucket(null, now)).toBe("not-observed");
    expect(activityBucket(now - 2 * 24 * 3600 * 1000, now)).toBe("this-week");
    expect(activityBucket(now - 20 * 24 * 3600 * 1000, now)).toBe("this-month");
    expect(activityBucket(now - 200 * 24 * 3600 * 1000, now)).toBe("quiet");
    // The distinction the whole facet exists for: a listing whose repository
    // we cannot read has NOT told us it is inactive, and putting it in
    // `quiet` would be this program making a claim about somebody's project
    // on the strength of not having looked.
    expect(activityBucket(null, now)).not.toBe("quiet");
  });

  it("the live-URL answer is a boolean on the card — the address stays on the page", async () => {
    const cards = await fetchCards();
    expect(cards[0]!.hasLiveUrl).toBe(true);
    expect(JSON.stringify(cards[0])).not.toContain("http");
  });
});

describe("LC2 — the directory's strip, decided by the API", () => {
  async function directory(env: Partial<Env> = {}) {
    const res = await route(
      get("/internal/public/openproduct/projects"),
      { ENVIRONMENT: "stage", ...env } as Env,
      undefined,
      publicDeps(),
    );
    return (await res.json()) as {
      data: { projects: unknown[]; freshness: Record<string, unknown>; freshnessThreshold: number };
    };
  }

  it("chooses the window HERE, not on the page", () => {
    // The threshold is per-environment configuration (LC-3), and a page
    // computing its own answer would state a rule the estate is not applying
    // — the same failure LC0's scheduler avoided by returning the policy it
    // enforces.
    return directory().then(({ data }) => {
      expect(data.freshness).toEqual({ kind: "recent", window: "today", count: 12 });
      expect(data.freshnessThreshold).toBe(5);
    });
  });

  it("respects a configured threshold, with no deploy", () => {
    // LC2's done-when: the transition needs no deploy. At 40, twelve today
    // and thirty this week both fall short and the strip widens to the month.
    return directory({ OPENPRODUCT_FRESHNESS_THRESHOLD: "40" } as Partial<Env>).then(({ data }) => {
      expect(data.freshness).toEqual({ kind: "recent", window: "month", count: 60 });
      expect(data.freshnessThreshold).toBe(40);
    });
  });

  it("a malformed threshold falls back rather than becoming zero", () => {
    // A zero threshold makes every window qualify, and `today · 0 new` is the
    // one sentence this whole mechanism exists to prevent.
    return directory({ OPENPRODUCT_FRESHNESS_THRESHOLD: "0" } as Partial<Env>).then(({ data }) => {
      expect(data.freshnessThreshold).toBe(5);
    });
  });

  it("the strip does not leak into the CARD's pinned key set", () => {
    // A card is a card. The strip is a fact about the document, and widening
    // one into the other is how a projection stops being reviewable (I2).
    return directory().then(({ data }) => {
      for (const card of data.projects) {
        expect(Object.keys(card as object)).not.toContain("freshness");
      }
    });
  });
});
