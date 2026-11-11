// The personalisation overlay (openproduct-commons XP2).
//
// THIS FILE EXISTS BECAUSE OF ONE DECISION, OPC-1: every public page is a
// single cacheable document that resolves no actor. That buys the crawl, the
// edge cache and invariant I6 — and it costs the ability to render anything
// personal in the HTML. The overlay is how the cost is paid back: a second,
// tiny, uncached read that runs AFTER paint and answers only questions of the
// form "which of these, and how many of mine".
//
// THREE PROPERTIES ARE LOAD-BEARING, and each is enforced by the shape here
// rather than by anyone's discipline at the call site:
//
//   1. IDS AND INTEGERS ONLY. Nothing here carries a tagline, a name, a URL or
//      a timestamp. A response that carried renderable content would be a
//      second rendering path for the same product — one cached and crawled,
//      one personal and not — and the two would drift. Everything a visitor
//      READS came from the cached document; the overlay only says which of it
//      is theirs.
//
//   2. THE ANSWER IS BOUNDED BY THE QUESTION. `saved` is the intersection of
//      what this subject saved with the ids the page actually asked about, so
//      a product page cannot become a listing of everything you ever saved,
//      and the response size is a function of the page rather than of the
//      account's history.
//
//   3. FAILING AND BEING SIGNED OUT ARE THE SAME BRANCH. Not a convenience: it
//      is the only way the fail-open path stays correct. A branch taken only
//      when the service is down is a branch that is exercised only when the
//      service is down. Here it is the branch every anonymous visitor takes on
//      every page load, which means it cannot rot unnoticed.
//
// `endorsed` ARRIVED WITH EN1 and is the same shape as `saved`, bounded by the
// ids the page asked about. The two are separate fields over separate tables
// and are never merged: a save is private and an endorsement is public
// (OPC-3), and a single field meaning "you interacted with this" would be the
// exact conflation the whole EN sub-epic is built to refuse.

/**
 * What the overlay answers. Ids and integers, nothing else.
 *
 * `saved` and `savedCount` are two different numbers and must never be
 * conflated: the first is "which of the ids you asked about", the second is
 * "how many you have in total". A product page asking about one slug gets a
 * `saved` of length 0 or 1 and a `savedCount` of however many the account
 * holds; rendering the former as the latter would tell someone with forty
 * saved products that they have one.
 */
export interface MeOverlay {
  /** The subset of the REQUESTED ids this subject has saved. PRIVATE. */
  readonly saved: readonly string[];
  /** How many products the subject has saved in total. */
  readonly savedCount: number;
  /**
   * The subset of the REQUESTED ids this subject has ENDORSED. PUBLIC.
   *
   * A separate field from `saved`, over a separate table, and never merged:
   * one keystroke apart in every UI that has shipped them together, and
   * merging them is the accident OPC-3 exists to prevent.
   */
  readonly endorsed: readonly string[];
  /** How many contribution requests the subject has made. */
  readonly requests: number;
  /** How many listings the subject maintains. */
  readonly listings: number;
  /**
   * The visitor's OWN handle, or null when none is claimed — so the shell's
   * account menu can print their public address (`openproduct.live/@ada`)
   * and link to it. Already public by construction (CG0: a handle is an
   * address), and the visitor's own, so it widens nothing a public page
   * could not already say about them.
   */
  readonly handle: string | null;
  /** Whether their public page is on (CG1's toggle), for the same menu. */
  readonly profilePublic: boolean;
  /**
   * FL0 — the subset of the REQUESTED follow keys this subject follows.
   *
   * `topic:dev-tools`, `person:ada`. PRIVATE, and more strictly so than
   * `saved`: a save is private to the saver, and a follow is private to the
   * follower AND to the followed, who sees only a count. There is no read
   * anywhere on this estate that answers "who follows this", and this field is
   * bounded by what the page asked about so it cannot become one by accident.
   *
   * ONE ARRAY FOR BOTH KINDS, keyed, rather than two arrays — the page can
   * hold both at once, and two arrays would be two bounds to keep in step and
   * two chances to answer one kind's question with the other kind's ids.
   */
  readonly follows: readonly string[];
  /**
   * DQ1 — the subset of the REQUESTED post ids this subject has upvoted.
   *
   * ITS OWN ARRAY RATHER THAN A KEY IN `follows`, and the division is the same
   * one `ids` and `follows` already make: a post id and a follow key are
   * different namespaces, and one list holding both would make the answer's
   * meaning depend on which kind of page happened to ask.
   *
   * The COUNT beside each comment is public and in the page's cached
   * document; this is the other half — whether YOU upvoted it — and it arrives
   * after paint so a thread's anonymous and signed-in renders stay
   * byte-identical (I6). Bounded by what the page rendered, so it cannot
   * become a listing of everything this visitor has ever upvoted.
   */
  readonly postVotes: readonly string[];
  /**
   * NF0 — how many inbox rows sit after this visitor's read cursor.
   *
   * A NUMBER, AND IT JOINS THE OVERLAY RATHER THAN BECOMING A SECOND
   * PER-VISITOR READ. The badge is personal, so it arrives after paint like
   * everything else here (I6) — and a second fetch for one integer on every
   * page would double the personalisation traffic of the whole site.
   *
   * UNBOUNDED BY THE PAGE, unlike every array above, because it is not ABOUT
   * anything the page rendered: it is a fact about the reader. That is the one
   * exception, and it is safe for the reason the arrays are bounded — it
   * cannot be turned into a listing of anything.
   */
  readonly unread: number;
}

/**
 * The exact key set, pinned. The overlay is the one per-subject response that
 * reaches a public page, so the OD3 discipline applies to it with more force
 * than anywhere else: a field cannot appear here by accident, only on purpose.
 */
export const ME_OVERLAY_KEYS = ["endorsed", "follows", "handle", "listings", "postVotes", "profilePublic", "requests", "saved", "savedCount", "unread"] as const;

/**
 * The most ids one request may ask about.
 *
 * Chosen to fit the largest page that exists — the directory, which ships the
 * whole catalog — with room to grow, and small enough that the query stays a
 * bounded `= ANY($2)` rather than an unbounded scan. A request naming more is
 * TRUNCATED rather than refused: the overlay is decoration, and a 400 that
 * blanks a visitor's own state is a worse outcome than an answer about the
 * first 200 of their ids.
 */
export const ME_OVERLAY_MAX_IDS = 200;

/**
 * DQ1 — the post ids an overlay request asks about.
 *
 * A UUID GRAMMAR AND A BOUND, and the same silence `parseOverlayIds` gives a
 * malformed slug: anything else is dropped rather than refused, because the
 * ids come from whatever the page rendered and a 400 that blanks a visitor's
 * own state is a worse outcome than an answer about the ones we understood.
 */
export const ME_OVERLAY_POST_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseOverlayPostIds(raw: string | null | undefined): string[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const id = part.trim().toLowerCase();
    if (ME_OVERLAY_POST_ID_RE.test(id)) seen.add(id);
    if (seen.size >= ME_OVERLAY_MAX_IDS) break;
  }
  return [...seen];
}

/** The same slug grammar the public read uses. Anything else is dropped. */
const SLUG_RE = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Parse the `ids` parameter: comma-separated slugs, deduped, capped.
 *
 * Silently drops anything unparseable rather than refusing the request, for
 * the reason above — and because the ids come from whatever the page happened
 * to render, so a single malformed one should cost that one answer, not the
 * visitor's whole personalisation.
 */
export function parseOverlayIds(raw: string | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const slug = part.trim();
    if (!SLUG_RE.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length >= ME_OVERLAY_MAX_IDS) break;
  }
  return out;
}
