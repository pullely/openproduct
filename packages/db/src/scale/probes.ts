// The public reads, named — and how each one's plan is read (openproduct-scale OS0, OS4).
//
// `PUBLIC_READS` is every repository method a public route calls, as the
// route calls it: the same arguments, the same shape, run through the real
// repository so what is measured is the SQL the product runs and not a
// paraphrase of it. A recording executor keeps each statement the method
// issued; the plan is asked for THAT statement, with THOSE parameters.
//
// Why a registry rather than a loop over the interface: the interface has
// two hundred methods and most are writes or the maintainer's. The public
// surface is the one a stranger can load, and the one whose cost is paid on
// every cold edge. Adding a public read means adding a row here — which is
// the point (OS4): the next read that walks a table cannot merge without
// either an index or a reason in the exceptions list.

import type { SqlExecutor, SqlRow } from "../executor.js";
import type { OpenproductRepository } from "../types.js";

export interface ProbeContext {
  readonly now: string;
  /** OS1 — the oldest merges observation the ordering reads (two freshness windows). */
  readonly mergesSince: string;
  /** OB3 — the upvote count's freshness floor, beside the merges one. */
  readonly endorsementsSince: string;
  readonly today: string;
  readonly weekAgo: string;
  readonly weekAgoDay: string;
  readonly monthAgo: string;
  /** The front page's slugs — what the directory's batched reads are given. */
  readonly slugs: readonly string[];
  readonly days: readonly string[];
  readonly day: string;
  readonly slug: string;
  readonly profileId: string;
  readonly threadId: string;
  readonly handle: string;
  readonly collectionSlug: string;
}

export interface ReadProbe {
  readonly name: string;
  /** Where a stranger pays for it. */
  readonly route: string;
  readonly run: (repo: OpenproductRepository, ctx: ProbeContext) => Promise<unknown>;
}

export const PUBLIC_READS: readonly ReadProbe[] = [
  // The front page and the directory.
  { name: "listPublicCards(100)", route: "/ · /v1/products", run: (r) => r.listPublicCards(100) },
  { name: "listPublicCardsPage(100)", route: "/ · /v1/products (OS1)", run: (r, c) => r.listPublicCardsPage({ cursor: null, limit: 100, mergesSince: c.mergesSince, endorsementsSince: c.endorsementsSince }) },
  { name: "listCataloguePage(100)", route: "/ · /v1/products (OS5)", run: (r) => r.listCataloguePage({ cursor: null, limit: 100 }) },
  { name: "latestMetricsForSlugs(100)", route: "/ · /v1/products", run: (r, c) => r.latestMetricsForSlugs([...c.slugs]) },
  { name: "listPublicMediaForSlugs(100)", route: "/ · /v1/products", run: (r, c) => r.listPublicMediaForSlugs([...c.slugs]) },
  { name: "countFollowers(listing × 100)", route: "/", run: (r, c) => r.countFollowers("listing", c.slugs) },
  { name: "countPublishedWindows", route: "/", run: (r, c) => r.countPublishedWindows(c.now) },
  { name: "listFeedLaunches(7 days)", route: "/", run: (r, c) => r.listFeedLaunches(c.days) },
  { name: "listRecentlyRepliedThreads(5)", route: "/ (sidebar)", run: (r) => r.listRecentlyRepliedThreads(5) },
  { name: "listPublishedCollections(20)", route: "/ · /collections", run: (r) => r.listPublishedCollections(20) },
  // The board and its archive.
  { name: "readBoardRanks(day)", route: "/launches/{day}", run: (r, c) => r.readBoardRanks(c.day) },
  { name: "listBoardDays(30)", route: "/launches", run: (r) => r.listBoardDays(30) },
  // The listing.
  { name: "getPublicProfile(slug)", route: "/{slug}", run: (r, c) => r.getPublicProfile(c.slug) },
  { name: "latestMetrics(profile)", route: "/{slug}", run: (r, c) => r.latestMetrics(c.profileId) },
  { name: "countEndorsements(profile)", route: "/{slug}", run: (r, c) => r.countEndorsements(c.profileId as never, c.now) },
  { name: "listPublicRoleOpenings(profile)", route: "/{slug}", run: (r, c) => r.listPublicRoleOpenings(c.profileId) },
  { name: "listPublicMaintainers(profile)", route: "/{slug}", run: (r, c) => r.listPublicMaintainers(c.profileId) },
  { name: "listPublicMedia(profile)", route: "/{slug}", run: (r, c) => r.listPublicMedia(c.profileId) },
  { name: "countOpeningDemand(profile)", route: "/{slug}", run: (r, c) => r.countOpeningDemand(c.profileId) },
  { name: "getLaunchThread(profile)", route: "/{slug}", run: (r, c) => r.getLaunchThread(c.profileId) },
  { name: "listThreads(profile)", route: "/{slug}", run: (r, c) => r.listThreads(c.profileId, null, 20) },
  { name: "listPosts(thread)", route: "/{slug}", run: (r, c) => r.listPosts(c.threadId, 50) },
  { name: "latestSnapshotBefore(profile)", route: "/{slug} (changed)", run: (r, c) => r.latestSnapshotBefore(c.profileId, c.weekAgoDay) },
  // Search.
  // A NAME search — the common case, and the one the GIN index is for. A
  // search for a word every listing carries is a scan by construction.
  { name: "searchCandidates(name)", route: "/search", run: (r) => r.searchCandidates(["00060"], 50) },
  { name: "getSearchIndexState", route: "/health", run: (r) => r.getSearchIndexState() },
  // The forum.
  { name: "listForumThreads(replied)", route: "/threads", run: (r) => r.listForumThreads({ tag: null, order: "replied", limit: 20 }) },
  // The digest.
  { name: "listMostEndorsedInWindow(week)", route: "/digest/{week}", run: (r, c) => r.listMostEndorsedInWindow(c.weekAgo, c.now, 5) },
  { name: "listLaunchesInWindow(week)", route: "/digest/{week}", run: (r, c) => r.listLaunchesInWindow(c.weekAgo, c.now, 25) },
  { name: "listSnapshotPairsInWindow(week)", route: "/digest/{week}", run: (r, c) => r.listSnapshotPairsInWindow(c.weekAgoDay, c.today, 100) },
  { name: "listDigestWeeks(52)", route: "/digest", run: (r) => r.listDigestWeeks(52) },
  // People and collections.
  { name: "listPublicContributorCards(50)", route: "/people", run: (r) => r.listPublicContributorCards(50) },
  { name: "getPublicContributor(handle)", route: "/people/{handle}", run: (r, c) => r.getPublicContributor(c.handle) },
  { name: "searchPublicContributors('maker')", route: "/search", run: (r) => r.searchPublicContributors("maker", 10) },
  { name: "getPublicCollection(slug)", route: "/collections/{slug}", run: (r, c) => r.getPublicCollection(c.collectionSlug) },
];

// ---------------------------------------------------------------------------
// Recording, and reading a plan
// ---------------------------------------------------------------------------

export interface RecordedStatement {
  readonly text: string;
  readonly params: readonly unknown[];
  readonly ms: number;
  readonly rows: number;
}

/** An executor that keeps what it ran. `statements` is cleared by the caller
 *  between probes. */
export function recordingExecutor(inner: SqlExecutor): { sql: SqlExecutor; statements: RecordedStatement[] } {
  const statements: RecordedStatement[] = [];
  const sql: SqlExecutor = {
    async execute<T extends SqlRow = SqlRow>(text: string, params?: unknown[]) {
      const t = Date.now();
      const res = await inner.execute<T>(text, params);
      statements.push({ text, params: params ?? [], ms: Date.now() - t, rows: res.rowCount });
      return res;
    },
  };
  return { sql, statements };
}

export interface PlanNode {
  readonly "Node Type": string;
  readonly "Relation Name"?: string;
  readonly "Index Name"?: string;
  readonly "Actual Total Time"?: number;
  readonly "Actual Rows"?: number;
  readonly Plans?: readonly PlanNode[];
}

/** Ask the engine for the plan of one recorded statement, with its own
 *  parameters bound — the plan the product got, not the plan of a paraphrase. */
export async function explain(sql: SqlExecutor, statement: RecordedStatement, analyze = false): Promise<PlanNode> {
  const res = await sql.execute<{ "QUERY PLAN": unknown }>(
    `EXPLAIN (${analyze ? "ANALYZE, " : ""}FORMAT JSON) ${statement.text}`,
    [...statement.params],
  );
  const raw = res.rows[0]?.["QUERY PLAN"];
  const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as Array<{ Plan: PlanNode }>;
  const plan = parsed?.[0]?.Plan;
  if (!plan) throw new Error(`no plan returned for: ${statement.text.slice(0, 80)}`);
  return plan;
}

/** Every relation a plan reads by sequential scan. */
export function seqScans(plan: PlanNode): string[] {
  const out: string[] = [];
  const walk = (node: PlanNode): void => {
    if (node["Node Type"] === "Seq Scan" && node["Relation Name"]) out.push(node["Relation Name"]);
    for (const child of node.Plans ?? []) walk(child);
  };
  walk(plan);
  return out;
}

/** The scan kinds a plan uses, for the baseline's one-word summary. */
export function planShape(plan: PlanNode): string {
  const kinds = new Set<string>();
  const walk = (node: PlanNode): void => {
    const type = node["Node Type"];
    if (type.endsWith("Scan") && node["Relation Name"]) {
      kinds.add(`${type === "Seq Scan" ? "Seq Scan" : type.replace(" Scan", "")}:${node["Relation Name"]}`);
    }
    for (const child of node.Plans ?? []) walk(child);
  };
  walk(plan);
  return [...kinds].join(" ");
}

/** The tables OS4 watches: the ones every public route reads and the ones
 *  that grow with the corpus rather than with the estate. */
export const WATCHED_TABLES: readonly string[] = [
  "profiles",
  "catalog_cards",
  "metrics",
  "endorsements",
  "endorsement_integrity",
  "profile_snapshots",
  "posts",
  "threads",
  "launches",
  "search_index",
  "follows",
];
