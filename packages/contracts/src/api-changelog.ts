// The catalog API's changelog and stability policy (openproduct-consumers CS0).
//
// ─── CS-1: ADDITIVE FOREVER ──────────────────────────────────────────────
//
// Every change the worldclass epic made to this API was additive, and its
// consumers — an agent, a badge, a curl — survived each one without knowing
// it had happened. That is the policy, said out loud: a field, once
// published, stays. A removal is announced HERE with a date, carries a
// `Deprecation` header for the whole notice period, and is marked
// `x-deprecated` in the OpenAPI document until it goes.
//
// THE NOTICE PERIOD IS CS-A'S TO DECIDE, and this is its proposal, published
// as the floor: ninety days, and no major version ever — a breaking change is
// a new path beside the old one, and the old one keeps answering for the
// notice period. A version in the URL is a promise a consumer can see.
//
// ─── CS-2: GENERATED FROM THE PINNED KEY SETS, THEN ANNOTATED ────────────
//
// I8 pins `CATALOG_CARD_KEYS` and `CATALOG_PRODUCT_KEYS` and asserts them
// sorted; a changelog computed from them is the floor and a sentence per
// change is the ceiling. This file is both: a release is a list of keys
// added or removed, each with the sentence a person wrote and the milestone
// that made it — and a test RECONCILES the releases against the pinned sets,
// so a key cannot ship without its line and a line cannot outlive its key.
// The publish-disclosure guard's discipline, applied to the API.

import { CATALOG_CARD_KEYS, CATALOG_PRODUCT_KEYS } from "./catalog-api.js";
import { CATALOG_PAGE_KEYS } from "./pagination.js";

/** How long a removal is announced before it happens. CS-A's proposal,
 *  published as the floor until the gate is answered. */
export const DEPRECATION_NOTICE_DAYS = 90;

/** The policy, as the sentence `/docs/api` and the OpenAPI document carry. */
export const API_STABILITY_SENTENCE =
  `Additive forever. A field, once published, stays. A removal is announced on this page with a date at least ${DEPRECATION_NOTICE_DAYS} days out, carries a Deprecation header for the whole notice period, and is marked x-deprecated in the OpenAPI document until it goes. There is no 2.0.0: a breaking change is a new path beside the old one, and the old one keeps answering for the notice period.`;

/** Which document a key belongs to: a card (every row of the catalog), a
 *  product (the one-listing document, a superset of the card), or the page
 *  envelope around a list of cards. */
export type ApiShape = "card" | "product" | "page";

export interface ApiChange {
  readonly key: string;
  readonly shape: ApiShape;
  readonly change: "added" | "removed";
  /** One hand-written sentence. Never empty — the test says so. */
  readonly sentence: string;
  /** The milestone that made it, so a reader can find the reasoning. */
  readonly milestone: string;
}

export interface ApiRelease {
  readonly version: string;
  readonly date: string;
  readonly entries: readonly ApiChange[];
}

/** A field in its notice period: announced `since`, gone at `until`. */
export interface ApiDeprecation {
  readonly key: string;
  readonly shape: ApiShape;
  readonly since: string;
  readonly until: string;
  readonly sentence: string;
}

/** Nothing is in notice. The list exists so that the first removal is a
 *  line here, a marker in the schema and a header on the wire — all three
 *  from one entry. */
export const API_DEPRECATIONS: readonly ApiDeprecation[] = [];

const added = (shape: ApiShape, milestone: string, key: string, sentence: string): ApiChange => ({
  key,
  shape,
  change: "added",
  sentence,
  milestone,
});

/**
 * Newest first. The keys of `1.0.0` are the catalog as AG0 published it, read
 * back from the file's first commit; everything since is `1.1.0`, `1.2.0` and
 * then `1.3.0`, one line per key, with the milestone beside it.
 */
export const API_CHANGELOG: readonly ApiRelease[] = [
  {
    version: "1.3.0",
    date: "2026-10-01",
    entries: [
      added("product", "OPR5", "workspaceRef", "The console address of the public workspace the maintainers attested with their link grant — the door a signed-in visitor opens to read it on Orunbase; null while the listing holds no grant. Never the listing's own tenancy id."),
    ],
  },
  {
    version: "1.2.0",
    date: "2026-09-10",
    entries: [
      added("page", "OS5", "computedAt", "When the catalogue these cards came from was computed — the sweep materialises it every ten minutes and the page says so; null while a page is served from the live join, before the first sweep."),
    ],
  },
  {
    version: "1.1.0",
    date: "2026-09-10",
    entries: [
      added("page", "OS1", "next", "The cursor for the page after this one, on every page; null on the last, never absent. The catalog is paged in its published order, and a cursor is a position in it."),
      added("page", "OS1", "total", "Every published listing, counted — a number about the catalog, never the page's length."),
      added("card", "PV0", "language", "The repository's primary language, as observed, with the moment of the read."),
      added("card", "PV0", "lastCommitAt", "When the repository was last pushed to, as observed."),
      added("card", "PV0", "openIssues", "The repository's open issue count, as observed."),
      added("card", "MD0", "media", "The listing's images in document order — an authored hero and gallery, and an observed capture that carries its moment and is withdrawn past its window."),
      added("card", "PP3", "pricing", "How the maintainers describe what it costs, as one enumerated, authored value."),
      added("product", "PV2", "installLine", "One copyable install command in the maintainer's own words — always authored, never derived, one command by construction."),
      added("product", "PV3", "cleanVotes", "Whether the listing's upvotes were checked by the integrity model and almost none discounted. A boolean and never a count."),
      added("product", "PV4", "changes", "What changed on the listing in the last week, oldest snapshot to newest, each entry with its own provenance; null where there is no earlier snapshot."),
      added("product", "PP1", "followers", "How many people follow the listing."),
      added("product", "PP5", "launches", "Every launch the listing has had, newest first, with where each placed."),
    ],
  },
  {
    version: "1.0.0",
    date: "2026-09-05",
    entries: [
      added("page", "AG0", "products", "The cards of the catalog."),
      added("card", "AG0", "slug", "The listing's address, and its name on every public surface."),
      added("card", "AG0", "tagline", "One line in the maintainers' words."),
      added("card", "AG0", "category", "The one category the maintainers chose, from the published vocabulary."),
      added("card", "AG0", "hosting", "Where it runs, as the maintainers describe it."),
      added("card", "AG0", "stack", "What it is built with, in the maintainers' own words, untouched."),
      added("card", "AG0", "stackCanonical", "The subset of the stack the vocabulary recognises — the only part a facet reads."),
      added("card", "AG0", "licence", "The repository's licence, as observed — never a maintainer's claim."),
      added("card", "AG0", "metrics", "Every observed number with its window, its moment and its state; absent when nobody observed it, never zero."),
      added("card", "AG0", "openRoles", "How many roles are open."),
      added("card", "AG0", "openingCommitments", "The commitment each open role asks for, verbatim."),
      added("card", "AG0", "hasLiveUrl", "Whether there is something running to try. A boolean, not the address."),
      added("card", "AG0", "publishedAt", "When the listing was published."),
      added("card", "AG0", "indexable", "Whether the listing asks to be indexed — the sitemap and the robots directive agree with it."),
      added("product", "AG0", "components", "The maintainers' curated map of what the product is made of: a name and a kind, nothing more."),
      added("product", "AG0", "launch", "The listing's current or most recent launch and where it placed on its board."),
      added("product", "AG0", "liveUrl", "The address the maintainers declared."),
      added("product", "AG0", "maintainers", "Who maintains it, as the maintainers published themselves."),
      added("product", "AG0", "openings", "The open roles in full."),
      added("product", "AG0", "pitch", "The pitch, in the maintainers' words."),
      added("product", "AG0", "pitchDigest", "A digest of the pitch, so a change can be noticed without the text."),
      added("product", "AG0", "repoUrl", "The repository the observed facts are read from."),
    ],
  },
];

/**
 * The key set a shape has after every release, oldest first — the changelog
 * replayed. A test compares this with the pinned literal; the two must be
 * equal, which is CS-2's "generated from the pinned key sets" as an
 * assertion rather than a script.
 */
export function keysAfterChangelog(shape: ApiShape, changelog: readonly ApiRelease[] = API_CHANGELOG): string[] {
  const keys = new Set<string>();
  for (const release of [...changelog].reverse()) {
    for (const entry of release.entries) {
      if (entry.shape !== shape && !(shape === "product" && entry.shape === "card")) continue;
      if (entry.change === "added") keys.add(entry.key);
      else keys.delete(entry.key);
    }
  }
  return [...keys].sort();
}

/** The pinned literal for a shape, sorted the way the changelog replays. */
export function pinnedKeysOf(shape: ApiShape): string[] {
  const keys = shape === "card" ? CATALOG_CARD_KEYS : shape === "product" ? CATALOG_PRODUCT_KEYS : CATALOG_PAGE_KEYS;
  return [...keys].sort();
}

/**
 * The two headers a notice puts on the wire (CS1, finishing CS0's sentence):
 * RFC 9745 `Deprecation`, the moment the earliest open notice began, as
 * `@<unix seconds>`; RFC 8594 `Sunset`, the day the earliest one goes, as an
 * HTTP date. `null` while nothing is in notice at `now` — a notice whose
 * `until` has passed is a field that is gone, not a header.
 */
export interface DeprecationHeaders {
  readonly deprecation: string;
  readonly sunset: string;
}

export function deprecationHeaders(now: Date, deprecations: readonly ApiDeprecation[] = API_DEPRECATIONS): DeprecationHeaders | null {
  const at = now.getTime();
  const open = deprecations.filter((notice) => Date.parse(notice.since) <= at && at < Date.parse(notice.until));
  if (open.length === 0) return null;
  const since = Math.min(...open.map((notice) => Date.parse(notice.since)));
  const until = Math.min(...open.map((notice) => Date.parse(notice.until)));
  return { deprecation: `@${Math.floor(since / 1000)}`, sunset: new Date(until).toUTCString() };
}

/** The version the newest release carries — what `CATALOG_API_VERSION` must equal. */
export function changelogVersion(changelog: readonly ApiRelease[] = API_CHANGELOG): string {
  return changelog[0]?.version ?? "0.0.0";
}
