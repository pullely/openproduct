// A maker's page and its tabs (openproduct-launch MP0).
//
// The TAB VOCABULARY and the addresses are tested in packages/contracts, where
// they are pure. What is pinned here is the handler:
//
//   - one document per address, with the header, all three counts and one list
//   - the same contributor projection the bare page serves, called not copied
//   - the 404 comes before the namespace, and every refusal looks identical
//   - the three reads that do not depend on each other run at once
//   - it resolves no actor and reads no session (OPC-1, I6)

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MAKER_TAB_LIMIT } from "@openproduct/contracts";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { MakerHandlerDeps } from "@openproduct-worker/handlers/maker";

const BASE = "https://openproduct.internal/internal/public/openproduct/people";
const ADA = "usr_0000000000000000000000000000ada0";

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

function req(path: string, method = "GET", headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { "x-request-id": "req_mp0", ...headers },
  });
}

interface Harness {
  deps: MakerHandlerDeps;
  /** Every list read, in the order it was asked for. */
  calls: string[];
  /** The limits each list read was given. */
  limits: number[];
}

function harness(
  over: {
    contributor?: unknown;
    subjects?: Map<string, string>;
    counts?: { launched: number; upvotesGiven: number; comments: number };
    launches?: unknown[];
    upvotes?: unknown[];
    comments?: unknown[];
    /** PE1 — the history read, and what it answers. */
    history?: unknown[];
    /** PE2 — the marks' inputs. */
    firstLaunchDay?: string | null;
    cleanVoteListings?: number;
  } = {},
): Harness {
  const calls: string[] = [];
  const limits: number[] = [];
  const repo = {
    // openproduct-studio OSD3 — the rows' logos; none unless a test says so.
    async listPublicMediaForSlugs() {
      return new Map();
    },
    async getPublicContributor(handle: string) {
      calls.push("contributor");
      if (over.contributor === null) return null;
      return (
        over.contributor ?? {
          handle,
          displayName: "Ada Lovelace",
          bio: "One line, as they wrote it.",
          githubUrl: null,
          siteUrl: null,
          openToProject: true,
          publishedAt: "2026-08-01T00:00:00.000Z",
          maintains: [{ slug: "acme-thing", tagline: "A thing" }],
          contributesTo: [{ slug: "other-thing", tagline: "Another" }],
        }
      );
    },
    async getSubjectsForHandles(handles: readonly string[]) {
      calls.push("subjects");
      return over.subjects ?? new Map(handles.map((h) => [h, ADA]));
    },
    async countFollowers(_kind: string, targets: readonly string[]) {
      calls.push("followers");
      return new Map(targets.map((t) => [t, 7]));
    },
    async countMakerActivity(_subjectId: string) {
      calls.push("counts");
      return over.counts ?? { launched: 3, upvotesGiven: 9, comments: 4 };
    },
    async listMakerLaunches(_s: string, limit: number) {
      calls.push("launches");
      limits.push(limit);
      return over.launches ?? [{ launchId: "lch_1", slug: "acme-thing", tagline: null, versionLabel: "v1", launchedAt: "2026-09-01T00:00:00.000Z", day: "2026-09-01", rank: 1, counted: 5 }];
    },
    async listMakerUpvotes(_s: string, limit: number) {
      calls.push("upvotes");
      limits.push(limit);
      return over.upvotes ?? [{ slug: "other-thing", tagline: null, at: "2026-09-02T00:00:00.000Z", counting: true }];
    },
    async listMakerComments(_s: string, limit: number) {
      calls.push("comments");
      limits.push(limit);
      return over.comments ?? [{ slug: "other-thing", tagline: null, comments: 2, lastAt: "2026-09-03T00:00:00.000Z", threadId: "thr_1" }];
    },
    async listMakerHistory(_s: string, limit: number, before: string | null) {
      calls.push(before ? `history<${before}` : "history");
      limits.push(limit);
      return over.history ?? [];
    },
    async firstMakerLaunchDay() {
      calls.push("first-launch");
      return over.firstLaunchDay ?? null;
    },
    async countMakerCleanVoteListings() {
      calls.push("clean-votes");
      return over.cleanVoteListings ?? 0;
    },
  };
  return { deps: { repo } as unknown as MakerHandlerDeps, calls, limits };
}

async function get(path: string, over: Parameters<typeof harness>[0] = {}) {
  const h = harness(over);
  const res = await route(req(path), env(), h.deps as never);
  return { res, body: res.status === 200 ? ((await res.json()) as { data: Record<string, unknown> }).data : null, ...h };
}

describe("one document per address", () => {
  it("carries the header, ALL THREE counts and the one tab's rows", () => {
    // The header shows all three counts on every tab, so a count that only
    // existed for the tab in front of you would be two of three numbers
    // missing on two pages out of three.
    return get("/ada/tab/launched").then(({ res, body }) => {
      expect(res.status).toBe(200);
      expect(body!.tab).toBe("launched");
      expect(body!.counts).toEqual({ launched: 3, upvotesGiven: 9, comments: 4 });
      expect((body!.rows as unknown[]).length).toBe(1);
    });
  });

  it("serves the SAME contributor projection the bare page does", async () => {
    // Called rather than copied: two copies of a public projection is how a
    // field somebody deliberately kept off one surface arrives on the other.
    const { body } = await get("/ada/tab/launched");
    const contributor = body!.contributor as Record<string, unknown>;
    expect(contributor.handle).toBe("ada");
    expect(contributor.displayName).toBe("Ada Lovelace");
    expect(contributor.contributesTo).toBe(1);
    expect(contributor.reviews).toBeNull();
    // FL0's count, from the follows table, on the projection where it lives.
    expect(contributor.followers).toBe(7);
  });

  it("does NOT carry a second copy of the follower count", async () => {
    // A second copy in a second shape is a second number that can be wrong.
    const { body } = await get("/ada/tab/launched");
    expect(Object.keys(body!.counts as object)).toEqual(["launched", "upvotesGiven", "comments"]);
  });

  it("reads ONE list — the tab's — and bounds it", async () => {
    const launched = await get("/ada/tab/launched");
    expect(launched.calls).toContain("launches");
    expect(launched.calls).not.toContain("upvotes");
    expect(launched.calls).not.toContain("comments");
    expect(launched.limits).toEqual([MAKER_TAB_LIMIT]);

    const upvoted = await get("/ada/tab/upvoted");
    expect(upvoted.calls).toContain("upvotes");
    expect(upvoted.calls).not.toContain("launches");
    expect((upvoted.body!.rows as Array<Record<string, unknown>>)[0]!.counting).toBe(true);

    const comments = await get("/ada/tab/comments");
    expect(comments.calls).toContain("comments");
    expect((comments.body!.rows as Array<Record<string, unknown>>)[0]!.comments).toBe(2);
  });

  it("carries the moment it was counted (I9)", async () => {
    const { body } = await get("/ada/tab/launched");
    expect(typeof body!.observedAt).toBe("string");
    expect(Number.isNaN(Date.parse(body!.observedAt as string))).toBe(false);
  });
});

describe("every refusal looks the same", () => {
  it("404s a tab that is not one of the three", async () => {
    const { res } = await get("/ada/tab/saved");
    expect(res.status).toBe(404);
  });

  it("404s a malformed handle without reading anything", async () => {
    const { res, calls } = await get("/NOT A HANDLE/tab/launched");
    expect(res.status).toBe(404);
    expect(calls).toEqual([]);
  });

  it("404s a handle with no public profile, and does not reach the namespace", async () => {
    // Reversing the two reads would let a caller learn from timing what the
    // status code refuses to say.
    const { res, calls } = await get("/ghost/tab/launched", { contributor: null });
    expect(res.status).toBe(404);
    expect(calls).toEqual(["contributor"]);
  });

  it("404s when the profile resolves but the handle has no holder", async () => {
    const { res } = await get("/ada/tab/launched", { subjects: new Map() });
    expect(res.status).toBe(404);
  });

  it("refuses a write with 405 rather than pretending to be a form", async () => {
    const h = harness();
    const res = await route(req("/ada/tab/launched", "POST"), env(), h.deps as never);
    expect(res.status).toBe(405);
  });
});

describe("OPC-1 / I6 — one cacheable document that resolves no actor", () => {
  it("answers identically with and without a session header", async () => {
    const anon = await get("/ada/tab/launched");
    const h = harness();
    const signedIn = await route(
      req("/ada/tab/launched", "GET", {
        "x-actor-subject-id": ADA,
        "x-actor-subject-type": "user",
      }),
      env(),
      h.deps as never,
    );
    const a = anon.body as Record<string, unknown>;
    const b = ((await signedIn.json()) as { data: Record<string, unknown> }).data;
    // `observedAt` is the clock and is allowed to differ; nothing else may.
    delete a.observedAt;
    delete b.observedAt;
    expect(b).toEqual(a);
  });

  it("the handler source reads no actor at all", () => {
    // Cheaper and blunter than the assertion above, and it catches a helper
    // doing the reading on the page's behalf.
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../../core/src/handlers/maker.ts"),
      "utf-8",
    );
    expect(/authorize\(|actorFrom|x-actor|readSession/.test(src)).toBe(false);
  });
});

describe("PE1 — the history tab, paged by moment", () => {
  const act = (i: number) => ({
    kind: "commented",
    at: `2026-08-${String(30 - i).padStart(2, "0")}T09:00:00.000Z`,
    slug: "acme-thing",
    tagline: null,
    detail: "A thread",
    ref: null,
  });

  it("reads one more row than the page, and says where the earlier page begins", async () => {
    const { res, body, calls, limits } = await get("/ada/tab/history", { history: Array.from({ length: 31 }, (_, i) => act(i)) });
    expect(res.status).toBe(200);
    expect(calls).toContain("history");
    expect(limits).toEqual([31]);
    expect((body!.rows as unknown[]).length).toBe(30);
    // The cursor is the LAST SHOWN row's moment, so the next page is
    // everything strictly before what the reader has already seen.
    expect(body!.nextCursor).toBe(act(29).at);
  });

  it("has no earlier page when the read came back short", async () => {
    const { body } = await get("/ada/tab/history", { history: [act(0), act(1)] });
    expect(body!.nextCursor).toBeNull();
    expect((body!.rows as unknown[]).length).toBe(2);
  });

  it("passes a moment through, and 404s anything that is not one", async () => {
    const before = "2026-08-15T09:00:00.000Z";
    const { res, calls } = await get(`/ada/tab/history?before=${encodeURIComponent(before)}`, { history: [] });
    expect(res.status).toBe(200);
    expect(calls).toContain(`history<${before}`);
    expect((await get("/ada/tab/history?before=page-3")).res.status).toBe(404);
    expect((await get("/ada/tab/history?before=2026-08-15")).res.status).toBe(404);
  });

  it("a cursor under any other tab is a 404, not a first page", async () => {
    const { res, calls } = await get("/ada/tab/upvoted?before=2026-08-15T09:00:00.000Z");
    expect(res.status).toBe(404);
    expect(calls).not.toContain("upvotes");
  });

  it("every tab carries the cursor key, null where there is no paging (I2)", async () => {
    for (const tab of ["launched", "upvoted", "comments"]) {
      const { body } = await get(`/ada/tab/${tab}`);
      expect(body!.nextCursor).toBeNull();
    }
  });
});

describe("PE2 — the marks' inputs travel, never the marks", () => {
  it("carries the three inputs on every tab, from two reads and the roster", async () => {
    const { body, calls } = await get("/ada/tab/launched", { firstLaunchDay: "2026-08-17", cleanVoteListings: 1 });
    expect(body!.marks).toEqual({ firstLaunchDay: "2026-08-17", cleanVoteListings: 1, maintains: 1 });
    expect(calls).toContain("first-launch");
    expect(calls).toContain("clean-votes");
    // No label, no badge, no formula on the wire: the page derives those.
    expect(JSON.stringify(body!.marks)).not.toMatch(/label|First launch|Clean vote/);
  });

  it("says null and zero when nothing has been earned, never a default mark", async () => {
    const { body } = await get("/ada/tab/comments");
    expect(body!.marks).toEqual({ firstLaunchDay: null, cleanVoteListings: 0, maintains: 1 });
  });
});
