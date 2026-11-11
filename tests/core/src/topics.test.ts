// Topic pages' reads (openproduct-launch TP0).
//
// The INDEX and the ORDER are tested in packages/contracts, where
// `buildTopicIndex` and `buildTopic` are pure. What is pinned here is the
// handlers and their routes:
//
//   - the index is one read, and it is the DIRECTORY's, so a topic card and
//     the facet rail cannot disagree about a count
//   - a topic nobody has chosen is a 404, not an empty page
//   - the window is decided from the clock and handed to the read
//   - the product count comes from listings and the body from launches, and
//     neither is derived from the other (LC0)
//   - both resolve no actor and refuse anything but GET

import { TOPIC_WINDOW_DAYS } from "@openproduct/contracts";
import type { FeedLaunchRecord, OpenproductRepository, ProfileCardRecord } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { TopicsHandlerDeps } from "@openproduct-worker/handlers/topics";

const INDEX = "https://openproduct.internal/internal/public/openproduct/topics";
const NOW = Date.parse("2026-09-05T12:00:00.000Z");
const DEV = "dev-tools";
const DATA = "data";

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

function req(path = "", method = "GET"): Request {
  return new Request(`${INDEX}${path}`, { method, headers: { "x-request-id": "req_tp0" } });
}

function card(slug: string, category: string | null) {
  return {
    slug,
    tagline: null,
    stack: [],
    stackCanonical: [],
    category,
    hosting: null,
    pricing: null,
    licence: null,
    roleOpeningCount: 0,
    openingCommitments: [],
    hasLiveUrl: false,
    indexable: true,
    publishedAt: "2026-01-01T00:00:00.000Z",
    metrics: [],
  } as unknown as ProfileCardRecord;
}

function row(
  over: Partial<FeedLaunchRecord> & Pick<FeedLaunchRecord, "slug" | "day">,
): FeedLaunchRecord {
  return {
    launchId: `l-${over.slug}`,
    profileId: `p-${over.slug}`,
    tagline: null,
    versionLabel: "1.0",
    launchedAt: `${over.day}T09:00:00.000Z`,
    rank: 1,
    counted: 1,
    ineligible: 0,
    licence: null,
    category: DEV,
    stack: [],
    roleOpeningCount: 0,
    commentCount: 0,
    ...over,
  };
}

interface Harness {
  deps: TopicsHandlerDeps;
  cardCalls: number;
  windows: string[][];
}

function harness(cards: unknown[] = [], rows: FeedLaunchRecord[] = []): Harness {
  const h: Harness = { deps: {} as TopicsHandlerDeps, cardCalls: 0, windows: [] };
  const repo = {
    async listPublicCards() {
      h.cardCalls += 1;
      return cards;
    },
    // MD3 — the rows' tiles; none on these fixtures unless a test says so.
    async listPublicMediaForSlugs() {
      return new Map();
    },
    async listFeedLaunches(dayIds: readonly string[]) {
      h.windows.push([...dayIds]);
      return rows;
    },
    // FL0 — the follower count and the handle it is keyed by. Counted here so
    // the projection can carry a number; nothing lists followers anywhere.
    async getSubjectsForHandles(handles: readonly string[]) {
      return new Map(handles.map((h) => [h, `sub_${h}`]));
    },
    async countFollowers() {
      return new Map<string, number>();
    },
  } as unknown as OpenproductRepository;
  h.deps = { repo, now: () => NOW } as TopicsHandlerDeps;
  return h;
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return ((await res.json()) as { data: Record<string, unknown> }).data;
}

describe("the index", () => {
  it("is ONE read, and it is the directory's own", async () => {
    // The number on a topic card and the number beside that value in the facet
    // rail are the same claim, counted from the same rows.
    const h = harness([card("a", DEV), card("b", DEV), card("c", DATA)]);
    const data = await json(await route(req(), env(), h.deps as never));
    expect(h.cardCalls).toBe(1);
    expect(h.windows).toHaveLength(0);
    expect((data.topics as Array<{ value: string; products: number }>).map((t) => [t.value, t.products])).toEqual([
      [DEV, 2],
      [DATA, 1],
    ]);
  });

  it("answers an empty list rather than a failure when nothing is categorised", async () => {
    const h = harness([card("a", null)]);
    const res = await route(req(), env(), h.deps as never);
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ topics: [] });
  });

  it("carries its meaning and the window it advertises", async () => {
    const h = harness([card("a", DEV)]);
    const data = await json(await route(req(), env(), h.deps as never));
    expect(typeof data.meaning).toBe("string");
    expect(data.windowDays).toBe(TOPIC_WINDOW_DAYS);
  });

  it("refuses anything but GET", async () => {
    const h = harness();
    expect((await route(req("", "POST"), env(), h.deps as never)).status).toBe(405);
  });
});

describe("one topic", () => {
  it("404s a topic nobody has chosen, rather than rendering an empty page", async () => {
    // The vocabulary has more values than the catalogue has listings, and a
    // page for a topic with no products is a page about nothing.
    const h = harness([card("a", DEV)]);
    const res = await route(req(`/${DATA}`), env(), h.deps as never);
    expect(res.status).toBe(404);
  });

  it("404s a value the vocabulary has never heard of", async () => {
    const h = harness([card("a", DEV)]);
    expect((await route(req("/not-a-facet-value"), env(), h.deps as never)).status).toBe(404);
  });

  it("decides the window here, never from the database's clock", async () => {
    const h = harness([card("a", DEV)], [row({ slug: "x", day: "2026-09-04" })]);
    await route(req(`/${DEV}`), env(), h.deps as never);
    expect(h.windows).toHaveLength(1);
    expect(h.windows[0]).toHaveLength(TOPIC_WINDOW_DAYS);
    expect(h.windows[0]![0]).toBe("2026-09-05");
    expect(h.windows[0]!.at(-1)).toBe("2026-08-07");
  });

  it("counts products from LISTINGS and fills the body from LAUNCHES", async () => {
    // LC0's separation, held on one page: two listings carry the topic, one of
    // them launched. Deriving the count from the launches would say "1".
    const h = harness(
      [card("a", DEV), card("b", DEV)],
      [row({ slug: "a", day: "2026-09-04" })],
    );
    const data = await json(await route(req(`/${DEV}`), env(), h.deps as never));
    expect(data.products).toBe(2);
    expect((data.entries as unknown[]).length).toBe(1);
  });

  it("keeps only this topic's launches", async () => {
    const h = harness(
      [card("a", DEV), card("b", DATA)],
      [
        row({ slug: "mine", day: "2026-09-04", category: DEV }),
        row({ slug: "theirs", day: "2026-09-04", category: DATA }),
      ],
    );
    const data = await json(await route(req(`/${DEV}`), env(), h.deps as never));
    expect((data.entries as Array<{ slug: string }>).map((e) => e.slug)).toEqual(["mine"]);
  });

  it("carries the vocabulary's label and description rather than writing its own", async () => {
    const h = harness([card("a", DEV)]);
    const data = await json(await route(req(`/${DEV}`), env(), h.deps as never));
    expect(data.label).toBe("Dev tools");
    expect(typeof data.description).toBe("string");
  });

  it("carries the empty note always, not only when empty", async () => {
    const h = harness([card("a", DEV)], [row({ slug: "x", day: "2026-09-04" })]);
    const data = await json(await route(req(`/${DEV}`), env(), h.deps as never));
    expect(typeof data.emptyNote).toBe("string");
  });

  it("carries a follower count, and it is honest at zero (FL0 made it so)", async () => {
    // TP0 shipped this page with NO follower count, because nothing observed a
    // follow and "0 followers" would have been a claim rather than a
    // measurement (OPC-C). FL0 is what makes the zero honest — this assertion
    // is the inverse of the one it replaces, and the inversion is the point.
    const h = harness([card("a", DEV)]);
    const data = await json(await route(req(`/${DEV}`), env(), h.deps as never));
    expect(data.followers).toBe(0);
  });

  it("resolves no actor — the answer is the same document for everybody (I6)", async () => {
    const cards = [card("a", DEV)];
    const rows = [row({ slug: "x", day: "2026-09-04" })];
    const anon = await json(await route(req(`/${DEV}`), env(), harness(cards, rows).deps as never));
    const signedIn = await json(
      await route(
        new Request(`${INDEX}/${DEV}`, {
          headers: { cookie: "op_session=whatever", "x-request-id": "r2" },
        }),
        env(),
        harness(cards, rows).deps as never,
      ),
    );
    expect(signedIn).toEqual(anon);
  });

  it("refuses anything but GET", async () => {
    const h = harness([card("a", DEV)]);
    expect((await route(req(`/${DEV}`, "POST"), env(), h.deps as never)).status).toBe(405);
  });
});
