// The feed's sidebar (openproduct-launch FL1).
//
// The ORDER and the ABSENCE rules are tested in packages/contracts, where they
// are pure. What is pinned here is the handler:
//
//   - six reads, in ONE round trip, and none of them is the feed's
//   - the window is decided from the clock and handed to the read
//   - followers are counted for the whole bounded vocabulary, in the same
//     round trip as everything else (OPP7)
//   - a person's headline is THEIRS, and absent when they wrote none
//   - every panel is absent rather than empty, and it resolves no actor

import {
  SIDEBAR_OPENING_LIMIT,
  SIDEBAR_PERSON_LIMIT,
  SIDEBAR_TOPIC_LIMIT,
  SIDEBAR_TOPIC_WINDOW_DAYS,
  TOPIC_FACET,
  facet,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { SidebarHandlerDeps } from "@openproduct-worker/handlers/sidebar";

const URL_ = "https://openproduct.internal/internal/public/openproduct/sidebar";
const NOW = Date.parse("2026-09-05T12:00:00.000Z");
const DEV = "dev-tools";
const DATA = "data";

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

function req(method = "GET", headers: Record<string, string> = {}): Request {
  return new Request(URL_, { method, headers: { "x-request-id": "req_fl1", ...headers } });
}

interface Harness {
  deps: SidebarHandlerDeps;
  windows: string[][];
  countedTopics: string[][];
  askedReplies: number[];
}

function harness(over: {
  cards?: Array<{ slug: string; category: string | null }>;
  launches?: Array<{ category: string | null }>;
  collections?: unknown[];
  roles?: unknown[];
  people?: Array<{ handle: string; displayName: string | null; bio: string | null; openToProject: boolean }>;
  replied?: Array<{ threadId: string; slug: string; title: string; tag: string; lastPostAt: string; postCount: number }>;
} = {}): Harness {
  const windows: string[][] = [];
  const countedTopics: string[][] = [];
  const askedReplies: number[] = [];
  const repo = {
    async listPublicCards() {
      return over.cards ?? [{ slug: "a", category: DEV }];
    },
    async listFeedLaunches(days: readonly string[]) {
      windows.push([...days]);
      return (over.launches ?? []).map((l, i) => ({ ...l, slug: `l${i}`, day: "2026-09-04" }));
    },
    async countFollowers(_kind: string, targets: readonly string[]) {
      countedTopics.push([...targets]);
      return new Map(targets.map((t) => [t, 7]));
    },
    async listPublishedCollections() {
      return over.collections ?? [];
    },
    async listOpenRoles() {
      return over.roles ?? [];
    },
    async listPublicContributorCards() {
      return over.people ?? [];
    },
    // HB3 — the fifth read, in the same round.
    async listRecentlyRepliedThreads(limit: number) {
      askedReplies.push(limit);
      return over.replied ?? [];
    },
  } as unknown as OpenproductRepository;
  return { deps: { repo, now: () => NOW } as SidebarHandlerDeps, windows, countedTopics, askedReplies };
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return ((await res.json()) as { data: Record<string, unknown> }).data;
}

describe("the reads", () => {
  it("decides the window here, never from the database's clock", async () => {
    const h = harness();
    await route(req(), env(), h.deps as never);
    expect(h.windows[0]).toHaveLength(SIDEBAR_TOPIC_WINDOW_DAYS);
    expect(h.windows[0]![0]).toBe("2026-09-05");
    expect(h.windows[0]!.at(-1)).toBe("2026-08-07");
  });

  it("counts the whole topic vocabulary, in the SAME round trip (OPP7)", async () => {
    // REVERSED DELIBERATELY. This read used to happen after the others,
    // bounded to the topics that made the panel, because "counting the whole
    // vocabulary to show five would be reading rows to throw them away".
    //
    // That weighed the ROWS and not the WAIT. The topic facet is a fixed
    // contract vocabulary, so the difference is a handful of rows on a query
    // that was going to run anyway — against a whole round trip to Postgres,
    // which on the front page was the second of two where the board pays one.
    const h = harness({
      cards: [
        { slug: "a", category: DEV },
        { slug: "b", category: DATA },
      ],
      launches: [{ category: DEV }, { category: DEV }],
    });
    await route(req(), env(), h.deps as never);
    expect(h.countedTopics).toHaveLength(1);
    const vocabulary = (facet(TOPIC_FACET)?.values ?? []).map((v) => v.value);
    expect(h.countedTopics[0]).toEqual(vocabulary);
    // And the bound is what makes that acceptable: a FIXED vocabulary, not a
    // list that grows with the catalogue. If this ever stops being small, the
    // trade is worth re-deciding.
    expect(vocabulary.length).toBeLessThanOrEqual(40);
  });

  it("shows the SAME five topics it always did — the order never used followers", async () => {
    // What makes reading the vocabulary up front safe: `orderSidebarTopics`
    // sorts on `launches` and `label` and never on followers, so the panel is
    // identical either way. If that changes, the read must move back.
    const h = harness({
      cards: [
        { slug: "a", category: DEV },
        { slug: "b", category: DATA },
      ],
      launches: [{ category: DEV }, { category: DEV }, { category: DATA }],
    });
    const data = await json(await route(req(), env(), h.deps as never));
    const topics = data.topics as Array<{ value: string; launches: number }>;
    expect(topics.map((t) => t.value)).toEqual([DEV, DATA]);
    expect(topics.map((t) => t.launches)).toEqual([2, 1]);
  });

  it("issues every read before any of them answers — ONE round trip, not two", async () => {
    // The assertion a call-count cannot make. Each read here blocks until all
    // six have been ASKED, so a handler that awaited one before issuing the
    // next would deadlock and this test would time out rather than pass
    // slightly slower. That is the difference OPP7 is about: five reads and
    // then a sixth costs two waits; six reads costs one. HB3 makes it seven.
    const EXPECTED_READS = 7;
    let asked = 0;
    let release!: () => void;
    const allAsked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gate = async <T>(value: T): Promise<T> => {
      asked += 1;
      if (asked === EXPECTED_READS) release();
      await allAsked;
      return value;
    };
    const repo = {
      listPublicCards: () => gate([{ slug: "a", category: DEV }]),
      listFeedLaunches: () => gate([{ slug: "l0", category: DEV, day: "2026-09-04" }]),
      countFollowers: (_k: string, targets: readonly string[]) =>
        gate(new Map(targets.map((t) => [t, 0]))),
      listPublishedCollections: () => gate([]),
      listOpenRoles: () => gate([]),
      listPublicContributorCards: () => gate([]),
      listRecentlyRepliedThreads: () => gate([]),
    } as unknown as OpenproductRepository;

    const response = await route(
      req(),
      env(),
      { repo, now: () => NOW } as SidebarHandlerDeps as never,
    );
    expect(response.status).toBe(200);
    expect(asked).toBe(EXPECTED_READS);
  });

  it("asks for ONE collection — there is no `featured` flag to ask about", async () => {
    const h = harness({ collections: [{ slug: "s", title: "T", curatorHandle: "ada", count: 4 }] });
    const data = await json(await route(req(), env(), h.deps as never));
    expect(data.collection).toEqual({
      slug: "s",
      title: "T",
      curator: "ada",
      items: 4,
      preview: [],
    });
  });
});

describe("every panel is absent rather than empty", () => {
  it("answers empty lists and a null collection when there is nothing", async () => {
    const h = harness({ cards: [], launches: [] });
    const data = await json(await route(req(), env(), h.deps as never));
    expect(data.topics).toEqual([]);
    expect(data.collection).toBeNull();
    expect(data.openings).toEqual([]);
    expect(data.people).toEqual([]);
    expect(data.replies).toEqual([]);
  });

  // HB3 — the fifth panel: the read's own order and count, projected to
  // four public fields and nothing else (no thread id, no author).
  it("HB3 — projects the recently replied threads, bounded to three, with the row's own count", async () => {
    const h = harness({
      replied: [
        { threadId: "t1", slug: "acme-thing", title: "Comments on acme-thing", tag: "launch", lastPostAt: "2026-09-04T10:00:00.000Z", postCount: 4 },
        { threadId: "t2", slug: "other", title: "How do I run this?", tag: "question", lastPostAt: "2026-09-04T09:00:00.000Z", postCount: 1 },
      ],
    });
    const data = await json(await route(req(), env(), h.deps as never));
    expect(h.askedReplies).toEqual([3]);
    expect(data.replies).toEqual([
      { slug: "acme-thing", title: "Comments on acme-thing", repliedAt: "2026-09-04T10:00:00.000Z", posts: 4 },
      { slug: "other", title: "How do I run this?", repliedAt: "2026-09-04T09:00:00.000Z", posts: 1 },
    ]);
  });

  it("drops a topic with nothing in the window rather than listing it at zero", async () => {
    const h = harness({
      cards: [
        { slug: "a", category: DEV },
        { slug: "b", category: DATA },
      ],
      launches: [{ category: DEV }],
    });
    const data = await json(await route(req(), env(), h.deps as never));
    expect((data.topics as Array<{ value: string }>).map((t) => t.value)).toEqual([DEV]);
  });
});

describe("the people panel ranks nobody", () => {
  it("lists only those who ticked `open to a project`, and no others", async () => {
    const h = harness({
      people: [
        { handle: "ada", displayName: "Ada", bio: "Builds tools.", openToProject: true },
        { handle: "bob", displayName: "Bob", bio: "Also builds.", openToProject: false },
      ],
    });
    const data = await json(await route(req(), env(), h.deps as never));
    expect((data.people as Array<{ handle: string }>).map((p) => p.handle)).toEqual(["ada"]);
  });

  it("carries THEIR headline, and none when they wrote none", async () => {
    const h = harness({
      people: [
        { handle: "ada", displayName: "Ada", bio: "Builds tools.\nSecond line.", openToProject: true },
        { handle: "cy", displayName: "Cy", bio: null, openToProject: true },
      ],
    });
    const data = await json(await route(req(), env(), h.deps as never));
    const people = data.people as Array<{ headline: string | null }>;
    expect(people[0]!.headline).toBe("Builds tools.");
    expect(people[1]!.headline).toBeNull();
  });

  it("is bounded", async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      handle: `h${i}`,
      displayName: `P${i}`,
      bio: null,
      openToProject: true,
    }));
    const h = harness({ people: many });
    const data = await json(await route(req(), env(), h.deps as never));
    expect(data.people).toHaveLength(SIDEBAR_PERSON_LIMIT);
  });
});

describe("the document", () => {
  it("names a formula for every panel (OPC-4)", async () => {
    const h = harness();
    const data = await json(await route(req(), env(), h.deps as never));
    expect(Object.keys(data.formulas as object).sort()).toEqual([
      "collection",
      "openings",
      "people",
      "replies",
      "topics",
    ]);
  });

  it("bounds the topics panel", async () => {
    const cards = Array.from({ length: 12 }, (_, i) => ({ slug: `s${i}`, category: DEV }));
    const h = harness({ cards, launches: [{ category: DEV }] });
    const data = await json(await route(req(), env(), h.deps as never));
    expect((data.topics as unknown[]).length).toBeLessThanOrEqual(SIDEBAR_TOPIC_LIMIT);
  });

  it("resolves no actor — the same document for everybody (I6)", async () => {
    const anon = await json(await route(req(), env(), harness().deps as never));
    const signedIn = await json(
      await route(req("GET", { cookie: "op_session=x" }), env(), harness().deps as never),
    );
    expect(signedIn).toEqual(anon);
  });

  it("refuses anything but GET", async () => {
    expect((await route(req("POST"), env(), harness().deps as never)).status).toBe(405);
  });

  it("asks for no more openings than it will show", async () => {
    expect(SIDEBAR_OPENING_LIMIT).toBeLessThanOrEqual(5);
  });
});
