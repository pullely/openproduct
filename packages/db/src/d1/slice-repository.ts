// The D1 slice of the openproduct repository (openproduct-standalone OPN,
// D1 slice proof).
//
// SIX METHODS, the same signatures and the same return shapes as the Postgres
// implementation in `../repository.ts`, over the SQLite schema in
// `./migrations/0001_slice.sql`:
//
//   rebuildCatalogue · listCataloguePage                  (OS5, OB3)
//   replaceSearchIndex · searchCandidates
//   getSearchIndexState · markSearchIndexDirty            (DS0, LI0)
//
// plus `touchSearchIndex`, the `touchIndex()` every listing write calls on
// Postgres — kept because it is the slice's one `now()` (factory RUNBOOK
// trap 16: `now()` does not exist in SQLite).
//
// What each Postgres construct became is beside the statement that uses it,
// and tabulated in PROOF.md. The D1 limits the code is shaped by:
//
//   * ≤ 100 bound parameters per statement — every statement here binds at
//     most four; bulk input is ONE JSON parameter expanded by `json_each`.
//   * ≤ 2 MB per string value — every JSON parameter is chunked to at most
//     `maxParamBytes` (default 900 KB of UTF-8), and a document too large for
//     one chunk is refused rather than sent.
//   * ≤ 100 KB of SQL text per statement — the largest statement here is
//     under 5 KB, and its size does not grow with the data.
//   * no interactive transactions — every multi-statement write is ONE
//     `batch()`, which D1 runs atomically.
//   * rowCount is rows.length — every count a caller sees comes from
//     `RETURNING`.

import { MOST_ACTIVE_FOLD } from "@openproduct/contracts";

import type { SqlExecutorResult } from "../executor.js";
import type {
  CataloguePage,
  CataloguePageInput,
  CatalogueRebuildInput,
  CatalogueRebuildReport,
  MetricRecord,
  OpenproductRepository,
  ProductMediaRecord,
  ProfileCardRecord,
  SearchIndexRow,
} from "../types.js";

import type { D1SqlExecutor, D1Statement } from "./executor.js";
import {
  cardOf,
  iso,
  jsonArray,
  jsonInstant,
  jsonObject,
  mediaOf,
  metricOf,
  parseFacets,
  parseStringList,
  type CardRow,
  type MediaRow,
  type MetricRow,
} from "./mappers.js";
import { toInstant } from "./sql.js";

/** The methods this slice ports, typed off the Postgres interface itself. */
export type SliceMethods = Pick<
  OpenproductRepository,
  | "rebuildCatalogue"
  | "listCataloguePage"
  | "replaceSearchIndex"
  | "searchCandidates"
  | "getSearchIndexState"
  | "markSearchIndexDirty"
>;

export interface D1SliceRepository extends SliceMethods {
  /** `touchIndex()`: mark the index stale at the database's own clock, keeping the first instant. */
  touchSearchIndex(): Promise<void>;
}

export interface D1SliceOptions {
  /**
   * The largest JSON parameter, in UTF-8 bytes, any statement binds. D1
   * refuses a string over 2 MB (remote — local workerd does not enforce it);
   * 900 KB leaves the headroom the brief asked for. Tests lower it to force
   * the multi-chunk path with a small corpus.
   */
  readonly maxParamBytes?: number;
}

export const DEFAULT_MAX_PARAM_BYTES = 900_000;

const MAX_CARD_LIMIT = 200;
const EPOCH_ISO = "1970-01-01T00:00:00.000Z";
const DAY_MS = 24 * 60 * 60 * 1000;
/** `strftime` in the one format (see `toInstant`): the D1 spelling of `now()`. */
const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/** `listed(alias)`: public AND not acted on (TS3). */
function listed(alias: string): string {
  const a = alias ? `${alias}.` : "";
  return `${a}visibility = 'public' AND ${a}moderation_state = 'visible'`;
}

/**
 * `mostActiveKeySql`: OB3's folded key. `LEAST` → SQLite's multi-argument
 * scalar `min()` — which, unlike LEAST, returns NULL if ANY argument is NULL;
 * the ELSE branch only runs when merges is not NULL, so the two agree.
 */
function mostActiveKeySql(merges: string, upvotes: string): string {
  return `CASE WHEN ${merges} IS NULL THEN NULL
               ELSE (${merges} + 1) * (COALESCE(${upvotes}, 0) + 1) * ${MOST_ACTIVE_FOLD}
                    + min(${merges}, ${MOST_ACTIVE_FOLD - 1}) END`;
}

/** `LEFT JOIN LATERAL (… ORDER BY observed_at DESC LIMIT 1)` → a correlated scalar subquery, one index probe. */
function latestMetricValue(profileCol: string, metric: string, sinceParam: string): string {
  return `(SELECT m.value FROM metrics m
            WHERE m.profile_id = ${profileCol} AND m.metric = '${metric}' AND m.window_key = '7d'
              AND m.observed_at >= ${sinceParam}
            ORDER BY m.observed_at DESC
            LIMIT 1)`;
}

/**
 * `(SELECT to_jsonb(c) FROM (SELECT ${CARD_COLUMNS}) c)` → `json_object`, key
 * for key. Three things to_jsonb did implicitly are spelled out:
 *   * a JSON column is embedded as JSON, not as a string: `json(p.stack)`;
 *   * a boolean is `true`/`false`, not 0/1: `json('true')` — `cardOf` tests
 *     `=== true` and `!== false`, so a 1 would read as "no live URL";
 *   * `array_agg(… ORDER BY …)` → `json_group_array(… ORDER BY …)`, the
 *     aggregate ORDER BY SQLite has had since 3.44 (verified on workerd). An
 *     ordered subquery feeding the aggregate is NOT a guarantee in SQLite.
 *
 * And one thing D1 forces: AT MOST 32 ARGUMENTS PER SQL FUNCTION (D1's
 * documented limit — local workerd does NOT enforce it, so a 34-argument
 * `json_object` passes every local test and fails on remote D1). The card has
 * seventeen keys, thirty-four arguments; it is built as a 16-argument
 * `json_object` extended by a 19-argument `json_insert`. `json_patch` would
 * be shorter and wrong: RFC 7396 merge DELETES a key whose patch value is
 * null, and half the card's values are null on a new listing.
 */
function cardRecordSql(p: string): string {
  return `json_insert(
      json_object(
        'slug', ${p}.slug,
        'tagline', ${p}.tagline,
        'stack', json(${p}.stack),
        'stack_canonical', json(${p}.stack_canonical),
        'category', ${p}.category,
        'hosting', ${p}.hosting,
        'pricing', ${p}.pricing,
        'repo_licence', ${p}.repo_licence),
      '$.published_at', ${p}.published_at,
      '$.repo_language', ${p}.repo_language,
      '$.repo_pushed_at', ${p}.repo_pushed_at,
      '$.repo_open_issues', ${p}.repo_open_issues,
      '$.repo_checked_at', ${p}.repo_checked_at,
      '$.role_opening_count', (SELECT count(*) FROM role_openings o
                                WHERE o.profile_id = ${p}.id AND o.status = 'open'),
      '$.open_commitments', json((SELECT json_group_array(o2.commitment ORDER BY o2.sort_order, o2.id)
                                    FROM role_openings o2
                                   WHERE o2.profile_id = ${p}.id AND o2.status = 'open'
                                     AND o2.commitment IS NOT NULL)),
      '$.has_live_url', json(CASE WHEN ${p}.live_url IS NOT NULL THEN 'true' ELSE 'false' END),
      '$.indexable', json(CASE WHEN ${p}.indexable = 1 THEN 'true' ELSE 'false' END)
    )`;
}

/**
 * `DISTINCT ON (metric, window_key) … ORDER BY metric, window_key,
 * observed_at DESC` → `row_number() OVER (PARTITION BY metric, window_key
 * ORDER BY observed_at DESC) = 1`; `jsonb_agg(to_jsonb(lmr) ORDER BY …)` →
 * `json_group_array(json_object(…) ORDER BY …)`.
 */
function latestMetricsJsonSql(p: string): string {
  return `json((SELECT json_group_array(json_object(
                         'profile_id', l.profile_id, 'metric', l.metric, 'window_key', l.window_key,
                         'value', l.value, 'source', l.source, 'observed_at', l.observed_at)
                       ORDER BY l.metric, l.window_key)
                  FROM (SELECT m.profile_id, m.metric, m.window_key, m.value, m.source, m.observed_at,
                               row_number() OVER (PARTITION BY m.metric, m.window_key
                                                  ORDER BY m.observed_at DESC) AS rn
                          FROM metrics m
                         WHERE m.profile_id = ${p}.id) l
                 WHERE l.rn = 1))`;
}

/** `MEDIA_ORDER`, verbatim. */
const MEDIA_ORDER =
  "CASE m.kind WHEN 'logo' THEN 0 WHEN 'hero' THEN 1 WHEN 'gallery' THEN 2 ELSE 3 END, m.position ASC, m.id ASC";

/** `jsonb_agg(to_jsonb(md) - 'ord' ORDER BY md.ord)` over a `row_number()` → the aggregate's own ORDER BY. */
function mediaJsonSql(p: string): string {
  return `json((SELECT json_group_array(json_object(
                         'id', m.id, 'kind', m.kind, 'storage_ref', m.storage_ref, 'alt_text', m.alt_text,
                         'width', m.width, 'height', m.height, 'position', m.position,
                         'observed_at', m.observed_at)
                       ORDER BY ${MEDIA_ORDER})
                  FROM product_media m
                 WHERE m.profile_id = ${p}.id))`;
}

/** UTF-8 length without allocating, for chunking by what D1 will actually receive. */
function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Serialise `items` as JSON arrays of at most `maxBytes` UTF-8 bytes each —
 * one bound parameter per array. An item that cannot fit a chunk on its own
 * is refused: sending it would be D1 refusing it a round trip later.
 */
export function chunkJsonArrays(items: readonly unknown[], maxBytes: number, what: string): string[] {
  const chunks: string[] = [];
  let parts: string[] = [];
  let bytes = 2;
  for (const item of items) {
    const json = JSON.stringify(item);
    const size = utf8Length(json);
    if (size + 2 > maxBytes) {
      throw new Error(`d1: one ${what} is ${size} bytes of JSON, over the ${maxBytes}-byte parameter ceiling`);
    }
    if (parts.length > 0 && bytes + 1 + size > maxBytes) {
      chunks.push(`[${parts.join(",")}]`);
      parts = [];
      bytes = 2;
    }
    bytes += size + (parts.length > 0 ? 1 : 0);
    parts.push(json);
  }
  if (parts.length > 0) chunks.push(`[${parts.join(",")}]`);
  return chunks;
}

/**
 * Postgres refuses a NUL inside text and jsonb ("unsupported Unicode escape
 * sequence"); SQLite stores one and then half its string functions stop at
 * it (factory RUNBOOK trap 50 — `length('a\0b')` is 1 on workerd). Refused
 * here, so the two engines refuse the same document.
 */
function assertNoNul(document: SearchIndexRow): void {
  const strings = [
    document.entityId,
    document.title,
    document.summary ?? "",
    ...document.terms,
    ...Object.entries(document.facets).flatMap(([key, values]) => [key, ...values]),
  ];
  if (strings.some((s) => typeof s === "string" && s.includes("\u0000"))) {
    throw new Error(`d1: search document ${JSON.stringify(document.entityId)} carries a NUL character`);
  }
}

/** One row of `catalog_cards` joined to its singleton, as `listCataloguePage` reads it. */
interface CatalogueRow {
  [column: string]: unknown;
  computed_at: string | null;
  today_count: number | null;
  week_count: number | null;
  month_count: number | null;
  total_count: number | null;
  slug: string | null;
  ordering_merges: number | null;
  record: string | null;
  metrics: string | null;
  media: string | null;
}

interface SearchIndexRowSql {
  [column: string]: unknown;
  kind: string;
  entity_id: string;
  title: string;
  summary: string | null;
  terms: string;
  facets: string;
}

export function createD1SliceRepository(sql: D1SqlExecutor, options: D1SliceOptions = {}): D1SliceRepository {
  const maxParamBytes = options.maxParamBytes ?? DEFAULT_MAX_PARAM_BYTES;

  return {
    async listCataloguePage(input: CataloguePageInput): Promise<CataloguePage> {
      // OS5 — ONE READ, as on Postgres: the singleton on the left so the
      // moment and the census come back even when the page is empty.
      //
      // `LEFT JOIN LATERAL (…) ON TRUE` → a plain `LEFT JOIN (…) ON 1`: the
      // page subquery never referenced the singleton, so it was never really
      // lateral. The outer ORDER BY is NEW and deliberate — Postgres's nested
      // loop happens to hand the lateral's rows back in its order, and SQLite
      // promises no order for a join's output without one (≤ 201 rows).
      //
      // `slug COLLATE "C"` → bare `slug`: BINARY is memcmp over UTF-8, which
      // is exactly "C". Every instant is normalised to the stored format
      // first, or the text comparison would be meaningless (see `toInstant`).
      const limit = Math.min(Math.max(1, Math.trunc(input.limit)), MAX_CARD_LIMIT);
      const later = `(c.ordering_published_at < $3
          OR (c.ordering_published_at = $3 AND c.slug > $4))`;
      const after =
        input.cursor === null
          ? "1"
          : input.cursor.activity === null
            ? `($2 IS NULL AND c.ordering_merges IS NULL AND ${later})`
            : `(c.ordering_merges IS NULL OR c.ordering_merges < $2 OR (c.ordering_merges = $2 AND ${later}))`;
      const params: unknown[] = [limit + 1];
      if (input.cursor !== null) {
        params.push(
          input.cursor.activity,
          toInstant(input.cursor.publishedAt ?? EPOCH_ISO),
          input.cursor.slug,
        );
      }
      const res = await sql.execute<CatalogueRow>(
        `SELECT s.computed_at, s.today_count, s.week_count, s.month_count, s.total_count,
                c.slug, c.ordering_merges, c.record, c.metrics, c.media
           FROM catalog_state s
           LEFT JOIN (
             SELECT c.slug, c.ordering_merges, c.ordering_published_at, c.record, c.metrics, c.media
               FROM catalog_cards c
              WHERE ${after}
              ORDER BY c.ordering_merges DESC NULLS LAST, c.ordering_published_at DESC, c.slug ASC
              LIMIT $1
           ) c ON 1
          WHERE s.singleton = 1
          ORDER BY c.ordering_merges DESC NULLS LAST, c.ordering_published_at DESC, c.slug ASC`,
        params,
      );
      // From here down: the Postgres method's mapping, verbatim.
      const head = res.rows[0];
      const computedAt = iso(head?.computed_at ?? null);
      const windows = {
        today: Number(head?.today_count ?? 0),
        week: Number(head?.week_count ?? 0),
        month: Number(head?.month_count ?? 0),
        total: Number(head?.total_count ?? 0),
      };
      if (computedAt === null) {
        return { computedAt: null, cards: [], metrics: new Map(), media: new Map(), next: null, windows };
      }
      const present = res.rows.filter((row) => row.slug !== null);
      const rows = present.slice(0, limit);
      const more = present.length > limit;
      const cards: ProfileCardRecord[] = [];
      const metrics = new Map<string, MetricRecord[]>();
      const media = new Map<string, ProductMediaRecord[]>();
      for (const row of rows) {
        const record = jsonObject(row.record);
        const card = cardOf({
          ...(record as CardRow),
          published_at: jsonInstant(record.published_at),
          repo_pushed_at: jsonInstant(record.repo_pushed_at),
          repo_checked_at: jsonInstant(record.repo_checked_at),
        });
        cards.push(card);
        const metricRows = jsonArray(row.metrics).map((m) =>
          metricOf({ ...(m as unknown as MetricRow), observed_at: jsonInstant(m.observed_at) ?? "" }),
        );
        if (metricRows.length > 0) metrics.set(card.slug, metricRows);
        const mediaRows = jsonArray(row.media).map((m) =>
          mediaOf({ ...(m as unknown as MediaRow), observed_at: jsonInstant(m.observed_at) }),
        );
        if (mediaRows.length > 0) media.set(card.slug, mediaRows);
      }
      const last = rows[rows.length - 1];
      const lastCard = cards[cards.length - 1];
      return {
        computedAt,
        cards,
        metrics,
        media,
        next:
          more && last && lastCard
            ? {
                activity: last.ordering_merges === null ? null : Number(last.ordering_merges),
                publishedAt: lastCard.publishedAt,
                slug: lastCard.slug,
              }
            : null,
        windows,
      };
    },

    async rebuildCatalogue(input: CatalogueRebuildInput): Promise<CatalogueRebuildReport> {
      // OS5 — the same three statements as Postgres, in ONE `batch()`, so on
      // D1 the phase is atomic (Postgres runs them as three autocommits). The
      // batch is one query against the Worker's per-invocation limit.
      //
      //   1. UPSERT every listed profile's row, rewriting only rows whose
      //      content changed. `IS DISTINCT FROM` on row values → `IS NOT` on
      //      row values (SQLite ≥ 3.15, verified), same NULL-safe meaning.
      //      `RETURNING 1` counts what was written: SQLite returns no row for
      //      a conflict whose DO UPDATE … WHERE is false (verified), which is
      //      exactly "written" — Postgres's `affectedRows`.
      //   2. DELETE the rows whose listing is no longer listed; `RETURNING 1`.
      //   3. STAMP the singleton with the census. `count(*) FILTER (WHERE …)`
      //      is SQLite ≥ 3.30 (verified); `$1 - INTERVAL 'n days'` → the
      //      instants computed here and bound (UTC days of 24 h, which is what
      //      Postgres computes in a UTC session).
      const now = toInstant(input.now);
      const mergesSince = toInstant(input.mergesSince);
      const endorsementsSince = toInstant(input.endorsementsSince);
      const at = Date.parse(now);
      const dayAgo = toInstant(at - DAY_MS);
      const weekAgo = toInstant(at - 7 * DAY_MS);
      const monthAgo = toInstant(at - 30 * DAY_MS);

      const [written, removed, stamped] = (await sql.batch([
        {
          // The ordering keys once per listed row (`MATERIALIZED`, so the
          // three uses of `merges` in the folded key are one probe, not three).
          text: `WITH k AS MATERIALIZED (
                   SELECT p.id,
                          ${latestMetricValue("p.id", "merges", "$1")} AS merges,
                          ${latestMetricValue("p.id", "endorsements", "$3")} AS upvotes
                     FROM profiles p
                    WHERE ${listed("p")}
                 )
                 INSERT INTO catalog_cards
                   (profile_id, slug, ordering_merges, ordering_published_at, record, metrics, media, computed_at)
                 SELECT p.id,
                        p.slug,
                        ${mostActiveKeySql("k.merges", "k.upvotes")},
                        COALESCE(p.published_at, '${EPOCH_ISO}'),
                        ${cardRecordSql("p")},
                        ${latestMetricsJsonSql("p")},
                        ${mediaJsonSql("p")},
                        $2
                   FROM k JOIN profiles p ON p.id = k.id
                  WHERE true
                 ON CONFLICT (profile_id) DO UPDATE
                   SET slug = excluded.slug,
                       ordering_merges = excluded.ordering_merges,
                       ordering_published_at = excluded.ordering_published_at,
                       record = excluded.record,
                       metrics = excluded.metrics,
                       media = excluded.media,
                       computed_at = excluded.computed_at
                 WHERE (catalog_cards.slug, catalog_cards.ordering_merges, catalog_cards.ordering_published_at,
                        catalog_cards.record, catalog_cards.metrics, catalog_cards.media)
                       IS NOT
                       (excluded.slug, excluded.ordering_merges, excluded.ordering_published_at,
                        excluded.record, excluded.metrics, excluded.media)
                 RETURNING 1 AS written`,
          params: [mergesSince, now, endorsementsSince],
        },
        {
          text: `DELETE FROM catalog_cards
                  WHERE NOT EXISTS (SELECT 1 FROM profiles p
                                     WHERE p.id = catalog_cards.profile_id AND ${listed("p")})
                 RETURNING 1 AS removed`,
        },
        {
          text: `WITH w AS (
                   SELECT count(*) FILTER (WHERE published_at >= $2) AS today,
                          count(*) FILTER (WHERE published_at >= $3) AS week,
                          count(*) FILTER (WHERE published_at >= $4) AS month,
                          count(*) AS total
                     FROM profiles
                    WHERE ${listed("")} AND published_at IS NOT NULL
                 ),
                 n AS (SELECT count(*) AS cards FROM catalog_cards)
                 INSERT INTO catalog_state
                   (singleton, computed_at, card_count, today_count, week_count, month_count, total_count)
                 SELECT 1, $1, n.cards, w.today, w.week, w.month, w.total FROM w, n WHERE true
                 ON CONFLICT (singleton) DO UPDATE
                   SET computed_at = excluded.computed_at,
                       card_count = excluded.card_count,
                       today_count = excluded.today_count,
                       week_count = excluded.week_count,
                       month_count = excluded.month_count,
                       total_count = excluded.total_count
                 RETURNING card_count`,
          params: [now, dayAgo, weekAgo, monthAgo],
        },
      ])) as [SqlExecutorResult, SqlExecutorResult, SqlExecutorResult<{ card_count: number }>];

      return {
        computedAt: input.now,
        cards: Number(stamped.rows[0]?.card_count ?? 0),
        written: written.rowCount,
        removed: removed.rowCount,
      };
    },

    async replaceSearchIndex(kind, documents, builtAt) {
      // WHOLESALE, in ONE atomic batch. Postgres deletes the documents that
      // are gone and upserts the rest in three autocommit statements — so a
      // failing upsert there leaves the deletions applied. Here the batch is:
      //
      //   DELETE this kind's terms; DELETE this kind's documents;
      //   per chunk: INSERT the documents; INSERT their terms;
      //   UPDATE the state row.
      //
      // Delete-then-insert is safe ONLY because the batch is atomic: no
      // reader can see the empty index between the two (D1 is single-writer
      // and the batch is one transaction). The end state is Postgres's: one
      // row per document, every row stamped `builtAt` (Postgres's upsert
      // rewrites every row too). A duplicate entity id fails on both engines
      // — the PK here, "cannot affect row a second time" there.
      //
      // `jsonb_to_recordset($2::text::jsonb) AS d(…)` → `json_each($2)` with
      // `json_extract`; a `terms text[]` per row → the JSON array as TEXT,
      // plus one `search_index_terms` row per distinct term (`json_each` over
      // the row's own array). Each chunk's JSON is ≤ maxParamBytes.
      const at = toInstant(builtAt);
      if (documents.length === 0) {
        const [, cleared] = await sql.batch([
          { text: `DELETE FROM search_index_terms WHERE kind = $1`, params: [kind] },
          { text: `DELETE FROM search_index WHERE kind = $1 RETURNING 1 AS cleared`, params: [kind] },
          { text: `UPDATE search_index_state SET built_at = $1, dirty_at = NULL`, params: [at] },
        ]);
        return cleared!.rowCount;
      }

      for (const document of documents) assertNoNul(document);
      const chunks = chunkJsonArrays(
        documents.map((d) => ({
          entity_id: d.entityId,
          title: d.title,
          summary: d.summary,
          terms: d.terms,
          facets: d.facets,
        })),
        maxParamBytes,
        "search document",
      );
      const statements: D1Statement[] = [
        { text: `DELETE FROM search_index_terms WHERE kind = $1`, params: [kind] },
        { text: `DELETE FROM search_index WHERE kind = $1`, params: [kind] },
      ];
      for (const chunk of chunks) {
        statements.push(
          {
            text: `INSERT INTO search_index (kind, entity_id, title, summary, terms, facets, built_at)
                   SELECT $1,
                          json_extract(d.value, '$.entity_id'),
                          json_extract(d.value, '$.title'),
                          json_extract(d.value, '$.summary'),
                          json_extract(d.value, '$.terms'),
                          json_extract(d.value, '$.facets'),
                          $3
                     FROM json_each($2) d`,
            params: [kind, chunk, at],
          },
          {
            text: `INSERT INTO search_index_terms (term, kind, entity_id)
                   SELECT DISTINCT t.value, $1, json_extract(d.value, '$.entity_id')
                     FROM json_each($2) d, json_each(d.value, '$.terms') t`,
            params: [kind, chunk],
          },
        );
      }
      statements.push({
        text: `UPDATE search_index_state SET built_at = $1, dirty_at = NULL`,
        params: [at],
      });
      await sql.batch(statements);
      return documents.length;
    },

    async searchCandidates(terms, limit) {
      if (terms.length === 0) return [];
      // `terms && $1::text[]` (GIN) → the documents whose key appears under
      // any of the terms in `search_index_terms` (a primary-key range per
      // term). NO ORDER BY, as on Postgres: any bounded subset is a valid
      // candidate set, because the contract ranks it.
      const res = await sql.execute<SearchIndexRowSql>(
        `SELECT s.kind, s.entity_id, s.title, s.summary, s.terms, s.facets
           FROM search_index s
          WHERE (s.kind, s.entity_id) IN (
                  SELECT t.kind, t.entity_id
                    FROM search_index_terms t
                   WHERE t.term IN (SELECT value FROM json_each($1)))
          LIMIT $2`,
        [JSON.stringify([...terms]), Math.max(1, Math.trunc(limit))],
      );
      return res.rows.map((row) => ({
        kind: row.kind,
        entityId: row.entity_id,
        title: row.title,
        summary: row.summary,
        terms: parseStringList(row.terms),
        facets: parseFacets(row.facets),
      }));
    },

    async getSearchIndexState() {
      const res = await sql.execute<{ built_at: string | null; dirty_at: string | null }>(
        `SELECT built_at, dirty_at FROM search_index_state LIMIT 1`,
      );
      const row = res.rows[0];
      return { builtAt: iso(row?.built_at ?? null), dirtyAt: iso(row?.dirty_at ?? null) };
    },

    async markSearchIndexDirty(at) {
      // COALESCE keeps the FIRST dirtying instant, as on Postgres.
      await sql.execute(`UPDATE search_index_state SET dirty_at = COALESCE(dirty_at, $1)`, [toInstant(at)]);
    },

    async touchSearchIndex() {
      // `COALESCE(dirty_at, now())` → the database's clock, in the one format.
      await sql.execute(`UPDATE search_index_state SET dirty_at = COALESCE(dirty_at, ${NOW_SQL})`);
    },
  };
}
