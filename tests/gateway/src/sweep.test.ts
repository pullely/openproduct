// The ingestion sweep (openproduct-commons SN1).
//
// Three claims, and the first is the one the whole sub-epic exists for:
//
//   1. an outage is never an observation — no failure path writes a number
//   2. the outbound surface did not grow: one host, slug-bounded inputs
//   3. a tier that cannot be polled is skipped, not observed as empty
//
// The database half is pinned against a live engine in
// packages/db/src/repository-pg.test.ts; this is the wire behaviour.

import { observeActivity, parseGithubRepo } from "@openproduct-gateway/github";
import { runSweep } from "@openproduct-gateway/sweep";
import type { Env } from "@openproduct-gateway/env";

interface OutcomeReport {
  at: string;
  outcomes: Array<{ phase: string; ok: boolean; reason: string | null }>;
}

interface Posted {
  profileId: string;
  source: string;
  ok?: boolean;
  error?: string;
  metrics?: Array<{ metric: string; window: string; value: number }>;
  repo?: { visibility?: string; licence?: string | null } | null;
}

function harness(
  sources: Array<Partial<Posted> & { slug?: string; repoUrl?: string | null }> = [],
  rebuild: { status?: number; rebuilt?: boolean; reason?: string } = { status: 200, rebuilt: true },
  // LC0 — what core answers when asked to fire due launches. Defaults to a
  // 200 with nothing due, which is the quiet-estate case every other test in
  // this file is really about.
  launches: { status?: number; live?: number; missed?: number } = {},
  // OS5 — what core answers when asked to materialise the catalogue.
  catalogue: { status?: number; rebuilt?: boolean } = {},
): {
  env: Env;
  posted: Posted[];
  rebuildCalls: string[];
  catalogueCalls: string[];
  launchCalls: string[];
  outcomes: OutcomeReport[];
} {
  const posted: Posted[] = [];
  const outcomes: OutcomeReport[] = [];
  const rebuildCalls: string[] = [];
  const catalogueCalls: string[] = [];
  const launchCalls: string[] = [];
  const env = {
    ENVIRONMENT: "test",
    CORE: {
      async fetch(url: string | Request, init?: RequestInit) {
        const href = typeof url === "string" ? url : url.url;
        if (href.endsWith("/signals/due")) {
          return new Response(
            JSON.stringify({
              data: {
                sources: sources.map((s, i) => ({
                  profileId: s.profileId ?? `opp_${i}`,
                  source: s.source ?? "linked_repo",
                  locator: null,
                  slug: s.slug ?? "acme-thing",
                  repoUrl: s.repoUrl === undefined ? "https://github.com/acme/thing" : s.repoUrl,
                  failureCount: 0,
                })),
              },
            }),
            { status: 200 },
          );
        }
        if (href.endsWith("/launches/fire")) {
          launchCalls.push(`${init?.method ?? "GET"} ${href}`);
          return new Response(
            JSON.stringify({
              data: { fired: { live: launches.live ?? 0, missed: launches.missed ?? 0 } },
            }),
            { status: launches.status ?? 200 },
          );
        }
        // OS5 — the catalogue phase, answered as core answers it.
        if (href.endsWith("/catalogue/rebuild")) {
          catalogueCalls.push(`${init?.method ?? "GET"} ${href}`);
          return new Response(
            JSON.stringify({
              data: { rebuilt: catalogue.rebuilt ?? true, cards: 2, written: 1, removed: 0, computedAt: "2026-08-25T12:00:00.000Z" },
            }),
            { status: catalogue.status ?? 200 },
          );
        }
        if (href.endsWith("/search/rebuild")) {
          rebuildCalls.push(`${init?.method ?? "GET"} ${href}`);
          return new Response(
            JSON.stringify({
              data: {
                rebuilt: rebuild.rebuilt ?? true,
                ...(rebuild.reason === undefined ? {} : { reason: rebuild.reason }),
              },
            }),
            { status: rebuild.status ?? 200 },
          );
        }
        // RS5 FOUND THIS. The fallback used to `JSON.parse(String(init?.body))`
        // unconditionally, so every BODYLESS call — the integrity sweep, the
        // board rank, the defence sweep, the digest queue — threw
        // `SyntaxError: "undefined" is not valid JSON` inside the stub itself.
        // Four of the six materialisation phases have therefore been failing
        // in every run of this suite since they were written, and every test
        // passed, because a phase that fails says nothing. That is the exact
        // defect RS5 exists to close, found in the tests for it.
        if (href.endsWith("/sweep/outcome")) {
          outcomes.push(JSON.parse(String(init?.body)) as OutcomeReport);
          return new Response(JSON.stringify({ data: { recorded: 5 } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (init?.body !== undefined) posted.push(JSON.parse(String(init.body)) as Posted);
        return new Response(JSON.stringify({ data: { swept: {} } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  } as unknown as Env;
  return { env, posted, rebuildCalls, catalogueCalls, launchCalls, outcomes };
}

const NOW = new Date("2026-08-25T12:00:00.000Z");

/** An env whose core refuses the search rebuild with a chosen error body. */
function coreRefusing(body: unknown): Env {
  return {
    ENVIRONMENT: "test",
    CORE: {
      async fetch(url: string | Request) {
        const href = typeof url === "string" ? url : url.url;
        if (href.endsWith("/search/rebuild")) {
          return new Response(JSON.stringify(body), {
            status: 503,
            headers: { "content-type": "application/json" },
          });
        }
        if (href.endsWith("/catalogue/rebuild")) {
          return new Response(JSON.stringify({ data: { rebuilt: true, cards: 0, written: 0, removed: 0 } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ data: { swept: {} } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  } as unknown as Env;
}

function jsonFetch(status: number, body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("an outage is never an observation", () => {
  it("records a FAILURE, not a zero, when GitHub cannot be reached", async () => {
    const h = harness([{}]);
    const throwing = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    const result = await runSweep(h.env, NOW, throwing);
    expect(result).toMatchObject({ looked: 1, failed: 1, observed: 0 });
    expect(h.posted).toHaveLength(1);
    expect(h.posted[0]).toMatchObject({ ok: false, error: "github_unreachable" });
    // The claim, stated as an absence: no metric of any kind was written.
    expect(h.posted[0]!.metrics).toBeUndefined();
  });

  it("records a failure on a bare 403 — only GitHub's own rate-limit signal is excused", async () => {
    const h = harness([{}]);
    await runSweep(h.env, NOW, jsonFetch(403, { message: "forbidden" }));
    expect(h.posted[0]).toMatchObject({ ok: false });
  });

  it("charges NOBODY for a rate limit, and stops asking for the rest of the run (OB2)", async () => {
    // The limit is a statement about this caller, not the repository. Eight
    // bad hours charged to the sources would withdraw every healthy listing.
    const h = harness([{ profileId: "opp_a" }, { profileId: "opp_b" }, { profileId: "opp_c" }]);
    let calls = 0;
    const limited = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      });
    }) as unknown as typeof fetch;
    const result = await runSweep(h.env, NOW, limited);
    expect(h.posted).toEqual([]);
    expect(calls).toBe(1);
    expect(result).toMatchObject({ looked: 3, skipped: 3, failed: 0, observed: 0 });
  });

  it("treats a 429 the same way", async () => {
    const h = harness([{}]);
    const result = await runSweep(h.env, NOW, jsonFetch(429, {}));
    expect(h.posted).toEqual([]);
    expect(result.failed).toBe(0);
  });

  it("records a failure — not a zero — for a repo_url we cannot parse", async () => {
    // A permanent condition with the remedy in the maintainer's hands. It
    // counts toward withdrawal rather than being retried forever at rate.
    const h = harness([{ repoUrl: "https://gitlab.com/acme/thing" }]);
    const result = await runSweep(h.env, NOW, jsonFetch(200, []));
    expect(result.failed).toBe(1);
    expect(h.posted[0]).toMatchObject({ ok: false, error: "repo_url_unreadable" });
  });

  it("writes a genuine zero when the repository is genuinely empty", async () => {
    // 409 is GitHub's answer for an empty repo. That IS an observation —
    // there is nothing merged because there is nothing — and it is
    // materially different from a repository we could not read.
    const h = harness([{}]);
    const empty = (async (url: string | URL) =>
      String(url).includes("/commits")
        ? new Response("{}", { status: 409 })
        : new Response(JSON.stringify({ private: false, license: null }), { status: 200 })) as unknown as typeof fetch;
    await runSweep(h.env, NOW, empty);
    expect(h.posted[0]).toMatchObject({ ok: true });
    expect(h.posted[0]!.metrics).toEqual([
      { metric: "merges", window: "7d", value: 0 },
      { metric: "merges", window: "30d", value: 0 },
    ]);
  });
});

describe("what the sweep writes when it succeeds", () => {
  it("counts merges in the window and records the last push", async () => {
    const h = harness([{}]);
    // Newest first, as the commits API answers: the head, then its parent.
    const commits = [
      { sha: "b", parents: [{ sha: "a" }], commit: { committer: { date: "2026-08-25T09:00:00Z" } } },
      { sha: "a", parents: [], commit: { committer: { date: "2026-08-24T10:00:00Z" } } },
    ];
    const ok = (async (url: string | URL) =>
      String(url).includes("/commits")
        ? new Response(JSON.stringify(commits), { status: 200 })
        : new Response(JSON.stringify({ private: false, license: { spdx_id: "MIT" } }), {
            status: 200,
          })) as unknown as typeof fetch;
    await runSweep(h.env, NOW, ok);
    const metrics = h.posted[0]!.metrics!;
    expect(metrics).toContainEqual({ metric: "merges", window: "7d", value: 2 });
    expect(metrics).toContainEqual({ metric: "merges", window: "30d", value: 2 });
    const touched = metrics.find((m) => m.metric === "last_touched");
    expect(touched?.value).toBe(Math.floor(Date.parse("2026-08-25T09:00:00Z") / 1000));
  });

  it("omits last_touched entirely when nothing has ever been pushed", async () => {
    // Absent, not zero. Epoch zero would render as 1 January 1970.
    const h = harness([{}]);
    const ok = (async (url: string | URL) =>
      String(url).includes("/commits")
        ? new Response("[]", { status: 200 })
        : new Response(JSON.stringify({ private: false, license: null }), { status: 200 })) as unknown as typeof fetch;
    await runSweep(h.env, NOW, ok);
    expect(h.posted[0]!.metrics!.map((m) => `${m.metric}.${m.window}`)).toEqual(["merges.7d", "merges.30d"]);
  });

  it("asks GitHub for the trailing thirty days — one read answers both windows (OB2)", async () => {
    const seen: string[] = [];
    const h = harness([{}]);
    const spy = (async (url: string | URL) => {
      seen.push(String(url));
      return new Response("[]", { status: 200 });
    }) as unknown as typeof fetch;
    await runSweep(h.env, NOW, spy);
    const since = encodeURIComponent(new Date("2026-07-26T12:00:00.000Z").toISOString());
    expect(seen.some((u) => u.includes(`since=${since}`))).toBe(true);
  });
});

describe("merged changes are counted the way the formula says (OB2)", () => {
  const AT = (iso: string) => ({ committer: { date: iso } });

  it("counts a merge commit once, leaves out bots, and caps a contributor's day", async () => {
    const h = harness([{}]);
    const day = "2026-08-24T";
    // Head first. m merges feature commits f1..f2 (off the first-parent line);
    // a bot bump; then seven commits by one agent on one UTC day.
    const agent = Array.from({ length: 7 }, (_, i) => ({
      sha: `g${i}`,
      parents: [{ sha: i > 0 ? `g${i - 1}` : "root" }],
      author: { login: "busy-agent", type: "User" },
      commit: AT(`${day}0${i}:00:00Z`),
    })).reverse();
    const commits = [
      { sha: "m", parents: [{ sha: "bump" }, { sha: "f2" }], author: { login: "ada", type: "User" }, commit: AT("2026-08-25T10:00:00Z") },
      { sha: "f2", parents: [{ sha: "f1" }], author: { login: "bo", type: "User" }, commit: AT("2026-08-25T09:30:00Z") },
      { sha: "f1", parents: [{ sha: "bump" }], author: { login: "bo", type: "User" }, commit: AT("2026-08-25T09:00:00Z") },
      { sha: "bump", parents: [{ sha: "g6" }], author: { login: "dependabot[bot]", type: "Bot" }, commit: AT("2026-08-25T08:00:00Z") },
      ...agent,
    ];
    const ok = (async (url: string | URL) =>
      String(url).includes("/commits")
        ? new Response(JSON.stringify(commits), { status: 200 })
        : new Response(JSON.stringify({ private: false, license: null }), { status: 200 })) as unknown as typeof fetch;
    await runSweep(h.env, NOW, ok);
    // m (1) + the agent's capped day (5). Not f1, f2 or the bump.
    expect(h.posted[0]!.metrics).toContainEqual({ metric: "merges", window: "7d", value: 6 });
  });

  it("hands core the whole repository read, so the observed row refreshes every pass", async () => {
    const h = harness([{}]);
    await runSweep(h.env, NOW, okGithub());
    expect(h.posted[0]!.repo).toMatchObject({ visibility: "public", licence: "MIT" });
  });

  it("hands core no repository read at all when that read failed", async () => {
    const h = harness([{}]);
    const half = (async (url: string | URL) =>
      String(url).includes("/commits")
        ? new Response("[]", { status: 200 })
        : new Response("oops", { status: 500 })) as unknown as typeof fetch;
    await runSweep(h.env, NOW, half);
    expect(h.posted[0]).toMatchObject({ ok: true, repo: null });
  });
});

describe("tiers that cannot be polled are skipped, not observed as empty", () => {
  it("does not touch a manifest-only listing's clock", async () => {
    // A manifest tier's facts were captured at publish; an empty observation
    // would reset its clock and imply we looked.
    const h = harness([{ source: "manifest" }, { source: "operator" }]);
    const result = await runSweep(h.env, NOW, jsonFetch(200, []));
    expect(result).toMatchObject({ looked: 2, skipped: 2, observed: 0, failed: 0 });
    expect(h.posted).toEqual([]);
  });
});

describe("the outbound surface did not grow", () => {
  it("still refuses every host but github.com", () => {
    expect(parseGithubRepo("https://github.com/acme/thing")).toEqual({
      owner: "acme",
      repo: "thing",
    });
    for (const hostile of [
      "https://gitlab.com/acme/thing",
      "https://github.com.evil.test/acme/thing",
      "http://github.com/acme/thing",
      "https://github.com/acme/thing/../../secrets",
      "https://169.254.169.254/latest/meta-data",
      "file:///etc/passwd",
      "https://github.com/acme",
    ]) {
      expect(parseGithubRepo(hostile)).toBeNull();
    }
  });

  it("builds the activity URL from api.github.com and a slug-bounded pair only", async () => {
    const seen: string[] = [];
    const spy = (async (url: string | URL) => {
      seen.push(String(url));
      return new Response("[]", { status: 200 });
    }) as unknown as typeof fetch;
    await observeActivity("acme", "thing", "2026-08-18T12:00:00.000Z", undefined, spy);
    expect(seen).toHaveLength(1);
    expect(new URL(seen[0]!).hostname).toBe("api.github.com");
  });

  it("treats a non-array body as unreadable rather than as zero merges", async () => {
    // GitHub returns an object for some error shapes. Counting `.length` of
    // an object is 0, and 0 here would say the project is dead.
    const result = await observeActivity(
      "acme",
      "thing",
      "2026-08-18T12:00:00.000Z",
      undefined,
      jsonFetch(200, { message: "Not Found" }),
    );
    expect(result.ok).toBe(false);
  });
});


/** A GitHub that answers both reads successfully — one merge, one push. */
function okGithub(): typeof fetch {
  return (async (url: string | URL) =>
    String(url).includes("/commits")
      ? new Response(
          JSON.stringify([{ sha: "a", parents: [], commit: { committer: { date: "2026-08-25T09:00:00Z" } } }]),
          { status: 200 },
        )
      : new Response(JSON.stringify({ private: false, license: { spdx_id: "MIT" } }), {
          status: 200,
        })) as unknown as typeof fetch;
}

describe("the search index rebuild (openproduct-commons DS0)", () => {
  it("asks core to rebuild, LAST, after this run's metrics have landed", async () => {
    const h = harness([{ profileId: "opp_1" }], { status: 200, rebuilt: true });
    const result = await runSweep(h.env, NOW, okGithub());
    // Ordering matters: a rebuild that ran first would index the PREVIOUS
    // sweep's numbers and be a full cycle behind for no reason.
    expect(h.posted).toHaveLength(1);
    expect(result.observed).toBe(1);
    expect(h.rebuildCalls).toEqual(["POST https://openproduct.internal/internal/openproduct/search/rebuild"]);
    expect(result.reindexed).toBe(true);
  });

  it("asks even when there was nothing to observe — a publish dirties the index without touching a metric", async () => {
    const h = harness([]);
    const result = await runSweep(h.env, NOW, jsonFetch(200, {}));
    expect(h.rebuildCalls).toHaveLength(1);
    expect(result.reindexed).toBe(true);
  });

  it("core deciding NOT to rebuild is not a failure", async () => {
    const h = harness([], { status: 200, rebuilt: false });
    const result = await runSweep(h.env, NOW, jsonFetch(200, {}));
    // Within the floor, or clean. The sweep runs on its own cadence and has
    // no way to know; core owns the floor because there is no single worker.
    expect(result.reindexed).toBe(false);
  });

  it("a failed rebuild never takes the sweep down with it", async () => {
    const h = harness([{ profileId: "opp_1" }], { status: 503 });
    const result = await runSweep(h.env, NOW, okGithub());
    // The previous index keeps serving and `dirty_at` stays set, so the next
    // sweep tries again. A stale index is a far better failure than an empty
    // one — and the observation this run just wrote must still stand.
    expect(result.reindexed).toBe(false);
    expect(result.observed).toBe(1);
  });
});

describe("firing the launches whose moment has passed (openproduct-commons LC0)", () => {
  it("asks core once, after the index rebuild", async () => {
    // ORDERING: a launch going live is the most visible thing this sweep does,
    // and doing it after the rebuild means the board's listing is already in
    // the search index when somebody arrives from it.
    const h = harness([], { status: 200, rebuilt: true }, { live: 2, missed: 1 });
    const result = await runSweep(h.env, NOW, jsonFetch(200, {}));
    expect(h.launchCalls).toEqual([
      "POST https://openproduct.internal/internal/openproduct/launches/fire",
    ]);
    expect(result.launchesFired).toEqual({ live: 2, missed: 1 });
  });

  it("reports a quiet estate as zero, not as a failure", async () => {
    const h = harness();
    const result = await runSweep(h.env, NOW, jsonFetch(200, {}));
    expect(result.launchesFired).toEqual({ live: 0, missed: 0 });
    expect(h.launchCalls).toHaveLength(1);
  });

  it("a failed fire leaves them SCHEDULED and never takes the sweep down", async () => {
    // The right failure: the next tick tries again and a launch goes out late.
    // Marking them fired and hoping would announce nothing while claiming it
    // had, and a maker whose launch silently evaporated cannot find out.
    const h = harness([{ profileId: "opp_1" }], { status: 200, rebuilt: true }, { status: 503 });
    const result = await runSweep(h.env, NOW, okGithub());
    expect(result.launchesFired).toEqual({ live: 0, missed: 0 });
    // ...and everything else this run did still stands.
    expect(result.observed).toBe(1);
    expect(result.reindexed).toBe(true);
  });
});

// RS2 — the split, tested as BEHAVIOUR rather than as a mapping.
//
// `sweep-schedule.test.ts` pins which cron means which mode. What is pinned
// here is the thing that actually matters: that a mode CHANGES WHAT RUNS.
// A split that named two modes and ran everything in both would satisfy every
// test in that file and none of the reasons the split exists.
describe("the two halves (RS2)", () => {
  it("materialisation asks core for none of the outward work", async () => {
    // The whole safety argument. Materialisation reaches nothing outside the
    // estate, so it must not even ASK which sources are due — that read is
    // the first step of a chain that ends at github.com.
    const h = harness([{ slug: "acme-thing" }]);
    const calls: string[] = [];
    const core = h.env.CORE as unknown as { fetch: (u: string | Request, i?: RequestInit) => Promise<Response> };
    const inner = core.fetch.bind(core);
    core.fetch = async (u: string | Request, i?: RequestInit) => {
      calls.push(typeof u === "string" ? u : u.url);
      return inner(u, i);
    };

    let outbound = 0;
    const countingFetch = (async () => {
      outbound += 1;
      return new Response("[]", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await runSweep(h.env, NOW, countingFetch, "materialisation");

    expect(calls.some((c) => c.includes("/signals/due"))).toBe(false);
    expect(outbound).toBe(0);
    expect(result.looked).toBe(0);
    expect(result.observed).toBe(0);
    // ...and it still does its own work.
    expect(calls.some((c) => c.includes("/search/rebuild"))).toBe(true);
    expect(calls.some((c) => c.includes("/launches/fire"))).toBe(true);
  });

  it("ingestion does the outward work and stops before the inward work", async () => {
    // The cost argument in the other direction: an hourly outbound run must
    // not drag seven inward phases along with it, or the two cadences are one
    // cadence again.
    const h = harness([{ slug: "acme-thing" }]);
    const calls: string[] = [];
    const core = h.env.CORE as unknown as { fetch: (u: string | Request, i?: RequestInit) => Promise<Response> };
    const inner = core.fetch.bind(core);
    core.fetch = async (u: string | Request, i?: RequestInit) => {
      calls.push(typeof u === "string" ? u : u.url);
      return inner(u, i);
    };

    const result = await runSweep(h.env, NOW, okGithub(), "ingestion");

    expect(calls.some((c) => c.includes("/signals/due"))).toBe(true);
    expect(result.looked).toBe(1);
    expect(calls.some((c) => c.includes("/search/rebuild"))).toBe(false);
    expect(calls.some((c) => c.includes("/launches/fire"))).toBe(false);
    expect(result.reindexed).toBe(false);
    expect(result.boardsRanked).toBe(0);
  });

  it("defaults to doing both, so every caller that predates the split is unchanged", async () => {
    const h = harness([{ slug: "acme-thing" }]);
    const result = await runSweep(h.env, NOW, okGithub());
    expect(result.looked).toBe(1);
    expect(result.reindexed).toBe(true);
  });
});

// RS5 — a phase that fails says so.
//
// Before RS5 this file's subject held ten `catch` blocks and not one
// `console` call. Every one of those catches fails SAFELY and each has a good
// sentence beside it — a failed rebuild leaves the previous index serving, a
// failed ranking leaves the previous board standing. None of them says so,
// and RS4 watched the index rebuild fail on prod in exactly that silence, on
// the phase behind the audit's lowest-scoring dimension.
//
// What is pinned here is that the silence is over, and that the SAFETY is not
// traded for it: every assertion below checks the log AND that the phase
// still degraded the way its comment promises.
describe("a failing phase says so (RS5)", () => {
  let warned: string[];
  const realWarn = console.warn;

  beforeEach(() => {
    warned = [];
    console.warn = (line: unknown) => {
      warned.push(String(line));
    };
  });
  afterEach(() => {
    console.warn = realWarn;
  });

  const parsed = (lines: string[]): Array<Record<string, unknown>> =>
    lines.map((l) => JSON.parse(l) as Record<string, unknown>);

  it("tells two refusals apart when they share a code", async () => {
    // BOTH of core's 503s on this route carry `internal_error`: a missing
    // PLATFORM_DB binding answers "Service unavailable", and the rebuild's own
    // catch answers "Search index rebuild failed". Different problems,
    // different remedies — and a log that called them both `internal_error`
    // would have learned nothing, which is this milestone's own failure mode
    // reproduced inside its fix.
    const withMessage = (message: string) =>
      coreRefusing({ error: { code: "internal_error", message } });

    const a = await runSweep(withMessage("Service unavailable"), NOW, okGithub(), "materialisation");
    const first = parsed(warned).find((l) => l.phase === "search_rebuild");
    expect(String(first!.reason)).toBe("internal_error: Service unavailable");
    expect(a.reindexed).toBe(false);

    warned = [];
    await runSweep(withMessage("Search index rebuild failed"), NOW, okGithub(), "materialisation");
    const second = parsed(warned).find((l) => l.phase === "search_rebuild");
    expect(String(second!.reason)).toBe("internal_error: Search index rebuild failed");
    expect(String(second!.reason)).not.toBe(String(first!.reason));
  });

  it("names the phase and the reason when core refuses the rebuild", async () => {
    const h = harness([], { status: 503 });
    const result = await runSweep(h.env, NOW, okGithub(), "materialisation");

    const failures = parsed(warned).filter((l) => l.msg === "sweep_phase_failed");
    const rebuild = failures.find((l) => l.phase === "search_rebuild");
    expect(rebuild).toBeDefined();
    expect(rebuild!.status).toBe(503);
    // ...and the phase still failed SAFELY: no throw, and the run continued.
    expect(result.reindexed).toBe(false);
  });

  it("stays silent when the floor declines, and speaks when the reason is a surprise", async () => {
    // Declining is not failing. `clean` and `within-floor` are the floor doing
    // its job on every tick forever, and a log that fires on success is a log
    // nobody reads on the day it matters. Any OTHER reason is a decline nobody
    // anticipated and gets exactly one line.
    const quiet = harness([], { status: 200, rebuilt: false, reason: "within-floor" });
    await runSweep(quiet.env, NOW, okGithub(), "materialisation");
    expect(parsed(warned).some((l) => l.phase === "search_rebuild")).toBe(false);

    warned = [];
    const odd = harness([], { status: 200, rebuilt: false, reason: "something-nobody-expected" });
    await runSweep(odd.env, NOW, okGithub(), "materialisation");
    const line = parsed(warned).find((l) => l.phase === "search_rebuild");
    expect(line).toBeDefined();
    expect(String(line!.reason)).toBe("declined:something-nobody-expected");
  });

  it("says nothing at all when every phase does its job", async () => {
    // A log that fires on success is a log nobody reads, and this one has to
    // stay worth reading on the day it fires for real.
    const h = harness([], { status: 200, rebuilt: true });
    await runSweep(h.env, NOW, okGithub(), "materialisation");
    expect(parsed(warned).filter((l) => l.msg === "sweep_phase_failed")).toHaveLength(0);
  });

  it("carries no listing, subject or repository into the line", async () => {
    // A sweep failure is about OUR machinery. The only thing a wider line
    // would add is something to leak (I3, and the velocity log's own rule).
    const h = harness([{ slug: "acme-thing" }], { status: 503 });
    await runSweep(h.env, NOW, okGithub(), "materialisation");

    for (const line of parsed(warned)) {
      expect(Object.keys(line).sort()).toEqual(
        expect.arrayContaining(["level", "msg", "phase", "reason"]),
      );
      expect(JSON.stringify(line)).not.toContain("acme-thing");
      expect(JSON.stringify(line)).not.toContain("github.com");
    }
  });
});

describe("the ledger reaches core as one write (openproduct-worldclass-v2 LI0)", () => {
  const realWarn = console.warn;
  beforeEach(() => {
    console.warn = () => {};
  });
  afterEach(() => {
    console.warn = realWarn;
  });

  it("reports every health phase once, after the last phase, stamped with the sweep's instant", async () => {
    const h = harness([], { status: 200, rebuilt: true });
    await runSweep(h.env, NOW, okGithub(), "materialisation");
    expect(h.outcomes).toHaveLength(1);
    const report = h.outcomes[0]!;
    expect(report.at).toBe(NOW.toISOString());
    expect(report.outcomes.map((o) => o.phase)).toEqual([
      "catalogue",
      "searchIndex",
      "integrity",
      "defence",
      "board",
      "digest",
      "snapshots",
    ]);
    expect(report.outcomes.every((o) => o.ok && o.reason === null)).toBe(true);
  });

  it("carries the refused rebuild as a failure with its bounded reason and status — the column production was missing", async () => {
    const h = harness([], { status: 503 });
    await runSweep(h.env, NOW, okGithub(), "materialisation");
    const index = h.outcomes[0]!.outcomes.find((o) => o.phase === "searchIndex")!;
    expect(index.ok).toBe(false);
    expect(index.reason).toMatch(/\(503\)$/);
    expect(index.reason!.length).toBeLessThanOrEqual(210);
    const rest = h.outcomes[0]!.outcomes.filter((o) => o.phase !== "searchIndex");
    expect(rest.every((o) => o.ok)).toBe(true);
  });

  it("a declined rebuild inside the floor is not a failure", async () => {
    const h = harness([], { status: 200, rebuilt: false, reason: "within-floor" });
    await runSweep(h.env, NOW, okGithub(), "materialisation");
    expect(h.outcomes[0]!.outcomes.find((o) => o.phase === "searchIndex")!.ok).toBe(true);
  });

  it("OS5 — the catalogue is asked for once, after integrity and before the index is built from it", async () => {
    const h = harness([], { status: 200, rebuilt: true });
    const calls: string[] = [];
    const core = h.env.CORE as unknown as { fetch: (u: string | Request, i?: RequestInit) => Promise<Response> };
    const inner = core.fetch.bind(core);
    core.fetch = async (u: string | Request, i?: RequestInit) => {
      calls.push(typeof u === "string" ? u : u.url);
      return inner(u, i);
    };
    const result = await runSweep(h.env, NOW, okGithub(), "materialisation");
    expect(result.catalogued).toBe(true);
    expect(h.catalogueCalls).toEqual(["POST https://openproduct.internal/internal/openproduct/catalogue/rebuild"]);
    const at = (needle: string) => calls.findIndex((c) => c.includes(needle));
    expect(at("/endorsements/integrity-sweep")).toBeGreaterThanOrEqual(0);
    expect(at("/endorsements/integrity-sweep")).toBeLessThan(at("/catalogue/rebuild"));
    expect(at("/catalogue/rebuild")).toBeLessThan(at("/search/rebuild"));
    expect(h.outcomes[0]!.outcomes.find((o) => o.phase === "catalogue")).toEqual({ phase: "catalogue", ok: true, reason: null });
  });

  it("OS5 — a refused catalogue rebuild is the phase's failure, with its status, and takes nothing else down", async () => {
    const h = harness([], { status: 200, rebuilt: true }, {}, { status: 503 });
    const result = await runSweep(h.env, NOW, okGithub(), "materialisation");
    expect(result.catalogued).toBe(false);
    expect(result.reindexed).toBe(true);
    const phase = h.outcomes[0]!.outcomes.find((o) => o.phase === "catalogue")!;
    expect(phase.ok).toBe(false);
    expect(phase.reason).toMatch(/\(503\)$/);
    expect(h.outcomes[0]!.outcomes.filter((o) => o.phase !== "catalogue").every((o) => o.ok)).toBe(true);
  });

  it("ingestion alone reports nothing — it has no health phase to report", async () => {
    const h = harness([], { status: 200, rebuilt: true });
    await runSweep(h.env, NOW, okGithub(), "ingestion");
    expect(h.outcomes).toHaveLength(0);
  });

  it("carries no listing, subject or repository into the report", async () => {
    const h = harness([{ slug: "acme-thing" }], { status: 503 });
    await runSweep(h.env, NOW, okGithub());
    expect(JSON.stringify(h.outcomes)).not.toContain("acme-thing");
    expect(JSON.stringify(h.outcomes)).not.toContain("github.com");
  });
});

// ─── MD4 — observed screenshots ride the ingestion run ────────────────────

function pngBytes(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13], 8);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

const PROVIDER_URL = "https://api.cloudflare.com/client/v4/accounts/abc/browser-rendering/screenshot";

/** The MD3 harness, with a bucket, the two capture settings, and a core that
 *  answers the capture queue and records what is posted to the ledger. */
function captureHarness(
  due: Array<{ profileId?: string; slug?: string; target: string; observedAt?: string | null }>,
  opts: { configured?: boolean; dueStatus?: number } = {},
) {
  const h = harness([]);
  const puts: string[] = [];
  const bucket = {
    async head() {
      return null;
    },
    async put(key: string) {
      puts.push(key);
      return { key };
    },
  } as unknown as R2Bucket;
  const calls: string[] = [];
  const reports: Array<Record<string, unknown>> = [];
  const core = h.env.CORE as unknown as { fetch: (u: string | Request, i?: RequestInit) => Promise<Response> };
  const inner = core.fetch.bind(core);
  core.fetch = async (u: string | Request, i?: RequestInit) => {
    const href = typeof u === "string" ? u : u.url;
    calls.push(`${i?.method ?? "GET"} ${href}`);
    if (href.endsWith("/media/captures/due")) {
      if (opts.dueStatus && opts.dueStatus !== 200) {
        return new Response(JSON.stringify({ error: { code: "internal_error", message: "no" } }), { status: opts.dueStatus });
      }
      return new Response(
        JSON.stringify({
          data: {
            captures: due.map((d, n) => ({
              profileId: d.profileId ?? `opp_${n}`,
              slug: d.slug ?? `thing-${n}`,
              target: d.target,
              observedAt: d.observedAt ?? null,
            })),
          },
        }),
        { status: 200 },
      );
    }
    if (href.endsWith("/media/captures")) {
      reports.push(JSON.parse(String(i?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ data: { recorded: "capture" } }), { status: 200 });
    }
    return inner(u, i);
  };
  const env = {
    ...h.env,
    MEDIA: bucket,
    ...(opts.configured === false
      ? {}
      : { SCREENSHOT_CAPTURE_URL: PROVIDER_URL, SCREENSHOT_CAPTURE_TOKEN: "cf-secret-token" }),
  } as unknown as Env;
  return { env, calls, reports, puts };
}

/** GitHub answers as before; the provider answers with a 1280×800 PNG. */
function providerAndGithub(): { fetchImpl: typeof fetch; providerCalls: Array<{ url: string; body: string }> } {
  const providerCalls: Array<{ url: string; body: string }> = [];
  const github = okGithub();
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    if (href.startsWith(PROVIDER_URL)) {
      providerCalls.push({ url: href, body: String(init?.body) });
      return new Response(pngBytes(1280, 800), { status: 200, headers: { "content-type": "image/png" } });
    }
    return github(url as string, init);
  }) as unknown as typeof fetch;
  return { fetchImpl, providerCalls };
}

describe("MD4 — observed screenshots ride the ingestion run", () => {
  it("does nothing, and asks core nothing, where the provider is not configured — and says so once", async () => {
    const h = captureHarness([{ target: "https://acme.example.com" }], { configured: false });
    const warned: string[] = [];
    const realWarn = console.warn;
    console.warn = (line: string) => warned.push(line);
    try {
      const result = await runSweep(h.env, NOW, providerAndGithub().fetchImpl, "ingestion");
      expect(result.captures).toEqual({ looked: 0, captured: 0, failed: 0 });
      expect(h.calls.some((c) => c.includes("/media/captures"))).toBe(false);
      const skipped = warned
        .map((l) => JSON.parse(l) as { msg: string; phase?: string; reason?: string })
        .filter((l) => l.msg === "sweep_phase_skipped");
      expect(skipped).toEqual([
        { level: "warn", msg: "sweep_phase_skipped", phase: "captures", reason: "not_configured" },
      ]);
    } finally {
      console.warn = realWarn;
    }
  });

  it("is ingestion: a materialisation run never reaches the queue even where captures are configured", async () => {
    const h = captureHarness([{ target: "https://acme.example.com" }]);
    const p = providerAndGithub();
    await runSweep(h.env, NOW, p.fetchImpl, "materialisation");
    expect(h.calls.some((c) => c.includes("/media/captures"))).toBe(false);
    expect(p.providerCalls).toEqual([]);
  });

  it("asks the queue, photographs each listing the policy allows, stores the bytes and reports one word per attempt", async () => {
    const h = captureHarness([
      { profileId: "opp_a", slug: "acme-thing", target: "https://acme.example.com/#top" },
      { profileId: "opp_b", slug: "beta-thing", target: "http://beta.example.com" },
    ]);
    const p = providerAndGithub();
    const result = await runSweep(h.env, NOW, p.fetchImpl, "ingestion");

    expect(result.captures).toEqual({ looked: 2, captured: 1, failed: 1 });
    expect(h.calls.filter((c) => c.includes("/media/captures"))).toEqual([
      "GET https://openproduct.internal/internal/openproduct/media/captures/due",
      "POST https://openproduct.internal/internal/openproduct/media/captures",
      "POST https://openproduct.internal/internal/openproduct/media/captures",
    ]);
    // The browser saw only the allowed address, without its fragment.
    expect(p.providerCalls.map((c) => (JSON.parse(c.body) as { url: string }).url)).toEqual(["https://acme.example.com/"]);
    expect(h.puts).toHaveLength(1);

    const [ok, refused] = h.reports as [Record<string, unknown>, Record<string, unknown>];
    expect(ok.ok).toBe(true);
    expect(ok.profileId).toBe("opp_a");
    expect(ok.target).toBe("https://acme.example.com/#top");
    expect(String(ok.ref)).toMatch(/^[0-9a-f]{64}\.png$/);
    expect(String(ok.alt)).toContain("acme-thing");
    expect([ok.width, ok.height, ok.observedAt]).toEqual([1280, 800, NOW.toISOString()]);
    expect(refused).toEqual({ profileId: "opp_b", target: "http://beta.example.com", ok: false, error: "target_refused" });
    // The token crosses to the provider and nowhere else.
    expect(JSON.stringify(h.reports)).not.toContain("cf-secret-token");
  });

  it("takes at most the contract's cap from a queue core over-answered", async () => {
    const h = captureHarness(Array.from({ length: 9 }, (_, n) => ({ target: `https://site-${n}.example.com` })));
    const p = providerAndGithub();
    const result = await runSweep(h.env, NOW, p.fetchImpl, "ingestion");
    expect(result.captures.looked).toBe(5);
    expect(p.providerCalls).toHaveLength(5);
  });

  it("logs a queue that would not answer and moves on — a refused read is not a capture and not a crash", async () => {
    const h = captureHarness([{ target: "https://acme.example.com" }], { dueStatus: 503 });
    const p = providerAndGithub();
    const warned: string[] = [];
    const realWarn = console.warn;
    console.warn = (line: string) => warned.push(line);
    try {
      const result = await runSweep(h.env, NOW, p.fetchImpl, "ingestion");
      expect(result.captures).toEqual({ looked: 0, captured: 0, failed: 0 });
      expect(p.providerCalls).toEqual([]);
      const phases = warned.map((l) => (JSON.parse(l) as { phase?: string }).phase);
      expect(phases).toContain("captures_due");
    } finally {
      console.warn = realWarn;
    }
  });
});
