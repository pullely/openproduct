// The search results page (openproduct-launch SR0).
//
// `/search?q=` — one page, three sections, and each section is answered by a
// DIFFERENT mechanism on purpose. That is the milestone's whole design, and
// the reason is worth the space.
//
// ─── LAUNCHES COME FROM THE INDEX. MAKERS MUST NOT ───────────────────────
//
// DS0 built a search index, and widening it with a `person` kind is the
// obvious move — one ranking, one formula, and DS3's palette comment
// ("people: empty until CG1 mints the handle namespace") finally resolves.
//
// It is the wrong move, and the reason is NOT that an index can be stale —
// every public read here is stale by up to 60 seconds and that is deliberate.
// It is that the index's staleness is UNBOUNDED AND DIFFERENT.
//
// `handleRebuildSearchIndex` rebuilds when the index is dirty AND past a
// 60-second floor, driven by a sweep. If the sweep is not running the entry is
// stale indefinitely — and this estate has had exactly that outage. So the
// bound is not 60 seconds, it is "however long since something last ran".
//
// A LIVE READ IS STALE BY THE SAME 60 SECONDS AS THE PAGE IT LINKS TO, because
// both sit under the same public cache, and `/@handle` is itself
// `revalidate = 60`. Somebody who turns their profile off disappears from the
// search page and from their own page in the same breath. That coherence is
// the whole argument: the objection was never staleness, it was a second
// answer to "is this person public" that can drift away from the first.
//
// For a PRODUCT none of this matters — a stale entry links to a page that
// 404s, which is a dead link. For a PERSON it is a disclosure, and CG1's
// design is that a profile is public because somebody said so and stops being
// public when they say otherwise: four conditions, checked on every read.
//
// So MAKERS ARE READ LIVE, through the same four conditions in the same SQL as
// the people directory. Two ranking paths is the price, and a pglite test
// asserts the two reads AGREE condition by condition rather than trusting
// either to be right on its own.
//
// ─── TOPICS COME FROM THE VOCABULARY, AND ASK NOTHING ────────────────────
//
// A topic is a facet value, and the vocabulary is in this package. Matching a
// query against it is a pure function over a list of about a dozen — no read,
// no index, no staleness. DS3 already does exactly this for stacks, and the
// argument it made then holds now: asking the index to also emit facet rows
// would make one endpoint answer two questions and put the vocabulary in two
// places.
//
// ─── THE PAGE IS CRAWLABLE, AND IT IS NOT CACHED ─────────────────────────
//
// Those are different things, and SR0's done-when asks only for the first. A
// page that reads `searchParams` is DYNAMIC in Next 15 — a `revalidate` beside
// it is accepted and silently ignored, which is the exact defect XP4's census
// exists to catch. So this page declares none, renders server-side, returns
// 200 with its content and its metadata, and a crawler reads it perfectly
// well. What it does not do is sit in an ISR cache keyed on an unbounded query
// space, which is a cache nobody wants and an easy way to fill one.

import { facet } from "./facets.js";
import { topicPath } from "./topics.js";

/** The one address, and the design's. */
export const SEARCH_PATH = "/search";

export function searchPath(query: string): string {
  const q = query.trim();
  return q.length === 0 ? SEARCH_PATH : `${SEARCH_PATH}?q=${encodeURIComponent(q)}`;
}

/** How many of each the page shows.
 *
 *  LAUNCHES GETS THE MOST because it is what people come for, and the other
 *  two are ways of narrowing rather than answers in themselves. All three are
 *  bounded: a search page whose length depends on how common a word is, is a
 *  page that occasionally takes a minute to read. */
export const SEARCH_LAUNCH_LIMIT = 20;
export const SEARCH_MAKER_LIMIT = 8;
export const SEARCH_TOPIC_LIMIT = 6;

/** The `launches` key is the section's old name; what it holds is the
 *  index's products, which the product calls builds (openproduct-open-builds
 *  D4; said here since openproduct-calm CL5). */
export const SEARCH_HEADINGS = {
  launches: "Builds",
  makers: "Makers",
  topics: "Topics",
} as const;

/**
 * What each section says when it has nothing — and each says something
 * DIFFERENT, because the absences mean different things.
 *
 * OPC-C applied to a search page: an empty section is not a zero, and three
 * sections all reading "No results" would tell a reader nothing about which
 * of the three they should try differently.
 */
export const SEARCH_EMPTY = {
  launches: "No builds match. Try a topic or a maker's name.",
  makers: "No public profiles matched. People appear here once they have made their profile public.",
  topics: "No topic by that name. The topics are a fixed list — browse them all.",
} as const;

/** What the page says when the whole query found nothing anywhere. */
export const SEARCH_NOTHING =
  "Nothing matched that. Search looks at product names, taglines and stacks, at public profiles, and at the topic list.";

/** What it says before anybody has typed. Not an error and not an apology. */
export const SEARCH_PROMPT = "Search products, people and topics.";

/** The published sentence for what this page looks at — OPC-4's discipline
 *  applied to search, where "relevance" sounds like a technical detail and is
 *  actually an editorial position about whose work is seen. */
export const SEARCH_SCOPE_NOTE =
  "Products are ranked by the published search.relevance formula. People are matched on handle, name and bio, and only public profiles appear. Topics are matched against the fixed topic list.";

// ---------------------------------------------------------------------------
// Topics, derived
// ---------------------------------------------------------------------------

export interface SearchTopicHit {
  readonly value: string;
  readonly label: string;
  /** The topic's own page. */
  readonly href: string;
}

/**
 * Topics whose label or value contains the query.
 *
 * SUBSTRING AND NOT PREFIX, because somebody searching "tools" should find
 * "Developer tools". Case-folded, and the query is trimmed rather than
 * tokenised: a topic is a single label, so matching it word by word would make
 * "developer tools" fail to find the topic literally called that.
 */
export function matchTopics(query: string, limit = SEARCH_TOPIC_LIMIT): SearchTopicHit[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];
  const group = facet("category");
  if (!group) return [];
  const hits: SearchTopicHit[] = [];
  for (const value of group.values) {
    if (hits.length >= limit) break;
    if (
      !value.label.toLowerCase().includes(needle) &&
      !value.value.toLowerCase().includes(needle)
    ) {
      continue;
    }
    hits.push({
      value: value.value,
      label: value.label,
      href: topicPath(value.value),
    });
  }
  return hits;
}

/** How many topics the search field offers before anybody has typed. */
export const SEARCH_SUGGESTION_LIMIT = 4;

/**
 * What to offer a reader who has opened the search field and typed nothing.
 *
 * THE VOCABULARY'S OWN FIRST FEW, in the order the facet declares them, and
 * NOT a popularity ranking: this list is drawn before any query, so a
 * "trending" version of it would be an ordering with an input nobody outside
 * this program can see — exactly what OPC-4 forbids a published order from
 * being. The facet's order is editorial, written down, and the same for every
 * visitor.
 */
export function suggestedTopics(limit = SEARCH_SUGGESTION_LIMIT): SearchTopicHit[] {
  const group = facet("category");
  if (!group) return [];
  return group.values.slice(0, limit).map((value) => ({
    value: value.value,
    label: value.label,
    href: topicPath(value.value),
  }));
}

// ---------------------------------------------------------------------------
// Makers, matched
// ---------------------------------------------------------------------------

/** What the page needs about a person, and no more. A SMALLER shape than the
 *  card the people directory renders, which is itself smaller than the page —
 *  each surface narrows again (OD3). */
export interface SearchMakerHit {
  readonly handle: string;
  readonly displayName: string | null;
  /** What matched: their handle, their name, or their bio. Rendered so a
   *  reader is not left wondering why somebody is in the list. */
  readonly matched: "handle" | "name" | "bio";
}

export const SEARCH_MAKER_KEYS = ["displayName", "handle", "matched"] as const;

/** Why this person is in the results, said in a word. */
export const MAKER_MATCH_LABELS: Record<SearchMakerHit["matched"], string> = {
  handle: "handle",
  name: "name",
  bio: "bio",
};

/**
 * Which field matched, in the order a reader would expect.
 *
 * PURE, so the page and the handler cannot disagree about it. The read returns
 * rows; this decides what to say about each, and a test can walk every branch
 * without a database.
 */
export function makerMatchField(
  row: { handle: string; displayName: string | null; bio: string | null },
  query: string,
): SearchMakerHit["matched"] | null {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return null;
  if (row.handle.toLowerCase().includes(needle)) return "handle";
  if ((row.displayName ?? "").toLowerCase().includes(needle)) return "name";
  if ((row.bio ?? "").toLowerCase().includes(needle)) return "bio";
  return null;
}

// ---------------------------------------------------------------------------
// The whole document
// ---------------------------------------------------------------------------

export interface SearchLaunchHit {
  readonly slug: string;
  readonly title: string;
  readonly summary: string | null;
}

export interface SearchResults {
  readonly query: string;
  readonly launches: readonly SearchLaunchHit[];
  readonly makers: readonly SearchMakerHit[];
  readonly topics: readonly SearchTopicHit[];
}

/** Did anything match at all? Used to choose between three empty sections and
 *  one honest sentence — three "no results" in a row is noise. */
export function searchFoundNothing(results: SearchResults): boolean {
  return (
    results.launches.length === 0 && results.makers.length === 0 && results.topics.length === 0
  );
}

/** The page's title, which is also what a crawler and a shared link show. */
export function searchTitle(query: string): string {
  const q = query.trim();
  return q.length === 0 ? "Search" : `${q} — search`;
}

/** The palette's new last row (SR0). It is a row rather than a hint under the
 *  field because it is a DESTINATION: the palette is a jump, and this is the
 *  door out of it to something you can read, share and reload. */
export const SEE_ALL_RESULTS = "See all results";
