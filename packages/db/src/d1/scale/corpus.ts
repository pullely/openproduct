// The load fixture, on D1 — the slice's tables only (OPN D1 slice proof).
//
// A PORT of `../../scale/corpus.ts` (openproduct-scale OS0) to SQLite, for
// the tables the slice reads and writes: profiles, metrics (a year-shaped
// ingestion at the cap, the board's launch metric, and the upvote counts the
// OB3 tick writes), role_openings, product_media and the search index. The
// shapes, rotations and sizes are corpus.ts's — `generate_series` became a
// recursive CTE, `($1 - (n || ' hours')::interval)` became
// `strftime(…, $1, '-n hours')`, and `md5('p' || n)::uuid` became a printf'd
// uuid-shaped id (SQLite has no md5; the ids need only be deterministic and
// distinct, and nothing in the slice reads their bits).
//
// Two things corpus.ts does not have, both so the slice's code paths are
// exercised at size: the `endorsements` counts (`7d` and `total` for every
// listing, as `refreshEndorsementCounts` writes them — the corpus leaves that
// to the tick), and the search index's `search_index_terms` rows (the GIN
// replacement, which corpus.ts has no need of).
//
// EVERY STATEMENT IS BOUNDED. A bulk table is written in ranges of at most
// `ROWS_PER_STATEMENT` rows, because remote D1 stops any one statement at
// 30 s; the generator runs inside the database, so it binds four parameters
// and no row ever crosses the wire.

import type { CorpusShape } from "../../scale/corpus.js";
import type { D1SqlExecutor } from "../executor.js";

export { CORPUS_NOW, SCALE_CORPUS, SMOKE_CORPUS, SUITE_CORPUS, corpusSlug } from "../../scale/corpus.js";

export const ROWS_PER_STATEMENT = 50_000;

const CATEGORIES = `'["developer-tools","productivity","infrastructure","design"]'`;
const HOSTINGS = `'["self-host","cloud","both"]'`;
const LICENCES = `'["MIT","Apache-2.0","AGPL-3.0"]'`;
const LANGUAGES = `'["typescript","go","rust","python"]'`;
const pick = (list: string, index: string) => `json_extract(${list}, '$[' || (${index}) || ']')`;
const F = `'%Y-%m-%dT%H:%M:%fZ'`;
/** The corpus's uuid for listing `n`, as SQL. */
const listingId = (n: string) => `printf('%08x-0000-4000-8000-%012x', 1, ${n})`;

export interface D1CorpusStep {
  readonly table: string;
  readonly rows: number;
  readonly statements: number;
  readonly ms: number;
}

export interface D1CorpusReport {
  readonly shape: CorpusShape;
  readonly steps: readonly D1CorpusStep[];
  readonly totalMs: number;
}

/** Build the slice corpus into a migrated, empty D1 database. */
export async function loadD1SliceCorpus(sql: D1SqlExecutor, shape: CorpusShape, now: string): Promise<D1CorpusReport> {
  const steps: D1CorpusStep[] = [];
  const started = Date.now();
  const N = shape.listings;

  /** One table, written in ranges [lo, hi] of the series, each one bounded statement. */
  const ranged = async (table: string, total: number, rowsPerSeriesValue: number, text: (lo: string, hi: string) => string) => {
    const t = Date.now();
    const per = Math.max(1, Math.floor(ROWS_PER_STATEMENT / rowsPerSeriesValue));
    let statements = 0;
    for (let lo = 1; lo <= total; lo += per) {
      const hi = Math.min(total, lo + per - 1);
      // CAST: D1 binds EVERY JS number as REAL (typeof(?) is "real" even for
      // 5), and REAL arithmetic leaks into text — '$[' || n % 3 || ']' became
      // '$[1.0]', a bad JSON path, on the first run.
      await sql.execute(text("CAST($2 AS INTEGER)", "CAST($3 AS INTEGER)"), [now, lo, hi]);
      statements += 1;
    }
    steps.push({ table, rows: total * rowsPerSeriesValue, statements, ms: Date.now() - t });
  };
  const series = (lo: string, hi: string, v = "n") =>
    `WITH RECURSIVE s(${v}) AS (SELECT ${lo} UNION ALL SELECT ${v} + 1 FROM s WHERE ${v} < ${hi})`;

  // ── Listings: published over the last `days × 2`, a third without a live
  //    address, facets and licences on rotation (corpus.ts, verbatim shape).
  await ranged("profiles", N, 1, (lo, hi) => `${series(lo, hi)}
    INSERT INTO profiles
      (id, org_id, project_id, slug, visibility, tagline, pitch_body, pitch_digest, repo_url, live_url,
       stack, stack_canonical, repo_visibility, repo_licence, repo_checked_at, reviewed_at, reviewed_by,
       published_at, created_by, category, hosting, indexable, moderation_state,
       repo_name, repo_language, repo_pushed_at, repo_open_issues)
    SELECT ${listingId("n")}, printf('%08x-0000-4000-8000-%012x', 2, n % 700), printf('%08x-0000-4000-8000-%012x', 3, n),
           'product-' || printf('%05d', n), 'public',
           'A dull, deterministic product for measuring page weight (#' || n || ').',
           'We are building a thing, number ' || n || ', in the open.', 'sha256:' || printf('%032x', n),
           'https://github.com/acme/thing-' || n,
           CASE WHEN n % 3 = 0 THEN NULL ELSE 'https://thing-' || n || '.example.com' END,
           '["typescript","cloudflare"]', '["typescript","cloudflare"]',
           'public', ${pick(LICENCES, "n % 3")},
           strftime(${F}, $1, '-' || n || ' hours'), strftime(${F}, $1, '-' || n || ' hours'), 'usr_admin',
           strftime(${F}, $1, '-' || (n * (${shape.days} * 48.0 / ${N})) || ' hours'), 'usr_maker',
           ${pick(CATEGORIES, "n % 4")}, ${pick(HOSTINGS, "n % 3")}, 1, 'visible',
           'thing-' || n, ${pick(LANGUAGES, "n % 4")},
           strftime(${F}, $1, '-' || n || ' hours'), n % 37
      FROM s`);

  // ── A year of ingestion AT THE CAP: `observationsPerDay` a day, round-robin
  //    over the corpus, two metrics per observation.
  await ranged("metrics (ingestion)", shape.days * shape.observationsPerDay, 2, (lo, hi) => `${series(lo, hi, "g")}
    INSERT INTO metrics (id, profile_id, metric, window_key, value, source, observed_at)
    SELECT printf('%08x-%04x-4000-8000-%012x', 4, k.k, g), ${listingId(`1 + (g % ${N})`)},
           CASE k.k WHEN 0 THEN 'merges' ELSE 'last_touched' END,
           CASE k.k WHEN 0 THEN '7d' ELSE 'all' END,
           CASE k.k WHEN 0 THEN (g * 7) % 41 ELSE 1700000000 + g END,
           'linked_repo',
           strftime(${F}, $1, '-${shape.days} days', '+' || (g * 86400.0 / ${shape.observationsPerDay}) || ' seconds')
      FROM s, (SELECT 0 AS k UNION ALL SELECT 1 AS k) k`);

  // ── The board's `launch` metric for `launchesPerDay` live launches a day,
  //    each on its own listing, dated an hour after its launch (LC3).
  await ranged("metrics (board)", shape.days * shape.launchesPerDay, 1, (lo, hi) => `${series(lo, hi, "g")}
    INSERT INTO metrics (id, profile_id, metric, window_key, value, source, observed_at)
    SELECT printf('%08x-0000-4000-8000-%012x', 5, g), ${listingId(`1 + (g % ${N})`)}, 'launch',
           date($1, '-${shape.days} days', '+' || (g * 86400.0 / ${shape.launchesPerDay}) || ' seconds'),
           (g * 7919) % 60, 'operator',
           strftime(${F}, $1, '-${shape.days} days', '+' || (g * 86400.0 / ${shape.launchesPerDay} + 3600) || ' seconds')
      FROM s`);

  // ── The upvote counts the OB3 tick writes: both windows for every listed
  //    build, zeros included, an hour old — so the folded key is (merges+1)×(upvotes+1)
  //    for real, not (merges+1)×1.
  await ranged("metrics (upvotes)", N, 2, (lo, hi) => `${series(lo, hi)}
    INSERT INTO metrics (id, profile_id, metric, window_key, value, source, observed_at)
    SELECT printf('%08x-%04x-4000-8000-%012x', 6, k.k, n), ${listingId("n")}, 'endorsements',
           CASE k.k WHEN 0 THEN '7d' ELSE 'total' END,
           CASE k.k WHEN 0 THEN CASE WHEN n % 7 = 0 THEN 1 + n % 3 ELSE 0 END ELSE 10 + n % 5 END,
           'operator', strftime(${F}, $1, '-1 hours')
      FROM s, (SELECT 0 AS k UNION ALL SELECT 1 AS k) k`);

  // ── Openings on every third listing; a hero on every fourth.
  await ranged("role_openings", N, 1, (lo, hi) => `${series(lo, hi)}
    INSERT INTO role_openings (id, profile_id, title, description, commitment, status, sort_order, created_at, updated_at)
    SELECT printf('%08x-0000-4000-8000-%012x', 7, n), ${listingId("n")}, 'Maintainer', 'Keep the lights on.',
           'a-few-hours-a-week', 'open', 0, $1, $1
      FROM s WHERE n % 3 = 0`);
  await ranged("product_media", N, 1, (lo, hi) => `${series(lo, hi)}
    INSERT INTO product_media (id, profile_id, kind, storage_ref, alt_text, width, height, position, created_at)
    SELECT printf('%08x-0000-4000-8000-%012x', 8, n), ${listingId("n")}, 'hero',
           printf('%064x', n) || '.png', 'The dashboard', 1200, 630, 0, $1
      FROM s WHERE n % 4 = 0`);

  // ── The search index the rebuild would have written, and its term rows.
  const doc = `'["product",' || json_quote(printf('%05d', n)) || ',' || json_quote(${pick(CATEGORIES, "n % 4")}) || ','
               || json_quote(${pick(LANGUAGES, "n % 4")}) || ',"dull","deterministic"]'`;
  await ranged("search_index", N, 1, (lo, hi) => `${series(lo, hi)}
    INSERT INTO search_index (kind, entity_id, title, summary, terms, facets, built_at)
    SELECT 'listing', 'product-' || printf('%05d', n), 'product-' || printf('%05d', n),
           'A dull, deterministic product for measuring page weight (#' || n || ').',
           ${doc},
           json_object('category', json_array(${pick(CATEGORIES, "n % 4")}), 'hosting', json_array(${pick(HOSTINGS, "n % 3")})),
           $1
      FROM s`);
  await ranged("search_index_terms", N, 6, (lo, hi) => `
    INSERT INTO search_index_terms (term, kind, entity_id)
    SELECT DISTINCT t.value, d.kind, d.entity_id
      FROM search_index d, json_each(d.terms) t
     WHERE d.kind = 'listing' AND d.entity_id BETWEEN 'product-' || printf('%05d', ${lo}) AND 'product-' || printf('%05d', ${hi})
       AND $1 IS NOT NULL`);
  await sql.execute(`UPDATE search_index_state SET built_at = $1, dirty_at = NULL`, [now]);

  const t = Date.now();
  await sql.execute(`ANALYZE`);
  steps.push({ table: "ANALYZE", rows: 0, statements: 1, ms: Date.now() - t });
  return { shape, steps, totalMs: Date.now() - started };
}
