// One page of card rows, and where it came from (openproduct-scale OS5).
//
// Shared by the catalogue API (`catalog.ts`), the website's directory read
// (`public.ts`) and the search rebuild, so the three read the SAME source
// by the SAME rule — and a module of its own because `catalog.ts` already
// imports from `public.ts` for the placement, and a page reader both need
// cannot live in either without a cycle.

import { FRESHNESS_WINDOW_MS } from "@openproduct/contracts";
import type {
  CataloguePage,
  MetricRecord,
  OpenproductRepository,
  ProductMediaRecord,
  ProfileCardRecord,
  PublishedWindows,
} from "@openproduct/db";

/**
 * OS1 — the oldest `merges` observation the ordering may read: two freshness
 * windows, which is exactly when `metricState` stops carrying the metric on
 * the card. Computed here, from the contract, so the repository's "not
 * observed" and the card's "not observed" are one rule.
 */
export function mergesSinceOf(nowMs: number): string {
  return new Date(nowMs - 2 * FRESHNESS_WINDOW_MS.merges).toISOString();
}

/**
 * OB3 — the same rule for the other term of `sort.most-active`: the oldest
 * `endorsements.7d` count the ordering may read. Older, and the build ranks
 * on its changes alone — as the published sentence says.
 */
export function endorsementsSinceOf(nowMs: number): string {
  return new Date(nowMs - 2 * FRESHNESS_WINDOW_MS.endorsements).toISOString();
}

/**
 * OS5 — ONE PAGE OF CARD ROWS, with the observations and media the cards are
 * assembled from, and where they came from.
 *
 * The materialised catalogue first: `catalog_cards` holds every listed
 * product with its latest observations and media in the published order, and
 * a page of it is one indexed read that also carries the census and the
 * moment it was computed. When the catalogue has NEVER been computed (a fresh
 * estate before its first sweep — `computedAt` null), the page is the live
 * join, as it was before OS5: the card read, then the metrics and media reads
 * for the page, then the census. Never a mixture: a page is one source or the
 * other, and says which by whether it has a moment.
 */
export interface CardsPage {
  cards: readonly ProfileCardRecord[];
  metrics: ReadonlyMap<string, MetricRecord[]>;
  media: ReadonlyMap<string, ProductMediaRecord[]>;
  next: CataloguePage["next"];
  windows: PublishedWindows;
  /** When the catalogue these rows came from was computed; null on the live join. */
  computedAt: string | null;
}

export type CardsPageRepo = Pick<
  OpenproductRepository,
  "listCataloguePage" | "listPublicCardsPage" | "latestMetricsForSlugs" | "listPublicMediaForSlugs" | "countPublishedWindows"
>;

export async function readCardsPage(
  repo: CardsPageRepo,
  input: { cursor: CataloguePage["next"]; limit: number },
  nowMs: number,
): Promise<CardsPage> {
  const built = await repo.listCataloguePage({ cursor: input.cursor, limit: input.limit });
  if (built.computedAt !== null) return built;
  // The live join — the three reads OS5 takes off the request path, still the
  // page's source until the first sweep has run.
  const [page, windows] = await Promise.all([
    repo.listPublicCardsPage({
      cursor: input.cursor,
      limit: input.limit,
      mergesSince: mergesSinceOf(nowMs),
      endorsementsSince: endorsementsSinceOf(nowMs),
    }),
    repo.countPublishedWindows(new Date(nowMs).toISOString()),
  ]);
  const slugs = page.cards.map((c) => c.slug);
  // ONE metrics read and ONE media read for the whole page. The public
  // document is assembled once per cache fill, and an N+1 here is an N+1
  // against every cold edge. In parallel because neither needs the other.
  const [metrics, media] = await Promise.all([repo.latestMetricsForSlugs(slugs), repo.listPublicMediaForSlugs(slugs)]);
  return { cards: page.cards, metrics, media, next: page.next, windows, computedAt: null };
}
