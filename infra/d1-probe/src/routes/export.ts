// POST /export[?detail=full] — the slice's canonical outputs for the loaded
// corpus (openproduct-standalone OPN-2; PROOF.md "the remote test", step 6).
//
// The catalogue is rebuilt first (a quiet tick when /bench already left it
// current — `prep` says which), so the export depends on the corpus alone and
// not on what ran before it. Then, for the corpus:
//
//   catalogue         the whole walk, 200 cards a page, every page exactly as
//                     `listCataloguePage` returns it (cards, metrics, media,
//                     next cursor, census windows)
//   census            the catalog_state row the rebuild stamped
//   searchIndex       every search_index row, ordered by (kind, entity_id)
//   searchIndexTerms  every search_index_terms row, ordered by its key
//   searchIndexState  getSearchIndexState()
//   candidates        searchCandidates for fixed queries, UNTRUNCATED (any
//                     bounded subset is a valid candidate set, so only the
//                     full set is comparable), as sorted ids; plus one
//                     truncated query, compared by size and membership only
//
// Each section is a SHA-256 of its canonical JSON (src/canonical.ts) with its
// counts; the catalogue also has a digest per page, so a difference points at
// a page. `detail=full` adds the content itself, for a human to diff. The
// smoke compares `sections` with a snapshot made the same way on LOCAL D1.

import type { D1SliceRepository } from "@openproduct/db/d1";

import { digestOf } from "../canonical.js";
import { INPUT, loadedSize, type ProbeContext } from "../probe.js";

type Page = Awaited<ReturnType<D1SliceRepository["listCataloguePage"]>>;
type Cursor = Parameters<D1SliceRepository["listCataloguePage"]>[0]["cursor"];

const WALK_LIMIT = 200;
const UNTRUNCATED = 1_000_000;

export const CANDIDATE_QUERIES: Record<string, readonly string[]> = {
  common: ["product"],
  rare: ["00060"],
  multi: ["00060", "rust", "nope"],
  fourTerms: ["00060", "00061", "00062", "zzz"],
  category: ["design"],
  absent: ["nope"],
  none: [],
};

/** A page with its Maps as plain objects (canonical JSON sorts their keys). */
function plainPage(page: Page) {
  return {
    computedAt: page.computedAt,
    windows: page.windows,
    cards: page.cards,
    metrics: Object.fromEntries(page.metrics),
    media: Object.fromEntries(page.media),
    next: page.next,
  };
}

export async function exportRoute(ctx: ProbeContext, url: URL): Promise<unknown> {
  const size = await loadedSize(ctx.sql);
  const full = url.searchParams.get("detail") === "full";
  const prep = await ctx.repo.rebuildCatalogue(INPUT);

  // ── the catalogue walk
  const pages: ReturnType<typeof plainPage>[] = [];
  let cursor: Cursor = null;
  do {
    const page = await ctx.repo.listCataloguePage({ cursor, limit: WALK_LIMIT });
    pages.push(plainPage(page));
    cursor = page.next;
    if (pages.length > 10_000) throw new Error("export: the catalogue walk did not end");
  } while (cursor !== null);
  const pageDigests = await Promise.all(pages.map(async (p) => (await digestOf(p)).digest));
  const cards = pages.flatMap((p) => p.cards);
  const catalogue = {
    pages: pages.length,
    cards: cards.length,
    firstSlug: cards[0]?.slug ?? null,
    lastSlug: cards[cards.length - 1]?.slug ?? null,
    digest: (await digestOf(pageDigests)).digest,
    pageDigests,
  };

  // ── the census the rebuild stamped
  const state = await ctx.sql.execute<Record<string, unknown>>(
    `SELECT computed_at, card_count, today_count, week_count, month_count, total_count FROM catalog_state WHERE singleton = 1`,
  );
  const s = state.rows[0] ?? {};
  const census = {
    computedAt: s.computed_at ?? null,
    cardCount: Number(s.card_count ?? 0),
    windows: { today: Number(s.today_count ?? 0), week: Number(s.week_count ?? 0), month: Number(s.month_count ?? 0), total: Number(s.total_count ?? 0) },
  };

  // ── the search index, as stored
  const docs = await ctx.sql.execute<{ kind: string; entity_id: string; title: string; summary: string | null; terms: string; facets: string; built_at: string }>(
    `SELECT kind, entity_id, title, summary, terms, facets, built_at FROM search_index ORDER BY kind, entity_id`,
  );
  const indexRows = docs.rows.map((r) => ({
    kind: r.kind,
    entityId: r.entity_id,
    title: r.title,
    summary: r.summary,
    terms: JSON.parse(r.terms) as unknown,
    facets: JSON.parse(r.facets) as unknown,
    builtAt: r.built_at,
  }));
  const terms = await ctx.sql.execute<{ term: string; kind: string; entity_id: string }>(
    `SELECT term, kind, entity_id FROM search_index_terms ORDER BY term, kind, entity_id`,
  );
  const termRows = terms.rows.map((r) => [r.term, r.kind, r.entity_id]);
  const searchIndexState = await ctx.repo.getSearchIndexState();

  // ── candidate sets
  const candidates: Record<string, unknown> = {};
  const candidateContent: Record<string, unknown> = {};
  for (const [name, query] of Object.entries(CANDIDATE_QUERIES)) {
    const found = await ctx.repo.searchCandidates([...query], UNTRUNCATED);
    const ids = found.map((d) => `${d.kind}/${d.entityId}`).sort();
    const sorted = [...found].sort((a, b) => (a.kind === b.kind ? (a.entityId < b.entityId ? -1 : 1) : a.kind < b.kind ? -1 : 1));
    candidates[name] = { terms: query, count: ids.length, digest: (await digestOf(sorted)).digest, ...(ids.length <= 20 ? { ids } : {}) };
    if (full) candidateContent[name] = ids;
  }
  const truncated = await ctx.repo.searchCandidates(["product"], 50);
  candidates.truncated = {
    terms: ["product"],
    limit: 50,
    count: truncated.length,
    allMatch: truncated.every((d) => d.terms.includes("product")),
    distinct: new Set(truncated.map((d) => `${d.kind}/${d.entityId}`)).size === truncated.length,
  };

  const sections = {
    catalogue,
    census,
    searchIndex: { rows: indexRows.length, ...(await digestOf(indexRows)) },
    searchIndexTerms: { rows: termRows.length, ...(await digestOf(termRows)) },
    searchIndexState,
    candidates,
  };
  return {
    size,
    prep,
    sections,
    ...(full ? { content: { catalogue: pages, searchIndex: indexRows, searchIndexTerms: termRows, candidates: candidateContent } } : {}),
  };
}
