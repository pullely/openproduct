// The openproduct repository's own types (saas-openproduct OD0).
//
// Row shapes and inputs only. The WIRE shapes live in
// @saas/contracts/openproduct and are assembled by the worker — this module
// deliberately does not import them, so a change to the public projection can
// never reach into SQL by accident, and vice versa.

import type { Uuid } from "./ids.js";

export type ProfileVisibility = "private" | "public";
export type RepoVisibility = "private" | "public";
export type RoleOpeningStatus = "open" | "filled" | "closed";

/** A profile as this schema stores it. Ids are UUIDs; actors are opaque text. */
/** One curated snapshot entry (OH4). Name and kind, nothing else — an
 *  architecture map is exactly what the projection must not become. */
export interface ProfileComponent {
  name: string;
  kind: string | null;
}

export interface ProfileRecord {
  id: string;
  orgId: string;
  projectId: string;
  slug: string;
  visibility: ProfileVisibility;
  tagline: string | null;
  pitchBody: string | null;
  /**
   * PV2 — one copyable install command, AUTHORED by the maintainer.
   *
   * Declared beside the pitch rather than with the `repo_*` family, and that
   * placement is the decision: it may never be derived from a repository,
   * because a wrong observed licence is a wrong label and a wrong derived
   * shell command is something a person pastes into a terminal.
   */
  installLine: string | null;
  /**
   * PV3 — the clean-vote mark. A BOOLEAN AND NEVER A COUNT: the ratio is
   * computed in `countEndorsements`, where `endorsement_integrity` is joined,
   * so the suppression count has nowhere to travel (EN3 decision 5).
   *
   * `false` is ambiguous on purpose — it covers both "too few upvotes to
   * check", which is most listings, and "checked and did not clear the bar".
   * Nothing distinguishes them, which is what stops an absent mark being an
   * accusation.
   */
  cleanVotes: boolean;
  pitchDigest: string | null;
  repoUrl: string | null;
  liveUrl: string | null;
  /** The maintainer's own words. Untouched by canonicalisation — an entry we
   *  do not recognise stays exactly as written (CT-1). */
  stack: string[];
  /** CT1 — the RESOLVED subset of `stack`, and the only one facets read. */
  stackCanonical: string[];
  /** CT1 — assigned facets. Null means the listing has not answered; it is
   *  never a default bucket, and never rendered as one. */
  category: string | null;
  hosting: string | null;
  /** PP3 — the third assigned facet. Same posture as the two above. */
  pricing: string | null;
  repoVisibility: RepoVisibility | null;
  repoLicence: string | null;
  repoCheckedAt: string | null;
  /** IN2 — observed from the linked repository, never authored. `null` means
   *  not observed; `[]` in `repoTopics` means observed and empty. */
  repoName: string | null;
  repoDescription: string | null;
  repoTopics: string[] | null;
  repoLanguage: string | null;
  repoPushedAt: string | null;
  /** `null` is "not observed"; `0` is a repository with none open. */
  repoOpenIssues: number | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  publishedAt: string | null;
  /** TS1 — may crawlers amplify this listing. Decided at publish from the
   *  maker's trust level and raised when a human reviews. NEVER recomputed at
   *  read time: that would make it retroactive. */
  indexable: boolean;
  /** OH4 — the curated snapshot copied at publish; null = nothing chosen. */
  components: ProfileComponent[] | null;
  linkGrant: StoredLinkGrant | null;
  /**
   * TS3 — what the ESTATE did, on its own axis. Never a value of
   * `visibility`, which is the maintainer's switch: a removal they can flip
   * back is not a removal, and a private listing 404s where TS-3 requires a
   * tombstone. Read together with `visibility`, never instead of it.
   */
  moderationState: ModerationStateName;
  /** When the act producing `moderationState` occurred. Null iff visible. */
  moderatedAt: string | null;
  /** The append-only act that produced it, so a tombstone traces to an appeal. */
  moderationActId: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * What one subject's overlay read returns (XP2). Ids and integers only — no
 * row here can be rendered, only used to mark something the cached document
 * already rendered as belonging to this visitor.
 */
export interface OverlayRecord {
  /** The subset of the QUERIED slugs this subject saved. PRIVATE. */
  savedSlugs: string[];
  /** The subset of the QUERIED slugs this subject ENDORSED. PUBLIC (EN1). */
  endorsedSlugs: string[];
  /** The account's total, which is a different number from `savedSlugs.length`. */
  savedCount: number;
  requestCount: number;
  listingCount: number;
}

/** One row of the search index. Mirrors the contract's `IndexDocument`. */
export interface SearchIndexRow {
  kind: string;
  entityId: string;
  title: string;
  summary: string | null;
  /** Readonly so the contract's `IndexDocument` is assignable here directly —
   *  the builder's output IS the write input, with no copy in between that
   *  could quietly reshape it. */
  terms: readonly string[];
  facets: Readonly<Record<string, readonly string[]>>;
}

/**
 * The rebuild floor's state.
 *
 * `builtAt === null` means the index has never been built, which is a
 * different thing from "built and now stale" — the first must build even
 * inside the floor, because an empty index answers every query with nothing
 * and that reads as "this commons has no products in it".
 */
/**
 * The sweep ledger's phases (openproduct-worldclass-v2 LI0). The same seven
 * names the contract's `SWEEP_PHASES` carries, declared here rather than
 * imported so this module keeps its rule: row shapes, never wire shapes. The
 * two are structurally identical and the contract's test pins that.
 */
export const SWEEP_LEDGER_PHASES = ["catalogue", "searchIndex", "integrity", "defence", "board", "digest", "snapshots"] as const;
export type SweepLedgerPhase = (typeof SWEEP_LEDGER_PHASES)[number];

/** One phase's singleton row, as the ledger reads it. */
export interface SweepPhaseStateRecord {
  lastRunAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

/** What the gateway saw of one phase this tick. */
export interface SweepOutcomeInput {
  phase: SweepLedgerPhase;
  ok: boolean;
  reason: string | null;
}

export interface SearchIndexState {
  builtAt: string | null;
  dirtyAt: string | null;
}

/**
 * A handle row (CG0). A RESERVED row has a `reservedFor` and no holder; a
 * RELEASED row has a `releasedAt` and no holder; a live row has a holder.
 * All three are rows, because a released handle is a tombstone rather than a
 * free slot — see the 1360 migration for why that trade is worth making.
 */
export interface HandleRecord {
  handle: string;
  subjectId: string | null;
  reservedFor: string | null;
  claimedAt: string | null;
  releasedAt: string | null;
}

/**
 * EN0 — one endorsement at rest.
 *
 * `withdrawnAt` set means it was taken back and the row SURVIVES; `pending`
 * means the act is recorded but does not count yet (TS1's floor). Both are
 * different from a row that does not exist.
 */
export interface EndorsementRecord {
  profileId: string;
  subjectId: string;
  state: "confirmed" | "pending";
  createdAt: string;
  withdrawnAt: string | null;
}

/** A directory row. Only what the card needs — the list read never loads pitches. */
export interface ProfileCardRecord {
  slug: string;
  tagline: string | null;
  stack: string[];
  /** CT1 — what the card filters and counts by. */
  stackCanonical: string[];
  category: string | null;
  hosting: string | null;
  pricing: string | null;
  /** Observed at publish, not a maintainer's claim (OD-F). */
  licence: string | null;
  /** PV0 — the rest of the observed row, and the moment behind all of it. On
   *  the card as well as the profile, so the catalog answers both from one
   *  shape (WC-9). */
  language: string | null;
  lastCommitAt: string | null;
  openIssues: number | null;
  observedAt: string | null;
  roleOpeningCount: number;
  /** DS1 — the AUTHORED commitment lines of the open roles, verbatim. The
   *  contract folds them to `openings` facet values; what it does not
   *  recognise stays the maintainer's words and never becomes a count. */
  openCommitments: string[];
  /** DS1 — whether something is running to try. A boolean, not the URL: the
   *  card does not link out, so carrying the address would widen the public
   *  projection for a filter's benefit. */
  hasLiveUrl: boolean;
  /** TS1 — may crawlers amplify this listing. */
  indexable: boolean;
  publishedAt: string | null;
}

export interface RoleOpeningRecord {
  id: string;
  profileId: string;
  title: string;
  description: string | null;
  commitment: string | null;
  status: RoleOpeningStatus;
  joinLinkRef: string | null;
  sortOrder: number;
}

export interface PublishedMaintainerRecord {
  profileId: string;
  subjectId: string;
  /** Maintainer-authored (OD3, migration 1170) — never a platform identity claim. */
  displayName: string | null;
  roleLabel: string | null;
  sortOrder: number;
}

/**
 * One person on a listing's PUBLIC roster.
 *
 * A separate type from `PublishedMaintainerRecord` rather than a widening of
 * it, because the two are answers to different questions. That one is the
 * maintainer's own publication list — what they typed, in their order — and
 * `setMaintainers` returns it. This one is that list RECONCILED with consent
 * (CG3) and with the reader's ability to follow a name somewhere (CG4), and
 * only a public read can answer it. Merging them would have put a `handle`
 * field on a write path that has no way to fill it.
 */
export interface PublicMaintainerRecord {
  subjectId: string;
  displayName: string | null;
  roleLabel: string | null;
  /**
   * CG4 — non-null IF AND ONLY IF `/@handle` resolves, so a caller can render
   * a link on presence alone and never has to ask why (XP-5). Both of the
   * gates the profile read applies are applied here: their own opt-in, and
   * standing.
   */
  handle: string | null;
}

/** LC0 — one launch, as the studio and the sweep see it. */
export interface LaunchRecord {
  id: string;
  profileId: string;
  state: "scheduled" | "live" | "cancelled" | "missed";
  versionLabel: string;
  scheduledFor: string;
  launchedAt: string | null;
  cancelledAt: string | null;
  missedAt: string | null;
  scheduledBy: string;
  /**
   * LC3 — when this launch's board day was last ranked, or null.
   *
   * LC0 created the column and deliberately left nothing writing it; LC3 is
   * what fills it. Surfaced on the record rather than left in the table
   * because "has this day been ranked" is an operator's question, and
   * answering it from a metric's ABSENCE cannot distinguish "not ranked yet"
   * from "ranked, and the answer was nobody".
   */
  boardRankAt: string | null;
}

/** LC0 — what `checkLaunchable` needs to answer, read in ONE query. */
export interface LaunchEligibility {
  /** Null when the listing does not exist or is not this org's. */
  profileId: string | null;
  /** The listing's slug — so the studio can name what it is looking at
   *  rather than echoing an opaque id back at its own maintainer. */
  slug: string | null;
  isPublished: boolean;
  /** Versions held by a scheduled or live launch. */
  consumedVersions: string[];
  /** When this listing last went live, if ever. */
  lastLaunchedAt: string | null;
  hasScheduled: boolean;
}

export interface ScheduleLaunchInput {
  id: Uuid;
  profileId: Uuid;
  versionLabel: string;
  scheduledFor: string;
  scheduledBy: string;
}

/** LC1 — one launch inside a digest's week. */
export interface DigestLaunchRecord {
  slug: string;
  tagline: string | null;
  versionLabel: string;
  launchedAt: string;
}

/** LC1 — one listing in a week's most-endorsed. */
export interface DigestEndorsedRecord {
  slug: string;
  tagline: string | null;
  endorsements: number;
}

/** LC1 — a week's signed note, with its author's handle resolved. */
export interface DigestNoteRecord {
  weekId: string;
  body: string;
  /** CG1's handle, or null when the author has no public profile — the page
   *  renders plain text rather than a dead link (XP-5). */
  byHandle: string | null;
  writtenAt: string;
}

export interface CreateProfileInput {
  id: Uuid;
  orgId: Uuid;
  projectId: Uuid;
  slug: string;
  createdBy: string;
  tagline?: string | null | undefined;
  pitchBody?: string | null | undefined;
  pitchDigest?: string | null | undefined;
  repoUrl?: string | null | undefined;
  liveUrl?: string | null | undefined;
  stack?: string[] | undefined;
  linkGrant?: StoredLinkGrant | null | undefined;
}

export interface UpdateProfileInput {
  slug?: string | undefined;
  tagline?: string | null | undefined;
  pitchBody?: string | null | undefined;
  /** PV2 — authored, never derived. Explicitly clearable. */
  installLine?: string | null | undefined;
  pitchDigest?: string | null | undefined;
  repoUrl?: string | null | undefined;
  liveUrl?: string | null | undefined;
  /** Authored, as written. The repository derives `stack_canonical` from it —
   *  the caller never supplies both, so the two cannot be set out of step. */
  stack?: string[] | undefined;
  /** CT1 — assigned facets. `null` clears; omitted leaves unchanged. Both are
   *  meaningful: clearing says "we do not answer this", which is not the same
   *  as never having been asked. */
  category?: string | null | undefined;
  hosting?: string | null | undefined;
  pricing?: string | null | undefined;
  updatedBy: string;
}

/** What the GitHub App observed, written on the authenticated path only.
 *  `repoVisibility: null` records "checked, and there is no repository to
 *  observe" — it clears an earlier reading rather than leaving it to block a
 *  listing whose link has since been removed. */
export interface RepoObservation {
  repoVisibility: RepoVisibility | null;
  repoLicence: string | null;
  observedAt: string;
  /**
   * IN2 — what the repository says about itself, alongside what it is.
   *
   * Optional so a caller that has not been taught to observe them writes
   * NULL rather than failing to compile; `null` and absent both mean "not
   * observed", which is distinct from an empty description a repository
   * really has.
   */
  repoName?: string | null;
  repoDescription?: string | null;
  repoTopics?: string[] | null;
  /** PV0 — the rest of what a public repository read can see. No `repoTests`:
   *  a `declared_repo` read cannot see CI, and an absent field is honest
   *  where a guessed one would not be. */
  repoLanguage?: string | null;
  repoPushedAt?: string | null;
  repoOpenIssues?: number | null;
}

export interface UpsertRoleOpeningInput {
  id: Uuid;
  profileId: Uuid;
  title: string;
  description?: string | null | undefined;
  commitment?: string | null | undefined;
  status?: RoleOpeningStatus | undefined;
  sortOrder?: number | undefined;
}

export interface MaintainerInput {
  subjectId: string;
  displayName?: string | null | undefined;
  roleLabel?: string | null | undefined;
  sortOrder?: number | undefined;
}

/**
 * The repository seam.
 *
 * Note the deliberate asymmetry between the two read families. The three
 * `*Public*` methods filter `visibility = 'public'` INSIDE the method — there
 * is no public-read function that can return a private row, so a future
 * handler bug cannot leak one (design.md §5). The org-scoped methods do not
 * filter, because a maintainer must be able to see their own draft.
 */
// ─── openproduct-home (OH0) ───

/** JR's own status vocabulary — the projection cannot invent a state. */
export type ApplicationStatus = "pending" | "approved" | "denied" | "withdrawn" | "expired";

export interface ContributorRecord {
  subjectId: string;
  displayName: string | null;
  bio: string | null;
  /** CG1 — the contributor's own opt-in. Nothing but their act sets it. */
  profilePublic: boolean;
  openToProject: boolean;
  githubUrl: string | null;
  siteUrl: string | null;
  /** When the PUBLIC page began, not when the account was created. */
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertContributorInput {
  subjectId: string;
  displayName?: string | null;
  bio?: string | null;
  /** CG1 — omitted leaves unchanged; the fields are separately clearable
   *  because clearing a link is a thing people do. */
  githubUrl?: string | null;
  siteUrl?: string | null;
  openToProject?: boolean;
}

/**
 * CG1 — a contributor's public page, as the repository assembles it.
 *
 * Returned only when BOTH gates pass: they opted in, and they maintain a
 * listing that is itself public. The second is a join rather than a column,
 * so a page cannot outlive the standing it was granted for.
 */
export interface PublicContributorRecord {
  handle: string;
  displayName: string | null;
  bio: string | null;
  githubUrl: string | null;
  siteUrl: string | null;
  openToProject: boolean;
  publishedAt: string;
  maintains: Array<{ slug: string; tagline: string | null }>;
  /**
   * CG4 — listings they confirmed a place on and do NOT run, with `maintains`
   * subtracted so the two stats never describe the same product twice. A
   * listing they have since retired from still appears: the work happened,
   * and a profile that erased them on the way out would make leaving cost
   * something.
   */
  contributesTo: Array<{ slug: string; tagline: string | null }>;
}

/**
 * CG2 — one row of the contributors directory.
 *
 * Deliberately narrower than `PublicContributorRecord`: no links. A directory
 * that shipped every contributor's GitHub and personal site in one response
 * would be a link-harvesting endpoint wearing a card grid.
 */
export interface PublicContributorCardRecord {
  handle: string;
  displayName: string | null;
  bio: string | null;
  openToProject: boolean;
  /** Slugs only — the count's evidence, not a second listing directory. */
  maintains: string[];
  /** CG4 — counted, not named: a card that listed both sets would be a
   *  listing directory wearing a person's face. The page names them. */
  contributesTo: number;
  /** PE3 — a listing they maintain has gone live. */
  launched: boolean;
}

/** EN3 — one endorsement, as the integrity sweep sees it. Ids and times. */
export interface IntegrityObservationRecord {
  profileId: string;
  subjectId: string;
  createdAt: string;
  /** When this subject first endorsed ANYTHING here. */
  subjectFirstSeenAt: string;
}

export interface RestateIntegrityInput {
  /** Every (listing, subject) the sweep currently judges discountable. */
  readonly findings: ReadonlyArray<{ profileId: string; subjectId: string; reason: string }>;
  /** The window the sweep looked at — anything discounted inside it and NOT
   *  in `findings` is reversed. Bounding the reversal to the window is what
   *  stops a short sweep from silently restoring every historical discount. */
  readonly windowStart: string;
  /**
   * The reasons THIS sweep is responsible for. The reversal half touches
   * only discounts carrying one of them.
   *
   * ADDED WHEN TS4 ARRIVED, and it is a correctness fix rather than a
   * generalisation. EN3's reversal was bounded by window alone, which was
   * complete while EN3 was the only sweep writing to this table. TS4 writes
   * `cohort` discounts to endorsements at least three days old — inside EN3's
   * seven-day window — so without this bound EN3's next run would reverse
   * every cohort discount it had never heard of, TS4 would re-apply it six
   * hours later, and the two sweeps would fight forever over a number the
   * estate publishes.
   *
   * A sweep reverses its own opinions and leaves everybody else's alone.
   */
  readonly reasons: readonly string[];
  readonly decidedBy: string;
  readonly at: string;
}

// ─── TS4 — the flag queue and what the defence sweep reads ───

/** One row in TS4's queue. Prose evidence, never a score (see 1480). */
export interface FlagRecord {
  id: string;
  kind: string;
  subjectKind: string;
  subjectRef: string;
  state: string;
  evidence: string;
  /** What was done automatically when it was raised: 'deindex', 'discount'
   *  or 'queue-only'. Recorded on the flag so a triager can see what has
   *  ALREADY happened to the thing they are looking at — without which
   *  "restore it" is an instruction nobody can follow. */
  consequence: string;
  raisedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface RaiseFlagInput {
  readonly id: Uuid;
  readonly kind: string;
  readonly subjectKind: string;
  readonly subjectRef: string;
  readonly evidence: string;
  readonly consequence: string;
  readonly at: string;
  /**
   * Raise this at most ONCE for this (thing, kind), ever — resolved flags
   * included, not just open ones.
   *
   * For the kinds whose evidence is frozen history (see the contract's
   * `FLAG_RECURS`). Without it a dismissed cohort flag returns on the next
   * sweep and every sweep after, because the accounts in it have already gone
   * quiet and the pattern can never change again.
   */
  readonly once?: boolean;
}

/** A listed pitch, for the filler check. Carries the slug because a flag
 *  addresses a thing by its PUBLIC ref, so the queue row survives the row it
 *  was raised about. */
export interface PitchRecord {
  profileId: string;
  slug: string;
  tagline: string | null;
  pitchBody: string | null;
}

/** One act, shaped for cohort detection. Same posture as EN3's observation:
 *  ids and times, and `subjectFirstSeenAt` means their history HERE. */
export interface CohortObservationRecord {
  subjectId: string;
  targetRef: string;
  actedAt: string;
  subjectFirstSeenAt: string;
}

/** A live launch and the account ages behind its endorsements. */
export interface LaunchEndorsementRecord {
  launchId: string;
  profileId: string;
  slug: string;
  launchedAt: string;
  endorsements: Array<{ subjectId: string; subjectFirstSeenAt: string }>;
}

export interface DiscountCohortInput {
  readonly profileId: string;
  readonly subjectIds: readonly string[];
  readonly reason: string;
  readonly decidedBy: string;
  readonly at: string;
}

/** One launch on a board day, with the raw endorsements that landed during
 *  it. The eligibility partition is the contract's, never SQL's. */
export interface BoardLaunchRecord {
  launchId: string;
  profileId: string;
  slug: string;
  tagline: string | null;
  versionLabel: string;
  launchedAt: string;
  endorsements: Array<{ subjectId: string; subjectFirstSeenAt: string }>;
}

export interface WriteBoardRanksInput {
  readonly day: string;
  readonly ranks: ReadonlyArray<{
    /** The launch this rank is about — so `board_rank_at` can be stamped,
     *  which is the column LC0 carried for LC3 and nothing has written yet. */
    readonly launchId: string;
    readonly profileId: string;
    /**
     * TWO IDS, SUPPLIED BY THE CALLER, because this writes two metric rows.
     *
     * Deriving the second from the first (flipping some characters) would be
     * shorter and would eventually collide with a real row's primary key.
     * Ids come from one generator, and the generator is the caller's.
     */
    readonly countedId: Uuid;
    readonly ineligibleId: Uuid;
    readonly counted: number;
    readonly ineligible: number;
  }>;
  /** The moment the board was computed (I9). Never the moment of a launch. */
  readonly observedAt: string;
}

/** A day's stored rank, as the board reads it back. */
export interface BoardRankRecord {
  launchId: string;
  profileId: string;
  slug: string;
  tagline: string | null;
  versionLabel: string;
  launchedAt: string;
  counted: number;
  ineligible: number;
  observedAt: string;
}

/**
 * OL2 — one launch as a FEED ROW renders it.
 *
 * A superset of `BoardRankRecord`, and the extra fields are the card facts
 * the design's row shows beside the name. Kept as its own type rather than as
 * a widening of the board's, because the two answer different questions: the
 * board's page is a dense list of one day, the feed's row is the design's
 * primary unit across a week and carries what that unit draws.
 *
 * `rank` IS NULLABLE and that is a real state, not a defensive one: a day
 * that has just begun has launches the sweep has not ranked yet. Null renders
 * as an absent position, never as zero (OPC-C).
 */
export interface FeedLaunchRecord {
  launchId: string;
  profileId: string;
  slug: string;
  tagline: string | null;
  versionLabel: string;
  launchedAt: string;
  /** The UTC day id this launch belongs to — `2026-08-26`. */
  day: string;
  rank: number | null;
  counted: number;
  ineligible: number;
  /** Observed at publish, never a maintainer's claim (OPC-7). */
  licence: string | null;
  category: string | null;
  stack: string[];
  roleOpeningCount: number;
  /** Visible posts across the listing's threads. Moderated-away posts are
   *  not counted, so the number beside a row and the discussion a reader
   *  actually finds under it are the same number. */
  commentCount: number;
}

/** LC4 — a collection as its own row, without items. */
export interface CollectionRow {
  id: string;
  slug: string;
  title: string;
  blurb: string | null;
  curatorSubjectId: string;
  state: string;
  publishedAt: string | null;
  retiredAt: string | null;
}

/** MP0 — one launch of a listing a person maintains, as their page draws it. */
export interface MakerLaunchRecord {
  launchId: string;
  slug: string;
  tagline: string | null;
  versionLabel: string;
  launchedAt: string;
  day: string;
  /** The board's ordinal for that day, or null while the day has no counts
   *  yet. Derived from the sweep's own stored figures with the board's
   *  published comparison — never a second opinion about the order. */
  rank: number | null;
  counted: number;
}

/** MP0 — one listing a person upvoted, and when they did. */
export interface MakerUpvoteRecord {
  slug: string;
  tagline: string | null;
  at: string;
  /** TS1's trust floor: an upvote below it is recorded and does not count
   *  toward the listing's public total yet. The act still happened and still
   *  has their name on it, so it is listed and the page says which. */
  counting: boolean;
}

/** MP0 — one listing a person has commented on. */
export interface MakerCommentRecord {
  slug: string;
  tagline: string | null;
  /** How many of THEIR visible comments are on it. */
  comments: number;
  lastAt: string;
  /** The thread to open, or null when their comments span more than one. */
  threadId: string | null;
}

/** PE1 — one act in a person's history. */
export interface MakerHistoryRecord {
  kind: "launched" | "commented" | "endorsed" | "confirmed";
  at: string;
  slug: string;
  tagline: string | null;
  detail: string | null;
  ref: string | null;
}

/** MP0 — the three numbers in a maker page's header, counted in one read so a
 *  counter and the tab beneath it cannot disagree. */
export interface MakerActivityCounts {
  launched: number;
  upvotesGiven: number;
  comments: number;
}

/** FL1 — one open role, with the listing it belongs to. */
export interface OpenRoleRecord {
  id: string;
  title: string;
  /** The listing's slug — its address, and what a reader recognises. */
  slug: string;
  commitment: string | null;
  createdAt: string;
}

/** LC4 — the index row. `count` is the VISIBLE count. */
export interface CollectionCardRecord {
  slug: string;
  title: string;
  blurb: string | null;
  curatorHandle: string;
  publishedAt: string;
  count: number;
}

/** LC4 — a public collection with the items that are public right now. */
export interface CollectionRecord {
  slug: string;
  title: string;
  blurb: string | null;
  curatorHandle: string;
  publishedAt: string;
  items: Array<{ card: ProfileCardRecord; note: string | null }>;
}

/** LC4 — the curator's own view: every state, and the STORED item count
 *  beside the visible one, because a curator editing a draft needs to know an
 *  item is there even while it is not public. */
export interface CuratorCollectionRecord {
  id: string;
  slug: string;
  title: string;
  blurb: string | null;
  state: string;
  publishedAt: string | null;
  /** Every item the curator chose. */
  held: number;
  /** How many of them a reader would see today. */
  visible: number;
}

export interface CreateCollectionInput {
  readonly id: Uuid;
  readonly slug: string;
  readonly title: string;
  readonly blurb: string | null;
  readonly curatorSubjectId: string;
  readonly at: string;
}

export interface AddCollectionItemInput {
  readonly collectionId: Uuid;
  readonly slug: string;
  readonly note: string | null;
  readonly at: string;
}

export interface IntegrityRestatement {
  /** Newly discounted, or re-discounted after a reversal. */
  applied: number;
  /** No longer judged discountable, and restored. */
  reversed: number;
  /** Listings whose public total therefore needs recomputing. */
  touchedProfileIds: string[];
}

/** CG3 — one confirmed person on a listing, as the public roster reads them. */
export interface RosterMemberRecord {
  subjectId: string;
  roleLabel: string | null;
  /** CG1's handle when they have a public profile, so a name is a link or
   *  plain text and never a dead link (XP-5). */
  handle: string | null;
  displayName: string | null;
  since: string;
}

/** CG3 — the edge itself, for authorization and for the two private views. */
export interface RosterEdgeRecord {
  profileId: string;
  subjectId: string;
  state: "pending" | "confirmed" | "retired";
  origin: "confirmed_by_subject" | "grandfathered";
  roleLabel: string | null;
  invitedBy: string;
  invitedAt: string;
  confirmedAt: string | null;
  retiredAt: string | null;
}

/** CG3 — one person's own view of every edge they are part of. */
export interface SubjectRosterRecord {
  /** Confirmed, on listings that are public. What their profile shows. */
  confirmed: Array<{ slug: string; tagline: string | null; roleLabel: string | null; since: string }>;
  /** Pending invitations they have not answered. */
  invitations: Array<{ slug: string; tagline: string | null; roleLabel: string | null; invitedAt: string }>;
  /** OPC-G — confirmed edges they never actually agreed to. The `/me` surface
   *  says so plainly and puts removal one click away. */
  grandfathered: string[];
}

export interface InviteToRosterInput {
  profileId: Uuid;
  subjectId: string;
  roleLabel: string | null;
  invitedBy: string;
  at: string;
}

export interface ApplicationRecord {
  id: string;
  subjectId: string;
  profileId: string;
  roleOpeningId: string;
  /** The JR request's opaque public id; null until the JR ask lands. */
  jrRequestRef: string | null;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
  /** Joined product identity for the contributor's own list (OH2); present
   *  on subject-keyed reads, absent elsewhere. */
  productSlug?: string | null;
  productTagline?: string | null;
}

export interface RecordApplicationInput {
  id: Uuid;
  subjectId: string;
  profileId: Uuid;
  roleOpeningId: Uuid;
  jrRequestRef?: string | null;
}

// ─── end openproduct-home (OH0) ───

// ─── openproduct-independence (OX4): the authority handover ───
//
// WHO MAY ACT ON A LISTING is a fact this schema owns. The AUTHORIZATION
// list, deliberately distinct from published_maintainers (the PUBLICATION
// list — what a visitor sees): who may edit and who is shown were never the
// same fact.

export type ListingRole = "owner" | "maintainer";

/** The platform's verified link attestation, stored whole (S4/S5, OX5). */
export interface StoredLinkGrant {
  doorRef: string;
  grantedBy: string;
  grantedAt: string;
  workspaceVisibility: "public";
}

export interface ListingMaintainerRecord {
  profileId: string;
  subjectId: string;
  role: ListingRole;
  addedAt: string;
  addedBy: string;
}

// ─── openproduct-independence (OX5c): the LOCAL audit log ───
//
// The maintainer door's audit trail, in the context that owns the acts —
// what the platform's appendEventWithAudit used to receive lands here.
// FK-free of profiles on purpose: an audit row survives the listing it
// describes; the workspace purge deletes it by org.

export interface AppendAuditInput {
  id: Uuid;
  orgId: Uuid;
  profileId?: Uuid | null;
  actorType: string;
  actorId: string;
  type: string;
  description: string;
  payload?: Record<string, unknown> | null;
  requestId?: string | null;
  occurredAt: string;
}

export interface AuditEntryRecord {
  id: string;
  orgId: string;
  profileId: string | null;
  actorType: string;
  actorId: string;
  type: string;
  description: string;
  payload: Record<string, unknown> | null;
  requestId: string | null;
  occurredAt: string;
}

// ─── end openproduct-independence (OX4/OX5c) ───


// ─── openproduct-commons TS0 — trust and safety ───
//
// Three record shapes, one per layer of TS-1. Note what is NOT here: there is
// no `UpdateModerationActInput` and no `deleteModerationAct`. The record is
// append-only, and the absence is the mechanism — a restore is a new act, not
// an edit of the removal, because an appeal has to be able to ask what was
// done and when it was undone.

/** FL0 — what a follow points at. Mirrors the schema's CHECK; a third kind
 *  costs a migration, which is the point of a closed vocabulary. */
export type FollowKindName = "topic" | "person" | "listing";

export type TrustLevelName = "new" | "established" | "trusted" | "restricted";

/** TS3 — see `ProfileRecord.moderationState`. Mirrors the CHECK on 1440. */
export type ModerationStateName = "visible" | "delisted" | "removed";

export interface TrustLevelRecord {
  subjectId: string;
  level: TrustLevelName;
  setBy: string;
  reason: string | null;
  setAt: string;
}

export interface CreateReportInput {
  id: Uuid;
  subjectKind: string;
  subjectRef: string;
  reporterSubjectId: string;
  reason: string;
  detail?: string | null;
}

export interface ReportRecord {
  id: string;
  subjectKind: string;
  subjectRef: string;
  reporterSubjectId: string;
  reason: string;
  detail: string | null;
  state: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A queue row plus the one number that changes a triager's priority. */
export interface QueuedReportRecord extends ReportRecord {
  /** Other reports naming the same subject that are still open or triaged. */
  alsoReported: number;
}

// ---------------------------------------------------------------------------
// CB1 — discussions
// ---------------------------------------------------------------------------

export interface ThreadRecord {
  id: string;
  tag: string;
  title: string;
  state: "open" | "answered" | "locked" | "removed";
  /** Opaque, and it stops here — I3 keeps it out of every public shape. */
  authorSubjectId: string;
  authorHandle: string | null;
  authorName: string | null;
  createdAt: string;
  lastPostAt: string | null;
  postCount: number;
  profileId: string | null;
  answerPostId: string | null;
}

/** PP0 — the six tags a comment may carry; the schema's CHECK spells the
 *  same six. Named here so `packages/db` keeps its rule (no wire imports). */
export type PostTagName =
  | "design"
  | "proposal"
  | "question"
  | "governance"
  | "contributing"
  | "accessibility";

export interface PostRecord {
  id: string;
  authorSubjectId: string;
  /** PP0 — the tag a titled discussion used to be classified by, or null. */
  tag: PostTagName | null;
  /** Empty for a removed post — dropped in SQL, not by the caller. */
  body: string;
  state: "visible" | "removed";
  authorHandle: string | null;
  authorName: string | null;
  createdAt: string;
  editedAt: string | null;
  isAnswer: boolean;
  /** CV1 — the post this one answers, or `null` for a top-level post.
   *  One level only: a reply's parent is always top-level, guarded in the
   *  insert's own SQL as well as in the handler. */
  parentPostId: string | null;
}

export interface CreateThreadInput {
  id: Uuid;
  profileId: string;
  tag: string;
  title: string;
  authorSubjectId: string;
  at: string;
}

/** DQ0b — what making a launch thread needs. No tag (it is always `launch`)
 *  and no `at` (a thread with no posts has no `last_post_at`). */
/** FO1 — a thread with the listing it lives on. */
export interface ForumThreadRecord extends ThreadRecord {
  slug: string;
}

/** HB3 — one row of the "Recently replied" panel. */
export interface RecentlyRepliedThreadRecord {
  threadId: string;
  /** The listing's slug — the thread's address is under it. */
  slug: string;
  title: string;
  tag: string;
  lastPostAt: string;
  postCount: number;
}

export interface EnsureLaunchThreadInput {
  id: Uuid;
  profileId: string;
  /** Written from the listing's own name, because nobody typed one. */
  title: string;
  authorSubjectId: string;
}

export interface CreatePostInput {
  id: Uuid;
  threadId: string;
  authorSubjectId: string;
  /** As typed. The render subset is applied on READ, never on write. */
  body: string;
  at: string;
  /** CV1 — the post being answered. Omitted or null makes a top-level post. */
  parentPostId?: string | null;
  /** PP0 — optional; the schema refuses anything outside the six. */
  tag?: PostTagName | null;
}

/** NF0 — one row in the on-site inbox. No prose: the sentence is composed at
 *  read time from the contract's phrasebook. */
/** AC1 — the two purposes, as the schema's CHECK spells them. Mirrors the
 *  contract's `CredentialTokenPurpose`; named separately here so `packages/db`
 *  does not depend on `packages/contracts` (it never has). */
export type CredentialTokenPurposeName = "verify" | "reset";

export interface IssueCredentialTokenInput {
  /** The hash of the handle this pending password is bound to. For a sign-up
   *  that is the platform's challenge id — which is NOT secret, and does not
   *  need to be: the row is a binding, not a credential. Spending it requires
   *  the code from the mail, which openproduct never sees until it is typed
   *  back. */
  readonly tokenHash: string;
  readonly purpose: CredentialTokenPurposeName;
  /** Set for `reset` (the subject exists), null for `verify` (it does not
   *  yet). The schema's CHECK holds the two shapes apart. */
  readonly subjectId?: string | null;
  /** Set for `verify` (the password waiting behind the mail), null for
   *  `reset` (the new one is typed on the page the link opens). */
  readonly verifier?: string | null;
  readonly at: string;
  readonly expiresAt: string;
}

export interface IssueAuthSessionInput {
  /** SHA-256 of the token the cookie carries. Never the token. */
  tokenHash: string;
  subjectId: string;
  at: string;
  expiresAt: string;
}

/** A session row as stored — no address, no name, no user agent. */
export interface AuthSessionRecord {
  subjectId: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface WriteCredentialInput {
  readonly subjectId: string;
  readonly verifier: string;
  readonly at: string;
}

export interface WriteNotificationInput {
  id: Uuid;
  /** Opaque, and the only thing about the person here (I3). */
  subjectId: string;
  kind: string;
  /** `kind:ref` — what makes once-per-event-per-person a schema property. */
  eventKey: string;
  /** A HANDLE, or null for something the system observed. Never a subject id. */
  actor?: string | null;
  targetKind: string;
  targetRef: string;
  figure?: number | null;
}

/** NF0 — one row as the inbox page receives it. `unread` is computed against
 *  the reader's own cursor, never stored. */
export interface NotificationRecord {
  id: string;
  kind: string;
  actor: string | null;
  targetKind: string;
  targetRef: string;
  figure: number | null;
  createdAt: string;
  unread: boolean;
}

export interface QueueNotificationInput {
  id: Uuid;
  /** Opaque, and the ONLY thing about the person that exists here (I3). */
  subjectId: string;
  /** CV3 widened this to five. The CHECK in SQL is the authority; this
   *  spelling is what stops a typo reaching it. */
  kind: "reply" | "answered" | "decision" | "digest" | "mention";
  threadId: string | null;
  /** `kind:causeId` — what makes once-per-event a schema property. */
  eventRef: string;
}

export interface OpeningDemandRecord {
  roleOpeningId: string;
  /** RAW. Floored by the contract in core, not here — see the repository. */
  pending: number;
  openedAt: string;
}

export interface SetModerationStateInput {
  slug: string;
  state: ModerationStateName;
  /** ISO 8601. Becomes `moderated_at`, which is what a tombstone shows. */
  at: string;
  /** The append-only act that produced this state. Null only for `visible`. */
  actId: string | null;
  /** The states this act may be applied from — the contract's table, passed in. */
  legalFrom: readonly ModerationStateName[];
}

export interface AppendModerationActInput {
  id: Uuid;
  subjectKind: string;
  subjectRef: string;
  act: string;
  actorId: string;
  reason: string;
  reportId?: Uuid | null;
  occurredAt: string;
}

export interface ModerationActRecord {
  id: string;
  subjectKind: string;
  subjectRef: string;
  act: string;
  actorId: string;
  reason: string;
  reportId: string | null;
  occurredAt: string;
}

// ─── openproduct-commons TS5 — the appeal, and the ledger read behind it ───

export interface CreateAppealInput {
  id: Uuid;
  actId: Uuid;
  subjectKind: string;
  subjectRef: string;
  appellantSubjectId: string;
  says: string;
  filedAt: string;
}

export interface AppealRecord {
  id: string;
  actId: string;
  subjectKind: string;
  subjectRef: string;
  appellantSubjectId: string;
  says: string;
  state: "open" | "upheld" | "refused";
  outcomeActId: string | null;
  reversalActId: string | null;
  filedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

export interface ResolveAppealInput {
  id: Uuid;
  state: "upheld" | "refused";
  outcomeActId: Uuid;
  /** Null when an upheld appeal had nothing left to reverse — somebody else
   *  undid the act while it waited. See 1510's column comment. */
  reversalActId: Uuid | null;
  decidedBy: string;
  at: string;
}

// ─── end openproduct-commons (TS0) ───


// ─── openproduct-commons SN1 — the signal plane's records ───

/**
 * What a row in `signal_sources` may be — the REPOSITORY tiers, and only
 * those.
 *
 * Deliberately narrower than the contract's `SignalSource` since MD0, which
 * added `declared_url` for a read of a listing's live address. This table has
 * no row shape for one: nothing polls a live URL on the metrics path, and a
 * row here would be a source the sweep would try to read as a repository.
 * The contract's `REPO_SIGNAL_SOURCES` is this list, and the signal plane's
 * write door validates against that rather than against the wider vocabulary.
 */
export type SignalSourceName = "linked_repo" | "declared_repo" | "manifest" | "operator";

/**
 * CB3 — what an ACTIVITY row's provenance may be. A superset of the polled
 * sources, because the JR seam pushes rather than being polled: it can be the
 * origin of a fact without being something you could ever poll. Kept as a
 * separate type so nothing can register a seam as a signal source.
 */
export type ActivitySourceName = SignalSourceName | "seam";

export interface SignalSourceRecord {
  profileId: string;
  source: SignalSourceName;
  locator: string | null;
  lastSuccessAt: string | null;
  failureCount: number;
  lastError: string | null;
  withdrawnAt: string | null;
}

/** A source the scheduler should poll, with the listing's coordinates. */
export interface DueSourceRecord extends SignalSourceRecord {
  slug: string;
  repoUrl: string | null;
}

export interface WriteMetricInput {
  id: Uuid;
  profileId: Uuid;
  metric: string;
  window: string;
  value: number;
  source: SignalSourceName;
  observedAt: string;
}

export interface MetricRecord {
  profileId: string;
  metric: string;
  window: string;
  value: number;
  source: SignalSourceName;
  observedAt: string;
}

export interface AppendActivityInput {
  id: Uuid;
  profileId: Uuid;
  kind: string;
  summary: string;
  actorSubjectId?: string | null;
  /** CB3 — activity may also come from the seam, which is not pollable. */
  source: ActivitySourceName;
  occurredAt: string;
}

export interface ActivityEventRecord {
  id: string;
  profileId: string;
  kind: string;
  summary: string;
  actorSubjectId: string | null;
  /** CB3 — activity may also come from the seam, which is not pollable. */
  source: ActivitySourceName;
  occurredAt: string;
}

// ─── end openproduct-commons (SN1) ───


// ─── openproduct-worldclass MD0 — the media plane's records ───

/**
 * The three kinds, split by TRUST CLASS rather than by shape (WC-3).
 *
 * `hero` and `gallery` are the maker's own: authored, never stale, no
 * `observedAt`. `screenshot` is a capture: observed, and it cannot exist
 * without the moment it was taken. Migration 1820 refuses either mistake with
 * a CHECK constraint, and the contract refuses it again as a type union.
 */
export type MediaKindName = "logo" | "hero" | "gallery" | "screenshot";

/**
 * MD1 — one authored row, or (MD4) one observed one. `observedAt` is set for
 * a screenshot and null otherwise; 1820's CHECK refuses the other pairings.
 */
export interface InsertMediaInput {
  id: Uuid;
  profileId: Uuid;
  kind: MediaKindName;
  storageRef: string;
  alt: string;
  width: number;
  height: number;
  position: number;
  observedAt?: string | null;
}

export interface ProductMediaRecord {
  id: string;
  kind: MediaKindName;
  /**
   * OPAQUE. Not a URL, and nothing in this package interprets it: MD1 decides
   * what a reference resolves to once WC-C is answered.
   */
  storageRef: string;
  /** Required and non-blank, at the column. See 1820's header for why it is
   *  not nullable. */
  alt: string;
  width: number;
  height: number;
  /** Order within the kind; always 0 for the kinds there is only one of. */
  position: number;
  /** Set for a screenshot, null for authored media. Never both ways round. */
  observedAt: string | null;
}

/** MD4 — a listing whose capture is due, with what the sweep needs to take it. */
export interface DueCaptureRecord {
  profileId: string;
  /** The listing's name on every public surface is its slug (there is no
   *  other), so the generated alt text names it by this. */
  slug: string;
  /** The declared address, exactly as the maker wrote it. */
  target: string;
  /** When the capture on the page was taken, or null for none. */
  observedAt: string | null;
  /** The failure run against THIS address; a changed address reads as 0. */
  failureCount: number;
}

/** MD4 — the capture ledger's row (1905). */
export interface ScreenshotCaptureRecord {
  profileId: string;
  target: string;
  attemptedAt: string;
  capturedAt: string | null;
  failureCount: number;
  lastError: string | null;
  withdrawnAt: string | null;
}

/** OS1 — a page of the catalogue, asked for by position. */
export interface PublicCardsPageInput {
  /** The position to continue from, or null for the first page. */
  /** OB3 — `activity` is `sort.most-active`'s folded key (contracts `mostActiveKeyOf`). */
  cursor: { activity: number | null; publishedAt: string | null; slug: string } | null;
  /** Rows on the page. The caller bounds it; the repository bounds it again. */
  limit: number;
  /** The oldest `merges` observation the ordering may read — the contract's
   *  freshness rule, computed by the caller, so that "not observed" here is
   *  exactly "not observed" on the card. */
  mergesSince: string;
  /** OB3 — the oldest `endorsements.7d` count the ordering may read, by the
   *  same rule. An older one is not read, and the build ranks on its changes. */
  endorsementsSince: string;
}

export interface PublicCardsPage {
  cards: ProfileCardRecord[];
  /** The last row's position when more rows follow; null on the last page. */
  next: { activity: number | null; publishedAt: string | null; slug: string } | null;
}

/**
 * CS3 — everything the subject may take with them, from the registry's
 * `rows` columns and the maintainer projection of the listings they maintain.
 * Per table, the rows as stored (snake_case, as the schema names them),
 * stripped of every other subject's id; `profile_id` resolved to a `slug`
 * and `thread_id` to a `thread` beside the id, so a row means something
 * outside this database.
 */
export interface SubjectExport {
  exportedAt: string;
  subjectId: string;
  tables: Record<string, Record<string, unknown>[]>;
  /** The listings they maintain, as the studio shows them — drafts included —
   *  less the link grant (a door token) and every other subject's id. */
  listings: Record<string, unknown>[];
}

/** CS2 — what `eraseSubject` did, per registry column (`table.column`). */
export interface SubjectErasure {
  /** Rows deleted, over every `theirs` column. */
  deleted: number;
  /** Rows kept with the subject replaced, over every `anonymise` and `record` column. */
  anonymised: number;
  /** Per column: rows deleted or rewritten. Absent columns matched nothing. */
  columns: Record<string, number>;
}

/** LC2 — the four trailing windows, counted at one instant. */
export interface PublishedWindows {
  today: number;
  week: number;
  month: number;
  total: number;
}

/** OS5 — a page of the materialised catalogue, asked for by position. The
 *  freshness rule is not an input: it was applied when the catalogue was
 *  computed, at the moment the page carries. */
export interface CataloguePageInput {
  cursor: PublicCardsPageInput["cursor"];
  limit: number;
}

/**
 * OS5 — one page of `catalog_cards`, in one read: the cards, their latest
 * observations and their media (the three reads the live path makes, as the
 * phase stored them), the census stamped beside the catalogue, and the
 * moment. `computedAt` null is "never computed": the cards are empty, and
 * the caller serves the live join instead.
 */
export interface CataloguePage {
  computedAt: string | null;
  cards: ProfileCardRecord[];
  metrics: Map<string, MetricRecord[]>;
  media: Map<string, ProductMediaRecord[]>;
  next: PublicCardsPage["next"];
  windows: PublishedWindows;
}

export interface CatalogueRebuildInput {
  /** The moment the catalogue is computed at — stamped on every row written and on the singleton. */
  now: string;
  /** The oldest `merges` observation the ordering may read (the contract's freshness rule, computed by the caller). */
  mergesSince: string;
  /** OB3 — the oldest `endorsements.7d` count the ordering may read, by the same rule. */
  endorsementsSince: string;
}

export interface CatalogueRebuildReport {
  computedAt: string;
  /** Rows in the table after the rebuild — every listed profile. */
  cards: number;
  /** Rows inserted or rewritten this run: a row is rewritten only when it changed. */
  written: number;
  /** Rows dropped because their listing is no longer listed. */
  removed: number;
}

// ─── end openproduct-worldclass (MD0) ───

export interface OpenproductRepository {
  // ---- public reads: visibility-filtered, no actor, no org scope ----
  listPublicCards(limit?: number): Promise<ProfileCardRecord[]>;
  /**
   * OS1 — the catalogue in `sort.most-active`'s published order, one page at
   * a time: the folded key desc (OB3: `(merges+1)×(upvotes+1)`, then merges;
   * unknown merges last), then published desc, then slug under
   * `COLLATE "C"`. A cursor is the previous page's last row; the page is
   * every row after it in the same order (OS-1: never a second ordering).
   */
  listPublicCardsPage(input: PublicCardsPageInput): Promise<PublicCardsPage>;
  /**
   * OS5 — the same page from `catalog_cards`, in ONE indexed read, with the
   * metrics and media the live path fetches in two more and the census the
   * live path counts in a third. `computedAt` null means the catalogue has
   * never been computed: the page is empty and the caller serves the live
   * join until the first sweep.
   */
  listCataloguePage(input: CataloguePageInput): Promise<CataloguePage>;
  /**
   * OS5 — the catalogue phase's write: every listed profile's card, latest
   * observations and media into `catalog_cards`, rewriting only rows whose
   * content changed, dropping rows whose listing is no longer listed, and
   * stamping the moment and the census on `catalog_state`. One transaction.
   */
  rebuildCatalogue(input: CatalogueRebuildInput): Promise<CatalogueRebuildReport>;
  /**
   * OB3 — re-count every listed build's endorsements (both windows, the same
   * rule as `countEndorsements`) in ONE statement, and append a metric row
   * only where the count moved or the latest is older than `republishBefore`.
   * A vote ageing out of the week moves `7d` with nobody voting, and only a
   * re-count sees it. Answers how many rows it wrote.
   */
  refreshEndorsementCounts(input: { now: string; republishBefore: string }): Promise<number>;
  /**
   * LC2 — how many public listings were published in each window, and how
   * many there are altogether.
   *
   * ONE QUERY FOR ALL FOUR, because they must describe the same instant: a
   * "today" counted before a publish and a "total" counted after it would let
   * the strip say `today · 6` above a catalog of 5.
   */
  countPublishedWindows(now: string): Promise<PublishedWindows>;
  getPublicProfile(slug: string): Promise<ProfileRecord | null>;
  listPublicRoleOpenings(profileId: string): Promise<RoleOpeningRecord[]>;
  listPublicMaintainers(profileId: string): Promise<PublicMaintainerRecord[]>;
  /**
   * MD0 — a listing's media, in document order: hero, then gallery by
   * position, then the capture.
   *
   * A public child read, so it re-asserts the parent's visibility in SQL like
   * every other one here rather than trusting the caller to have arrived
   * through a public read.
   */
  listPublicMedia(profileId: string): Promise<ProductMediaRecord[]>;
  /** MD1 — every row, draft or not. The handler authorises; see the repo. */
  listMediaForProfile(profileId: string): Promise<ProductMediaRecord[]>;
  /** MD1 — one row. The column refuses what MD0's model refuses. */
  insertMedia(input: InsertMediaInput): Promise<ProductMediaRecord>;
  /** MD1 — the row, scoped by profile AND id. Returns what was removed, or
   *  null. The object it referenced stays: it is content-addressed and may
   *  be somebody else's. */
  deleteMedia(profileId: string, id: string): Promise<ProductMediaRecord | null>;
  /** openproduct-studio OSD6 — the words under a picture, changed in place.
   *  Scoped by profile AND id; an observed capture's alt is not the maker's to
   *  edit, so only authored rows match. Null when nothing matched. */
  updateMediaAlt(profileId: string, id: string, alt: string): Promise<ProductMediaRecord | null>;
  /** openproduct-studio OSD6 — the gallery in the maker's order: `ids` is
   *  every gallery row, first to last, and positions become 0..n-1. */
  reorderGallery(profileId: string, ids: readonly string[]): Promise<ProductMediaRecord[]>;
  /** openproduct-studio OSD4 — a logo or a hero, REPLACING the one in its
   *  slot if there is one, in one statement. Returns the row as stored. */
  replaceAuthoredSingleton(input: InsertMediaInput & { kind: "logo" | "hero" }): Promise<ProductMediaRecord>;

  /** The same, for the whole directory page in one query — the shape
   *  `latestMetricsForSlugs` established, for the same reason: an N+1 here is
   *  an N+1 against every cold edge. */
  listPublicMediaForSlugs(slugs: string[]): Promise<Map<string, ProductMediaRecord[]>>;
  /**
   * openproduct-studio OSD3 — every row of these profiles, draft or not, in
   * ONE query, keyed by profile id. The studio list's tiles: the maintainer
   * sees their own draft's logo. The handler authorises (the ids are the
   * caller's own listings); like `listMediaForProfile`, this does not.
   */
  listMediaForProfiles(profileIds: string[]): Promise<Map<string, ProductMediaRecord[]>>;
  /**
   * openproduct-studio OSD3 — rewrite ONE listing's `catalog_cards.media`
   * from `product_media`, so a logo added or removed shows on the home list
   * without waiting for the sweep (risk R2). Touches only the media column,
   * only when it changed, and only a row that exists: a listing the sweep
   * has not catalogued yet is the sweep's to add. True when a row changed.
   */
  refreshCatalogueMedia(profileId: string): Promise<boolean>;

  /**
   * MD4 — the listings whose capture is due: listed, with a declared address,
   * and either no screenshot or one observed before `refreshBeforeIso`. Never
   * one whose address the ledger has withdrawn — unless the address has
   * changed since, which re-arms it. Never-tried first, then the oldest
   * attempt, so a run that cannot finish the queue finishes it next time.
   */
  listDueCaptures(refreshBeforeIso: string, limit?: number): Promise<DueCaptureRecord[]>;
  /** MD4 — the picture, replaced in place: the one screenshot slot is upserted,
   *  so a retake never leaves two rows or a moment with none. The column still
   *  refuses a screenshot without its `observedAt` (WC-3). */
  replaceScreenshot(input: InsertMediaInput): Promise<ProductMediaRecord>;
  /** MD4 — a capture came back. Clears the failure run against `target`. */
  recordCaptureSuccess(profileId: Uuid, target: string, at: string): Promise<ScreenshotCaptureRecord>;
  /**
   * MD4 — a capture did not come back. Increments the run against `target`
   * (a different target starts a new run at one) and, at `withdrawAfter`,
   * withdraws the address from the queue. The picture on the page, if any,
   * ages out through its own window rather than being frozen.
   */
  recordCaptureFailure(
    profileId: Uuid,
    target: string,
    error: string,
    at: string,
    withdrawAfter: number,
  ): Promise<ScreenshotCaptureRecord>;

  // ---- launches (LC0) ----
  /**
   * Everything `checkLaunchable` needs, in one read.
   *
   * ONE QUERY RATHER THAN FOUR, because the four facts must describe the same
   * instant: a cooldown checked before a concurrent launch fires, against a
   * version list read after it, is a check that can pass on a state that never
   * existed.
   */
  launchEligibility(profileId: Uuid): Promise<LaunchEligibility>;

  // ---- the digest (LC1) ----
  /** Every launch that went live inside `[start, end)`, earliest first. */
  listLaunchesInWindow(start: string, end: string, limit?: number): Promise<DigestLaunchRecord[]>;
  /**
   * The week's most-endorsed, counted over the WEEK rather than a trailing
   * window — a digest from a year ago must answer about the days it names.
   */
  listMostEndorsedInWindow(
    start: string,
    end: string,
    limit?: number,
  ): Promise<DigestEndorsedRecord[]>;
  getDigestNote(weekId: string): Promise<DigestNoteRecord | null>;
  /** Every week that has a note or a launch — what the index and the feed
   *  enumerate, newest first. */
  listDigestWeeks(limit?: number): Promise<string[]>;
  scheduleLaunch(input: ScheduleLaunchInput): Promise<LaunchRecord>;
  /** Move a scheduled or missed launch. Returns null when it may not move. */
  rescheduleLaunch(id: Uuid, scheduledFor: string): Promise<LaunchRecord | null>;
  cancelLaunch(id: Uuid, actor: string, at: string): Promise<LaunchRecord | null>;
  getLaunch(id: Uuid): Promise<LaunchRecord | null>;
  listLaunchesForProfile(profileId: Uuid): Promise<LaunchRecord[]>;
  /**
   * Fire every launch whose moment has passed — LIVE where the listing is
   * published, MISSED where it is not. Returns what happened to each.
   */
  /**
   * LC0's sweep, widened at NF0 to say WHAT fired.
   *
   * `fired` carries each live launch's slug and topic, so a caller announcing
   * them does not have to re-read the day and find a different set — a launch
   * that fired between two reads would be in one and not the other.
   */
  fireDueLaunches(
    now: string,
    limit?: number,
  ): Promise<{ live: number; missed: number; fired: Array<{ slug: string; topic: string | null }> }>;

  // ---- authenticated reads: org-scoped, drafts included ----
  listProfilesForOrg(orgId: Uuid): Promise<ProfileRecord[]>;
  getProfileForOrg(orgId: Uuid, profileId: Uuid): Promise<ProfileRecord | null>;
  getProfileByProject(orgId: Uuid, projectId: Uuid): Promise<ProfileRecord | null>;
  listRoleOpenings(profileId: Uuid): Promise<RoleOpeningRecord[]>;
  listMaintainers(profileId: Uuid): Promise<PublishedMaintainerRecord[]>;
  /**
   * openproduct-studio OSD7 — the ACTIVE handle of each person on a listing's
   * publication list, keyed by subject id, for the studio's People step.
   *
   * A MAP BESIDE `listMaintainers` rather than a `handle` on its record, for
   * the reason `PublicMaintainerRecord` gives: `setMaintainers` returns that
   * record and has no way to fill a handle. It keys on the profile, not on
   * the subjects, so it leaves in the same round trip as `listMaintainers`
   * instead of waiting for its answer.
   *
   * ACTIVE, not "public": the same rule `getSubjectsForHandles` resolves by,
   * so a line the studio pre-fills as `@handle` saves back to the same person.
   * A subject with no active handle is ABSENT from the map.
   */
  listMaintainerHandles(profileId: Uuid): Promise<Map<string, string>>;

  // ---- listing authorization (OX4) ----
  /** The caller's role on one listing, or null — the whole authorization
   *  question, answered from openproduct's own table. */
  getListingRole(profileId: Uuid, subjectId: string): Promise<ListingRole | null>;
  /** Every profile in this org the subject maintains — the org-scoped list
   *  read filters through this, so a maintainer of one listing cannot learn
   *  what else the workspace has drafted. */
  listMaintainedProfileIds(orgId: Uuid, subjectId: string): Promise<string[]>;
  addListingMaintainer(profileId: Uuid, subjectId: string, role: ListingRole, addedBy: string): Promise<void>;
  /** Everything this subject maintains, across every org — the studio's
   *  home read (OX5). */
  listProfilesMaintainedBy(subjectId: string): Promise<ProfileRecord[]>;
  /** Store the platform's verified link attestation (S4/S5). */
  setProfileLinkGrant(profileId: Uuid, grant: StoredLinkGrant): Promise<ProfileRecord | null>;
  /** The workspace narrowed to private (seam `workspace.visibility_narrowed`,
   *  OX5c): every listing in the org loses its grant AND its public page in
   *  one statement — a private workspace with a live listing is exactly the
   *  drift the event exists to prevent. Returns the affected profile ids. */
  revokeWorkspaceEligibility(orgId: Uuid): Promise<string[]>;

  // ---- the local audit log (OX5c) ----
  appendAudit(input: AppendAuditInput): Promise<void>;
  /** The trail for one listing, newest first — bounded; a read surface for
   *  the studio when one is wanted, and the pglite proof today. */
  listAuditForProfile(profileId: Uuid, limit?: number): Promise<AuditEntryRecord[]>;


  // ---- trust and safety (openproduct-commons TS0) ----
  /** The subject's level, or null for "never set" — which means `new`. */
  getTrustLevel(subjectId: string): Promise<TrustLevelRecord | null>;
  setTrustLevel(
    subjectId: string,
    level: TrustLevelName,
    setBy: string,
    reason: string | null,
  ): Promise<TrustLevelRecord>;
  /**
   * File a report. Returns null when this reporter already has an unresolved
   * report against the same subject — the same person again is not a second
   * signal, and letting it through would let one motivated reporter drown the
   * queue without tripping any velocity limit.
   */
  createReport(input: CreateReportInput): Promise<ReportRecord | null>;
  /** Oldest first: a queue worked newest-first never reaches its tail. */
  listOpenReports(limit?: number): Promise<QueuedReportRecord[]>;
  listReportsForSubject(subjectKind: string, subjectRef: string, limit?: number): Promise<ReportRecord[]>;
  /** Resolve a report. `actioned` and `declined` are terminal; both name who. */
  resolveReport(id: Uuid, state: "actioned" | "declined", resolvedBy: string, at: string): Promise<ReportRecord | null>;
  /** Move a report to `triaged` — a human is looking, nothing is decided. */
  triageReport(id: Uuid, at: string): Promise<ReportRecord | null>;
  /**
   * Append a moderation act. THE ONLY WRITE PATH to this table: there is no
   * update and no delete, here or anywhere, and a test asserts the absence.
   */
  /**
   * TS3 — move a listing's moderation state, only from a state the act is
   * legal from. Returns null when nothing matched: either no such slug, or
   * the row moved under the triager since they loaded the queue.
   *
   * Call AFTER `appendModerationAct`, passing the act id it returned. The
   * executor is non-transactional and the two failure windows are not
   * symmetric — see the implementation.
   */
  setListingModerationState(input: SetModerationStateInput): Promise<ProfileRecord | null>;

  // CB1 — discussions. The public reads apply `listed()` on the listing, so a
  // delisted one has no discussions to show; the rows survive (TS-3).
  listThreads(profileId: string, tag?: string | null, limit?: number): Promise<ThreadRecord[]>;
  /**
   * HB3 — the threads most recently replied to, across every listed
   * listing, newest reply first. Only threads that have a post, only on
   * listings a stranger can see, and only visible posts counted — the same
   * three rules the feed row's own comment count keeps, so the number here
   * and the number on the row are one number.
   */
  listRecentlyRepliedThreads(limit: number): Promise<RecentlyRepliedThreadRecord[]>;
  /**
   * FO1 — the forum index: every titled thread on a listed listing, in one
   * of two orders. The launch thread is never here (it is the listing's
   * comment section); a removed thread is never here; a listing a stranger
   * cannot see takes its threads with it.
   */
  listForumThreads(input: {
    tag: string | null;
    order: "latest" | "replied";
    limit: number;
  }): Promise<ForumThreadRecord[]>;
  getThread(id: string): Promise<ThreadRecord | null>;
  listPosts(threadId: string, limit?: number): Promise<PostRecord[]>;
  createThread(input: CreateThreadInput): Promise<string | null>;

  /**
   * DQ0b — the listing's one launch thread, or null.
   *
   * `null` is "this listing has no comments yet", which is a state and not a
   * failure: the thread is written by the first person who says something, so
   * a quiet product simply has none.
   */
  getLaunchThread(profileId: string): Promise<ThreadRecord | null>;

  /**
   * DQ0b — the listing's launch thread, made if it does not exist.
   *
   * IDEMPOTENT AGAINST A RACE, not against a check. The insert is guarded by
   * the partial unique index and the loser of a tie reads back the winner's
   * thread — which is the thread they wanted. `created` says which happened,
   * because a caller that notifies participants must not announce a thread
   * that already existed.
   *
   * Null only when the row could neither be written nor found, which means
   * the listing stopped being public between the two statements.
   */
  ensureLaunchThread(input: EnsureLaunchThreadInput): Promise<{ id: string; created: boolean } | null>;
  /** Null when the thread stopped accepting posts — the lock is enforced in
   *  the UPDATE, not by a handler check that races with a maintainer. */
  createPost(input: CreatePostInput): Promise<string | null>;
  setThreadState(
    id: string,
    state: ThreadRecord["state"],
    legalFrom: readonly ThreadRecord["state"][],
  ): Promise<boolean>;
  markAnswer(threadId: string, postId: string): Promise<boolean>;
  setPostModerationState(id: string, state: PostRecord["state"], at: string): Promise<boolean>;
  getPostThreadId(postId: string): Promise<string | null>;

  /** NF0 — the listing a thread belongs to, for a notification's sentence.
   *  Unfiltered: the page decides what a reader may see when the link is
   *  followed, and a thread on a since-delisted listing still happened. */
  getSlugForThread(threadId: string): Promise<string | null>;

  /** NF0 — who wrote a VISIBLE post, and which thread it is in. Null for a
   *  removed one: there is nothing there to be told about. */
  getPostAuthor(postId: string): Promise<{ authorSubjectId: string; threadId: string } | null>;

  /**
   * NF0 — who follows a TOPIC. There is deliberately no equivalent for a
   * person: FL0 promised that nothing here answers "who follows this" about
   * one, and a function taking a `kind` would be the read that could. The
   * literal is in the SQL rather than in a parameter for exactly that reason.
   */
  listTopicFollowers(topic: string, limit: number): Promise<string[]>;
  /** PP1 — who follows a listing, by slug, for the launch fan-out. Bounded like the topic read. */
  listListingFollowers(slug: string, limit: number): Promise<string[]>;

  /** NF0 — the subjects who maintain a listing, for news that belongs to
   *  them. The same edge `maintains` reads on a maker page. */
  listMaintainerSubjects(profileId: string): Promise<string[]>;

  /**
   * DQ1 — upvote a comment. Idempotent; false when it did not happen.
   *
   * False covers the self-vote (refused by a trigger), a post that does not
   * exist, and a post deleted mid-request — all three mean the same thing to
   * a caller, and distinguishing them would make this an existence oracle for
   * post ids.
   */
  votePost(postId: string, subjectId: string, at: string): Promise<boolean>;

  /** DQ1 — withdraw it. The ROW SURVIVES with `withdrawn_at` set, because a
   *  public number anything may have to restate needs a log rather than a
   *  presence test (FL0's `unfollow` deletes, and says why it may). */
  withdrawPostVote(postId: string, subjectId: string, at: string): Promise<boolean>;

  /** DQ1 — the public count for many posts in ONE read. A post nobody voted
   *  on is ABSENT rather than zero: the caller renders zero either way, and an
   *  absent key cannot be mistaken for a measured emptiness. */
  countPostVotes(postIds: readonly string[]): Promise<Map<string, number>>;

  /** DQ1 — which of THESE posts this subject has upvoted. Bounded by what the
   *  page rendered, like every other overlay read. */
  listPostVotesBy(subjectId: string, postIds: readonly string[]): Promise<string[]>;


  appendModerationAct(input: AppendModerationActInput): Promise<ModerationActRecord>;
  listModerationActsForSubject(subjectKind: string, subjectRef: string, limit?: number): Promise<ModerationActRecord[]>;
  /** The transparency report's own read (TS5): counts by act since a moment. */
  countModerationActsSince(since: string): Promise<Array<{ act: string; count: number }>>;

  // ---- appeals (openproduct-commons TS5) ----
  /** One act by id — what an appeal is filed against, and what the queue puts
   *  in front of the person deciding. */
  getModerationAct(id: Uuid): Promise<ModerationActRecord | null>;
  /** Every act taken against a set of subject refs, newest first. The
   *  "what was done to my listings" read, and the standing check is the
   *  caller's: this takes the refs it is given. */
  listModerationActsForSubjects(
    subjectKind: string,
    subjectRefs: readonly string[],
    limit?: number,
  ): Promise<ModerationActRecord[]>;
  /** Null when the appeal is refused, for either of two reasons the caller
   *  disambiguates afterwards: this person has already appealed this act
   *  (ever), or somebody else's appeal against it is still open. Both are
   *  NOT EXISTS guards in the INSERT — 1510's partial unique index sits
   *  behind them as a concurrency backstop, so a co-maintainer filing during
   *  an open appeal gets a sentence rather than a constraint violation. */
  createAppeal(input: CreateAppealInput): Promise<AppealRecord | null>;
  getAppeal(id: Uuid): Promise<AppealRecord | null>;
  /** Whether this subject has ever appealed this act, decided or not. */
  hasAppealed(actId: Uuid, appellantSubjectId: string): Promise<boolean>;
  /** Their own appeals, for the acts they are looking at. */
  listAppealsByAppellant(appellantSubjectId: string, limit?: number): Promise<AppealRecord[]>;
  /** The operator queue: oldest open first. */
  listOpenAppeals(limit?: number): Promise<AppealRecord[]>;
  /** Terminal, and only from `open` — re-deciding a decided appeal would
   *  rewrite who decided it and when, which is the one thing the ledger row
   *  beside it cannot be made to agree with afterwards. */
  resolveAppeal(input: ResolveAppealInput): Promise<AppealRecord | null>;
  /** TS5's report: appeals by state, and how many upholds actually reversed
   *  something, since a moment. */
  countAppealsSince(since: string): Promise<Array<{ state: string; count: number }>>;
  countAppealReversalsSince(since: string): Promise<number>;
  /** TS5's report: reports by state since a moment — received against
   *  actioned, which is the pair that makes the rest believable. */
  countReportsSince(since: string): Promise<Array<{ state: string; count: number }>>;


  // ---- the signal plane (openproduct-commons SN1) ----
  /** Declare or update what we watch for a listing. */
  upsertSignalSource(
    profileId: Uuid,
    source: SignalSourceName,
    locator: string | null,
  ): Promise<SignalSourceRecord>;
  /**
   * Sources due a poll, oldest-checked first, skipping the withdrawn.
   * `beforeIso` is the caller's cutoff — the scheduler computes it from the
   * tier's interval, so the cadence is a decision in the contract rather than
   * a constant buried in SQL.
   */
  listDueSignalSources(beforeIso: string, limit?: number): Promise<DueSourceRecord[]>;
  /**
   * OB2 — every listed build with a public GitHub URL is watched.
   *
   * Nothing declared a source before this, so the queue `listDueSignalSources`
   * reads was empty and every card printed a dash for merges. This makes the
   * listing's own `repo_url` the declaration: a `declared_repo` row per listed
   * profile whose URL is on github.com (skipping one an App already watches),
   * a fresh run when the URL changed, and a withdrawal when it was cleared.
   * An unchanged URL never revives a source its failures withdrew.
   */
  seedDeclaredRepoSources(at: string): Promise<{ seeded: number; withdrawn: number }>;
  /** A source answered. Clears the failure run; nothing else changes. */
  recordSignalSuccess(profileId: Uuid, source: SignalSourceName, at: string): Promise<void>;
  /**
   * A source did not answer. Increments the run and, at `withdrawAfter`,
   * withdraws it — which stops both the polling AND the rendering, because a
   * number whose source we have given up on is exactly what OPC-7 exists to
   * prevent.
   */
  recordSignalFailure(
    profileId: Uuid,
    source: SignalSourceName,
    error: string,
    at: string,
    withdrawAfter: number,
  ): Promise<SignalSourceRecord | null>;
  /**
   * Append an observation. THE ONLY WRITE PATH: there is no update, so a
   * correction is a new row with a later observedAt and the history survives.
   */
  writeMetric(input: WriteMetricInput): Promise<void>;
  /** The latest value of every metric for a listing — one read per cache fill. */
  latestMetrics(profileId: string): Promise<MetricRecord[]>;
  /** The same, for many listings at once: the directory's whole metrics read. */
  latestMetricsForSlugs(slugs: string[]): Promise<Map<string, MetricRecord[]>>;
  appendActivity(input: AppendActivityInput): Promise<void>;
  listActivity(profileId: string, limit?: number): Promise<ActivityEventRecord[]>;

  // ---- writes ----
  /** Also records the creator as the listing's first OWNER (OX4). */
  createProfile(input: CreateProfileInput): Promise<ProfileRecord>;
  updateProfile(orgId: Uuid, profileId: Uuid, input: UpdateProfileInput): Promise<ProfileRecord | null>;
  recordRepoObservation(profileId: Uuid, observation: RepoObservation): Promise<ProfileRecord | null>;
  reviewProfile(profileId: Uuid, reviewedBy: string, at: string): Promise<ProfileRecord | null>;
  /** OH4 — `components` is the curated snapshot for THIS publish; omitted or
   *  null publishes none (the default), and a re-publish rewrites wholesale. */
  /**
   * TS1 — publish, with the ladder's decision carried in.
   *
   * `allowWithoutReview` and `indexable` come from `publishDecision`. They are
   * PARAMETERS rather than a level this method resolves itself, because the
   * repository must not know what a trust level is: the policy lives in the
   * contract where it can be read and argued with, and this re-asserts the
   * resolved decision in SQL so a race cannot slip past it.
   */
  publishProfile(
    orgId: Uuid,
    profileId: Uuid,
    at: string,
    actor: string,
    options: { components?: ProfileComponent[] | null; allowWithoutReview: boolean; indexable: boolean },
  ): Promise<ProfileRecord | null>;
  /** TS1 — how many PUBLIC listings this subject holds that nobody has
   *  reviewed. The abuse bound for a maker who has never been cleared. */
  countUnreviewedPublished(subjectId: string): Promise<number>;
  unpublishProfile(orgId: Uuid, profileId: Uuid, actor: string): Promise<ProfileRecord | null>;
  deleteProfile(orgId: Uuid, profileId: Uuid): Promise<boolean>;
  /** Orphan handling: the project went away, so the listing stops being public. */
  unpublishByProject(projectId: Uuid): Promise<number>;

  upsertRoleOpening(input: UpsertRoleOpeningInput): Promise<RoleOpeningRecord>;
  setRoleOpeningJoinLink(id: Uuid, joinLinkRef: string): Promise<RoleOpeningRecord | null>;
  deleteRoleOpening(profileId: Uuid, id: Uuid): Promise<boolean>;
  setMaintainers(profileId: Uuid, maintainers: MaintainerInput[]): Promise<PublishedMaintainerRecord[]>;

  // ---- contributor home (OH0): everything keyed by subject_id ----
  getContributor(subjectId: string): Promise<ContributorRecord | null>;
  upsertContributor(input: UpsertContributorInput): Promise<ContributorRecord>;
  /** One row per (subject, opening): re-applying re-uses the row. */
  recordApplication(input: RecordApplicationInput): Promise<ApplicationRecord>;
  /**
   * CB2 — raw pending counts per opening. Never joined to activity_events
   * (OPC-F); the flooring happens in core, before anything leaves the estate.
   */
  countOpeningDemand(profileId: string): Promise<OpeningDemandRecord[]>;

  /** CB3 — the application behind a JR ref, with what it was an offer for. */
  getApplicationByRequestRef(jrRequestRef: string): Promise<{
    subjectId: string;
    profileId: string;
    status: string;
    openingTitle: string | null;
  } | null>;


  // CB4 — notifications. I3: nothing here takes or returns an address.
  /** Derived from the posts; there is no subscriptions table by design. */
  listThreadParticipants(threadId: string): Promise<string[]>;
  listMutes(
    threadId: string,
    subjectIds: readonly string[],
  ): Promise<{ thread: string[]; global: string[] }>;
  /** False when the unique index refused it — already queued for that event. */
  queueNotification(input: QueueNotificationInput): Promise<boolean>;

  /**
   * NF0 — write one inbox row. False when this person already had it.
   *
   * IDEMPOTENT ON `(subject_id, event_key)`, and the index is the guarantee: a
   * retried sweep, a redelivered seam event and two workers racing all land on
   * DO NOTHING rather than on a duplicate in somebody's inbox.
   */
  writeNotification(input: WriteNotificationInput): Promise<boolean>;

  /** NF0 — this person's inbox, newest first, with `unread` computed against
   *  their own cursor. Reading it writes nothing. */
  listNotifications(subjectId: string, limit: number): Promise<NotificationRecord[]>;

  /** NF0 — how many rows sit after this person's read cursor. One comparison,
   *  which is why read state is a cursor rather than a flag per row. */
  countUnreadNotifications(subjectId: string): Promise<number>;

  /** NF0 — move the cursor. FORWARD ONLY: a clock that went backwards would
   *  un-read things somebody has already seen. */
  markNotificationsRead(subjectId: string, at: string): Promise<void>;

  // ─── AC1 — the credential store ──────────────────────────────────────────
  //
  // NOT ONE OF THESE TAKES AN ADDRESS, and none can: AC0's schema has no
  // column to hold one. A challenge hash, a hashed password and a subject id
  // cross this boundary; the address exists only inside one gateway request,
  // in a worker with no database binding.

  /** SR0 — public profiles matching a query, LIVE and never from the search
   *  index. Applies CG2's four eligibility conditions in the same SQL as
   *  `listPublicContributorCards`, because an index is a cache and a cached
   *  eligibility decision about a person goes stale in the direction "still
   *  findable after they turned it off". Matches handle, display name and bio
   *  — the three things the profile it links to already shows. */
  searchPublicContributors(
    needle: string,
    limit: number,
  ): Promise<Array<{ handle: string; displayName: string | null; bio: string | null }>>;

  /** AC1 — remember which password is waiting behind a challenge. Returns
   *  false when the challenge already has one, so a retry does not stack a
   *  second password behind the same piece of mail. */
  issueCredentialToken(input: IssueCredentialTokenInput): Promise<boolean>;

  /** AC1 — spend a token, EXACTLY ONCE. The single-use guard and the expiry
   *  check are both in the statement, so two clicks race in the database
   *  rather than in a handler. Null means spent, expired, wrong purpose or
   *  never issued — the caller must not tell those apart out loud. */
  consumeCredentialToken(
    tokenHash: string,
    purpose: CredentialTokenPurposeName,
    at: string,
  ): Promise<{
    purpose: CredentialTokenPurposeName;
    subjectId: string | null;
    verifier: string | null;
  } | null>;

  /** AC1 — the password is proven; write it against the subject the platform
   *  minted. Upserts, because somebody who forgot and signed up again expects
   *  the password they just proved to be the one that works. */
  writeCredential(input: WriteCredentialInput): Promise<void>;

  /** AC2's read, shipped with AC1: a write nothing reads is a write nothing
   *  tests properly. */
  getCredential(subjectId: string): Promise<{ verifier: string; verifiedAt: string } | null>;

  /** AC1 — drop unconsumed tokens past their window. An abandoned sign-up
   *  leaves a hashed password nobody is coming back for. */
  expireCredentialTokens(before: string): Promise<number>;

  // ─── AC2b — openproduct's own session ────────────────────────────────────
  //
  // The gateway resolves one of these against core on every authenticated
  // request, exactly as it resolves a platform token against the platform.
  // That symmetry is the milestone's whole design: the cookie is a POINTER at
  // both doors and a claim at neither.

  /** AC2b — mint a session for a subject that just proved a password. The
   *  HASH is stored; the token itself never reaches this layer. */
  issueAuthSession(input: IssueAuthSessionInput): Promise<void>;

  /** AC2b — the hot-path read, by primary key. Returns the row as stored,
   *  INCLUDING a revoked or expired one: whether it is still a session is
   *  `sessionUsable`'s decision, made in one place, rather than a filter here
   *  that a second caller would have to remember to repeat. */
  resolveAuthSession(tokenHash: string): Promise<AuthSessionRecord | null>;

  /** AC2b — end one session. Idempotent: revoking a revoked session keeps the
   *  first timestamp, because when it ended is the fact worth having. */
  revokeAuthSession(tokenHash: string, at: string): Promise<void>;

  /** AC2b — end every session a subject holds. Not reachable from a surface
   *  yet; it is what TS3's removal and a future "sign out everywhere" both
   *  need, and it is one statement rather than a loop a caller writes. */
  revokeAuthSessionsForSubject(subjectId: string, at: string): Promise<number>;

  /** AC2b — drop sessions past their window. Revoked rows are KEPT: the
   *  timestamp is the answer to "when did this end", and a sweep that deleted
   *  them would throw that away to save nothing worth saving. */
  expireAuthSessions(before: string): Promise<number>;

  // ─── the digest by email (openproduct-commons LC5) ───

  /**
   * Where this person stands. Three states, not two: "never asked" and
   * "asked and left" are different to somebody reading the control.
   */
  getDigestStanding(subjectId: string): Promise<{ standing: string; since: string | null }>;
  /**
   * Subscribe or unsubscribe. Upserts, so re-subscribing reuses the row —
   * somebody who leaves and returns is not somebody who has never been asked,
   * and the row is what remembers that.
   */
  setDigestSubscription(subjectId: string, subscribed: boolean, at: string): Promise<void>;
  /** Who is currently subscribed. Bounded per run for the reason every sweep
   *  here is: a send that times out half-way must be recoverable. */
  /** Has this week already been queued? One indexed read, asked before the
   *  send considers walking the subscriber list — the queue is idempotent,
   *  but re-walking every subscriber on every tick to discover that is a
   *  cost the guard exists to avoid. */
  digestWeekQueued(eventRef: string): Promise<boolean>;
  listDigestSubscribers(limit: number): Promise<string[]>;
  /**
   * Queued digests that are STILL WANTED.
   *
   * The subscription is re-checked here rather than trusted from queue time,
   * which is what makes "unsubscribe takes effect immediately, including for
   * something already queued" true rather than approximately true. The outbox
   * is a queue, not a promise.
   */
  listPendingDigests(limit: number): Promise<Array<{ id: string; subjectId: string; eventRef: string }>>;
  markDigestDelivered(ids: readonly string[], at: string): Promise<number>;
  /** A failed attempt, so a permanently failing row stops being retried
   *  rather than becoming a queue that only grows. */
  recordDigestAttempt(ids: readonly string[]): Promise<number>;
  setThreadMute(subjectId: string, threadId: string, muted: boolean): Promise<void>;
  setNotificationPref(subjectId: string, muted: boolean): Promise<void>;
  getNotificationPref(subjectId: string): Promise<boolean>;
  isThreadMuted(subjectId: string, threadId: string): Promise<boolean>;

  listApplicationsBySubject(subjectId: string): Promise<ApplicationRecord[]>;
  /** The JR status sync, keyed by the request's public id. JR is right. */
  setApplicationStatusByRequestRef(jrRequestRef: string, status: ApplicationStatus): Promise<number>;
  /** OH3 — the bridge from a JR ask back to the listing it came from: the
   *  opening whose join_link_ref is this link, on a PUBLIC listing only (the
   *  record write must not confirm anything about drafts). */
  getRoleOpeningByJoinLinkRef(joinLinkRef: string): Promise<{ id: string; profileId: string } | null>;
  saveProduct(subjectId: string, profileId: Uuid): Promise<void>;
  unsaveProduct(subjectId: string, profileId: Uuid): Promise<boolean>;
  // ─── the endorsement (openproduct-commons EN0) ───
  //
  // DORMANT: nothing routes to these until EN1. They exist here so the shape
  // the integrity model (EN3) has to fit was agreed before anybody had a
  // total they wanted to protect.

  /** One subject's endorsement of one listing, however it stands. */
  getEndorsement(profileId: Uuid, subjectId: string): Promise<EndorsementRecord | null>;
  /**
   * EN1 — resolve a PUBLIC listing's id from its slug, for the endorse path.
   *
   * Through the visibility filter, so endorsing a draft is indistinguishable
   * from endorsing something that does not exist. The alternative — resolving
   * the id and then checking — makes this an existence oracle for drafts.
   */
  getPublicProfileId(slug: string): Promise<Uuid | null>;
  /** EN1 — resolve a listing's id regardless of visibility, for WITHDRAWAL.
   *  The mirror of the unsave rule: an endorsement you cannot withdraw
   *  because the listing went private is a public act you are stuck with, and
   *  withdrawing discloses nothing. */
  getProfileIdBySlug(slug: string): Promise<Uuid | null>;
  /**
   * Endorse, or re-endorse after a withdrawal. IDEMPOTENT and row-reusing:
   * the key is the (listing, subject) pair, so "endorsed, withdrew, endorsed
   * again" is one row with a history rather than three facts nobody can
   * reconcile.
   */
  endorse(profileId: Uuid, subjectId: string, state: "confirmed" | "pending", at: string): Promise<EndorsementRecord>;
  /** Withdraw. Sets `withdrawn_at`; NEVER deletes, because EN3 must be able
   *  to restate a total without erasing what it restated. */
  withdrawEndorsement(profileId: Uuid, subjectId: string, at: string): Promise<EndorsementRecord | null>;
  /**
   * The public total for one listing: distinct subjects who endorsed, have
   * not withdrawn, are confirmed, and are not discounted.
   *
   * Computed from the rows rather than read from a counter (EN-3) — a counter
   * cannot be restated without erasing history, and drifts the first time a
   * write path forgets it.
   */
  /**
   * `discounted` IS PV3's, AND IT MUST NOT REACH A PUBLIC SHAPE. The
   * clean-vote mark is a boolean over `discounted / (total + discounted)`,
   * computed on the server so the count has nowhere to travel. EN3's fifth
   * decision — nothing per-person is ever exposed — and PV3's done-when —
   * nothing on the page reveals a per-listing suppression count — both turn
   * on this number staying here.
   */
  /**
   * OS2 — every listing a snapshot is taken of, as FULL RECORDS in one read.
   * PV4 returned ids and read each profile back singly (N+1); the phase now
   * reads once. `listed()` only: a listing with no public projection has no
   * moment to record.
   */
  listPublicProfilesForSnapshot(limit?: number): Promise<ProfileRecord[]>;
  /**
   * OS2 — open-role counts for every listed profile, one GROUP BY. A listing
   * with none is ABSENT and read as zero — the genuine-zero case (OPC-C).
   */
  countOpenRoleOpeningsByProfile(): Promise<Map<string, number>>;
  /**
   * OS2 — the snapshot sweep's floor. The instant of the last completed sweep,
   * or null for never. The handler derives the DAY from it; the health
   * document reads the instant like every other phase.
   */
  getSnapshotSweptAt(): Promise<string | null>;
  markSnapshotSwept(at: string): Promise<void>;
  /**
   * PV4 — the digest's lead. Per listing: the last snapshot BEFORE the week
   * and the last one IN it. A listing with no baseline is ABSENT rather than
   * rendered as all-new — the first-snapshot rule applied to the digest.
   *
   * OS5 — the baseline is looked for in the `SNAPSHOT_BASELINE_LOOKBACK_DAYS`
   * before the window, not in the whole history: OS2 records every listed
   * listing once a day, so the eve's row is the baseline for every listing
   * the sweep reached, and a week of lookback covers a sweep that missed
   * days. A listing the sweep did not reach for the whole lookback is absent
   * from that week's digest — the same rule as a listing with no history.
   */
  listSnapshotPairsInWindow(
    startDay: string,
    endDay: string,
    limit?: number,
  ): Promise<
    Array<{ slug: string; from: Record<string, unknown>; toAt: string; to: Record<string, unknown> }>
  >;
  /**
   * PV4 — write the day's snapshot. One row per listing per day by primary
   * key, so the ten-minute sweep is idempotent; the day's row holds the
   * LATEST shape of that day.
   */
  recordSnapshot(
    profileId: Uuid,
    takenOn: string,
    takenAt: string,
    fields: Record<string, unknown>,
  ): Promise<void>;
  /**
   * PV4 — the baseline: the most recent snapshot STRICTLY older than the day
   * asked about, or null when there is none. Strictly, so today's own row is
   * never its own baseline — which would make every diff empty and look like
   * nothing on this site ever changes.
   */
  latestSnapshotBefore(
    profileId: string,
    beforeDay: string,
  ): Promise<{ takenAt: string; fields: Record<string, unknown> } | null>;
  /**
   * PV3 — record the clean-vote mark. Called by the same path that writes the
   * totals, so the two cannot disagree.
   */
  setCleanVotes(profileId: Uuid, clean: boolean): Promise<void>;
  countEndorsements(
    profileId: Uuid,
    now: string,
  ): Promise<{ total: number; recent: number; discounted: number }>;
  /** XP2's overlay question, bounded by the ids on the page: which of these
   *  has this subject endorsed? */
  endorsedSlugsAmong(subjectId: string, slugs: readonly string[]): Promise<string[]>;

  // ─── integrity (openproduct-commons EN3) ───

  /**
   * The window the sweep reasons over: live endorsements created since
   * `sinceIso`, each carrying the subject's FIRST endorsement time anywhere
   * here.
   *
   * `subjectFirstSeenAt` is a fact about their history ON THIS SURFACE, not
   * about their identity elsewhere (OPC-6). We do not know and do not ask how
   * old an Orunbase account is; what we know is when somebody started
   * endorsing here, and that is the only newness this model may reason about.
   */
  listEndorsementsForIntegrity(
    sinceIso: string,
    limit: number,
  ): Promise<IntegrityObservationRecord[]>;
  /**
   * Record the sweep's opinions, and REVERSE the ones it no longer holds.
   *
   * ONE CALL, because the two halves are one restatement: applying without
   * reversing means a ring broken up last week stays discounted forever, and
   * reversing without applying means a live ring counts for a cycle. Returns
   * what actually changed, so the audit row describes a real delta rather
   * than the size of the sweep.
   */
  restateIntegrity(input: RestateIntegrityInput): Promise<IntegrityRestatement>;
  /**
   * TS4 — discount a cohort, and never overwrite an existing opinion.
   *
   * NOT `restateIntegrity`, and the difference is the whole method. That one
   * REPLACES the reason on conflict, which is right for EN3 (its assessor
   * applies its own precedence and re-decides the whole window each run) and
   * wrong here: an endorsement already discounted as part of a `ring` would
   * be rewritten to `cohort`, EN3 would rewrite it back an hour later, and
   * TS5's disclosure counts would oscillate between two sweeps describing the
   * same endorsement two ways.
   *
   * `ON CONFLICT DO NOTHING`: if it is already discounted, it stays
   * discounted for the reason first recorded. There is no reversal half at
   * all — a cohort that turns out to be real is undone by a human, through
   * the flag it raised.
   */
  discountCohort(input: DiscountCohortInput): Promise<number>;
  /** EN-4 — counts by reason for the transparency report. Never by listing,
   *  never by subject: either would be an accusation made by arithmetic. */
  integrityDisclosure(sinceIso: string): Promise<Array<{ reason: string; discounted: number }>>;
  /** EN3 — when the last sweep finished, or null if none has. The floor lives
   *  in the DATABASE rather than in worker memory because there is no single
   *  worker: an isolate with its own timer sweeps once per isolate. */
  // ─── the two-sided roster (openproduct-commons CG3) ───

  /**
   * The PUBLIC roster: confirmed edges only, reconciled with the maintainer's
   * publication list.
   *
   * "Reconciled" rather than "merged" is load-bearing. `published_maintainers`
   * is the maintainer's list — their ordering, their labels. `product_people`
   * is the consent. The roster is the intersection, so a person who confirmed
   * but was removed from the publication list is not shown, and a person on
   * the publication list who never confirmed is not shown either.
   */
  listRoster(profileId: Uuid): Promise<RosterMemberRecord[]>;
  /** One person's view: what they are on, and what they have been asked to
   *  join. The `/me` surface's question. */
  listRosterForSubject(subjectId: string): Promise<SubjectRosterRecord>;
  /** The edge as it stands, for the authorization check. Null = absent, which
   *  is a real state in the transition table (`invite` requires it). */
  getRosterEdge(profileId: Uuid, subjectId: string): Promise<RosterEdgeRecord | null>;
  /** The maintainer's create. Always `pending` — there is no path that
   *  creates a confirmed edge, because a confirmed edge nobody confirmed is
   *  the thing this table exists to prevent (OPC-G's grandfather ran once, in
   *  a migration, and is marked). */
  inviteToRoster(input: InviteToRosterInput): Promise<RosterEdgeRecord>;
  /** The named person's yes. */
  confirmRosterEdge(profileId: Uuid, subjectId: string, at: string): Promise<RosterEdgeRecord | null>;
  /** The named person's no. DELETES: "I was never part of this" should leave
   *  no record that they were asked. */
  declineRosterEdge(profileId: Uuid, subjectId: string): Promise<boolean>;
  /** Either side ends it. The row survives — CG4 counts over history. */
  retireRosterEdge(
    profileId: Uuid,
    subjectId: string,
    retiredBy: string,
    at: string,
  ): Promise<RosterEdgeRecord | null>;
  /** CG4's `contributes to`: confirmed edges on PUBLIC listings this subject
   *  holds, ever — retired included, because they did the work. */
  countRosterMemberships(subjectId: string): Promise<number>;
  /** OPC-G — how many public edges nobody actually confirmed. For TS5, and
   *  for knowing when the notification backlog is clear. */
  countGrandfathered(): Promise<number>;

  getIntegritySweptAt(): Promise<string | null>;
  markIntegritySwept(at: string): Promise<void>;

  // ─── the flag queue (openproduct-commons TS4) ───

  /**
   * Raise a flag, or collapse into the one already open.
   *
   * IDEMPOTENT BY THE SCHEMA, not by the caller checking first. The sweep
   * runs on a cron and re-raises every finding every run; without the partial
   * unique index behind this, a listing with an empty pitch would file a new
   * queue row every hour until somebody looked at it, which is a queue nobody
   * looks at. Returns null when the flag was already open — or, with `once`,
   * when one was ever raised.
   */
  raiseFlag(input: RaiseFlagInput): Promise<FlagRecord | null>;
  /** The queue read: oldest open first, because a queue worked newest-first
   *  never reaches its tail (the same rule TS0 set for reports). */
  listOpenFlags(limit?: number): Promise<FlagRecord[]>;
  /** "What has been noticed about this thing" — the question a triager asks
   *  with a report already open in front of them. */
  listFlagsForSubject(subjectKind: string, subjectRef: string, limit?: number): Promise<FlagRecord[]>;
  /**
   * A human's verdict on a flag.
   *
   * `dismissed` is a first-class outcome and is COUNTED: it is the only
   * measurement of the false-positive rate that comes from production rather
   * than from a fixture, and a detector that cannot be shown to be wrong is a
   * detector nobody can argue with.
   */
  resolveFlag(
    id: Uuid,
    state: "actioned" | "dismissed",
    resolvedBy: string,
    at: string,
  ): Promise<FlagRecord | null>;
  /** TS5's number, and the one this milestone is accountable to: flags by
   *  kind and outcome over a period. Never by subject. */
  flagDisclosure(sinceIso: string): Promise<Array<{ kind: string; state: string; count: number }>>;

  // ─── what the defence sweep reads ───

  /**
   * Listed pitches, for the filler check.
   *
   * ONLY `indexable` ONES. The single consequence this detector has is
   * de-indexing, so a listing already un-indexed has nothing left to do to it
   * — reading it again every hour would burn the sweep's budget re-deciding
   * something already decided, and re-raising a flag on a maker who has
   * already had the only consequence there is.
   */
  listPitchesForDefence(limit: number): Promise<PitchRecord[]>;
  /**
   * Endorsements in the window, shaped for cohort detection.
   *
   * Carries `subjectFirstSeenAt` for the same reason EN3's read does, and
   * with the same meaning: their history ON THIS SURFACE, never their
   * identity elsewhere (OPC-6).
   */
  listActsForCohorts(sinceIso: string, limit: number): Promise<CohortObservationRecord[]>;
  /** Live launches in the window with their endorsements' account ages, for
   *  the board's eligibility rule. */
  listLaunchEndorsements(sinceIso: string): Promise<LaunchEndorsementRecord[]>;
  /** Listings carrying a live `ring` discount, so EN3's finding reaches a
   *  human as well as a total. */
  listRingDiscountedProfiles(sinceIso: string): Promise<Array<{ profileId: string; slug: string; discounted: number }>>;
  /**
   * TS4's one automated consequence on a listing.
   *
   * Separate from every other profile write so it is greppable: this is the
   * only path by which automation changes anything a reader sees, and 1370's
   * CHECK still holds above it (a public, indexable, unreviewed listing
   * cannot exist).
   */
  setListingIndexable(profileId: Uuid, indexable: boolean): Promise<boolean>;
  /** TS4's floor. Separate from EN3's because the two sweeps read different
   *  things over different windows and will not stay on one cadence. */
  getDefenceSweptAt(): Promise<string | null>;
  markDefenceSwept(at: string): Promise<void>;

  // ─── the sweep ledger (openproduct-worldclass-v2 LI0) ───

  /**
   * Every materialisation phase's durable state in one read: when it last did
   * its work, and — WC2-1 — why it last failed, if nothing has succeeded since.
   * Five singleton rows, one function, so `/health` cannot forget a phase.
   */
  getSweepPhaseStates(): Promise<Record<SweepLedgerPhase, SweepPhaseStateRecord>>;
  /**
   * What the gateway saw of each phase this tick. A failure writes its bounded
   * reason beside the floor timestamp WITHOUT touching it (the phase's own
   * handler owns "when it last worked"); a success clears the reason. The
   * board and digest cuts have no other writer, so their success also stamps
   * `swept_at`. Returns how many rows were written.
   */
  recordSweepOutcomes(outcomes: readonly SweepOutcomeInput[], at: string): Promise<number>;

  // ─── collections (openproduct-commons LC4) ───

  /**
   * May this person publish a collection?
   *
   * CG4's biconditional, asked as a question rather than re-implemented: a
   * curator is somebody whose handle RESOLVES — public contributor profile,
   * unreleased handle, and a published listing behind it. "Signed" has to
   * mean a name a reader can go and look at, or it means nothing.
   */
  curatorHandleFor(subjectId: string): Promise<string | null>;
  /** How many this curator already has live. Bounded so one voice cannot
   *  become the index. */
  countLiveCollections(subjectId: string): Promise<number>;

  /**
   * The index: published collections whose curator still resolves.
   *
   * `count` is the VISIBLE count — the items that are public right now — and
   * never the stored item count. A card saying "8 products" that opens onto
   * five is the page lying about a number it could have counted correctly.
   */
  listPublishedCollections(limit: number): Promise<CollectionCardRecord[]>;

  /**
   * FL1 — open roles across PUBLISHED listings, most recently opened first.
   *
   * A cross-listing read rather than the per-profile `listPublicRoleOpenings`:
   * the sidebar's panel is about the estate, not about one product, and one
   * read per listing to fill three rows is the N+1 `listRostersFor` was
   * batched to avoid.
   *
   * WEIGHTED BY NOTHING. Not by how many endorsements the listing has, not by
   * how many people have already asked to help — a role on a quiet product is
   * as findable as a role on a busy one, which is most of what a directory of
   * small open products is for. The order is published as
   * `openings.newest`.
   */
  listOpenRoles(limit: number): Promise<OpenRoleRecord[]>;

  /**
   * MP0 — the three counts a maker page's header shows, in ONE read.
   *
   * TOGETHER RATHER THAN BESIDE THEIR LISTS, and that is the milestone's own
   * done-when: the header shows all three on every tab, so counting each one
   * inside the query that draws its list would mean three of the four numbers
   * on a page came from queries that page never ran. One read, three
   * subqueries, the same visibility filters the lists apply.
   */
  countMakerActivity(subjectId: string): Promise<MakerActivityCounts>;

  /**
   * MP0 — launches of the public listings this person maintains, newest first.
   *
   * THE ORDINAL IS DERIVED HERE FROM THE SWEEP'S OWN NUMBERS, with the board's
   * published comparison (counted desc, then earlier launch, then slug) — the
   * same arithmetic `listFeedLaunches` does in code over the same stored
   * figures. Not a second ranking: a launch's position on a maker's page and
   * on its own day's board are the same number by construction.
   */
  listMakerLaunches(subjectId: string, limit: number): Promise<MakerLaunchRecord[]>;

  /**
   * MP0 — listings this person upvoted, most recently upvoted first.
   *
   * WITHDRAWN IS ABSENT, never struck through: withdrawal is the act of
   * unsaying something in public, and a record that survived it would make it
   * unsayable. Saves are a different table and are read by nothing here.
   */
  listMakerUpvotes(subjectId: string, limit: number): Promise<MakerUpvoteRecord[]>;

  /**
   * MP0 — listings this person has commented on, by their most recent comment.
   *
   * LISTINGS, NOT POSTS. Every post is already public and already carries its
   * author's handle, so nothing new is disclosed — but a per-person index of
   * everything somebody has said is a different artefact from the same words
   * in the conversations they belong to, and this read declines to build it.
   */
  listMakerComments(subjectId: string, limit: number): Promise<MakerCommentRecord[]>;
  /** PE1 — the person's acts, newest first, everything before `before` when given. */
  listMakerHistory(subjectId: string, limit: number, before: string | null): Promise<MakerHistoryRecord[]>;
  /** PE2 — `YYYY-MM-DD` of the earliest live launch of a listing they maintain, or null. */
  firstMakerLaunchDay(subjectId: string): Promise<string | null>;
  /** PE2 — how many public listings they maintain carry PV3's clean-vote mark. */
  countMakerCleanVoteListings(subjectId: string): Promise<number>;
  /**
   * One collection, with the items that are public right now, in the
   * curator's order.
   *
   * Null when it is not published, or when its curator no longer resolves —
   * the judgement was only publishable while it was attributable.
   */
  getPublicCollection(slug: string): Promise<CollectionRecord | null>;
  /** The curator's own list, whatever state each is in. */
  listCollectionsForCurator(subjectId: string): Promise<CuratorCollectionRecord[]>;
  /** One of theirs, for the studio's edit view. Null if it is not theirs. */
  getCuratorCollection(id: Uuid, subjectId: string): Promise<CuratorCollectionRecord | null>;

  createCollection(input: CreateCollectionInput): Promise<CollectionRow | null>;
  /** Appended at the end of the curator's order. Null when the listing is not
   *  publicly addable or is already in. */
  addCollectionItem(input: AddCollectionItemInput): Promise<boolean>;
  removeCollectionItem(collectionId: Uuid, slug: string): Promise<boolean>;
  /** Renumbered DENSELY from the slugs given, in that order. Sparse positions
   *  rot: after enough moves two collide and the order becomes whatever the
   *  database returns. */
  reorderCollectionItems(collectionId: Uuid, slugs: readonly string[], at: string): Promise<number>;
  setCollectionState(
    id: Uuid,
    subjectId: string,
    state: "published" | "retired",
    at: string,
  ): Promise<CollectionRow | null>;

  // ─── the launch board (openproduct-commons LC3) ───

  /**
   * The launches that went live inside a day, with the raw account ages
   * behind every endorsement that landed during it.
   *
   * RAW, NOT PRE-COUNTED. The eligibility partition happens in the contract,
   * because `boardEligible` is TS4's rule and a second copy of it in SQL is
   * how the published sentence and the actual order come to disagree. What
   * the database is asked for is the facts; what counts is decided once, in
   * one function, that a test can reproduce exactly.
   */
  listLaunchesOnDay(startIso: string, endIso: string): Promise<BoardLaunchRecord[]>;
  /**
   * The days that hold at least one live launch, most recent first — the
   * archive index, and the sweep's list of what to recompute.
   */
  listBoardDays(limit: number): Promise<Array<{ day: string; launches: number }>>;
  /** Write a day's computed ranks. One call per day so a settled day is
   *  written once and never touched again. */
  writeBoardRanks(input: WriteBoardRanksInput): Promise<number>;
  /** Read a day's ranks back, as the board renders them. */
  readBoardRanks(day: string): Promise<BoardRankRecord[]>;
  /**
   * OL2 — every live launch on any of these days, with the board's rank and
   * the card facts a feed row draws.
   *
   * ONE CALL FOR THE WHOLE WINDOW, not one per day. The feed covers seven
   * days and the front page has a budget of one read; seven round trips to
   * render one cached document would spend that budget six times over.
   *
   * The days are passed IN, never derived from `now()` here. A window that
   * came from the database's clock would make the front page a function of
   * when the query ran rather than of the day it names, and two readers a
   * second apart could see different feeds — OPC-1 broken by a detail nobody
   * would look at.
   */
  listFeedLaunches(dayIds: readonly string[]): Promise<FeedLaunchRecord[]>;

  /**
   * UV2 — the confirmed public roster for SEVERAL listings at once.
   *
   * Same reconciliation as `listRoster` and the same SQL predicate: confirmed
   * edge INNER JOIN the maintainer's publication list. It is a batched read
   * rather than a different rule, and it must stay that way — a second
   * definition of "who is publicly on this product" is how an unconsented
   * name eventually reaches a page.
   *
   * ONE CALL FOR A WHOLE TABLE. The leaderboard draws up to a month of
   * launches and each row shows an avatar stack; one `listRoster` per row is
   * the N+1 that makes a page's read count a function of how busy the month
   * was.
   *
   * Returns a map keyed by profile id. A listing with no confirmed roster is
   * ABSENT from the map rather than present with an empty array — the caller
   * renders nothing either way, and an absent key cannot be mistaken for a
   * measured emptiness.
   */
  listRostersFor(profileIds: readonly Uuid[]): Promise<Map<string, RosterMemberRecord[]>>;

  // ─── follows (openproduct-launch FL0) ───

  /**
   * Follow a target. Idempotent — the primary key is the triple, so following
   * twice is following once and no handler has to remember to check.
   *
   * `target` is a canonical topic value or an opaque SUBJECT ID. Core resolves
   * a handle to a subject before calling: a handle is the public address and
   * a subject id is what this schema stores, and translating at the boundary
   * keeps the internal identifier off the wire.
   *
   * Returns false when the row was refused by the schema — today that is only
   * the self-follow check, which is a real request a maker can make by opening
   * their own page and clicking the button that is there.
   */
  follow(subjectId: string, kind: FollowKindName, target: string): Promise<boolean>;

  /**
   * Unfollow. DELETES the row rather than tombstoning it — the migration says
   * why at length: a follow has no restatement, so a tombstone would be a
   * durable private record that this person once followed that person, kept by
   * us and asked for by nobody.
   *
   * Returns whether a row went. False is not an error: unfollowing something
   * you do not follow is the state you asked for.
   */
  unfollow(subjectId: string, kind: FollowKindName, target: string): Promise<boolean>;

  /**
   * How many follow each of these targets.
   *
   * A COUNT AND NEVER A LIST. There is deliberately no read anywhere that
   * answers "who follows this", and the index leads with `(kind, target)` so
   * this stays one lookup while a follower list stays a scan.
   *
   * Returns a map keyed by target. A target nobody follows is ABSENT rather
   * than zero — the caller renders zero either way now that follows exist, but
   * an absent key cannot be mistaken for a measured emptiness by a caller that
   * has not read this sentence.
   */
  countFollowers(kind: FollowKindName, targets: readonly string[]): Promise<Map<string, number>>;

  /**
   * Which of these targets this subject follows — the XP2 overlay's question,
   * bounded by what the page asked about.
   *
   * Bounded rather than open, for the reason the overlay's other reads are: an
   * unbounded "everything you follow" would turn one page's personalisation
   * into a listing of the visitor's whole subscription history.
   */
  listFollowed(
    subjectId: string,
    targets: readonly { kind: FollowKindName; target: string }[],
  ): Promise<Array<{ kind: FollowKindName; target: string }>>;

  // ─── the public contributor profile (openproduct-commons CG1) ───

  /**
   * The public profile behind a handle, or null.
   *
   * Null covers every reason equally: no such handle, a released one, a
   * contributor who never opted in, and one whose standing lapsed. The page
   * 404s on all four, because distinguishing them would make this read an
   * oracle for whether a given person has an account.
   */
  getPublicContributor(handle: string): Promise<PublicContributorRecord | null>;
  /**
   * DS4 — every handle whose page a crawler is allowed to reach.
   *
   * The SAME two gates as `getPublicContributor`, expressed once more rather
   * than approximated: opted in, live handle, and at least one public listing
   * they maintain. A sitemap built from a looser query would advertise pages
   * that 404 — and a sitemap full of 404s is how a crawler learns to stop
   * trusting the document.
   *
   * `publishedAt` rides along as the `lastmod`. Coarse on purpose: it is when
   * the PUBLIC page began, not when the person last edited it, because an
   * edit timestamp on a public document is a record of somebody's activity
   * that nobody asked to publish.
   */
  listPublicContributorHandles(): Promise<Array<{ handle: string; publishedAt: string }>>;
  /**
   * CG2 — the contributors directory, one row per person.
   *
   * SAME ELIGIBILITY AS THE PAGE AND THE SITEMAP: opted in, live handle, and
   * standing. This is now the third statement expressing that rule, which is
   * two more than anybody wants — and the reason it is written out rather
   * than factored into a shared predicate is that each of the three reads a
   * DIFFERENT projection, and a shared fragment would have to be a string
   * pasted into three queries, which is a shared implementation with none of
   * the safety. The pglite tests instead assert the three AGREE against the
   * same fixtures, which is the property that actually matters.
   *
   * CG3 replaces all three at once, when `product_people` makes the standing
   * join `confirmed` edges rather than published maintainers.
   *
   * A LIMIT, always. This surface is the one public read whose row count
   * grows with people rather than with listings, and an unbounded people
   * query is the shape of a slow request somebody discovers by accident.
   */
  listPublicContributorCards(limit: number): Promise<PublicContributorCardRecord[]>;
  /** CG1 — set (or clear) the opt-in. `publishedAt` is stamped on the first
   *  publish and never rewritten: it is when the PUBLIC surface began. */
  setProfileVisibility(subjectId: string, isPublic: boolean, at: string): Promise<ContributorRecord | null>;

  /** OH2 — save by slug, THROUGH the visibility filter: only a public listing
   *  resolves, so unknown and private answer identically (false). */
  saveProductBySlug(subjectId: string, slug: string): Promise<boolean>;
  /** OH2 — unsave by slug regardless of visibility: a bookmark you cannot
   *  remove is a bug, and removal discloses nothing. */
  unsaveProductBySlug(subjectId: string, slug: string): Promise<boolean>;
  /** Saved products as PUBLIC cards only — a listing that was unpublished
   *  after being saved must not leak through the bookmark. */
  listSavedPublicCards(subjectId: string): Promise<ProfileCardRecord[]>;
  /**
   * XP2 — the personalisation overlay, in ONE round trip.
   *
   * Four answers that would otherwise be four queries, on the one read that
   * runs on every public page view for every signed-in visitor. It returns
   * ids and integers and nothing else — see `MeOverlay` for why that
   * restriction is load-bearing rather than an optimisation.
   *
   * `slugs` bounds the `saved` answer to what the page actually asked about;
   * `savedCount` is the account's total and is deliberately a different
   * number. An empty `slugs` still returns the three counts.
   */
  overlayFor(subjectId: string, slugs: readonly string[]): Promise<OverlayRecord>;
  // ---------------------------------------------------------------------
  // The search index (openproduct-commons DS0). Every method here is fed by
  // the PUBLIC projection, never by a query against profiles — see the 1350
  // migration for why that inversion is the whole safety argument.
  // ---------------------------------------------------------------------

  /**
   * Replace the whole index for one kind, in one transaction-shaped pass.
   *
   * WHOLESALE, because that is how de-indexing works: an unpublished listing
   * is simply absent from `documents` and its row goes with the replace. An
   * incremental index needs somebody to remember to remove it, and that
   * somebody is how every stale search result ever shipped.
   */
  replaceSearchIndex(kind: string, documents: readonly SearchIndexRow[], builtAt: string): Promise<number>;
  /**
   * Narrow to candidates by term overlap. NO ORDERING — the overlap test has
   * no opinion about rank, and the rank comes from a published formula in the
   * contract (OPC-4). Bounded by `limit` so a broad query stays bounded.
   */
  searchCandidates(terms: readonly string[], limit: number): Promise<SearchIndexRow[]>;
  /** The one state row: when the index was last built and whether it is stale. */
  getSearchIndexState(): Promise<SearchIndexState>;
  /** Mark the index stale. Called by every write that can change the document. */
  markSearchIndexDirty(at: string): Promise<void>;
  /**
   * Record that the sweep found the index clean (OPN-11): current without a
   * rebuild. Stamps `checked_at` only while the index is still clean, and
   * never touches `built_at`, which stays the rebuild floor. The phase's
   * last run, as `/health` reads it, is the later of the two.
   */
  markSearchIndexChecked(at: string): Promise<void>;

  // ─── the handle namespace (openproduct-commons CG0) ───

  /** One handle, however it stands — reserved, released, held, or absent. */
  getHandle(handle: string): Promise<HandleRecord | null>;
  /** The subject's ACTIVE handle, if they have one. A released row is not it. */
  getActiveHandleForSubject(subjectId: string): Promise<HandleRecord | null>;
  /**
   * FL0 — many handles to their holders, in one read.
   *
   * The overlay asks "am I following these people", and a page names them by
   * HANDLE because that is the public address; the table stores subject ids.
   * One batched translation rather than one read per handle, for the reason
   * `listRostersFor` is batched: a page's read count should not be a function
   * of how many names it renders.
   *
   * ACTIVE holders only. A released handle has no holder, and answering with
   * its previous one would attach a follow to somebody who gave the name up.
   * A handle with no active holder is ABSENT from the map.
   */
  getSubjectsForHandles(handles: readonly string[]): Promise<Map<string, string>>;
  /**
   * Claim a handle for a subject.
   *
   * Returns null when the row is reserved, released, or held by somebody
   * else — the caller has already decided WHY via `claimRefusal`, and this
   * re-asserts it in SQL so a race cannot hand one handle to two people.
   */
  claimHandle(handle: string, subjectId: string, at: string): Promise<HandleRecord | null>;
  /**
   * Release a subject's active handle. The row SURVIVES with `released_at`
   * set — it is a tombstone, and nobody is ever given it again.
   */
  releaseHandle(subjectId: string, at: string): Promise<HandleRecord | null>;

  /**
   * The subject's own exit (OX5c, widened by CS2 to every subject-keyed
   * column). Driven by `OPENPRODUCT_SUBJECT_REGISTRY`: every `theirs` row is
   * deleted, every `anonymise` and `record` row is kept with the subject id
   * replaced by a tombstone (or nulled where the column allows), the handle
   * released. Idempotent: a second call finds nothing. `at` is the moment the
   * release and any other kept-row stamp carry.
   */
  eraseSubject(subjectId: string, at: string): Promise<SubjectErasure>;
  /**
   * CS3 — `GET /me/export`: one document built by walking the registry's
   * `rows` columns and nothing else (plus the maintainer projection of their
   * listings). One list, two readers: the exit deletes or keeps exactly what
   * this hands over.
   */
  exportSubject(subjectId: string, at: string): Promise<SubjectExport>;
  /**
   * CS2 — where a subject appears, counted per registry column: the
   * assertion `eraseSubject` is tested against, and the read CS3's export
   * will walk. Rows of a polymorphic column count only under its subject kind.
   */
  subjectFootprint(subjectId: string): Promise<Map<string, number>>;
}
