// The public catalog API v1 (openproduct-commons CT2, realising OPC-9).
//
// "OpenRouter for products" is only true if a MACHINE can consume the
// catalog. This module is that claim made concrete: one versioned shape, one
// generated OpenAPI document, and a CI rule (invariant I8) that fails when
// the website renders a field the API cannot return.
//
// WHY EVERY FIELD IS WRAPPED. The website can afford to know, out of band,
// that `licence` was observed and `tagline` was written. A machine reading
// this API cannot — and a catalog that hands out numbers without saying where
// they came from is a catalog of assertions (OPC-2). So the wire type is
// `Fact<T>` throughout, and the OpenAPI document says so in its schemas.
//
// WHAT IS NOT WRAPPED, and why: `slug` and the record's own timestamps.
// They are the record's IDENTITY rather than claims about the product, and
// wrapping an identifier in provenance would say something false — that
// somebody observed or computed which listing this is.

import type { MediaFact } from "./media.js";
import type { Fact } from "./provenance.js";
import type { Change } from "./snapshots.js";

/** One row of the catalog, as a machine reads it. */
export interface CatalogCard {
  /** Identity, unwrapped — see the module header. */
  slug: string;
  tagline: Fact<string | null>;
  /** The maintainer's own words. */
  stack: Fact<string[]>;
  /** The canonicalised subset — the only one facet counts are taken over. */
  stackCanonical: Fact<string[]>;
  category: Fact<string | null>;
  hosting: Fact<string | null>;
  /** PP3 — authored, like the two above; the chip says so on hover. */
  pricing: Fact<string | null>;
  licence: Fact<string | null>;
  /**
   * PV0 — the rest of the observed row, each an observation with the moment
   * it was read. `null` inside one is "read, and it answered nothing" — a
   * repository declaring no licence, or one GitHub could not classify — which
   * is a finding and carries its moment like any other.
   *
   * There is no `tests`: a `declared_repo` read cannot see CI.
   */
  language: Fact<string | null>;
  lastCommitAt: Fact<string | null>;
  openIssues: Fact<number | null>;
  openRoles: Fact<number>;
  /**
   * DS1 — the `openings` facet values these roles resolve to, so a MACHINE
   * can filter by the same vocabulary the rail does. A facet the API and the
   * website disagree about is a facet whose count nobody can check.
   *
   * Named for what it holds rather than for the facet group, because
   * `CatalogProduct.openings` is the list of roles themselves.
   */
  openingCommitments: Fact<string[]>;
  /** DS1 — whether there is something running to try. A boolean on the card;
   *  the address itself is on the product. */
  hasLiveUrl: Fact<boolean>;
  /**
   * TS1 — whether crawlers are asked to index this listing.
   *
   * DERIVED, not authored: neither the maintainer nor an observation decided
   * it — the trust ladder did, at publish time. Wrapping it means the rule is
   * published prose at /docs/formulas#listing-indexable, so "why is my page
   * not indexed" is a question with an answer rather than a support ticket.
   */
  indexable: Fact<boolean>;
  /**
   * MD0 — the listing's media, in document order: the hero, then the gallery
   * in the maker's order, then the capture.
   *
   * THE ONLY FIELD ON THIS CARD THAT IS A LIST OF FACTS RATHER THAN A FACT
   * ABOUT A LIST, and the shape is forced by WC-3. A hero is authored and a
   * screenshot is observed; one wrapper around the array would have to pick a
   * class for both, and whichever it picked would be a lie about the other
   * half. So provenance sits per row, which is also how the table stores it.
   *
   * PRESENT AND EMPTY, never absent. MD0 ships the model and no renderer, and
   * MD1 — the store these refer to — is gated on WC-C, so every listing's
   * array is `[]` today. An empty list here says "this listing published no
   * images", which is true and is what a monogram renders from (MD-3). It is
   * not a claim that a picture was taken and found nothing.
   */
  media: readonly MediaFact[];
  publishedAt: string | null;
  /**
   * Observed metrics, by name. ABSENT rather than zero when this listing's
   * tier cannot see one, or when what we last read has gone stale past its
   * window — which is the whole of OPC-C and OPC-7 expressed in a wire shape.
   */
  metrics: Record<string, Fact<number>>;
}

/** One product page, as a machine reads it. */
export interface CatalogProduct extends CatalogCard {
  /** PP1 — people following this listing. `derived` by `followers.count`; nothing anywhere lists them. */
  followers: Fact<number>;
  pitch: Fact<string | null>;
  pitchDigest: string | null;
  /**
   * PV2 — the install line, and the one field here whose provenance carries
   * real weight for a machine consumer.
   *
   * `authored` by the maintainer, ALWAYS. An agent that reads this catalog and
   * runs what it finds needs to know that nobody measured this and nothing
   * verified it — which is exactly what the wrapper says. Deriving it would
   * have made the class `observed`, and an agent reading `observed` on a
   * shell command would be entitled to believe something this product cannot
   * claim.
   */
  installLine: Fact<string | null>;
  /**
   * PV3 — the clean-vote mark, `derived` and carrying `votes.clean`.
   *
   * The formula id is what makes a `true` answerable: a machine reading this
   * needs the rule behind it, and `votes.clean` resolves to published prose
   * with the thresholds, the statement that it orders nothing, and the
   * warning that a `false` is not a finding — most listings have too few
   * upvotes to check.
   */
  cleanVotes: Fact<boolean>;
  /**
   * PV4 — what changed on this listing in the last week, or `null`.
   *
   * THE ONE FIELD HERE THAT IS NOT A `Fact`, and deliberately. Every other
   * value on this product is one value with one provenance; a diff is a LIST
   * whose entries have DIFFERENT provenance — a licence moving is `observed`
   * with the moment of the read that found it, a tagline rewrite is
   * `authored` by a maintainer and carries no moment at all. A wrapper around
   * the list would have to choose one class for all of them, and would be
   * wrong for half. Each `Change` carries its own instead.
   *
   * `null` MEANS NO EARLIER SNAPSHOT, `[]` means compared and nothing moved.
   * A machine consumer that collapsed the two would report a listing as
   * stable when nobody has ever looked at it.
   */
  changes: readonly Change[] | null;
  repoUrl: Fact<string | null>;
  /**
   * OPR5 (seam S12) — the console address (`org_…`) of the PUBLIC workspace
   * the maker attested with the link grant, `null` without one. A plain
   * value like `applyRef`, not a Fact: it is the platform's attestation, not
   * an observation or a claim, and the only thing a consumer does with it is
   * build `{console}/view/{workspaceRef}`. Never the row's own org id.
   */
  workspaceRef: string | null;
  liveUrl: Fact<string | null>;
  components: Fact<Array<{ name: string; kind: string | null }>> | null;
  maintainers: Array<{ displayName: Fact<string | null>; roleLabel: Fact<string | null> }>;
  openings: Array<{
    id: string;
    title: Fact<string>;
    description: Fact<string | null>;
    commitment: Fact<string | null>;
    applyRef: string | null;
  }>;
  /**
   * UV1 — where this listing placed on the day it launched.
   *
   * IT IS HERE BECAUSE I8 SAYS IT MUST BE: the API returns everything the
   * website shows, and the product page shows this. A field that reached the
   * page and not the API would make the catalog a partial view of a public
   * document, which is the one thing CT2 promised it would not be.
   *
   * A `derived` Fact, carrying `launch.board-rank` — the same formula id the
   * board and the feed resolve to (OL-2a). A number that decides how a
   * product is presented owes a reader a sentence at an address, and there is
   * exactly one sentence behind this one.
   *
   * `null` rather than absent HERE, unlike on the website's own projection.
   * The two shapes answer different questions: a page renders nothing when
   * there is nothing to say, and an API's key set is a contract a client
   * parses. A key that came and went would make every consumer branch on its
   * presence.
   */
  launch: Fact<CatalogLaunchPlacement | null>;
  /** PP5 — the listing's launch history, newest first, read from the board.
   *  `[]` when it has never launched. */
  launches: Fact<CatalogListingLaunch[]>;
}

/** The placement as the API serializes it. Structurally the website's
 *  `PublicLaunchPlacement`; kept as its own name because the two are pinned by
 *  separate literals and a shared type would let one widen the other. */
export interface CatalogLaunchPlacement {
  day: string;
  rank: number;
  of: number;
  counted: number;
  ineligible: number;
  versionLabel: string | null;
  /** PP4 — see `PublicLaunchWeek`. */
  week: { rank: number; of: number; from: string; to: string } | null;
}

/** PP5 — see `PublicListingLaunch`. */
export interface CatalogListingLaunch {
  day: string;
  launchedAt: string;
  versionLabel: string | null;
  rank: number | null;
  of: number | null;
  counted: number | null;
  commentCount: number;
}

/** What `/v1/facets` answers: the taxonomy, so a client can build its own UI. */
export interface CatalogFacetGroup {
  id: string;
  label: string;
  kind: "assigned" | "derived";
  cardinality: "single" | "multi";
  description: string;
  values: Array<{ value: string; label: string }>;
}

// CS0 — bumped with the changelog: `api-changelog.ts` is the record of what
// changed under which version, and a test holds this literal to its newest
// release. `1.1.0` is everything the worldclass epic added to `1.0.0`.
export const CATALOG_API_VERSION = "1.3.0";

/**
 * The keys `/v1/products` and `/v1/products/{slug}` serialize.
 *
 * Pinned as literals for the same reason `PUBLIC_PROFILE_KEYS` is: a shape
 * derived from an interface widens silently, and a shape derived from a
 * literal cannot. Invariant I8 checks these against the OpenAPI document AND
 * against what the website renders.
 */
export const CATALOG_CARD_KEYS = [
  "category",
  "hasLiveUrl",
  "hosting",
  "indexable",
  // PV0 — the observed row. This literal edit IS the reviewable act the
  // exact-key-set test forces, and I8 is what required it: the website shows
  // these four, so the API returns them.
  "language",
  "lastCommitAt",
  "licence",
  // MD0 — the media plane's first appearance on the wire. I8 in the other
  // direction, for once: nothing renders these yet, and the API returns them
  // anyway, because a machine consumer that has to wait for our renderer to
  // exist is not a first-class consumer (WC-9).
  "media",
  "metrics",
  "openIssues",
  "openRoles",
  "openingCommitments",
  "pricing",
  "publishedAt",
  "slug",
  "stack",
  "stackCanonical",
  "tagline",
] as const;

export const CATALOG_PRODUCT_KEYS = [
  ...CATALOG_CARD_KEYS,
  "components",
  // UV1 — see `CatalogProduct.launch`. I8 is what forced this literal edit.
  "launch",
  // PP5 — the history; I8 again.
  "launches",
  "liveUrl",
  "maintainers",
  "openings",
  // PV3 — the mark. Product-only, like the install line: the feed row shows a
  // count and not a mark, and a boolean on every card would invite an ordering
  // that counts EN3's defence twice.
  "cleanVotes",
  // PV2 — the install line. Product-only: a directory row does not show one,
  // and putting it on the card would ship a shell command in every row of a
  // document nothing renders it from.
  "installLine",
  // PV4 — the diff. Product-only: a card is a directory row and a history is
  // not one, and a diff on every card would put a week of somebody's edits in
  // a document nothing renders it from.
  "changes",
  // PP1 — the follower count, product-only like the mark.
  "followers",
  "pitch",
  "pitchDigest",
  "repoUrl",
  // OPR5 — the attested workspace's console ref (seam S12); I8 again.
  "workspaceRef",
]
  .slice()
  .sort() as readonly string[];
