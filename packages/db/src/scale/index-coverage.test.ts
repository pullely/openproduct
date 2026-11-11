// Index coverage as a test (openproduct-scale OS4).
//
// Every public read, run as the route runs it against the suite corpus, and
// every statement it issued explained: no `Seq Scan` over a watched table
// unless the scan is ENUMERATED below with a reason — the way the purge
// registry enumerates its classifications. The value is not what it finds
// today; it is that the next handler cannot merge with a CTE that walks
// `metrics`.
//
// TWO WAYS TO FAIL, deliberately. A scan that is not in the list fails, and
// so does a list entry the plans no longer show: an exception that outlived
// its scan is a sentence nobody reads, and removing it is the reviewable act.
//
// ANALYSED, AT A SIZE THAT MEANS SOMETHING. The suite corpus is 1,500
// listings, 54,000 metric rows and 67,500 snapshots, and `ANALYZE` runs
// before any plan is asked for: a planner with statistics over ten rows
// prefers a sequential scan on principle, and would assert nothing.

import { beforeAll, describe, expect, it } from "vitest";

import { SUITE_CORPUS, loadCorpus } from "./corpus.js";
import { contextFor, migratedDb, type ScaleDb } from "./harness.js";
import {
  PUBLIC_READS,
  WATCHED_TABLES,
  explain,
  recordingExecutor,
  seqScans,
  type ProbeContext,
} from "./probes.js";
import { createOpenproductRepository } from "../repository.js";

interface AllowedScan {
  readonly read: string;
  readonly table: string;
  readonly reason: string;
}

/**
 * The sequential scans the public reads are ALLOWED to make, each with the
 * reason it is not a missing index. Adding a row here is a review decision.
 */
export const ALLOWED_SEQ_SCANS: readonly AllowedScan[] = [
  {
    read: "latestMetricsForSlugs(100)",
    table: "metrics",
    reason:
      "The front page's metrics for a hundred listings at once: the planner hashes the year of metrics against the page rather than probing the (profile_id, metric, window_key, observed_at) index a hundred times. OFF THE REQUEST PATH since OS5 — the catalogue carries each card's latest observations and the page reads them with it — and kept as the live fallback before the first sweep and as the equivalence test's oracle.",
  },
  {
    read: "listPublicCardsPage(100)",
    table: "profiles",
    reason:
      "OS1's page: the ordering key is a metric, so the sort is over every listed row and cannot be indexed — one index probe of metrics per row, then a sort of five thousand. OFF THE REQUEST PATH since OS5 (`listCataloguePage` is a range on the catalogue's order index); kept as the live fallback before the first sweep and as the equivalence test's oracle.",
  },
  {
    read: "listPublicContributorCards(50)",
    table: "launches",
    reason:
      "PE3's 'has a live launch' fact: a semi-join over the live launches for fifty contributors' listings, hashed whole at this size rather than probed per listing. The (profile_id, scheduled_for) index serves the per-listing read.",
  },
  {
    read: "countPublishedWindows",
    table: "profiles",
    reason:
      "Four counts over every listed row (today, week, month, total). A census reads the table by construction; five thousand listings is a few hundred pages. OS5 stamps it beside the catalogue.",
  },
  {
    read: "listBoardDays(30)",
    table: "launches",
    reason: "A census of live launches grouped by day, newest first. The table grows three rows a day; a stamped days table is OS5-shaped.",
  },
  {
    read: "listBoardDays(30)",
    table: "profiles",
    reason: "The join that re-asserts each launch's listing is public — a hash of the listed set, chosen over per-launch probes for a group over the whole table.",
  },
  {
    read: "listDigestWeeks(52)",
    table: "launches",
    reason: "A census of live launches by ISO week, for the digest's archive list. The same shape as the board days, for the same reason.",
  },
  {
    read: "listDigestWeeks(52)",
    table: "profiles",
    reason: "The listed-set hash that goes with the launches census above.",
  },
  {
    read: "listForumThreads(replied)",
    table: "threads",
    reason:
      "The forum's 'replied' order sorts by a COMPUTED post count first (`post_count DESC`), which no index can serve: the read is a sort over every open thread by construction. The forum page is one page; a stamped count would be OS5-shaped.",
  },
  {
    read: "listForumThreads(replied)",
    table: "profiles",
    reason: "The listed-set hash for the sort above, and the handle join's own EXISTS over the maintainers' listings.",
  },
  {
    read: "listMostEndorsedInWindow(week)",
    table: "profiles",
    reason:
      "A week of endorsements (now by index, 1915) grouped by listing: the planner hashes the listed set against a few hundred rows rather than probing per row. Chosen at this cardinality, not a missing index.",
  },
  {
    read: "listMostEndorsedInWindow(week)",
    table: "endorsement_integrity",
    reason:
      "The anti-join that drops discounted endorsements: the integrity table is the discounted five per cent and is hashed whole. Its (profile_id, subject_id) index serves the per-listing read; the week-wide read prefers the hash.",
  },
  {
    read: "listSnapshotPairsInWindow(week)",
    table: "profiles",
    reason: "The digest's diff is over EVERY listed listing by design; the listed set is hashed against the snapshot pairs.",
  },
  {
    read: "searchCandidates(name)",
    table: "search_index",
    reason:
      "The GIN index on `terms` exists and answers this predicate; at five thousand rows the planner prefers a hundred pages to a bitmap. The index takes over as the table grows — when it does, this line goes stale and the test says so.",
  },
  {
    read: "searchPublicContributors('maker')",
    table: "profiles",
    reason: "The EXISTS that keeps a contributor resolvable only while they maintain a listed listing, hashed over the listed set for an ILIKE that reads every contributor anyway.",
  },
];

describe("OS4 — every public read's plan", () => {
  let scale: ScaleDb;
  let ctx: ProbeContext;
  const found: Array<{ read: string; table: string; statement: string }> = [];

  beforeAll(async () => {
    scale = await migratedDb();
    await loadCorpus(scale.sql, SUITE_CORPUS);
    ctx = await contextFor(scale.repo);
    const recorder = recordingExecutor(scale.sql);
    const repo = createOpenproductRepository(recorder.sql);
    for (const probe of PUBLIC_READS) {
      recorder.statements.length = 0;
      await probe.run(repo, ctx);
      for (const statement of recorder.statements) {
        const plan = await explain(scale.sql, statement);
        for (const table of seqScans(plan)) {
          if (WATCHED_TABLES.includes(table) && !found.some((f) => f.read === probe.name && f.table === table)) {
            found.push({ read: probe.name, table, statement: statement.text.replace(/\s+/g, " ").slice(0, 400) });
          }
        }
      }
    }
  }, 180_000);

  it("walks no watched table by sequential scan unless the scan is enumerated with a reason", () => {
    // `OS4_DUMP=1` prints every scan found, with the statement, for the
    // person deciding whether it is an index or a reason.
    if (process.env.OS4_DUMP) {
      for (const f of found) process.stdout.write(`OS4 ${f.read} · ${f.table} · ${f.statement}\n`);
    }
    const unexpected = found.filter(
      (f) => !ALLOWED_SEQ_SCANS.some((a) => a.read === f.read && a.table === f.table),
    );
    expect(unexpected).toEqual([]);
  });

  it("keeps no exception whose scan the plans no longer show", () => {
    const stale = ALLOWED_SEQ_SCANS.filter(
      (a) => !found.some((f) => f.read === a.read && f.table === a.table),
    );
    expect(stale).toEqual([]);
  });

  it("covers every public read the registry names, and the registry names the front page", () => {
    expect(PUBLIC_READS.length).toBeGreaterThan(25);
    expect(PUBLIC_READS.map((p) => p.name)).toContain("listPublicCards(100)");
    expect(PUBLIC_READS.map((p) => p.name)).toContain("latestMetricsForSlugs(100)");
  });
});
