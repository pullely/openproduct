// The load fixture (openproduct-scale OS0).
//
// A corpus at the size the product is for, built in SQL with `generate_series`
// so that five thousand listings, a year of ingestion and a year of snapshots
// take a minute rather than an afternoon — and the same shape at a smaller
// size for the suite, because a plan asserted against ten rows is a plan
// asserted against nothing (OS4).
//
// ─── WHAT "A YEAR OF METRICS" ACTUALLY IS ────────────────────────────────
//
// The plan said "hourly × windows × metrics × listings", and building it
// showed that is not what the sweep produces. Ingestion is CAPPED —
// `INGESTION_MAX_SOURCES_PER_RUN` sources a run, one run an hour — so a year
// is `600 × days` observations whatever the corpus size, spread round-robin
// over the listings (the queue is oldest-first). Two metrics per observation
// (`merges·7d`, `last_touched·all`) is 438,000 rows for a year, not the
// eighty-seven million a per-listing-per-hour reading would give. The
// fixture writes what the cap allows, because a baseline over rows the
// product cannot produce is a baseline of nothing.
//
// Snapshots ARE per listing per day (OS2's one-a-day): 1.8 million rows for
// a year, and that is the table that decides whether OS3 is optional — which
// is exactly why the scale corpus generates it at full size, and why the
// suite corpus keeps a month of it (`snapshotDays`): the plans over it do
// not change shape past a few hundred thousand rows, and the suite's budget
// is seconds.
//
// ─── DETERMINISTIC, AND DATED FROM ONE INSTANT ───────────────────────────
//
// Every id is `md5(prefix || n)::uuid`, every subject `usr_` + a digest, and
// every timestamp is an offset from `CORPUS_NOW`. Two runs produce the same
// corpus; a query plan measured today is the plan measured tomorrow.

import type { SqlExecutor } from "../executor.js";

/** The moment the corpus is dated from. A Wednesday; the digest weeks and
 *  the board days fall out of it. */
export const CORPUS_NOW = "2026-09-09T12:00:00.000Z";

export interface CorpusShape {
  /** Listed products. */
  readonly listings: number;
  /** Days of ingestion and launches behind `CORPUS_NOW`. */
  readonly days: number;
  /** Days of one-a-day snapshots behind `CORPUS_NOW` (OS2's cadence). */
  readonly snapshotDays: number;
  /** Observations per day — the ingestion cap × the runs in a day. */
  readonly observationsPerDay: number;
  readonly endorsements: number;
  /** Every Nth endorsement carries an integrity decision (EN3). */
  readonly discountedEvery: number;
  readonly launchesPerDay: number;
  readonly follows: number;
  readonly contributors: number;
  readonly collections: number;
  readonly postsPerThread: number;
}

/** The size the product is for. Builds in about a minute on pglite. */
export const SCALE_CORPUS: CorpusShape = {
  listings: 5_000,
  days: 365,
  snapshotDays: 365,
  observationsPerDay: 25 * 24,
  endorsements: 50_000,
  discountedEvery: 20,
  launchesPerDay: 3,
  follows: 20_000,
  contributors: 1_000,
  collections: 50,
  postsPerThread: 4,
};

/** The same shape, sized for the suite: enough rows that the planner's
 *  choices mean something, few enough that the file runs in seconds. */
export const SUITE_CORPUS: CorpusShape = {
  listings: 5_000,
  days: 120,
  snapshotDays: 30,
  observationsPerDay: 25 * 24,
  endorsements: 20_000,
  discountedEvery: 20,
  launchesPerDay: 3,
  follows: 8_000,
  contributors: 500,
  collections: 20,
  postsPerThread: 2,
};

/** A smoke size: the shape, proved in well under a second. */
export const SMOKE_CORPUS: CorpusShape = {
  listings: 120,
  days: 10,
  snapshotDays: 10,
  observationsPerDay: 60,
  endorsements: 600,
  discountedEvery: 20,
  launchesPerDay: 6,
  follows: 200,
  contributors: 30,
  collections: 3,
  postsPerThread: 2,
};

export interface CorpusStep {
  readonly table: string;
  readonly rows: number;
  readonly ms: number;
}

export interface CorpusReport {
  readonly shape: CorpusShape;
  readonly steps: readonly CorpusStep[];
  readonly totalMs: number;
}

const CATEGORIES = ["developer-tools", "productivity", "infrastructure", "design"];
const HOSTINGS = ["self-host", "cloud", "both"];
const LICENCES = ["MIT", "Apache-2.0", "AGPL-3.0"];
const LANGUAGES = ["typescript", "go", "rust", "python"];

const arr = (values: readonly string[]) => `ARRAY[${values.map((v) => `'${v}'`).join(",")}]`;

/**
 * Build the corpus into a migrated, empty database.
 *
 * Every step is one statement. The order is the order of the foreign keys.
 * `ANALYZE` runs last so the planner sees the statistics a production
 * database would have — a plan over an unanalysed table is a guess.
 */
export async function loadCorpus(sql: SqlExecutor, shape: CorpusShape): Promise<CorpusReport> {
  const steps: CorpusStep[] = [];
  const started = Date.now();
  const N = shape.listings;
  const step = async (table: string, text: string): Promise<void> => {
    const t = Date.now();
    // The instant is bound where a statement dates from it; a statement that
    // reads only what an earlier one wrote takes no parameter.
    const res = await sql.execute(text, text.includes("$1") ? [CORPUS_NOW] : []);
    steps.push({ table, rows: res.rowCount, ms: Date.now() - t });
  };

  // ── Listings. Published over the last `days × 2`, a third without a live
  //    address, facets and licences on rotation (the web fixture's own).
  await step(
    "profiles",
    `INSERT INTO openproduct.profiles
       (id, org_id, project_id, slug, visibility, tagline, pitch_body, pitch_digest, repo_url, live_url,
        stack, stack_canonical, repo_visibility, repo_licence, repo_checked_at, reviewed_at, reviewed_by,
        published_at, created_by, category, hosting, indexable, moderation_state,
        repo_name, repo_language, repo_pushed_at, repo_open_issues)
     SELECT md5('p' || n)::uuid, md5('o' || (n % 700))::uuid, md5('j' || n)::uuid,
            'product-' || lpad(n::text, 5, '0'), 'public',
            'A dull, deterministic product for measuring page weight (#' || n || ').',
            'We are building a thing, number ' || n || ', in the open.', 'sha256:' || md5('d' || n),
            'https://github.com/acme/thing-' || n,
            CASE WHEN n % 3 = 0 THEN NULL ELSE 'https://thing-' || n || '.example.com' END,
            '["typescript","cloudflare"]'::jsonb, '["typescript","cloudflare"]'::jsonb,
            'public', (${arr(LICENCES)})[1 + n % 3],
            $1::timestamptz - (n || ' hours')::interval, $1::timestamptz - (n || ' hours')::interval, 'usr_admin',
            $1::timestamptz - ((n * (${shape.days} * 48.0 / ${N})) || ' hours')::interval, 'usr_maker',
            (${arr(CATEGORIES)})[1 + n % 4], (${arr(HOSTINGS)})[1 + n % 3], true, 'visible',
            'thing-' || n, (${arr(LANGUAGES)})[1 + n % 4],
            $1::timestamptz - (n || ' hours')::interval, n % 37
       FROM generate_series(1, ${N}) AS n`,
  );

  // ── One repository source per listing, read at the cadence the sweep
  //    would have reached it.
  await step(
    "signal_sources",
    `INSERT INTO openproduct.signal_sources (profile_id, source, locator, last_success_at)
     SELECT md5('p' || n)::uuid, 'linked_repo', 'acme/thing-' || n,
            $1::timestamptz - ((n % 24) || ' hours')::interval
       FROM generate_series(1, ${N}) AS n`,
  );

  // ── A year of ingestion AT THE CAP: `observationsPerDay` a day, round-robin
  //    over the corpus, two metrics per observation.
  await step(
    "metrics (ingestion)",
    `INSERT INTO openproduct.metrics (id, profile_id, metric, window_key, value, source, observed_at)
     SELECT md5('m' || g || '-' || k)::uuid, md5('p' || (1 + (g % ${N})))::uuid,
            CASE k WHEN 0 THEN 'merges' ELSE 'last_touched' END,
            CASE k WHEN 0 THEN '7d' ELSE 'all' END,
            CASE k WHEN 0 THEN (g * 7) % 41 ELSE 1700000000 + g END,
            'linked_repo',
            $1::timestamptz - interval '${shape.days} days' + ((g / ${shape.observationsPerDay}.0) || ' days')::interval
       FROM generate_series(1, ${shape.days * shape.observationsPerDay}) AS g, generate_series(0, 1) AS k`,
  );

  // ── Launches: `launchesPerDay` live launches a day, each on its own
  //    listing, with the board's `launch` metric the sweep would have
  //    written for it (LC3) — so the feed and the archive read the sweep's
  //    output, as they do in production.
  const launches = shape.days * shape.launchesPerDay;
  await step(
    "launches",
    `INSERT INTO openproduct.launches
       (id, profile_id, state, version_label, scheduled_for, launched_at, fired_at, board_rank_at, scheduled_by)
     SELECT md5('l' || g)::uuid, md5('p' || (1 + (g % ${N})))::uuid, 'live', 'v1.' || g,
            $1::timestamptz - interval '${shape.days} days' + ((g / ${shape.launchesPerDay}.0) || ' days')::interval,
            $1::timestamptz - interval '${shape.days} days' + ((g / ${shape.launchesPerDay}.0) || ' days')::interval,
            $1::timestamptz - interval '${shape.days} days' + ((g / ${shape.launchesPerDay}.0) || ' days')::interval,
            $1::timestamptz - interval '${shape.days} days' + ((g / ${shape.launchesPerDay}.0) || ' days')::interval + interval '1 hour',
            'usr_maker'
       FROM generate_series(0, ${launches - 1}) AS g`,
  );
  await step(
    "metrics (board)",
    `INSERT INTO openproduct.metrics (id, profile_id, metric, window_key, value, source, observed_at)
     SELECT md5('b' || l.id)::uuid, l.profile_id, 'launch',
            to_char(l.launched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
            (('x' || substr(md5('v' || l.id), 1, 6))::bit(24)::int) % 60, 'operator',
            l.board_rank_at
       FROM openproduct.launches l`,
  );

  // ── Discussion: the launch thread every listing with a launch has (CB1),
  //    a question thread on every other listing, and a few posts in each.
  await step(
    "threads",
    `INSERT INTO openproduct.threads (id, profile_id, tag, title, author_subject_id, state, last_post_at, created_at)
     SELECT md5('t' || l.profile_id)::uuid, l.profile_id, 'launch', 'Launch: ' || l.version_label, 'usr_maker', 'open',
            l.launched_at + interval '3 hours', l.launched_at
       FROM (SELECT DISTINCT ON (profile_id) profile_id, version_label, launched_at
               FROM openproduct.launches ORDER BY profile_id, launched_at DESC) l
     UNION ALL
     SELECT md5('q' || n)::uuid, md5('p' || n)::uuid, 'question', 'How do I run product-' || n || ' behind a proxy?',
            'usr_' || md5('u' || n), 'open',
            $1::timestamptz - ((n % 200) || ' hours')::interval, $1::timestamptz - ((n % 200) + 5 || ' hours')::interval
       FROM generate_series(1, ${N}) AS n WHERE n % 2 = 0`,
  );
  await step(
    "posts",
    `INSERT INTO openproduct.posts (id, thread_id, author_subject_id, body, created_at)
     SELECT md5('c' || t.id || '-' || k)::uuid, t.id, 'usr_' || md5('u' || (k * 31)),
            'Comment ' || k || ' on ' || t.title, t.created_at + (k || ' hours')::interval
       FROM openproduct.threads t, generate_series(1, ${shape.postsPerThread}) AS k`,
  );

  // ── Endorsements: each subject endorses about seven listings, spread
  //    over 400 days; every `discountedEvery`th carries an integrity
  //    decision, so the integrity reads have something to filter.
  await step(
    "endorsements",
    `INSERT INTO openproduct.endorsements (profile_id, subject_id, created_at, state)
     SELECT md5('p' || (1 + (e % ${N})))::uuid, 'usr_' || md5('s' || (e / 7)),
            $1::timestamptz - ((e % 400) || ' days')::interval - ((e % 23) || ' hours')::interval, 'confirmed'
       FROM generate_series(1, ${shape.endorsements}) AS e`,
  );
  await step(
    "endorsement_integrity",
    `INSERT INTO openproduct.endorsement_integrity (profile_id, subject_id, reason, decided_by, decided_at)
     SELECT profile_id, subject_id, 'ring', 'system', created_at + interval '1 day'
       FROM (SELECT profile_id, subject_id, created_at, row_number() OVER (ORDER BY created_at, subject_id) AS r
               FROM openproduct.endorsements) x
      WHERE r % ${shape.discountedEvery} = 0`,
  );

  // ── Snapshots: one per listing per day (OS2). The licence moves on one
  //    listing in fifty on one day in the window, so a diff exists.
  await step(
    "profile_snapshots",
    `INSERT INTO openproduct.profile_snapshots (profile_id, taken_on, taken_at, fields)
     SELECT md5('p' || n)::uuid, ($1::date - d), ($1::date - d)::timestamptz + interval '6 hours',
            jsonb_build_object(
              'tagline', 'A dull, deterministic product for measuring page weight (#' || n || ').',
              'licence', CASE WHEN n % 50 = 0 AND d < 3 THEN 'Apache-2.0' ELSE (${arr(LICENCES)})[1 + n % 3] END,
              'language', (${arr(LANGUAGES)})[1 + n % 4],
              'openings', CASE WHEN n % 3 = 0 THEN 1 ELSE 0 END,
              'category', (${arr(CATEGORIES)})[1 + n % 4])
       FROM generate_series(1, ${N}) AS n, generate_series(0, ${shape.snapshotDays - 1}) AS d`,
  );

  // ── The search index the rebuild would have written.
  await step(
    "search_index",
    `INSERT INTO openproduct.search_index (kind, entity_id, title, summary, terms, facets, built_at)
     SELECT 'listing', 'product-' || lpad(n::text, 5, '0'), 'product-' || lpad(n::text, 5, '0'),
            'A dull, deterministic product for measuring page weight (#' || n || ').',
            ARRAY['product', lpad(n::text, 5, '0'), (${arr(CATEGORIES)})[1 + n % 4], (${arr(LANGUAGES)})[1 + n % 4], 'dull', 'deterministic'],
            jsonb_build_object('category', (${arr(CATEGORIES)})[1 + n % 4], 'hosting', (${arr(HOSTINGS)})[1 + n % 3]),
            $1::timestamptz
       FROM generate_series(1, ${N}) AS n`,
  );
  await sql.execute(`UPDATE openproduct.search_index_state SET built_at = $1, dirty_at = NULL`, [CORPUS_NOW]);

  // ── People: public contributors with handles, one published maintainer
  //    per listing drawn from them.
  await step(
    "contributors",
    `INSERT INTO openproduct.contributors (subject_id, display_name, bio, profile_public, open_to_project, published_at)
     SELECT 'usr_' || md5('c' || c), 'Maker ' || c, 'Builds things in the open.', true, c % 4 = 0,
            $1::timestamptz - (c || ' hours')::interval
       FROM generate_series(1, ${shape.contributors}) AS c`,
  );
  await step(
    "handles",
    `INSERT INTO openproduct.handles (handle, subject_id, claimed_at)
     SELECT 'maker-' || c, 'usr_' || md5('c' || c), $1::timestamptz - (c || ' hours')::interval
       FROM generate_series(1, ${shape.contributors}) AS c`,
  );
  // The roster that makes a maintainer RESOLVE (CG2): a listing_maintainers
  // row and a confirmed product_people edge, without which no handle joins.
  await step(
    "listing_maintainers",
    `INSERT INTO openproduct.listing_maintainers (profile_id, subject_id, role, added_by)
     SELECT md5('p' || n)::uuid, 'usr_' || md5('c' || (1 + n % ${shape.contributors})), 'owner', 'usr_maker'
       FROM generate_series(1, ${N}) AS n`,
  );
  await step(
    "product_people",
    `INSERT INTO openproduct.product_people (profile_id, subject_id, state, invited_by, confirmed_at)
     SELECT md5('p' || n)::uuid, 'usr_' || md5('c' || (1 + n % ${shape.contributors})), 'confirmed', 'usr_maker',
            $1::timestamptz - (n || ' hours')::interval
       FROM generate_series(1, ${N}) AS n`,
  );
  await step(
    "published_maintainers",
    `INSERT INTO openproduct.published_maintainers (profile_id, subject_id, role_label, sort_order, display_name)
     SELECT md5('p' || n)::uuid, 'usr_' || md5('c' || (1 + n % ${shape.contributors})), 'Maintainer', 0,
            'Maker ' || (1 + n % ${shape.contributors})
       FROM generate_series(1, ${N}) AS n`,
  );

  // ── Follows: listings, and the four topics.
  await step(
    "follows",
    `INSERT INTO openproduct.follows (subject_id, kind, target, created_at)
     SELECT 'usr_' || md5('f' || (f / 5)), 'listing', 'product-' || lpad((1 + ((f * 7) % ${N}))::text, 5, '0'),
            $1::timestamptz - ((f % 300) || ' hours')::interval
       FROM generate_series(1, ${shape.follows}) AS f
     UNION ALL
     SELECT 'usr_' || md5('f' || f), 'topic', (${arr(CATEGORIES)})[1 + f % 4], $1::timestamptz - (f || ' hours')::interval
       FROM generate_series(1, ${Math.max(4, Math.floor(shape.follows / 20))}) AS f`,
  );

  // ── Collections: published, ten listings each.
  await step(
    "collections",
    `INSERT INTO openproduct.collections (id, slug, title, blurb, curator_subject_id, state, published_at)
     SELECT md5('k' || k)::uuid, 'collection-' || k, 'Worth a look, part ' || k, 'Ten things a maker chose.',
            'usr_' || md5('c' || (1 + k % ${shape.contributors})), 'published', $1::timestamptz - (k || ' days')::interval
       FROM generate_series(1, ${shape.collections}) AS k`,
  );
  await step(
    "collection_items",
    `INSERT INTO openproduct.collection_items (collection_id, profile_id, position)
     SELECT md5('k' || k)::uuid, md5('p' || (1 + ((k * 10 + j) % ${N})))::uuid, j
       FROM generate_series(1, ${shape.collections}) AS k, generate_series(0, 9) AS j`,
  );

  // ── Openings on every third listing; a hero on every fourth.
  await step(
    "role_openings",
    `INSERT INTO openproduct.role_openings (id, profile_id, title, description, commitment, status, sort_order)
     SELECT md5('r' || n)::uuid, md5('p' || n)::uuid, 'Maintainer', 'Keep the lights on.', 'a-few-hours-a-week', 'open', 0
       FROM generate_series(1, ${N}) AS n WHERE n % 3 = 0`,
  );
  await step(
    "product_media",
    `INSERT INTO openproduct.product_media (id, profile_id, kind, storage_ref, alt_text, width, height, position)
     SELECT md5('h' || n)::uuid, md5('p' || n)::uuid, 'hero', md5('img' || n) || md5('img2' || n) || '.png', 'The dashboard', 1200, 630, 0
       FROM generate_series(1, ${N}) AS n WHERE n % 4 = 0`,
  );

  const t = Date.now();
  await sql.execute(`ANALYZE`);
  steps.push({ table: "ANALYZE", rows: 0, ms: Date.now() - t });

  return { shape, steps, totalMs: Date.now() - started };
}

/** The corpus's slug for listing `n` (1-based). */
export function corpusSlug(n: number): string {
  return `product-${String(n).padStart(5, "0")}`;
}
