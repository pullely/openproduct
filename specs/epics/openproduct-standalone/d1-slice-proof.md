# D1 slice proof: can Cloudflare D1 replace Postgres for openproduct?

**Epic:** openproduct-standalone (OPN). **Milestone:** D1 slice proof.
**Tree:** the openproduct product tree cut from orun-cloud `b421bc672`, in a scratch repository outside this one (local git only; nothing pushed). OPN-2 carried the tree and the slice into this repository, and this write-up with them (it was that repository's `PROOF.md`); the commits listed at the end are the scratch repository's.
**Date:** 2026-11-09. **Engine:** local D1 is miniflare `5.20261104.0-beta` running workerd `1.20261104.1`. It is real workerd SQLite behind the D1 binding, not better-sqlite3 and not PGlite. The node runtime was Node.js v26.13.0.

## Verdict

**GO, with conditions** (see the end of this document). I ported six repository methods that use most of the hard Postgres features, along with their schema. They give **identical results to Postgres** in 41 differential cases and in a full walk of a 5,000-listing corpus. I checked results field for field, including order, cursors, census, report counts and timestamps, and I also compared the tables the methods write, row for row. All of this ran on local D1. Local timings are close to PGlite: the catalogue rebuild over 5,000 listings takes about 0.3 to 0.6 s of SQL time on both engines.

Nothing in the slice turned out impossible on D1. The port did hit **seven real incompatibilities**. Two of them local D1 would *not* have caught by itself, and one is a D1 limit that local workerd simply does not enforce. All seven are fixed, and the class of problem behind each one now has a test. What remains unproven is **remote** behaviour: network latency, payload limits and the limits local workerd skips. One specific remote test is still owed (described below).

## What was built

All code is in `packages/db/src/d1/`. The Postgres implementation is untouched. `git diff e37412b -- packages/db/src/repository.ts packages/db/src/executor.ts packages/db/src/migrations` is empty.

| File | What it is |
|---|---|
| `binding.ts` | Structural D1 binding types, including `batch()` and `meta.timings`. Adapted from cirrus (pullely/ackstack `packages/db/src/d1/binding.ts` @ 20c7e1cd). |
| `sql.ts` | Translates `$n` → `?n` and skips string literals and comments while doing so. Also `toBindValue`, and `toInstant`, which enforces **the one timestamp format**. Adapted from cirrus `sql.ts`. |
| `executor.ts` | `createD1Executor(binding, observer?)`. It implements openproduct's `SqlExecutor`, sets `rowCount = rows.length`, adds **`batch(statements)`** for atomic writes, and has no `transaction()`. Adapted from cirrus `executor.ts`. |
| `errors.ts` | Constraint-error classifiers. Copied verbatim from cirrus, plus `isTriggerAbort`. |
| `migrations/0001_slice.sql` | The SQLite schema for the slice's 9 tables, each at its latest shape. It combines Postgres migrations 1160, 1260, 1300, 1320, 1340, 1350, 1370, 1440, 1780, 1810, 1820, 1830, 1840, 1860, 1900, 1925 and 2255. |
| `schema.ts` | Applies that same file in tests. It has its own statement splitter, which understands triggers, because D1 `exec()` splits on newlines. |
| `mappers.ts` | The Postgres repository's private row mappers, copied verbatim so both implementations return byte-identical records. |
| `slice-repository.ts` | **`createD1SliceRepository(executor)`**: `rebuildCatalogue`, `listCataloguePage`, `replaceSearchIndex`, `searchCandidates`, `getSearchIndexState`, `markSearchIndexDirty`, plus `touchSearchIndex` (the D1 version of `touchIndex()`). The signatures are typed directly off `OpenproductRepository`. |
| `remote-limits.ts` | Static checks for the **remote** D1 limits that local workerd does not enforce: 32 arguments per function and 2 MB per value. It also checks the 100-parameter and 100 KB limits. |
| `harness.ts` | Starts local D1 through miniflare, resets the schema, and **mirrors** the source tables from Postgres into D1 under the translation rules. |
| `differential.ts` | The differential harness. Postgres is the oracle: both engines get the same call, and the suite compares results with deep equality, compares the written tables, compares refusals, and checks remote limits after every test. |
| `*.test.ts` | `sql` (12 tests), `engine` (19), `remote-limits` (5), `differential-catalogue` (19), `differential-search` (22), `pg-driver-counts` (3). |
| `scale/corpus.ts` | The OS0 corpus generator ported to SQLite for the slice's tables (recursive CTEs, bounded statements). |
| `scale/harness.ts`, `scale/catalogue-differential.test.ts`, `scale/d1-corpus.test.ts` | The scale suites. They are opt-in: set `D1_SCALE=1` for the suite size or `D1_SCALE=full` for 365 days. |

`packages/db/package.json` gained a `./d1` export, a `miniflare` dev dependency, and the scripts `test:d1` and `test:d1:scale`.

**How to run** (run the db package by itself; it times out under parallel load):

```bash
cd packages/db
npx vitest run                                                   # whole package: 28 files, 649 passed, 12 opt-in skipped
npx vitest run src/d1                                            # D1 suites only: 80 tests
D1_SCALE=1    npx vitest run src/d1/scale                        # 5,000 listings, 120 days (11 tests)
D1_SCALE=full npx vitest run src/d1/scale/d1-corpus.test.ts      # 5,000 listings, 365 days
```

## Translation rules

| Postgres | SQLite / D1 form | Where used |
|---|---|---|
| `openproduct.` schema prefix | Dropped; there is one database per product | everywhere |
| `UUID` | `TEXT` | all ids |
| `TIMESTAMPTZ` | `TEXT` in **exactly** `YYYY-MM-DDTHH:MM:SS.sssZ`. Every bound instant goes through `toInstant()`. Every column has the CHECK `strftime('%Y-%m-%dT%H:%M:%fZ', c) IS c`. Only in that one format does text order equal time order. | every instant |
| `DEFAULT now()`, `now()` | `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` | defaults, `touchSearchIndex` |
| `$1::timestamptz - INTERVAL 'n days'` | Instant computed in JS and bound (UTC days of 24 h) | census windows |
| `JSONB` | `TEXT` holding JSON, with `json_valid`/`json_type` CHECKs | profiles.stack, catalog_cards.record/metrics/media, search_index.facets |
| `BOOLEAN` | `INTEGER` 0/1 with CHECK; written into JSON as `json('true')` | indexable, clean_votes, singleton, has_live_url |
| `BIGINT` | `INTEGER` (64-bit). JS reads it exactly up to 2^53. | metrics.value, ordering_merges |
| `TEXT[]` + GIN `terms && $1` | `terms` stored as a JSON TEXT value, **plus** a table `search_index_terms(term, kind, entity_id)` with the primary key leading on `term`. The overlap check becomes `(kind, entity_id) IN (SELECT … WHERE term IN (SELECT value FROM json_each(?)))`. | search_index, searchCandidates |
| `= ANY($1::text[])`, `<> ALL($2::text[])` | `IN / NOT IN (SELECT value FROM json_each(?))`. In `replaceSearchIndex` the `<> ALL` disappeared entirely: delete-then-insert inside one atomic batch. | searchCandidates, replaceSearchIndex, mirror |
| `jsonb_to_recordset($2::text::jsonb) AS d(…)` | `json_each(?2) d` plus `json_extract(d.value, '$.col')`. A per-row array uses `json_each(d.value, '$.terms')`. | replaceSearchIndex |
| `LEFT JOIN LATERAL (… ORDER BY observed_at DESC LIMIT 1)` | Correlated scalar subquery (one index seek), inside `WITH k AS MATERIALIZED` so the folded key reads it once | rebuildCatalogue (`latestUpvotesLateral`, merges) |
| `LEFT JOIN LATERAL (page) ON TRUE` against the singleton | Plain `LEFT JOIN (page) ON 1`, because it was never really lateral, **plus an outer `ORDER BY`** (SQLite does not guarantee the order of join output) | listCataloguePage |
| `DISTINCT ON (metric, window_key) … ORDER BY …, observed_at DESC` | `row_number() OVER (PARTITION BY metric, window_key ORDER BY observed_at DESC) = 1` | rebuildCatalogue (latest metrics) |
| `jsonb_agg(x ORDER BY …)`, `array_agg(x ORDER BY …)` | `json_group_array(x ORDER BY …)`. ORDER BY inside an aggregate needs SQLite ≥ 3.44; verified on workerd. An ordered subquery is **not** a guarantee in SQLite. | metrics, media, open_commitments |
| `to_jsonb(row)`, `to_jsonb(md) - 'ord'` | `json_object(…)` key by key. The card has 17 keys, which is more than 32 arguments, so it is `json_insert(json_object(8 pairs), 9 paths)`. | the card record |
| `IS DISTINCT FROM` on row values | `IS NOT` on row values: NULL-safe, verified | upsert `WHERE` |
| `ON CONFLICT … DO UPDATE … WHERE` | Same syntax. The `SELECT` needs `WHERE true` (a SQLite parsing rule). `RETURNING` returns no row for a no-op conflict (verified), which is exactly the "written" count. | catalog_cards, catalog_state |
| `count(*) FILTER (WHERE …)` | Same (SQLite ≥ 3.30, verified) | census |
| `COLLATE "C"` | Default `BINARY` (memcmp over UTF-8, which equals "C"). Verified on accents, a combining mark, CJK and emoji. | keyset order, catalog index |
| `DESC NULLS LAST` in `CREATE INDEX` | Plain `DESC`. SQLite rejects NULLS LAST in an index, and DESC already puts NULL last. `DESC NULLS LAST` in `ORDER BY` is accepted and still served by the index (verified). | catalog_cards order index, visible_public index |
| `LEAST(a, b)` | Scalar `min(a, b)`, which returns NULL if any argument is NULL. Safe here because only the non-NULL branch uses it. | folded key |
| `'epoch'::timestamptz` | `'1970-01-01T00:00:00.000Z'` | ordering_published_at, cursor |
| regex CHECK (`~`) | `GLOB` patterns of 50 bytes or less, plus `instr()`. D1 has no REGEXP. | install_line CHECK |
| `btrim` | `trim` | alt text, install line |
| plpgsql `BEFORE INSERT OR UPDATE` trigger | Two SQLite triggers with `RAISE(ABORT, …)` | gallery ceiling (max 8 images) |
| affected-row count | `RETURNING 1`, with `rowCount = rows.length` | written, removed, cleared |
| three autocommit statements | **One `batch()`**, which is atomic and counts as 1 query against the per-invocation limit | rebuildCatalogue, replaceSearchIndex |

## Incompatibilities hit, and their fixes

1. **D1 limits LIKE/GLOB patterns to 50 bytes.** The first draft checked the timestamp format with a 120-byte GLOB, and every insert failed with "LIKE or GLOB pattern too complex". Local D1 caught it on the first run. *Fix:* a `strftime(…, c) IS c` round-trip CHECK. It is stricter than the GLOB was: it also rejects impossible dates, because 02-30 normalizes to 03-02 and so no longer matches. The install line's three GLOBs are 10, 36 and 30 bytes. **The full port must also handle bound LIKE patterns.** The 5 `ILIKE $1` sites in contributor search would fail on any search term longer than about 48 bytes.
2. **D1 allows at most 32 arguments per SQL function, and local workerd does not enforce it.** A 34-argument `json_object` runs fine locally (proven in `remote-limits.test.ts`) and would fail on remote D1. I found it in the D1 limits documentation, not by testing. *Fix:* the card is built as `json_insert(json_object(16 args), …19 args)`. `json_patch` would be wrong here: RFC 7396 merge deletes keys whose value is null. *Guard:* `remote-limits.ts` measures every function call in every statement the slice issues, and checks every bound value against 2 MB, after every differential test. The widest call is `json_insert` with 19 arguments. The schema's `char(…)` takes exactly 32.
3. **D1 binds every JS number as REAL,** even `5`. As a result, `'$[' || n % 3 || ']'` produced `$[1.0]` (a bad JSON path) in the corpus generator. *Fix:* `CAST(? AS INTEGER)` wherever a bound number feeds arithmetic or text. Stored integers are safe: INTEGER column affinity converts exact REALs back to integers, and comparisons are numeric. **Anything the full port does with arithmetic on bound numbers, LIMIT/OFFSET math, or string-built paths needs this check.**
4. **`COLLATE "C"`, `now()`, `REGEXP`, `LEAST`** do not exist in SQLite. **`sqlite_version()`, `if()`, `unistr()`** are blocked by D1's authorizer. All are rewritten as in the table above, and `engine.test.ts` asserts each of these behaviours of the engine.
5. **NULLS LAST is not allowed in `CREATE INDEX`.** Rewritten as plain `DESC`, which has the same order and was verified to be served by the index.
6. **SQLite does not guarantee the output order of a join.** Postgres's `LEFT JOIN LATERAL` page relies on the order of its nested loop. *Fix:* the D1 page read has an explicit outer `ORDER BY`, which sorts at most 201 rows (plan: `USE TEMP B-TREE FOR ORDER BY`).
7. **NUL characters.** Postgres refuses a NUL in text or jsonb. SQLite stores it, but its string functions stop at it (`length('a\0b')` = 1 on workerd; RUNBOOK trap 50). *Fix:* `replaceSearchIndex` refuses NUL in JavaScript, so both engines refuse the same input (there is a differential test for this).

Smaller divergences, noted and handled:

- **Microseconds.** Postgres stores microseconds. D1 stores milliseconds. Both JS paths already truncate, so results are equal. Two instants within the same millisecond tie on D1 but not on Postgres.
- **`lower()` folds ASCII only in SQLite** (Postgres and PGlite fold `ÀÉ` → `àé`). This affects the `lower(slug)` unique index. The slice's reads do not depend on it; the slug grammar should guard it. It matters for the 18 `lower(` sites in the rest of the port.
- **D1 `exec()` splits on newlines**, so a multi-line migration fails with "incomplete input". Tests use their own splitter, and wrangler applies migrations itself.
- **`EXPLAIN QUERY PLAN` names aliases, not tables** (`SCAN p`). My first full-scan detector compared aliases to table names and passed with an empty allowlist while it missed a full read of `profiles`. I caught this by reading the plans. Fixed; see the EXPLAIN section.
- **Atomicity on failure differs, deliberately.** If a rebuild is refused, D1's index is untouched, because the batch is atomic. Postgres's index is left **half-deleted**, because its DELETE committed before the INSERT failed. A differential test documents this. D1 is strictly better here.

**A finding about Postgres itself (`pg-driver-counts.test.ts`).** Through the *production* executor (postgres.js, `rowCount = result.length`), `rebuildCatalogue` always reports `written: 0, removed: 0`, and `replaceSearchIndex([])` always returns 0, whatever actually happened. PGlite's `affectedRows` hides this from every other test. It is RUNBOOK trap 22 in Postgres form. It only affects the sweep's JSON response (observability), not control flow. The D1 port counts with `RETURNING`.

## Differential results

The method: seed PGlite through the real Postgres repository, mirror the source tables (profiles, role_openings, metrics, product_media) into local D1, call the same method on both engines, and deep-compare the results. Then compare catalog_cards (JSON parsed), catalog_state, search_index, and the term table's consistency. If one engine throws, the other must throw too. Every D1 statement is also checked against the remote limits. **Final result: 0 mismatches.**

| Suite | Cases | Pass |
|---|---|---|
| `differential-catalogue.test.ts` | 19 (9 ported or analogue, 10 edge) | 19 |
| `differential-search.test.ts` | 22 (14 ported, 8 edge) | 22 |
| `engine.test.ts` (engine behaviours plus schema CHECKs, triggers, cascades) | 19 | 19 |
| `sql.test.ts`, `remote-limits.test.ts`, `pg-driver-counts.test.ts` | 12 + 5 + 3 | 20 |
| `scale/catalogue-differential.test.ts` (5,000 listings, Postgres vs D1) | 5 | 5 |
| `scale/d1-corpus.test.ts` (corpus built in D1; 120 days and 365 days) | 6 | 6 + 6 |
| **Whole db package**, run alone | 649 passed, 12 opt-in skipped (28 files) | the 569 pre-existing tests stay green beside the 80 D1 ones |

**Ported existing cases** (assertions kept; each one runs on both engines):

- `pg/media-snapshots-catalogue.test.ts`:
  - The four OS5 tests (never computed; after a rebuild the page *is* the live join; quiet tick / rewrite / removal; cursor pages concatenate to the live walk). Pass.
  - OB3 "orders … by (merges+1)×(upvotes+1), and they agree". Pass.
  - OB3 "reads no upvote count older than its floor", as an analogue on the catalogue's `endorsementsSince`. Pass.
  - OSD3 "a logo reaches the home list", as an analogue: the next rebuild writes it once, puts it first, then the following tick is quiet. Pass.
  - LI0's `replaceSearchIndex([])` step. Pass.
- `pg/home-overlay-search.test.ts`:
  - All six DS0 search-index tests (wholesale replace; an empty document clears only its kind; overlap search plus facets; refuses empty terms; dirty and first-instant semantics; one state row). Pass.
  - DS1's three card-facet tests, as two analogues through the catalogue (open-role commitments in sort order with null commitments dropped; booleans are true/false, never 1/0). Pass.
- `search-index-driver.test.ts`: the four slice cases (empty branch; non-empty production branch; a second rebuild de-indexes; the candidate read finds a listing by its name). Pass.
- `search-index-prod-shape.test.ts`: all three. Pass.
- `scale/catalogue.test.ts`: both tests (the walk equals Postgres; the front page is one statement), run at 5,000 listings. Pass.
- `scale/pagination.test.ts`: all three (the walk equals `byMostActive`; a cursor past the end; listing 201 in two requests), as catalogue analogues on the corpus built in D1. Pass.
- `scale/index-coverage.test.ts`: OS4's two assertions (no full scan outside the allowlist; no stale allowlist entry), applied to the slice's statements. Pass.

**Not ported, and why.**

- DS0's three "marked stale by the WRITE" tests exercise `publishProfile` and `unpublishProfile`, which are outside the slice. The SQL they rely on, `touchIndex`'s `COALESCE(dirty_at, now())`, *is* ported and is compared against Postgres's statement.
- OSD3's "adds no row the sweep has not" and OB3's "the tick re-counts" test methods that are not in the slice (`refreshCatalogueMedia`, `refreshEndorsementCounts`). The latter is used as the Postgres-side seed for upvotes.
- `array-params.test.ts` is a static guard for Postgres casts and does not apply to D1.

**Edge cases** (all pass on both engines):

- An empty catalogue, both never computed and computed.
- A cursor past the end, which still returns the moment and the census.
- A walk across the boundary where activity becomes null, plus a cursor whose publication date is null (treated as the epoch).
- All four ways to stop being listed: unpublished, delisted, removed, deleted (cascade).
- Unicode, emoji and CJK slugs and taglines, ordered by bytes. Both SQL engines agree, and neither matches JavaScript's UTF-16 `sort()`.
- Media inserted out of order comes out in document order.
- Census windows at millisecond boundaries.
- A row is rewritten when only its media changes, or when only a value changes.
- Page-size clamping (0 → 1, 100000 → 200). A draft is never catalogued.
- A 5,000-document `replaceSearchIndex` (2 chunks of 899,893 and 423,999 bytes), run cold, run again unchanged, then with one document removed.
- A forced 40+ chunk path (2 KB ceiling) lands an identical index.
- Unicode and emoji terms with no case folding. A search with no terms, absent terms, duplicate query terms, and a truncated limit.
- Duplicate documents and NUL characters are refused by both engines.
- Instants such as `…Z` without milliseconds, or `+02:00`, are normalized.

**Issues found during development, all resolved:** the GLOB limit (above); typed-parameter clashes in my own Postgres fixture SQL (a test bug); the default vitest timeout on the 5,000-document case under full-suite load; and the alias bug in the scan detector.

## Timings

**These are LOCAL timings.** Local D1 involves no network, no replication, no durable commit acknowledgement and no production hardware. PGlite is single-process WASM Postgres. Neither number is a remote D1 number. "D1 wall" includes miniflare's node→workerd loopback; the measured floor is **2.3 ms for `SELECT 1`, against 0.1 ms for in-process PGlite**. "D1 SQL" is D1's own server-side `meta.timings.sql_duration_ms`. It has 1 ms resolution, so values below 1 ms are averages.

**Postgres vs D1 on identical data.** OS0's suite corpus was built by the original `loadCorpus` and mirrored into D1: 5,000 listings, 154,360 metric rows (including 10,000 upvote counts written by `refreshEndorsementCounts`), 1,666 openings, 1,250 heroes. Each range covers three runs; reads are the median of 7.

| Operation | Rows | PGlite | D1 wall | D1 SQL |
|---|---|---|---|---|
| rebuildCatalogue, cold (everything written) | 5,000 written | 486–638 ms | 483–658 ms | 443–478 ms (1 batch, 3 statements) |
| rebuildCatalogue, quiet tick | 0 written | 381–415 ms | 372–471 ms | 415–458 ms |
| listCataloguePage, first page | 100 | 2.3 ms | 8.5–9.2 ms | 1.5 ms (1 statement) |
| listCataloguePage, deep (page 50 of 50) | 100 | 2.3 ms | 8.2–8.7 ms | 1.5 ms |
| replaceSearchIndex, 5,000 cold | 5,000 | 91–101 ms | 178–188 ms | 98 ms (1 batch, 7 statements) |
| replaceSearchIndex, 5,000 unchanged | 5,000 | 82–83 ms | 221–223 ms | 149 ms |
| searchCandidates `product` (common, limit 50) | 50 | 0.6 ms | 4.5–5.7 ms | 1.0 ms |
| searchCandidates `00060` (rare) | 1 | 1.4 ms | 3.2–3.5 ms | < 1 ms |
| searchCandidates `00060, rust, nope` (multi) | 50 | 0.6–0.7 ms | 4.0 ms | 0.13 ms |
| searchCandidates 4 terms, untruncated | 3 | 2.3–2.4 ms | 3.2–3.3 ms | 0.13 ms |
| searchCandidates, absent term | 0 | 1.3 ms | 3.0–3.2 ms | < 1 ms |

**Corpus built inside D1** (`scale/corpus.ts`, ported):

| Operation | 120 days (154,360 metric rows) | 365 days (449,095 metric rows) |
|---|---|---|
| Corpus load, all in-database | 1.3–1.4 s | 4.9–5.0 s (ingestion in 9 statements of ≤ 50k rows) |
| DB size: corpus / with catalogue | 57.5 MB / 81.4 MB | 148.5 MB / 172.4 MB |
| rebuildCatalogue cold: wall / SQL | 392–399 ms / 299–315 ms | 661–704 ms / 590–620 ms |
| rebuildCatalogue quiet: SQL | 325–362 ms | 579–610 ms |
| listCataloguePage first / deep: SQL | 1.25 / 1.13 ms | 1.13 / 1.0 ms |
| searchCandidates common / rare / multi: SQL | 1 / 0.13 / 0.25 ms | 1 / 0 / 0.38 ms |
| replaceSearchIndex 5,000 cold / unchanged: SQL | 96 / 149 ms | 91 / 150 ms |

**What the numbers say.**

- The rebuild runs at Postgres speed. Its cost grows with the number of metric rows per listing, because `row_number()` reads all of a listing's metrics. That is the same pass `DISTINCT ON` makes on Postgres.
- A quiet tick costs as much as a cold rebuild on both engines: it recomputes every card in order to compare.
- The reads are about 1 to 1.5 ms of SQL. On the local wall-clock figure, transport and serialization dominate.
- `replaceSearchIndex` is about 2× Postgres, because it deletes and reinserts the terms table.

**Estimated remote cost.** I used RUNBOOK trap 49's figure of about 0.3 s per statement for batched writes from this colo, plus the measured SQL time:

- rebuildCatalogue: 3 statements → ~0.9 s, plus 0.3–0.6 s of SQL → **~1.2–1.5 s per 10-minute tick**. D1 has a single writer, so for those 0.3–0.6 s every other query to the database waits.
- replaceSearchIndex (5,000 documents): 7 statements → ~2.1 s, plus ~0.1–0.15 s → **~2.2–2.3 s**. One batch request carries ~1.32 MB of parameters.
- Reads (listCataloguePage, searchCandidates, getSearchIndexState): 1 statement each, so **Worker↔D1 round-trip time plus 1–1.5 ms**. The round-trip time cannot be measured locally, and trap 49's figure is for writes.

## EXPLAIN findings

The plans came from `EXPLAIN QUERY PLAN` on every statement the slice issues, with its own parameters bound, against the analyzed D1 corpus. This mirrors OS4. **D1 reads one watched table in full, in one place, and that is listed with its reason. On Postgres the same statements make 6 sequential scans.**

| Method | D1 plan (local workerd) | Postgres plan (PGlite, same corpus) |
|---|---|---|
| rebuildCatalogue, upsert | `SCAN profiles` **(allowlisted: every listed row, by construction)**. Every probe is a seek: `SEARCH metrics USING INDEX openproduct_metrics_latest_idx (profile_id=? AND metric=? AND window_key=? AND observed_at>?)`; openings via `role_openings_profile_idx`; media via `product_media_slot`; profiles by primary key. Temp B-trees only for the ORDER BY inside aggregates (per listing, small). | Seq Scan profiles; Index metrics, role_openings, product_media; Bitmap Heap metrics |
| rebuildCatalogue, delete | `SCAN catalog_cards USING INDEX …_order` + `SEARCH profiles` by primary key | Seq Scan catalog_cards + Seq Scan profiles |
| rebuildCatalogue, census | `SEARCH profiles USING COVERING INDEX openproduct_profiles_visible_public_idx (published_at>?)` + `SCAN catalog_cards USING COVERING INDEX` | Seq Scan profiles + Seq Scan catalog_cards |
| listCataloguePage, first page or non-null cursor | `SCAN catalog_cards USING INDEX openproduct_catalog_cards_order` (bounded by LIMIT) + outer `USE TEMP B-TREE FOR ORDER BY` (≤ 201 rows, deliberate) | Index catalog_cards |
| listCataloguePage, null-activity cursor | `SEARCH catalog_cards USING INDEX …_order (ordering_merges=? AND ordering_published_at<?)` | Index catalog_cards |
| searchCandidates (all shapes) | `SEARCH search_index_terms USING PRIMARY KEY (term=?)` → `SEARCH search_index USING INDEX (kind=? AND entity_id=?)` | **Seq Scan search_index** (GIN unused at 5k rows; allowlisted in OS4) |
| replaceSearchIndex | `SEARCH … (kind=?)` on both tables; the inserts scan `json_each` (a virtual table); foreign-key cascade lookups by index | n/a (write) |
| getSearchIndexState / markSearchIndexDirty | `SCAN search_index_state` (1 row, not watched) | Seq Scan, 1 row |

The deep keyset page walks the order index from the start and filters as it goes, exactly as Postgres does: the OR-shaped predicate cannot be a single range. At 5,000 rows that costs about 1 ms. It is the first read to revisit if the catalogue grows by 10×; a UNION of ranges would let it seek.

## D1 limits the slice can hit, and how it stays under them

| Limit | Exposure | How the code stays under it | Who enforces it locally |
|---|---|---|---|
| 100 bound parameters per statement | Bulk writes | One JSON parameter, expanded with `json_each`. The most any statement binds is 4. `$n`→`?n` binds a repeated parameter once. | enforced locally |
| 2 MB per string, BLOB or row | 5,000-document index (1.32 MB of JSON), mirror | Chunks of ≤ 900 KB; a single document over the ceiling is refused. Largest bound value seen: 899,893 bytes. Largest row (a catalogue card): a few KB. | **not enforced locally** (a 3 MB parameter binds) → static guard |
| 100 KB SQL statement | Generated SQL | Largest is the rebuild upsert at 4,651 bytes, and it does not grow with the data | enforced locally |
| 32 arguments per function | `json_object` for the card | `json_insert` split (widest call: 19) | **not enforced locally** → static guard |
| 50-byte LIKE/GLOB pattern | CHECKs | strftime round-trip; GLOBs of ≤ 36 bytes | enforced locally |
| 30 s per query | Rebuild, corpus load | Rebuild is 0.3–0.6 s of SQL at 5,000 listings × 365 days (≈ 50× headroom locally). Corpus statements are bounded to 50k rows. | not tested |
| 1,000 queries per invocation | Sweep | rebuild = 1 batch, replace = 1 batch, each read = 1 | n/a |
| 50 MB result | Page reads | Pages ≤ 201 rows; `RETURNING 1` × 5,000 is tiny | **not enforced locally** (a 60 MB result returned) |
| 10 GB per database | Whole product | Slice tables are 172 MB at 365 days. Metrics grow ~140 MB/year at the ingestion cap. The full product adds `profile_snapshots` (~1.8M rows/year). Fits for years, but needs a retention plan. | n/a |
| Single-threaded per database | Rebuild every 10 minutes | One 0.3–0.6 s batch per tick. Reads queue behind it. | n/a |

## What local D1 does NOT prove

- **Remote latency.** There is no network here, so trap 49's ~0.3 s per statement is not reproduced. Neither is the Worker↔D1 round-trip time for reads, nor the effect of read replication and the Sessions API (a read straight after the sweep's write could reach a lagging replica).
- **Limit enforcement.** Local workerd does not enforce 32 arguments per function, 2 MB values or 50 MB results. The static guard stands in for the first two; only remote D1 can prove them. The maximum request size of one `batch()` (here, ~1.32 MB of parameters across 7 statements) is undocumented and untested.
- **Durability and contention.** Local D1 is in memory, with no commit replication and no competing traffic. Remote CPU speed versus this Mac is unknown, which matters for the 30 s ceiling as the catalogue grows.
- **The production Postgres collation.** PGlite uses `C`, which matches SQLite's BINARY exactly. If production Postgres sorts un-COLLATE'd text (metric names, media ids) under `en_US`, today's production order could differ from both. For the standalone product, D1 becomes the only engine, so this affects continuity, not correctness.

## The remote test still needed (exact)

1. Create a throwaway D1 database in the stage account (`wrangler d1 create op-d1-slice-proof`). Bind it to a throwaway Worker that exposes `createD1SliceRepository` behind a few internal routes.
2. Run `wrangler d1 migrations apply op-d1-slice-proof --remote`, using `0001_slice.sql` unchanged.
3. Load the corpus remotely with the same `loadD1SliceCorpus` (statements of ≤ 50k rows) from the Worker, for both suite and full sizes. Record each statement's `meta.timings` and confirm all of them stay under 30 s.
4. From the Worker, collect p50/p95 over 50 runs, wall-clock time plus `meta.timings`, for: rebuildCatalogue cold and quiet; listCataloguePage first and deep; replaceSearchIndex for 5,000 documents, cold and unchanged (**this confirms whether a 1.32 MB, 7-statement batch is accepted**); and searchCandidates common, rare and multi. Repeat the reads through the Sessions API, with and without read replication, straight after a rebuild.
5. Send negative probes that local D1 accepts: a 34-argument `json_object`, a 2.1 MB bound string, and a result over 50 MB. Confirm remote refuses each one with the expected error, so the static guard matches reality.
6. Export the remote pages as JSON and diff them against local D1's pages for the same corpus. They must be equal.

**Pass criteria:** every result equals the local result; the rebuild stays under ~3 s of wall-clock time and well under 30 s; the replace batch is accepted; page reads stay under ~50 ms at p95 from the Worker.

## Recommendation: GO, with conditions, for porting the rest of `repository.ts`

**Why go.** The hardest constructs in the repository all have direct, verified SQLite forms and match Postgres result for result: LATERAL, DISTINCT ON, jsonb aggregation, recordset expansion, array overlap backed by GIN, row-value IS DISTINCT FROM, FILTER, keyset pagination under "C" collation, and conditional upsert. Performance on local D1 matches PGlite for the write that matters. The rest of the repository has **no interactive transactions, no `FOR UPDATE`, no advisory locks and no full-text search**. Its comments say it already assumes an executor without transactions, which removes the usual blocker for a D1 port. The measured remainder:

| Construct | Count in repository.ts | Notes |
|---|---|---|
| `ON CONFLICT` | 51 | |
| `RETURNING` | 82 | |
| `= ANY` | 24 | |
| `now()` | 29 | |
| `::timestamptz` | 32 | |
| `to_char` | 15 | |
| `AT TIME ZONE` | 11 | |
| `DISTINCT ON` | 10 | |
| `FILTER` | 10 | |
| `LATERAL` | 7 | |
| `jsonb_agg` | 8 | |
| `ILIKE` | 5 | Also needs the 50-byte pattern rule |
| `gen_random_uuid()` | 2 | |
| Data-modifying CTEs | **4** | Lines 2692 and 2707, and the subject-erasure statement at ~7562. These are RUNBOOK trap 16 and must become batches. |

That is 266 `sql.execute` sites across 247 methods.

**Conditions.**

1. **Every ported method goes through this differential harness,** with Postgres as the oracle, until the Postgres side is retired. A method is not "ported" until its existing tests run on both engines, and the remote-limits guard runs after each test. The real catastrophe in the cirrus port was Postgres-only SQL surviving because tests ran on Postgres-like engines (trap 16). This harness makes that unable to pass silently.
2. **One timestamp format, enforced twice:** `toInstant()` on every bound instant, and the `strftime … IS c` CHECK on every column. Interval arithmetic moves into JS. The `to_char`/`AT TIME ZONE` sites become `strftime` in UTC. Each needs its own differential case, because day boundaries are where they will break.
3. **Every count comes from `RETURNING`,** and every multi-statement write is one `batch()`. Rewrite the 4 data-modifying CTEs as batches first; they are the known trap-16 sites.
4. **`CAST` any bound number used in arithmetic or text** (D1 binds JS numbers as REAL). Re-check every `ILIKE`/`LIKE` against the 50-byte pattern limit, including user-supplied search terms. Treat `lower()` as ASCII-only: either constrain slugs and handles to ASCII in the grammar, or fold in JS.
5. **Pass the remote test above before any production cut.** In particular, confirm the 1.3 MB batch is accepted and measure the rebuild's single-writer pause. If remote rebuild time is well above 3 s, or the batch is refused, the fallback is already shaped: chunk `replaceSearchIndex` into several batches (each one atomic and consistent), and the rebuild by profile-id range.
6. **Watch growth.** The catalogue rebuild is linear in listings × metric rows per listing, and a quiet tick costs as much as a cold one. Past roughly 50k listings, plan an incremental rebuild before the 30 s ceiling and the single-writer pause become visible. Plan retention for `metrics` and `profile_snapshots` to stay well clear of 10 GB.

**Separately, fix the production Postgres count bug** (written/removed/cleared always 0), or make sure nothing relies on those numbers until the cut.

## Commits (the scratch repository's, local only; OPN-2 brought the tree they produced)

```
(this file)  PROOF.md: the D1 slice proof — results, timings, plans, limits, GO with conditions
b36f6cf      db/d1: report the D1 database size in the corpus suite
e025fe7      db/d1: pin a finding — production Postgres reports 0 for the slice's write counts
1f7b5da      db/d1: scale suites — 5,000 listings on local D1 beside pglite
c597773      db/d1: the six slice methods on D1, and the differential suite
b45c49e      db/d1: executor, slice schema and engine tests on local D1
e37412b      baseline: openproduct tree cut from orun-cloud b421bc672
```
