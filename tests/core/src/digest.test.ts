// The digest, routed (openproduct-commons LC1).
//
// The week arithmetic is tested in packages/contracts and the SQL in
// packages/db. What is pinned here is the handler's four judgements:
//
//   1. a week that is not over has no digest,
//   2. the API enforces ONE spelling, where the page redirects,
//   3. a note whose author cannot be resolved is DROPPED, not anonymised,
//   4. the read is anonymous and byte-identical for everybody (OPC-1, I6),
//   5. PV4 — the lead is a CHANGE and it sits above the count.

import { DIGEST_KEYS, type Digest } from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { DigestHandlerDeps } from "@openproduct-worker/handlers/digest";

const BASE = "https://openproduct.internal";
const ENV = { ENVIRONMENT: "test" } as Env;
/** A Thursday well inside 2026-w34 (Mon 17 – Sun 23 August). */
const NOW = Date.parse("2026-08-20T12:00:00.000Z");
const SETTLED = "2026-w33";

interface Harness {
  deps: DigestHandlerDeps;
  windows: Array<{ start: string; end: string }>;
  days: Array<{ startDay: string; endDay: string }>;
}

function harness(
  over: {
    launches?: Array<{ slug: string; tagline: string | null; versionLabel: string; launchedAt: string }>;
    endorsed?: Array<{ slug: string; tagline: string | null; endorsements: number }>;
    note?: { weekId: string; body: string; byHandle: string | null; writtenAt: string } | null;
    weeks?: string[];
    pairs?: Array<{
      slug: string;
      from: Record<string, unknown>;
      toAt: string;
      to: Record<string, unknown>;
    }>;
  } = {},
): Harness {
  const windows: Array<{ start: string; end: string }> = [];
  const days: Array<{ startDay: string; endDay: string }> = [];
  const repo = {
    async listLaunchesInWindow(start: string, end: string) {
      windows.push({ start, end });
      return over.launches ?? [];
    },
    async listMostEndorsedInWindow(start: string, end: string) {
      windows.push({ start, end });
      return over.endorsed ?? [];
    },
    async getDigestNote() {
      return over.note ?? null;
    },
    async listDigestWeeks() {
      return over.weeks ?? [SETTLED, "2026-w34"];
    },
    // PV4 — the pairs the lead is computed from. DAYS, not moments: the
    // snapshot table's grain is a day, and the handler slices the window's
    // ISO instants down to match.
    async listSnapshotPairsInWindow(startDay: string, endDay: string) {
      days.push({ startDay, endDay });
      return over.pairs ?? [];
    },
  } as unknown as OpenproductRepository;
  return { deps: { repo, now: () => NOW }, windows, days };
}

function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, { headers: { "x-request-id": "req_lc1", ...headers } });
}

async function read(week: string, h = harness()) {
  const res = await route(get(`/internal/public/openproduct/digest/${week}`), ENV, undefined, h.deps as never);
  return {
    status: res.status,
    cache: res.headers.get("cache-control"),
    body: (await res.json()) as { data?: { digest: Digest } },
  };
}

describe("a week that is not over has no digest", () => {
  it("404s the CURRENT week", async () => {
    // "What happened this week" and "what has happened so far this week" are
    // different claims under one heading, and two readers quoting week 34's
    // digest a day apart would be quoting different documents.
    expect((await read("2026-w34")).status).toBe(404);
  });

  it("404s a FUTURE week", async () => {
    expect((await read("2026-w40")).status).toBe(404);
  });

  it("serves a week that has ended", async () => {
    const { status, body } = await read(SETTLED);
    expect(status).toBe(200);
    expect(body.data!.digest.week.id).toBe(SETTLED);
  });

  it("404 is NOT how an empty week reads — those are different answers", async () => {
    // A week that held nothing is a real answer about a real week. Conflating
    // it with "that week is not over" would make the empty-week page mean two
    // things, and the empty week is the case this whole surface was designed
    // around.
    const { status, body } = await read(SETTLED, harness({ launches: [], endorsed: [] }));
    expect(status).toBe(200);
    expect(body.data!.digest.launches).toEqual([]);
    expect(body.data!.digest.endorsed).toEqual([]);
  });
});

describe("one spelling, enforced", () => {
  it("404s every non-canonical spelling", async () => {
    // The API teaches the grammar; the PAGE redirects, because a person
    // typing a URL deserves the page and a client deserves to learn.
    for (const loose of ["2026-w33x", "2026-W33", "2026-w3", "2026-w54", "nonsense"]) {
      expect([loose, (await read(loose)).status]).toEqual([loose, 404]);
    }
  });
});

describe("the window is the week's own, half-open", () => {
  it("asks both reads for exactly the same seven days", async () => {
    const h = harness();
    await read(SETTLED, h);
    expect(h.windows).toHaveLength(2);
    expect(h.windows[0]).toEqual({ start: "2026-08-10T00:00:00.000Z", end: "2026-08-17T00:00:00.000Z" });
    // Both reads see ONE instant. A launch counted in one window and an
    // endorsement in another would put two facts about one week on a page
    // that claims they came from the same moment.
    expect(h.windows[1]).toEqual(h.windows[0]);
  });
});

describe("a note is signed or it is not published (LC-4)", () => {
  it("carries a note whose author resolves", async () => {
    const h = harness({
      note: { weekId: SETTLED, body: "A quiet week, and a good one.", byHandle: "ada", writtenAt: "2026-08-17T09:00:00.000Z" },
    });
    const { body } = await read(SETTLED, h);
    expect(body.data!.digest.note).toMatchObject({ byHandle: "ada" });
  });

  it("DROPS a note whose author has no public profile", async () => {
    // The byline is the whole of what makes an editorial note defensible. A
    // note whose author has since taken their profile down is an unsigned
    // opinion on a public page — which is exactly what the required column
    // exists to prevent. Dropping it is the honest failure; rendering it
    // anonymously is not.
    const h = harness({
      note: { weekId: SETTLED, body: "Anonymous opinions.", byHandle: null, writtenAt: "2026-08-17T09:00:00.000Z" },
    });
    const { body } = await read(SETTLED, h);
    expect(body.data!.digest.note).toBeNull();
    expect(JSON.stringify(body)).not.toContain("Anonymous opinions");
  });
});

describe("OPC-1 / I6 — one document, for everybody", () => {
  it("is byte-identical with and without forwarded actor headers", async () => {
    const anonymous = await route(
      get(`/internal/public/openproduct/digest/${SETTLED}`),
      ENV,
      undefined,
      harness().deps as never,
    );
    const withActor = await route(
      get(`/internal/public/openproduct/digest/${SETTLED}`, {
        "x-actor-subject-id": "usr_0123456789abcdef0123456789abcdef",
        "x-actor-subject-type": "user",
      }),
      ENV,
      undefined,
      harness().deps as never,
    );
    expect(await withActor.text()).toBe(await anonymous.text());
  });

  it("serializes exactly its pinned key set", async () => {
    const { body } = await read(SETTLED);
    expect(Object.keys(body.data!.digest).sort()).toEqual([...DIGEST_KEYS]);
  });

  it("stamps ONE observedAt for the whole document (I9)", async () => {
    // Every figure came from the same read of the same instant, and a per-row
    // timestamp would invite a reader to think otherwise.
    const { body } = await read(SETTLED);
    expect(body.data!.digest.observedAt).toBe(new Date(NOW).toISOString());
  });

  it("tells the gateway a settled week is IMMUTABLE", async () => {
    // Nothing in a week that ended can change, and serving it with sixty
    // seconds of freshness makes every crawler re-fetch an archive.
    const { cache } = await read(SETTLED);
    expect(cache).toBe("public, max-age=86400");
  });
});

describe("the index of weeks", () => {
  it("omits the CURRENT week, which has no digest", async () => {
    // A feed carrying it would republish the same entry every time something
    // launched, which is how a reader learns to ignore a feed.
    const res = await route(
      get("/internal/public/openproduct/digest"),
      ENV,
      undefined,
      harness().deps as never,
    );
    const body = (await res.json()) as { data: { weeks: string[] } };
    expect(body.data.weeks).toEqual([SETTLED]);
  });
});

// ---------------------------------------------------------------------------
// PV4 — the lead is a change, not a count
// ---------------------------------------------------------------------------

describe("PV4 — what the digest leads with", () => {
  const PAIR = (slug: string, from: Record<string, unknown>, to: Record<string, unknown>) => ({
    slug,
    from,
    toAt: "2026-08-16T00:00:00.000Z",
    to,
  });

  it("asks the snapshot table for DAYS, matching the window it asked the others for", async () => {
    // The two grains are one decision. A handler that passed the ISO instants
    // straight through would compare a DATE column against a timestamp and
    // silently return nothing, which looks exactly like a quiet week.
    const h = harness();
    await read(SETTLED, h);
    expect(h.days).toHaveLength(1);
    expect(h.days[0]!.startDay).toBe(h.windows[0]!.start.slice(0, 10));
    expect(h.days[0]!.endDay).toBe(h.windows[0]!.end.slice(0, 10));
    expect(h.days[0]!.startDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("carries the changed listings, attributed to the listing they happened on", async () => {
    const h = harness({
      pairs: [PAIR("kettle", { tagline: "Old words" }, { tagline: "New words" })],
    });
    const { body } = await read(SETTLED, h);
    expect(body.data!.digest.changed).toEqual([
      {
        slug: "kettle",
        field: "tagline",
        label: "The one-line description",
        provenance: { class: "authored", by: "maintainer" },
        from: "Old words",
        to: "New words",
      },
    ]);
  });

  it("puts an OBSERVED change above an authored one, whatever the slugs say", async () => {
    // OPC-2 as an ordering. A licence moving is a fact about the world and the
    // rarest thing on the list; a tagline edit is somebody typing. Alphabetical
    // order alone would bury the first under the second.
    const h = harness({
      pairs: [
        PAIR("aardvark", { tagline: "a" }, { tagline: "b" }),
        PAIR("zebra", { licence: "MIT" }, { licence: "AGPL-3.0" }),
      ],
    });
    const { body } = await read(SETTLED, h);
    expect(body.data!.digest.changed.map((c) => c.slug)).toEqual(["zebra", "aardvark"]);
    expect(body.data!.digest.changed[0]!.provenance).toEqual({
      class: "observed",
      source: "declared_repo",
      // OPC-7 — the moment of the read that found it, from the snapshot.
      observedAt: "2026-08-16T00:00:00.000Z",
    });
  });

  it("holds at three, because a lead is a lead", async () => {
    const h = harness({
      pairs: ["a", "b", "c", "d", "e"].map((s) =>
        PAIR(s, { tagline: "before" }, { tagline: "after" }),
      ),
    });
    const { body } = await read(SETTLED, h);
    expect(body.data!.digest.changed).toHaveLength(3);
  });

  it("is an EMPTY LIST for a quiet week, never a missing key", async () => {
    // The digest's key set is pinned (OD3) and a document that dropped a key
    // when its section was empty would make every consumer branch on absence.
    const { body } = await read(SETTLED);
    expect(body.data!.digest.changed).toEqual([]);
    expect(Object.keys(body.data!.digest).sort()).toEqual([...DIGEST_KEYS]);
  });

  it("orders by NOTHING about the listing itself", async () => {
    // Not by endorsements, not by recency, not by how many fields moved. A
    // listing with four changes does not outrank one with a licence change,
    // because this is a lead rather than a leaderboard.
    const h = harness({
      pairs: [
        PAIR(
          "busy",
          { tagline: "a", pitch: "a", category: "a", hosting: "a" },
          { tagline: "b", pitch: "b", category: "b", hosting: "b" },
        ),
        PAIR("quiet", { licence: "MIT" }, { licence: "Apache-2.0" }),
      ],
    });
    const { body } = await read(SETTLED, h);
    expect(body.data!.digest.changed[0]!.slug).toBe("quiet");
  });
});
