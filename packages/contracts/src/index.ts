import type { MediaFact, MediaThumbnail } from "./media.js";
import type { Demand } from "./demand.js";
import type { Change } from "./snapshots.js";

// The public plane's wire contracts (saas-openproduct OD0).
//
// THE POINT OF THIS FILE. `PublicProfileCard` and `PublicProfile` are
// AUTHORED shapes, not "the internal profile minus some fields". A denylist
// projection widens silently every time someone adds a column; an allowlist
// cannot. OD3 pins both key sets with an exact-key-set test, so adding a field
// to any internal type cannot widen the public one, and adding a field HERE
// requires editing a literal — a reviewable act.
//
// Rule applied throughout: only platform-observed facts are projected.
// `licence` is on the page because the GitHub App reported it at publish
// (design.md §2.5); `blueprintId` / `baselineVersion` are NOT, because nothing
// observes them — projecting a maintainer's own claim would print it in the
// platform's voice. The pitch body is the one maintainer-authored blob on the
// page, and it is visibly the maintainer's voice.
//
// Nothing here carries an email, a member roster, an internal id, a run, an
// event, a secret name, or a spend figure. That is not an omission to be
// corrected later; it is the contract.

/** Lifecycle of a role a listed project is looking for. */
export const ROLE_OPENING_STATUSES = ["open", "filled", "closed"] as const;
export type RoleOpeningStatus = (typeof ROLE_OPENING_STATUSES)[number];

/** A profile's own publication state. Defaults to `private` at rest. */
export const PROFILE_VISIBILITIES = ["private", "public"] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];

/** What the GitHub App observed about the linked repo. */
export const REPO_VISIBILITIES = ["private", "public"] as const;
export type RepoVisibility = (typeof REPO_VISIBILITIES)[number];

// ---------------------------------------------------------------------------
// The public projection — served with no session, cacheable at the edge.
// ---------------------------------------------------------------------------

/** One row in the public directory. Deliberately thinner than the page. */
export interface PublicProfileCard {
  slug: string;
  tagline: string | null;
  /** The maintainer's own words, as written. */
  stack: string[];
  /** CT1 — the canonicalised subset, and the ONLY one facets and counts read.
   *  An entry the vocabulary did not recognise appears in `stack` and not
   *  here, which is what keeps a facet count honest without blocking anyone. */
  stackCanonical: string[];
  /** CT1 — assigned facets. Null means the listing has not answered; it is
   *  never a default bucket. */
  category: string | null;
  hosting: string | null;
  /** PP3 — the third assigned facet, same posture: null is unanswered. */
  pricing: string | null;
  /** CT1 — the licence the App observed at publish. Promoted to the card
   *  because the design shows it on every row, and because a directory of
   *  open products whose rows do not say what they are licensed under is not
   *  answering the first question a reader has. */
  licence: string | null;
  roleOpeningCount: number;
  /**
   * DS1 — the `openings` facet values this listing holds, DERIVED from the
   * commitment lines its open roles actually carry.
   *
   * Derived and sent rather than derived on the page, so the API and the
   * website filter by the same values — a facet the machine and the browser
   * disagree about is a facet whose count nobody can check. A listing with no
   * open roles holds `none-open`, which is a real answer: "nothing open" is
   * what a contributor looking for somewhere to help wants to exclude, and it
   * can only be excluded if it is a value.
   *
   * NOT called `openings`: `CatalogProduct.openings` is the list of ROLES,
   * and two fields a keystroke apart meaning "the roles" and "what the roles
   * ask for" is a bug waiting for a tired reviewer.
   */
  openingCommitments: string[];
  /** DS1 — whether there is something running to try. A boolean, not a URL:
   *  the card does not link out. */
  hasLiveUrl: boolean;
  /** TS1 — may crawlers amplify this listing. On the CARD as well as the page
   *  because the sitemap is built from the directory read, and a sitemap that
   *  advertises pages the page itself marks `noindex` sends a crawler two
   *  contradictory instructions about the same URL. */
  indexable: boolean;
  publishedAt: string | null;
  /** SN2 — what was observed about this listing. Empty when nothing was. */
  metrics: PublicMetric[];
  /** MD3 — the hero for the row's tile, or `null` for the monogram. Never an ordering input (OPC-4). */
  thumbnail: MediaThumbnail | null;
}

/** A maintainer as a visitor sees them: a name and a label, nothing else. */
export interface PublicMaintainer {
  /** Opaque subject id — the join key for PP's `<Person>`, never an email. */
  subjectId: string;
  /**
   * Resolved at read time over MEMBERSHIP_WORKER. Null when the subject can no
   * longer be resolved: the page renders PP's written fallback rather than an
   * id or an endless skeleton.
   */
  displayName: string | null;
  /** Maintainer-authored ("maintainer", "design lead"). */
  roleLabel: string | null;
  /**
   * CG4 — their handle, and PRESENT IF AND ONLY IF `/@handle` resolves.
   *
   * That biconditional is the whole value of the field: the page renders a
   * link when it is here and plain text when it is not, and never has to know
   * why (XP-5). The read applies both of the gates the profile itself applies
   * — their own opt-in, and standing — so "they have a public profile" and
   * "this link works" cannot come apart.
   */
  handle: string | null;
}

/** A role opening as a visitor sees it. */
export interface PublicRoleOpening {
  id: string;
  title: string;
  description: string | null;
  commitment: string | null;
  status: RoleOpeningStatus;
  /**
   * The listed apply door's TOKEN (OD4) — what `/join/{secret}` resolves — or
   * null before one is minted. Non-secret by design: it is printed on a public
   * page on purpose, and what bounds the door is its `project_viewer` ceiling,
   * `max_pending`, JR6's throttle and lockout, and one-click revoke.
   */
  joinLinkRef: string | null;
  /**
   * CB2 — how many people are waiting, ALREADY FLOORED (OPC-F).
   *
   * A union rather than a number, so an exact count below the floor has no
   * field to sit in. Core decides this; nothing downstream re-decides it, and
   * the raw number never crosses the seam.
   */
  demand: Demand;
}

/** The public project page. */
/** One entry of the curated components snapshot (openproduct-home OH4). */
export interface PublicComponent {
  name: string;
  kind: string | null;
}

/**
 * An observed number on a public page (openproduct-commons SN2).
 *
 * `observedAt` is REQUIRED, and that is the whole shape: invariant I9 says a
 * surface may render an observed value only beside the moment it was true, so
 * the wire type cannot express one without the other. A metric nobody has
 * read is ABSENT from `metrics` — never present with a zero.
 */
export interface PublicMetric {
  /** `merges.7d`, `last_touched.all` — the metric and its window. */
  key: string;
  value: number;
  /** ISO-8601. The moment, not the moment we served it. */
  observedAt: string;
  /** `fresh` or `stale`. Withdrawn and unobserved never reach the wire. */
  state: "fresh" | "stale";
}

export interface PublicProfile {
  slug: string;
  /**
   * The public workspace behind this listing, as the console addresses it
   * (`org_…`) — openproduct-reader OPR5, seam edge S12. Present only while
   * the listing holds a link grant, i.e. while its maker has attested a PUBLIC
   * workspace; `null` otherwise, and the page renders no door.
   *
   * Deliberately NOT the record's `orgId` (which the projection must never
   * carry — tenancy structure): this is the grant's attested, non-secret
   * workspace, the same class of fact as the printed door token, and the only
   * thing "View workspace on Orunbase" needs.
   */
  workspaceRef: string | null;
  /** PP1 — people following this listing, counted at read time and never listed (WC2-7, FL0). */
  followers: number;
  tagline: string | null;
  /** Canonicalized pitch body (CRLF → LF), as published. */
  pitch: string | null;
  /** Content address of `pitch` — `sha256:<hex>`. A cache key, and a receipt. */
  pitchDigest: string | null;
  /**
   * PV2 — one copyable install command, in the maintainer's own words.
   *
   * AUTHORED, and it may never be derived: a wrong observed licence is a
   * wrong label beside a value, and a wrong derived shell command is
   * something a person pastes into a terminal because this page presented
   * it. `null` is "this listing has no install line", not "we could not
   * work one out" — nothing here tries.
   */
  installLine: string | null;
  /**
   * PV3 — the clean-vote mark. A boolean and never a count: the ratio is
   * computed where the rows are, and this is all that leaves.
   *
   * `false` is AMBIGUOUS ON PURPOSE — most listings have too few upvotes to
   * check, and the page says so where the mark would have been, so an absent
   * mark is not a finding about anybody's product.
   */
  cleanVotes: boolean;
  /**
   * PV4 — what changed since the last snapshot, or `null` when there is no
   * earlier one.
   *
   * `null` RATHER THAN `[]`, and the distinction reaches the wire because it
   * reaches the reader: an empty list means "we compared and nothing moved",
   * while `null` means nobody has looked yet. A page that rendered the first
   * as the second would tell a reader a listing is unchanged when there was
   * never anything to compare it against.
   */
  changes: Change[] | null;
  /**
   * MD2 — the listing's media, in document order: the hero, then the gallery
   * in the maker's order, then the automated capture. Each row carries its
   * own provenance (MD0: `authored` never has a moment, `observed` always
   * does) and its own dimensions, so a renderer cannot draw an `<img>`
   * without `width` and `height`. Empty when a listing has none, and the page
   * draws nothing — no placeholder, no penalty (MD-3).
   */
  media: readonly MediaFact[];
  stack: string[];
  /** CT1 — see PublicProfileCard.stackCanonical. */
  stackCanonical: string[];
  category: string | null;
  hosting: string | null;
  /** PP3 — pricing, as the maintainers describe it. Authored, never a price
   *  this estate charges or checks. */
  pricing: string | null;
  repoUrl: string | null;
  liveUrl: string | null;
  /** SPDX id as GitHub reported it at publish, or null for an unlicensed repo. */
  licence: string | null;
  /**
   * PV0 — the observed row, and the moment behind all of it.
   *
   * `observedAt` IS THE GATE. Every one of these four came from one read of
   * the repository, and a value without its moment is a claim wearing a
   * fact's clothes — so they travel together, and a listing whose repository
   * has never been read carries `null` here and renders no observed row at
   * all (rather than four dashes, which would say "we looked and found
   * nothing").
   */
  observedAt: string | null;
  language: string | null;
  /** ISO 8601 — a PUSH, as GitHub reported it. See `repo.last-commit`. */
  lastCommitAt: string | null;
  /** GitHub's own count, which includes open pull requests. `null` is "not
   *  observed"; `0` is a repository with none open. */
  openIssues: number | null;
  /**
   * TS1 — may crawlers amplify this listing.
   *
   * A property of the LISTING, not of the visitor, so it lives happily in the
   * one cacheable document (I6 is untouched). Decided at publish from the
   * maker's trust level and raised when a human reviews — never recomputed at
   * read time, which would make it retroactive.
   */
  indexable: boolean;
  publishedAt: string | null;
  /** OH4 — the curated snapshot COPIED at publish (never live, never default):
   *  what the maintainer ticked in the disclosure dialog, as of publishedAt. */
  components: PublicComponent[] | null;
  maintainers: PublicMaintainer[];
  roleOpenings: PublicRoleOpening[];
  /** SN2 — see PublicProfileCard.metrics. */
  metrics: PublicMetric[];
  /**
   * UV1 — where this listing placed on the day it launched.
   *
   * ABSENT, NOT NULL, when there is nothing to say — no launch, or a launch
   * the sweep has not ranked yet. A `rank: null` on the wire would be a page
   * saying "we looked and it placed nowhere", and the two are different
   * claims (OPC-C). Optional, so a document cached before UV1 is still valid.
   *
   * THE ORDER IS THE BOARD'S, read rather than derived (OL-2a). This carries
   * a position the board already computed and published under
   * `launch.board-rank`, so the product page, the feed and the archive cannot
   * disagree about who was first on a given day.
   */
  launch?: PublicLaunchPlacement;
  /**
   * PP5 — every launch this listing has made, newest first, each with where
   * the board put it and how many spoke under it. ALWAYS PRESENT: a listing
   * that has never launched carries `[]`, which is a true sentence ("no
   * launches") rather than a claim about a count. The most recent one is
   * also `launch` above, in more detail; this is the history.
   */
  launches: PublicListingLaunch[];
}

/**
 * PP5 — one launch in a listing's history.
 *
 * READ FROM THE BOARD, NEVER DERIVED (OL-2a): `rank`, `of` and `counted` are
 * the feed's own rows for the launch's day. A day the sweep has not ranked
 * carries `rank: null`, `of: null`, `counted: null` — an honest absence,
 * never a zero (OPC-C) — while `commentCount` is a count of visible posts
 * and is zero when there are none.
 */
export interface PublicListingLaunch {
  /** The UTC day id, which is also the archive's address. */
  readonly day: string;
  readonly launchedAt: string;
  readonly versionLabel: string | null;
  readonly rank: number | null;
  readonly of: number | null;
  readonly counted: number | null;
  readonly commentCount: number;
}

export const PUBLIC_LISTING_LAUNCH_KEYS = [
  "commentCount",
  "counted",
  "day",
  "launchedAt",
  "of",
  "rank",
  "versionLabel",
] as const;

/**
 * A listing's placement on its launch day (openproduct-launch UV1).
 *
 * `counted` is the number that decided the position — upvotes received during
 * the day from accounts that already existed when it went live — and
 * `ineligible` is what makes the position accountable: a maker whose launch
 * was shared somewhere popular can reconcile it against the total on their
 * own page instead of concluding we cannot count. LC3 made that argument for
 * the board and it applies harder here, where the maker is standing.
 */
export interface PublicLaunchPlacement {
  /** The UTC day id, which is also the archive's address: `2026-08-26`. */
  readonly day: string;
  /** 1-based, and always present — a placement with no rank is not returned
   *  at all rather than returned with a hole in it. */
  readonly rank: number;
  /** How many launches shared the day, so a position reads as "3rd of 11"
   *  rather than as a bare ordinal a reader has no way to scale. */
  readonly of: number;
  readonly counted: number;
  readonly ineligible: number;
  /** The version the maker labelled it, when they labelled one. */
  readonly versionLabel: string | null;
  /** PP4 — where the launch stands on the CURRENT seven-day leaderboard, read
   *  from the same build the leaderboard page uses. `null` when the launch's
   *  day is outside the window, or the board has not ranked it: an honest
   *  absence, never a zero. */
  readonly week: PublicLaunchWeek | null;
}

/** PP4 — a launch's standing on the weekly leaderboard. */
export interface PublicLaunchWeek {
  /** 1-based position on the leaderboard whose window ends today. */
  readonly rank: number;
  /** How many launches the leaderboard ranked, so the position scales. */
  readonly of: number;
  /** The window's ends, inclusive, as day ids. */
  readonly from: string;
  readonly to: string;
}

export const PUBLIC_LAUNCH_PLACEMENT_KEYS = [
  "counted",
  "day",
  "ineligible",
  "of",
  "rank",
  "versionLabel",
  // PP4 — the weekly standing. This literal edit is the reviewable act.
  "week",
] as const;

/**
 * The pinned key sets. OD3's contract test asserts the serialized keys of both
 * shapes against these literals; they are duplicated from the interfaces on
 * purpose, because a literal is what makes widening the projection a visible
 * edit rather than an inference.
 */
export const PUBLIC_PROFILE_CARD_KEYS = [
  // CT1 — the second deliberate widening of this projection. Four keys, each
  // one a literal edit, which IS the reviewable act the exact-key-set test
  // exists to force.
  "category",
  // DS1 — the fourth widening. Two DERIVED values (`hasLiveUrl` here,
  // `openingCommitments` below): the rail cannot filter by a facet the
  // document does not carry, and computing them on the page instead would
  // let the API and the website disagree about what a facet means, which is
  // a count nobody can check.
  "hasLiveUrl",
  "hosting",
  "licence",
  // SN2 — the third widening of the card. Observed numbers, each carrying
  // the moment it was true (I9).
  "metrics",
  "openingCommitments",
  // PP3 — pricing on the card, so the filter page and the rail read it.
  "pricing",
  "publishedAt",
  "roleOpeningCount",
  "slug",
  "stack",
  "stackCanonical",
  "tagline",
  // MD3 — the row's picture. This literal edit is the reviewable act.
  "thumbnail",
] as const;

export const PUBLIC_PROFILE_KEYS = [
  // OH4 — the first deliberate widening: this literal edit IS the reviewable
  // act the exact-key-set test exists to force. CT1 is the second.
  "category",
  // PV3 — the clean-vote mark. A boolean and never a count; the literal edit
  // is the reviewable act the exact-key-set test forces.
  // PV4 — the diff. `null` when there is no baseline, which is a different
  // answer from an empty list and travels as one.
  "changes",
  "cleanVotes",
  "components",
  // PP1 — the follower count. A number, never a list (WC2-7).
  "followers",
  "hosting",
  // TS1 — whether crawlers may amplify this listing. A property of the
  // listing rather than of the visitor, so it sits in the cacheable document
  // without touching I6.
  "indexable",
  // PV2 — the install line. This literal edit IS the reviewable act the
  // exact-key-set test forces, and it is the only authored field on a listing
  // that a reader may RUN.
  "installLine",
  // UV1 — the sixth widening, and optional on the wire: a document cached
  // before it existed has no `launch` key and is still a valid one.
  "language",
  "lastCommitAt",
  "launch",
  // PP5 — the history. Always present; `[]` when there is none.
  "launches",
  "licence",
  "liveUrl",
  "maintainers",
  // MD2 — the media rows. This literal edit IS the reviewable act the
  // exact-key-set test forces; the rows themselves are MD0's shape.
  "media",
  // SN2 — see the card's literal.
  "metrics",
  // PV0 — the observed row's three new signals and the moment they share.
  // This literal edit IS the reviewable act the exact-key-set test forces.
  "observedAt",
  "openIssues",
  "pitch",
  "pitchDigest",
  // PP3 — the pricing field. This literal edit is the reviewable act.
  "pricing",
  "publishedAt",
  "repoUrl",
  "roleOpenings",
  "slug",
  "stack",
  "stackCanonical",
  "tagline",
  // OPR5 — the attested public workspace's console ref (seam S12). This
  // literal edit is the reviewable act the exact-key-set test forces.
  "workspaceRef",
] as const;

export const PUBLIC_COMPONENT_KEYS = ["kind", "name"] as const;

export const PUBLIC_METRIC_KEYS = ["key", "observedAt", "state", "value"] as const;

export const PUBLIC_MAINTAINER_KEYS = ["displayName", "handle", "roleLabel", "subjectId"] as const;

export const PUBLIC_ROLE_OPENING_KEYS = [
  "commitment",
  "demand",
  "description",
  "id",
  "joinLinkRef",
  "status",
  "title",
] as const;

/** The public directory response. */
export interface PublicDirectoryResponse {
  projects: PublicProfileCard[];
}

// ---------------------------------------------------------------------------
// The maintainer side — authenticated, policy-gated, never cached.
// ---------------------------------------------------------------------------

/**
 * The maintainer's own view of a profile. A superset of the public shape:
 * it carries the publication state, the review state, and what the App
 * observed — the three things the publish dialog needs in order to say why a
 * publish is or is not currently possible.
 */
export interface MaintainerProfile {
  id: string;
  projectId: string;
  slug: string;
  visibility: ProfileVisibility;
  tagline: string | null;
  pitch: string | null;
  pitchDigest: string | null;
  /** PV2 — the maintainer's own install command. Authored, never derived. */
  installLine: string | null;
  stack: string[];
  /** CT1 — what of `stack` the vocabulary recognised. The maintainer sees
   *  both halves, which is the facet picker's whole feedback loop: an entry
   *  that is in `stack` and not here is one nobody can filter by. */
  stackCanonical: string[];
  category: string | null;
  hosting: string | null;
  pricing: string | null;
  repoUrl: string | null;
  liveUrl: string | null;
  repoVisibility: RepoVisibility | null;
  repoLicence: string | null;
  repoCheckedAt: string | null;
  /**
   * IN2 — what the linked repository says about itself, observed at the last
   * check and stored BESIDE what the maintainer wrote rather than over it.
   *
   * `null` means not observed — never checked, unlinked, or private, whose
   * words are not ours to repeat. `repoTopics: []` is different: the
   * repository was read and declares none (OPC-C).
   */
  repoName: string | null;
  repoDescription: string | null;
  repoTopics: string[] | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  /** OH4 — the snapshot as last published; null = nothing chosen. */
  components: PublicComponent[] | null;
  createdAt: string;
  updatedAt: string;
  maintainers: PublicMaintainer[];
  roleOpenings: PublicRoleOpening[];
  /** OX5 — when the listing was linked to its workspace (the stored link
   * grant's grantedAt); null = pre-seam listing, publish refuses with
   * `workspace_link_required` until the link flow runs. */
  workspaceLinkedAt?: string | null;
}

export interface CreateProfileRequest {
  /** OX5 — the platform-minted listing link grant; the project binding comes
   * FROM it. Required since the seam replaced the interim create gate. */
  grant: string;
  /** Optional restatement; refused if it disagrees with the grant. */
  projectId?: string;
  slug: string;
  tagline?: string | null;
  pitch?: string | null;
  repoUrl?: string | null;
  liveUrl?: string | null;
  stack?: string[];
  /** CT1 — assigned facets, from the closed vocabularies in `facets.ts`.
   *  `null` clears; an unrecognised value is REFUSED rather than stored,
   *  because unlike `stack` these have no authored half to fall back to —
   *  an unrecognised category would be a bucket of one that no reader can
   *  filter by, and the refusal names the vocabulary so a maintainer can pick. */
  category?: string | null;
  hosting?: string | null;
  /** PP3 — the same rule as the two above. */
  pricing?: string | null;
}

export type UpdateProfileRequest = Partial<Omit<CreateProfileRequest, "projectId">>;

export interface UpsertRoleOpeningRequest {
  title: string;
  description?: string | null;
  commitment?: string | null;
  status?: RoleOpeningStatus;
  sortOrder?: number;
}

/**
 * openproduct-studio OSD7 — a person is named by their public `handle` (no
 * `@`; core resolves it to its ACTIVE holder and refuses an unknown one by
 * name) or, as before, by `subjectId`. Never by email, on either path.
 */
export type MaintainerEntry =
  | { handle: string; subjectId?: undefined; roleLabel?: string | null; sortOrder?: number }
  | { subjectId: string; handle?: undefined; roleLabel?: string | null; sortOrder?: number };

export interface SetMaintainersRequest {
  maintainers: MaintainerEntry[];
}

// ─── openproduct-home (OH0) — contributor-facing shapes ───
// Dormant until OH2 routes them. Everything keys on the subject id the
// identity scope's one read returns; nothing here carries an email or a
// platform-resolved name.

/** JR's own status vocabulary — the contributor view cannot invent a state. */
export const APPLICATION_STATUSES = ["pending", "approved", "denied", "withdrawn", "expired"] as const;
export type ApplicationStatusValue = (typeof APPLICATION_STATUSES)[number];

/** The contributor's authored presence on openproduct.live. */
export interface ContributorProfile {
  subjectId: string;
  /** Authored for this surface; null renders the OI display name. */
  displayName: string | null;
  bio: string | null;
  // ─── CG1 — the public half. Private surface, so these are the CONTROLS
  // rather than the projection: what the contributor set, so their own page
  // can show them what is public and let them change it.
  /** Their live handle, or null when they have not claimed one. */
  handle: string | null;
  /** Whether the public page exists. Their own act, and nothing else's. */
  profilePublic: boolean;
  openToProject: boolean;
  githubUrl: string | null;
  siteUrl: string | null;
  /** When the PUBLIC page began. Null while it never has. */
  publishedAt: string | null;
  /**
   * CG-2's second gate, resolved for the contributor's own eyes: do they
   * maintain a listing that is public? Sent so their page can tell them WHY
   * their profile is not visible, rather than leaving them to guess at a
   * toggle that appears to do nothing.
   */
  hasStanding: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The contributor's view of one application (a projection of a JR request). */
export interface ContributorApplication {
  id: string;
  profileId: string;
  roleOpeningId: string;
  /** The JR request's public id; null until the ask lands. */
  requestRef: string | null;
  status: ApplicationStatusValue;
  createdAt: string;
  /** The listed product's public identity (OH2) — slug and tagline, the card
   *  fields; null only if the join could not resolve. */
  productSlug: string | null;
  productTagline: string | null;
}

// ─── end openproduct-home (OH0) ───

/**
 * Why a publish cannot proceed. Each reason names something the maintainer or
 * an admin can act on — the OD6 dialog states the remedy rather than greying
 * out a button.
 */
export const PUBLISH_BLOCKERS = [
  // ─── openproduct-workspaces (OW4) ───
  /** The WORKSPACE is private (OW4): listings live on public workspaces, and a
   * private workspace cannot become public — the remedy is a new public
   * workspace over the same repository (the OW5 escape hatch). Ordered first:
   * it is the blocker every other remedy is pointless without. */
  "workspace_private",
  /** The listing carries no LINK GRANT (openproduct-independence OX5): the
   * platform's attestation that it may bind to its workspace + project. The
   * remedy is running the link flow — a workspace owner/admin mints the grant
   * on the platform console. Listings created before the seam start here. */
  "workspace_link_required",
  // ─── end openproduct-workspaces (OW4) ───
  /** The LINKED repo read back private at publish time. Flip it public on
   *  GitHub. (A listing with no repository at all is not blocked: since
   *  2026-09-03 `repo_unlinked` is retired — a founder lists a product before
   *  its code has a home, and the repository attaches when one is linked.) */
  "repo_private",
  /** First publish requires an admin review (README §Curation). Since TS1
   *  this is raised only for a `restricted` maker: a `new` maker publishes
   *  unindexed rather than waiting, and an `established` one publishes
   *  outright. The review path itself survives as the exception route. */
  "awaiting_review",
  /** A listing with no pitch is not a listing. */
  "pitch_missing",
  /** TS1 — this maker has been restricted after a sustained act. Reading is
   *  never restricted (OPX-2) and an appeal is always available (TS-4). */
  "restricted",
  /** TS1 — a maker who has never been reviewed may hold only so many
   *  unreviewed public listings at once. The number is stated in the refusal
   *  rather than implied, because a cap a person cannot see is a cap they
   *  experience as the product being broken. */
  "unreviewed_listing_cap",
] as const;
export type PublishBlocker = (typeof PUBLISH_BLOCKERS)[number];

export interface PublishProfileResponse {
  profile: MaintainerProfile;
}

export interface PublishBlockedResponse {
  blockers: PublishBlocker[];
}

// ---------------------------------------------------------------------------
// The catalog substrate (openproduct-commons CT0)
// ---------------------------------------------------------------------------
//
// Dormant on arrival: nothing in the read or write path returns a `Fact<T>`
// or a canonical facet value until CT1. What ships here is the CONTRACT —
// which is the point of shipping it first. Every later sub-epic's numbers
// have to fit a shape that was agreed before anyone had a number they wanted
// to make fit.

export * from "./provenance.js";
export * from "./facets.js";

// Trust and safety (openproduct-commons TS0) — the gate every later public
// write surface waits on (OPC-8).
export * from "./trust.js";

// Velocity (openproduct-commons TS2) — how fast a person may act, published
// where they can read it, and the gate EN2 and CB1 wait on (OPC-8).
export * from "./velocity.js";

// Endorsement integrity (openproduct-commons EN3) — what a public count is
// defended by, and the miss it admits to rather than pretending away.
export * from "./integrity.js";

// The signal plane (openproduct-commons SN0) — which metrics exist, how fresh
// each must be, and what a surface may render when one is not.
export * from "./signals.js";
// OB2 — merged changes, counted the way activity.merges.* says.
export * from "./merge-count.js";

// The public catalog API v1 (openproduct-commons CT2) — the shape a machine
// reads, and the OpenAPI document generated from the same literals.
export * from "./catalog-api.js";
/**
 * CS0 — the API's changelog and its stability policy: additive forever, a
 * dated notice for any removal, the changelog reconciled against the pinned
 * key sets by a test.
 */
export * from "./api-changelog.js";
/**
 * CS1 — the rate limit, published: the three buckets the gateway enforces,
 * the auth plane's four beside them, and the pure token-bucket step the
 * Durable Object and the in-isolate fallback both run.
 */
export * from "./rate-limits.js";
/**
 * OO0 — the three sentences the product promises, each with the constant
 * its number is read from; OO2 — the log vocabulary, closed.
 */
export * from "./slo.js";
export * from "./log-vocabulary.js";
/**
 * OO1 — the synthetic reader: its cadence, the failure modes an alert tells
 * apart, the runbook anchors every alert line carries (OO-3, OO-D).
 */
export * from "./synthetic.js";
/**
 * OO4 — the runbook as a registry: one page per sweep phase, the deploy
 * that lags main, and every anchor the page renders in one list.
 */
export * from "./runbook.js";
/** OO3 — which build is answering: the Worker version and its upload time, on `/health`. */
export * from "./build.js";
export * from "./openapi.js";

// The personalisation overlay (openproduct-commons XP2) — the only per-subject
// read on a public route: ids and integers, after paint, allowed to fail.
export * from "./overlay.js";

// The search index and its published ordering (openproduct-commons DS0) — the
// builder takes the public projection (DS-1) and the ranker is a formula, not
// a black box (OPC-4).
export * from "./search.js";

// The published ORDERS (openproduct-commons DS4) — one implementation per
// sentence at `/docs/formulas`, imported by every surface that ranks, so a
// reader's sentence cannot be true of one panel and false of another.
export * from "./ranking.js";
export * from "./build-orders.js";
export * from "./open-build.js";

// What a CRAWLER reads off a listing page (openproduct-commons DS4) — built
// from the same projection the page renders, and carrying no rating, ever.
export * from "./structured-data.js";

// The handle namespace (openproduct-commons CG0) — `/@ada` is a person and
// `/kettleworks` is a product, and the `@` is what keeps the two namespaces
// from needing a shared uniqueness table (OPC-B).
export * from "./handles.js";

// The public contributor profile (openproduct-commons CG1) — authored fields
// only (CG-4), two gates in front of it (CG-2), and stats that refuse to
// invent (CG-5).
export * from "./profiles.js";

// The two-sided edge (openproduct-commons CG3) — a listing says who is on it,
// a person says whether that is true, and the public sees only the agreement.
export * from "./roster.js";

// The endorsement (openproduct-commons EN0) — the PUBLIC act, kept a separate
// object from the private save that OD promised would never be counted
// (OPC-3, EN-1). Dormant until EN1.
export * from "./endorsements.js";

/**
 * LC0 — the launch object: publishing makes a page exist, launching puts it
 * in front of people. Carries the once-per-version rule, which is a
 * maintainer-declared label AND a published cooldown, because neither half
 * alone stops a re-post treadmill.
 */
export * from "./launches.js";

/**
 * LC1 — the week as an address, and the digest published at it. ISO weeks,
 * one spelling per week, and a page that reads correctly when the week held
 * nothing.
 */
export * from "./weeks.js";
export * from "./digest.js";

/**
 * LC2 — the directory's strip. Widens its window until the number is worth
 * saying, names the window on screen, and stops claiming recency altogether
 * rather than announcing `0 new` (OPC-H).
 */
export * from "./freshness.js";
export * from "./sweep-health.js";
export * from "./sweep-copy.js";
export * from "./sweep-schedule.js";

/**
 * TS3 — consequence, and what is left behind. Moderation state is a SEPARATE
 * axis from `visibility` (a removal the subject can undo is not a removal,
 * and a private listing 404s, which TS-3 forbids), and every act leaves a
 * tombstone carrying the state and the date — never the reason, never the
 * actor, never the reporter.
 */
export * from "./moderation.js";

/**
 * CB0 — threads and posts, DORMANT until CB1's gate (TS2 + TS3) is satisfied.
 * The render subset is separate and is the part with an attacker on the other
 * side of it: a closed set of node kinds producing a TYPED TREE rather than
 * markup, so no call site could inject even if it wanted to.
 */
export * from "./discussions.js";
export * from "./render-subset.js";

/**
 * CB2 — the demand signal, floored at three (OPC-F). The mock's
 * `1 waiting on a decision` is not shippable as drawn: on a small opening,
 * beside a visible activity feed, "1 waiting" is a name.
 */
export * from "./demand.js";

/**
 * CB3 — the decision trail. An acceptance is published and names a person;
 * a decline is SILENT by default, and publishing one is an explicit act with
 * the maintainer'''s own words and nobody'''s name.
 */
export * from "./decisions.js";

/**
 * CB4 — notifications. I3 is the shape: nothing here has a field for an
 * address. Participation is the subscription, the actor is never told about
 * their own act, and the body carries nothing that is not already public.
 */
export * from "./notifications.js";

/**
 * TS4 — spam, slop and brigading. Signals, never decisions: `FlagConsequence`
 * has no member that deletes, there is no detector for who wrote something,
 * and the launch board answers brigading by changing what it counts rather
 * than by classifying anybody.
 */
export * from "./defence.js";

/**
 * LC3 — the launch board. A day is the unit and a settled day is final; the
 * rank counts only what TS4's eligibility rule allows, which answers a bought
 * audience by changing what the number is made of rather than by detecting
 * anybody.
 */
export * from "./board.js";

/**
 * OL2 — the launch feed, the front page. Grouping and presentation ONLY: the
 * order is the board's, resolved through the same `launch.board-rank`
 * formula, because a front page and an archive that ranked a day separately
 * would be two answers to one question (OL-2a).
 */
export * from "./feed.js";

/**
 * UV2 — the leaderboard. It DOES produce an order, and the reason that is not
 * a second board is written out at the top of the module: a day's board cannot
 * answer "which launch got the most upvotes this week", and every number this
 * orders is the one the board already published for that launch's own day.
 */
export * from "./leaderboard.js";

/**
 * TP0 — topic pages. A topic IS a CT1 category value, which is what keeps the
 * estate from growing a second taxonomy beside the one it canonicalises; the
 * long argument, including why `/topics/x` is not `/products?category=x`, is
 * at the top of the module.
 */
export * from "./topics.js";

/**
 * VC1 — the other half of the audit's missing filters. A stack value becomes
 * an address too, and the module's header says why it is the DIRECTORY
 * filtered where a topic is the BOARD filtered: fifty-seven values against a
 * week of launches would be fifty-seven empty boards.
 */
export * from "./stacks.js";
export * from "./pricing.js";
export * from "./marks.js";
export * from "./launch-health.js";
export * from "./forum.js";

/**
 * AG1 — the agent surface's tool set, and the pure filter behind it. The
 * module header carries WC-9's argument: the tools return the catalog card
 * verbatim, so "every field is returnable by the API" is a shape rather than
 * an agreement.
 */
export * from "./agent.js";

/**
 * FL0 — follows. One act with two targets, private to the follower and
 * visible to the followed only as a count; the module's own comment says why
 * that is one table and one control rather than two of each.
 */
export * from "./follows.js";

/**
 * FL1 — the feed's sidebar. Four panels, four published orderings, and no
 * behavioural signal in any of them; the module's comment says why two of the
 * design's headings did not survive that rule.
 */
export * from "./sidebar.js";

/**
 * MP0 — the maker page's three tabs. What a person DID, beside what CG1
 * already published about their standing: launched, upvoted, commented. The
 * long argument for why an upvote may be listed in public — and why a save
 * never will be — is at the top of the module.
 */
export * from "./maker.js";

/** RE4 — the embeddable badge. A public SVG with no subject, at a stable
 *  address, on the one surface strangers hotlink. */
export * from "./badge.js";

/** RE3 — sharing a listing, with no third-party script. */
export * from "./share.js";

/**
 * NF0 — the inbox. Four kinds, no stored prose, and a read CURSOR rather than
 * a flag per row. The design's fifth kind is refused, and the module says why:
 * FL0 promised people a follower count and never a name.
 */
export * from "./inbox.js";

/**
 * AC0 — the credential store, DORMANT: nothing here is reachable yet.
 *
 * The one thing to know is that it holds NO ADDRESS — not in the schema, not
 * in these types, not for a moment between sign-up and verification. The plan
 * asked for an `email` column and R1's binding text allowed one until
 * verification; both lose to I3 as written ("no email column exists anywhere
 * in the openproduct schema", enforced by an `information_schema` query) and
 * to R1's own decision that openproduct holds nothing. The TOKEN carries the
 * address and the PLATFORM holds it; openproduct gets a subject id back. The
 * module says what that buys and what it costs.
 */
export * from "./credentials.js";
export * from "./sessions.js";

/**
 * SR0 — the search results page. Three sections, three mechanisms: launches
 * come from the DS0 index, TOPICS from this package's own vocabulary, and
 * MAKERS from a live read — because an index is a cache, and caching an
 * eligibility decision about a person means the stale copy says "still
 * findable" after they turned their profile off.
 */
export * from "./search-page.js";

/**
 * LC4 — collections. The one place editorial judgement is allowed, because it
 * is the one place it is attributable: a collection carries its curator's
 * handle, that handle has to resolve, and the order is theirs and nothing
 * re-ranks it.
 */
export * from "./collections.js";

/**
 * LC5 — the digest by email. I3 for the second time: nothing here has a field
 * for an address. Opt-IN, inverting CB4's default, because a broadcast nobody
 * asked for by acting is a different consent from a reply in a thread you
 * joined.
 */
export * from "./digest-mail.js";

/**
 * TS5 — appeals. The half of TS-4 that gives an act an answer: an appeal
 * names the ACT rather than the thing, so upholding one knows what to undo,
 * and the vocabulary's pairing (remove/restore, delist/relist,
 * deindex/reindex) is finally what makes the reversal mechanical.
 */
export * from "./appeals.js";

/**
 * TS5 — the transparency record. The other half of TS-4: generated from the
 * append-only ledger rather than written by hand from it, so what is
 * published and what was done cannot drift. The one page on the estate where
 * a zero means zero, because these are records of our own acts rather than
 * observations of the world.
 */
export * from "./transparency.js";

/**
 * IN0 — the intake preview. A draft, mapped once into the feed's own row
 * shape so the form and the feed cannot disagree about what a listing will
 * look like, with every unknown left as its own absence rather than filled in
 * with a placeholder — and with the one thing this layer has no authority to
 * guess, the address, stated rather than invented.
 */
export * from "./intake.js";
export * from "./launch-act.js";
export * from "./maker-marks.js";
export * from "./people-filters.js";

/**
 * PV0 — the observed row. Four signals a public repository read can see, each
 * with the moment it was read and the address of the rule that produced it —
 * and a horizon past which an observation is withdrawn rather than presented
 * as current. There is no tests figure, because the source cannot see CI.
 */
export * from "./observed.js";

/**
 * MD0 — the media model. Three kinds split by TRUST CLASS rather than by
 * shape (WC-3): a hero and a gallery are the maker's own and never stale; a
 * screenshot carries the moment it was captured and is withdrawn past its
 * window rather than frozen. `MediaFact` is a union, so a screenshot in the
 * hero slot is a compile error rather than a review comment — and the
 * migration refuses the same row independently.
 */
export * from "./media.js";

/**
 * PV2 — alternatives, and the reason beside every one. Ordered by what two
 * listings SHARE and by nothing else: no behavioural signal, no popularity
 * term and no clock, so the panel is the same for every reader and the same
 * tomorrow. Two unobserved licences are not a match — that would manufacture
 * a shared property out of two of OPC-C's dashes.
 */
export * from "./alternatives.js";

/**
 * PV2 — the install line. The one field on a listing that MAY NEVER BE
 * DERIVED: a wrong observed licence is a wrong label, and a wrong derived
 * shell command is something a person pastes into a terminal because this
 * page presented it. Authored, one command, and a piped installer is refused
 * because a reader cannot see what it runs.
 */
export * from "./install.js";

/**
 * PV3 — the clean-vote mark. A boolean over a ratio, never a count: EN3's
 * fifth decision (nothing per-person is ever exposed) and PV3's own done-when
 * (nothing reveals a per-listing suppression count) both hold, because the
 * ratio is computed where the rows are and only the mark leaves. The FLOOR is
 * the privacy mechanism — it makes an absent mark ambiguous between "too few
 * upvotes to check" and "checked and did not clear", so absence is not an
 * accusation a machine made in public.
 */
export * from "./clean-vote.js";
export * from "./completeness.js";
export * from "./media-serving.js";
/**
 * MD4 — observed screenshots: the capture policy. Which listings are asked,
 * how often, what address may be visited, where the browser is (a pinned
 * URL, never a binding), the per-run cap, and the closed list of failures.
 */
export * from "./media-capture.js";
/**
 * OS1 — pagination as the published ordering, cut into pages: the cursor's
 * three keys and its codec, the page size and its ceiling, the page's keys.
 */
export * from "./pagination.js";

/**
 * PV4 — snapshot diffs. "What changed since last week", and a digest that
 * leads with a change rather than a count. THE FIRST SNAPSHOT PRODUCES NO
 * DIFF (`null`, never `[]`): a diff against nothing would render every field
 * as changed, announcing that a product rewrote its whole listing on the day
 * we started looking. And an AUTHORED change and an OBSERVED one are
 * different events — OPC-2 applied to time — so a maintainer's edit and a
 * repository's licence moving never render alike. Nothing here orders the
 * product: "recently updated" is an engagement term wearing a timestamp.
 */
export * from "./snapshots.js";
