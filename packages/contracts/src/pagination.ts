// Pagination as the published ordering, cut into pages (openproduct-scale OS1).
//
// THE 200 CEILING BECOMES A PAGE. Until OS1 the catalogue API and the front
// page's *All products* answered the first N published listings and stopped,
// and nothing said so: the 201st listing was absent from both with no
// published rule (IN3 spent a milestone making a listing kept off the front
// page be told why; this one was simply not there). A page has a `next`.
//
// ─── OS-1: NEVER A SECOND ORDERING ────────────────────────────────────────
//
// A cursor is a POSITION in `sort.most-active`'s already-published sequence
// — its key desc, unknown last, then published desc, then slug — and page two
// continues page one exactly. It is not a page number (a page number over a
// list that moves is two different pages an hour apart) and it is not an
// offset (an offset is a page number in disguise). It is the last row's three
// keys, and the next page is every row after them in the same order — which
// is what makes it stable at all, and which is why the tiebreak had to be
// published (OS-C: the slug clause was always true and never said; now it is
// said, in the sentence and in the comparator both).
//
// ─── OS-2: A CURSOR LIVES IN A URL ────────────────────────────────────────
//
// Opaque on the wire — base64url of the three keys — so a client treats it as
// an address and not as a thing to construct. Page two is one cacheable
// document at one address, identical for every reader (OPC-1, I6).

import type { PublicProfileCard } from "./index.js";
import { mostActiveKeyOf } from "./ranking.js";

/** A page, unless the caller says otherwise. */
export const PAGE_SIZE_DEFAULT = 100;
/** The most a caller may ask for — the old ceiling, now a page size. */
export const PAGE_SIZE_MAX = 200;

/** The three keys `sort.most-active` orders by, in that order. */
export interface CatalogueCursor {
  /** `sort.most-active`'s folded key (`mostActiveKeyOf`: the score, then
   *  merged changes), or null for "not observed" — which the ordering puts
   *  last, never as zero. Until OB3 this was the merges count alone. */
  readonly activity: number | null;
  readonly publishedAt: string | null;
  readonly slug: string;
}

/** The keys a catalogue page carries on the wire. `next` is present on every
 *  page — `null` means "this is the last page", never absent. */
// OS5 — `computedAt`: the moment the catalogue these rows came from was
// materialised, or null while a page is served from the live join (an estate
// whose sweep has not yet run). A page that carries a moment is OPC-7 at the
// page level — the same rule every metric on a card already follows.
export const CATALOG_PAGE_KEYS = ["products", "next", "total", "computedAt"] as const;
export const DIRECTORY_PAGE_KEYS = ["projects", "next", "total", "freshness", "freshnessThreshold", "computedAt"] as const;

const toBase64Url = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (text: string): string | null => {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
};

/** The position after `cursor`, as an address. */
export function encodeCursor(cursor: CatalogueCursor): string {
  return toBase64Url(JSON.stringify([cursor.activity, cursor.publishedAt, cursor.slug]));
}

/**
 * A cursor a stranger typed. Null for anything that is not exactly three
 * keys of the right shapes — a refused cursor is a 422, never a first page
 * quietly served under a wrong address.
 */
export function decodeCursor(text: string | null | undefined): CatalogueCursor | null {
  if (typeof text !== "string" || text.length === 0 || text.length > 512) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const json = fromBase64Url(text);
  if (json === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) return null;
  const [activity, publishedAt, slug] = parsed as [unknown, unknown, unknown];
  if (activity !== null && !(typeof activity === "number" && Number.isSafeInteger(activity) && activity >= 0)) return null;
  if (publishedAt !== null && !(typeof publishedAt === "string" && !Number.isNaN(Date.parse(publishedAt)))) return null;
  if (typeof slug !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(slug)) return null;
  return { activity, publishedAt, slug };
}

/** The page size a caller asked for, bounded. Absent or unreadable is the default. */
export function pageSize(raw: string | null | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return PAGE_SIZE_DEFAULT;
  return Math.min(n, PAGE_SIZE_MAX);
}

/** A card's own position — the keys the ordering read on it. */
export function catalogueCursorOf(card: Pick<PublicProfileCard, "slug" | "publishedAt" | "metrics">): CatalogueCursor {
  return { activity: mostActiveKeyOf(card as PublicProfileCard), publishedAt: card.publishedAt ?? null, slug: card.slug };
}

// ---------------------------------------------------------------------------
// The page on the website
// ---------------------------------------------------------------------------

/** Where a page after the first lives: a path, not a query string, so it is
 *  one document at one address that the app can prerender and cache like
 *  `/launches/{day}` (OS-2). `/products` itself stays the front page. */
export function cataloguePagePath(cursor: string): string {
  return `/products/${encodeURIComponent(cursor)}`;
}

/** The link from one page to the next. A plain link — a URL, not a button
 *  that fetches (OS-2, and OPP2's no-JS posture kept). */
export const CATALOGUE_NEXT_LABEL = "More builds";

/** A continuation page's heading line: what is on it, and the real count. */
export function cataloguePageMeta(shown: number, total: number | null): string {
  // OB4 (D4) — builds, in the reader's word.
  const noun = (n: number) => (n === 1 ? "build" : "builds");
  const here = `${shown} ${noun(shown)} on this page`;
  return total === null ? `${here} · most active first` : `${here} · ${total.toLocaleString("en-US")} in all · most active first`;
}
