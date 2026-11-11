// Provenance — where a public fact came from, and when it was true.
// (openproduct-commons CT0, realising OPC-2.)
//
// THIS IS THE MOST LOAD-BEARING MODULE IN THE PROGRAM, and it is 200 lines.
//
// The claim openproduct wants to make is that two products can be compared.
// That claim is worth nothing unless a reader can tell, for every number on
// the page, whether a person wrote it, a machine measured it, or we computed
// it — and, for the last two, at what moment. A catalog without provenance is
// a catalog of assertions.
//
// The estate has already paid for the lesson once. OD3 set out to resolve
// maintainer display names at read time, discovered mid-build that doing so
// would hand the public isolate a deanonymize-any-subject capability, and
// made the name AUTHORED instead — the right answer, found late. The general
// form of that lesson is: a field's trust class is part of its type, not a
// property discovered while implementing it.
//
// So `Fact<T>` is the wire type for every non-identity public field, and the
// three constructors below are the only way to build one. An `observed` fact
// cannot exist without the moment it was observed; a `derived` fact cannot
// exist without a formula id that resolves to published prose (OPC-4). Both
// are compile errors, not lint rules.

// ---------------------------------------------------------------------------
// Where an observation came from
// ---------------------------------------------------------------------------

/**
 * Where an observation came from (OPC-C's standing answer, SN-1).
 *
 * The first four are the REPOSITORY TIERS, and a listing sits in exactly one
 * of them: the tier decides which metrics can exist at all — never what they
 * default to. A tier-3 listing has no activity *because nothing measured it*,
 * and it renders a dash. It does not render a zero: a zero is a claim, and an
 * unmeasured thing has not made one.
 *
 * `declared_url` is not one of those tiers and does not compete with them.
 * MD0 added it for a reading of a listing's LIVE ADDRESS rather than its
 * repository, so a listing has a repository tier and, separately, may or may
 * not have been looked at. `REPO_SIGNAL_SOURCES` below is the tier list where
 * something needs one.
 */
export const SIGNAL_SOURCES = [
  /** A repository linked through the platform's GitHub App, read over the
   *  seam. Everything is observable, tests included. */
  "linked_repo",
  /** A public repository URL the maintainer declared, read without an App.
   *  Commits and last-touched only — we cannot see CI, so there is no tests
   *  figure and the field is absent rather than empty. */
  "declared_repo",
  /** The component manifest captured at publish. Names, kinds and languages;
   *  no activity of any sort. */
  "manifest",
  /** An operator recorded it by hand. Rare, always visible as such, and never
   *  used to fill a gap the automated tiers left. */
  "operator",
  /** A live address the maintainer declared, fetched anonymously — no
   *  credential, no App, no custody of anything. MD0 added it, and it is the
   *  first source here that is not a read of a repository at all: a
   *  screenshot of a running site is not a repository read, and reaching for
   *  the nearest existing name would have been the same overstatement PV0
   *  found in the catalog, one plane over. */
  "declared_url",
] as const;
export type SignalSource = (typeof SIGNAL_SOURCES)[number];

/**
 * The subset the SIGNAL PLANE's write door accepts (SN1).
 *
 * `SIGNAL_SOURCES` is the vocabulary of every observation this product makes.
 * `signal_sources` — the table the sweep polls and writes metrics against —
 * only ever holds a repository read, and its rows are keyed on the pair
 * (listing, source). MD0 widened the vocabulary with `declared_url`, which
 * that table has no row shape for; validating the observation endpoint
 * against the WIDER list would have let a caller post an observation that
 * matched no source row and recorded nothing, silently.
 *
 * So the door has its own list. Widening one no longer widens the other, and
 * which one a new source belongs to is a question somebody has to answer.
 */
export const REPO_SIGNAL_SOURCES = [
  "linked_repo",
  "declared_repo",
  "manifest",
  "operator",
] as const satisfies readonly SignalSource[];
export type RepoSignalSource = (typeof REPO_SIGNAL_SOURCES)[number];

// ---------------------------------------------------------------------------
// The three classes
// ---------------------------------------------------------------------------

/** Who authored a fact a human wrote. Both are the maintainer's or the
 *  contributor's own voice — never a platform assertion about them. */
export type AuthoredBy = "maintainer" | "contributor";

export type Provenance =
  | { readonly class: "authored"; readonly by: AuthoredBy }
  | {
      readonly class: "observed";
      readonly source: SignalSource;
      /** ISO-8601. Required by construction — see the module header. */
      readonly observedAt: string;
    }
  | {
      readonly class: "derived";
      readonly formula: FormulaId;
      /** The metric or field ids this was computed from, for the docs page. */
      readonly inputs: readonly string[];
      readonly computedAt: string;
    };

/** Value plus provenance. The wire type for every public field a human reads. */
export interface Fact<T> {
  readonly value: T;
  readonly provenance: Provenance;
}

// ---------------------------------------------------------------------------
// The only three ways to build one
// ---------------------------------------------------------------------------

export function authored<T>(value: T, by: AuthoredBy): Fact<T> {
  return { value, provenance: { class: "authored", by } };
}

/**
 * An observation. `observedAt` is a required positional argument, which is the
 * whole mechanism: there is no overload, no default, and no `Partial` that
 * lets it be forgotten.
 */
export function observed<T>(value: T, source: SignalSource, observedAt: string): Fact<T> {
  return { value, provenance: { class: "observed", source, observedAt } };
}

/**
 * A computed value. `formula` is a `FormulaId`, so it can only be one of the
 * ids below — and every id resolves to a published sentence, which is how
 * OPC-4 ("every ordering is explainable in one published sentence") stops
 * being a promise and becomes a type.
 */
export function derived<T>(
  value: T,
  formula: FormulaId,
  inputs: readonly string[],
  computedAt: string,
): Fact<T> {
  return { value, provenance: { class: "derived", formula, inputs, computedAt } };
}

/** Narrowing helpers, so a renderer can branch without repeating the literal. */
export function isObserved<T>(
  fact: Fact<T>,
): fact is Fact<T> & { provenance: Extract<Provenance, { class: "observed" }> } {
  return fact.provenance.class === "observed";
}

export function isDerived<T>(
  fact: Fact<T>,
): fact is Fact<T> & { provenance: Extract<Provenance, { class: "derived" }> } {
  return fact.provenance.class === "derived";
}

/**
 * When a fact was true, or null for an authored one.
 *
 * The renderer's single question. A surface may show an observed or derived
 * value only beside this (invariant I9), and having one accessor means the
 * rule has one place to be enforced rather than two branches to keep in step.
 */
export function factAt<T>(fact: Fact<T>): string | null {
  const p = fact.provenance;
  if (p.class === "observed") return p.observedAt;
  if (p.class === "derived") return p.computedAt;
  return null;
}

// ---------------------------------------------------------------------------
// The formula registry — the published half of OPC-4
// ---------------------------------------------------------------------------

/**
 * Every computed number the product shows, and the sentence that explains it.
 *
 * THIS IS A PUBLIC DOCUMENT, not an internal note. CT2 serves it at
 * `/docs/formulas`, the API returns the id beside every derived value, and CI
 * fails if a `FormulaId` exists with no sentence here (invariant I7).
 *
 * It is deliberately seeded with formulas later sub-epics will compute. The
 * point of OPC-4 is that the *rules* are published; a rule that appears only
 * on the day its number does is a rule nobody had a chance to object to.
 * `computedBy` says which milestone starts emitting it.
 */
export interface Formula {
  readonly id: string;
  /** One sentence. If it needs two, the formula is doing too much. */
  readonly sentence: string;
  /** The milestone that starts emitting facts carrying this id. */
  readonly computedBy: string;
}

export const FORMULAS = {
  // ─── PV0 — what a public repository read can see ───────────────────────
  //
  // FOUR, NOT FIVE. The plan named "licence, language, tests, last commit,
  // open issues"; there is no `repo.tests` here and there will not be one
  // until the source can see CI. `declared_repo`'s own description in this
  // file says so — "we cannot see CI, so there is no tests figure and the
  // field is absent rather than empty" — and an absent field is honest where
  // a guessed one would put a number nobody could defend into a frame whose
  // entire claim is that its numbers are not claims.
  "repo.licence": {
    id: "repo.licence",
    sentence:
      "The SPDX identifier GitHub reports for the linked public repository, read at the last check. A repository declaring no licence, or declaring one GitHub cannot identify, has none here rather than a guess.",
    computedBy: "PV0",
  },
  "repo.language": {
    id: "repo.language",
    sentence:
      "The language GitHub reports as the repository's primary one, read at the last check. It is GitHub's own determination by bytes of code, not a maintainer's answer and not this product's.",
    computedBy: "PV0",
  },
  "repo.last-commit": {
    id: "repo.last-commit",
    sentence:
      "When the linked repository was last pushed to, as GitHub reported it at the last check. A push, not a merge and not a release — it moves when anybody pushes to any branch.",
    computedBy: "PV0",
  },
  "repo.open-issues": {
    id: "repo.open-issues",
    sentence:
      "GitHub's own count of open issues on the linked repository at the last check, which INCLUDES open pull requests. Recorded as answered rather than adjusted: separating them would mean a second read per listing, and a number this product computed rather than one it observed.",
    computedBy: "PV0",
  },
  "activity.merges.7d": {
    id: "activity.merges.7d",
    sentence:
      "Changes merged into the default branch of the linked repository in the trailing seven days, counted once per merge and capped per contributor per day (five), never counting automation accounts.",
    computedBy: "SN2",
  },
  "activity.merges.30d": {
    id: "activity.merges.30d",
    sentence:
      "Changes merged into the default branch of the linked repository in the trailing thirty days, counted once per merge and capped per contributor per day (five), never counting automation accounts.",
    computedBy: "OB2",
  },
  "sort.most-active": {
    id: "sort.most-active",
    sentence:
      "Merged changes times counted upvotes over the trailing seven days, each plus one, highest first, so a build needs both work and interest to lead. Upvotes are counted after the integrity discount, and a build whose upvotes have not been counted yet is ranked on its changes alone. Builds whose changes are not observed are ordered last, never as zero, and among themselves by when they were published, most recent first. Ties go to more merged changes, then to the more recently published build; two builds equal on all of those are ordered by their address, so a page boundary falls in one place. Merged changes are counted, not pushes, and are capped per contributor per day.",
    computedBy: "OB3",
  },
  // ─── IN3 — the front-page floor (openproduct-worldclass) ───────────────
  //
  // AN ELIGIBILITY RULE, NOT A WEIGHT, and the sentence says so twice because
  // that is the thing a reader would otherwise assume. WC-D refused the
  // audit's published weight: a directory that decides who is seen holds
  // power over people who chose to build in the open to escape exactly that,
  // and "the listing with more marketing collateral ranks higher" reads like
  // the thing that audience left.
  "catalog.front-page-floor": {
    id: "catalog.front-page-floor",
    sentence:
      "A listing appears in the catalogue on the front page once it has a one-line description and a topic. THIS IS NOT A RANKING RULE AND IT IS NOT A BOOST: a listing that clears the bar holds exactly the position its observed activity gives it, and a listing that has not cleared it is not ordered lower — it is not in that list yet. Clearing the bar twice buys nothing, so there is nothing here to compete on. Nothing else a maintainer fills in affects where anything is ordered; the studio's own checklist is advice to them and reaches no public surface. Listings that launched this week are shown under their day by the launch board's own rule and are not filtered by this one.",
    computedBy: "IN3",
  },
  "sort.most-saved": {
    id: "sort.most-saved",
    sentence:
      "Listings ordered by the number of distinct subjects who have endorsed them and not withdrawn, all time, after the integrity discount is applied.",
    computedBy: "DS2",
  },
  "sort.newest": {
    id: "sort.newest",
    sentence: "Listings ordered by when they were first published, most recent first.",
    computedBy: "DS2",
  },
  // OB4 — a FILTER over Most active, not a fifth comparator. The front page's
  // Roles order is the builds that are asking for people, in the order the
  // page already explains; how many roles a build opens moves nothing, so
  // opening ten to climb a list does nothing.
  "sort.roles": {
    id: "sort.roles",
    sentence:
      "Builds with at least one open role, in the Most active order. How many roles a build has open does not move it, and a build with none is not on this list.",
    computedBy: "OB4",
  },
  "alternatives.overlap": {
    id: "alternatives.overlap",
    sentence:
      "Up to four listings that share something with this one, ordered by how much they share and by nothing else. Each shared thing counts once — the same topic, the same licence, running the same way — and each stack entry both carry counts once more; the panel names beside every listing exactly what it shares. A listing sharing nothing at all is absent rather than shown as a fourth suggestion. Ties are broken alphabetically so the panel is the same for every reader and the same tomorrow. Nothing about who is reading, what they read before, what other readers opened, or how active a listing is enters this order.",
    computedBy: "PV2",
  },
  "similar.same-category-then-active": {
    id: "similar.same-category-then-active",
    sentence:
      "SUPERSEDED BY `alternatives.overlap` (PV2) AND NO LONGER COMPUTED. It ordered up to four listings sharing this listing's category by merged changes in the trailing seven days. The sentence stays published because this address was linked from the panel it explained, and a rule that disappears leaves a reader who followed that link with no way to find out what they had been shown. What replaced it states, beside every listing, what that listing shares — and orders by that rather than by activity, so a panel no longer reshuffles because somebody else pushed a commit.",
    computedBy: "DS4",
  },
  "votes.clean": {
    id: "votes.clean",
    sentence:
      "A mark shown on a listing whose upvotes were checked by the integrity model and almost none discounted: at least 10 counted upvotes, and no more than 5% of everything cast set aside. IT ORDERS NOTHING — the directory and the launch board read the discounted TOTAL, which already reflects the same check, and ordering by this as well would count one defence twice. NO NUMBER IS PUBLISHED PER LISTING, here or anywhere: the ratio is computed where the rows are and only the mark leaves. And an ABSENT mark is not a finding — the great majority of listings have too few upvotes to check at all, so no mark covers both the listing nobody has voted on enough and the listing that did not clear the bar, and nothing distinguishes them.",
    computedBy: "PV3",
  },
  "integrity.discount": {
    id: "integrity.discount",
    sentence:
      "Endorsements not counted toward a listing's public total. An endorsement is discounted when a group of accounts endorsed substantially the same set of listings within a short window, or when one account endorsed many listings faster than a person reads them. Newness alone is never a reason. Nothing is deleted, the person is never told, and a later review can restore it — we publish how many were discounted and why, in aggregate, never which listings and never who.",
    computedBy: "EN3",
  },
  "endorsements.total": {
    id: "endorsements.total",
    sentence:
      "Distinct subjects who have endorsed this listing and not withdrawn, after the integrity discount is applied. One subject counts once.",
    computedBy: "EN2",
  },
  "endorsements.7d": {
    id: "endorsements.7d",
    sentence:
      "Endorsements added in the trailing seven days and not since withdrawn, after the integrity discount is applied.",
    computedBy: "EN2",
  },
  "digest.most-endorsed": {
    id: "digest.most-endorsed",
    sentence:
      "Listings ordered by the endorsements they received DURING that week — Monday to Sunday, in UTC — after the integrity discount, with the earliest launch of the week breaking a tie. Counted over the week itself rather than over a trailing window, so a digest from a year ago still answers about the days it names. A listing with no endorsements that week does not appear; absence here means nobody endorsed it in those seven days, not that it was judged.",
    computedBy: "LC1",
  },
  "facet.count": {
    id: "facet.count",
    sentence:
      "Public listings carrying this facet value at the last recompute. Recomputed on write and at most once every sixty seconds, which is also how stale the page itself may be.",
    computedBy: "CT4",
  },
  "openings.open": {
    id: "openings.open",
    sentence: "Contributor openings on this listing whose status is open.",
    computedBy: "CT4",
  },
  "followers.count": {
    id: "followers.count",
    sentence:
      "People following this listing right now. Counted at read time and never listed — nobody can see who they are, including the maintainers.",
    computedBy: "PP1",
  },
  "people.roster": {
    id: "people.roster",
    sentence:
      "Maintainers and contributors whose place on this listing both the maintainer and the person themselves have confirmed. Unconfirmed entries are not counted.",
    computedBy: "CG3",
  },
  "team.size-bucket": {
    id: "team.size-bucket",
    sentence:
      "The bucket this listing's confirmed roster falls into: solo, 2–3, 4–10, 11–30, or more than 30.",
    computedBy: "CG3",
  },
  "contributor.maintains": {
    id: "contributor.maintains",
    sentence:
      "Published listings this person runs — they hold an owner or maintainer role on it, and it is public. This is the same standing that makes the profile exist at all, so the number is never zero on a page you can read. Drafts are not counted, and neither is a listing that merely names them. THIS IS NOT THE NUMBER OF LAUNCHES: publishing and launching are separate acts, so this number and `maker.launched` count different things and often differ.",
    computedBy: "CG4",
  },
  "contributor.contributes-to": {
    id: "contributor.contributes-to",
    sentence:
      "Published listings this person confirmed a place on and does not run — counted ever, so a listing they have since left still counts, because the work happened. Anything already counted under maintains is subtracted rather than counted twice. Invitations nobody answered are not counted, and neither is anything unpublished.",
    computedBy: "CG4",
  },
  "contributor.since": {
    id: "contributor.since",
    sentence:
      "When this person's public profile began, to the month. Not when their account was created, and not when they first appeared on somebody else's listing.",
    computedBy: "CG4",
  },
  "contributor.reviews.12mo": {
    id: "contributor.reviews.12mo",
    sentence:
      "Reviews this person left on listings whose repositories are linked, in the trailing twelve months. Absent — not zero — where the repository's reviews cannot be observed.",
    computedBy: "CG4",
  },
  "listing.indexable": {
    id: "listing.indexable",
    sentence:
      "Whether search engines are asked to index this listing. A maker's first listing is not indexed until one of theirs has been reviewed by a person; every listing after that is indexed on publication. The decision is made when the listing is published and is not revisited, so a maker's later standing never changes what an already-published page was allowed to be. The page itself is live and readable either way.",
    computedBy: "TS1",
  },
  "search.relevance": {
    id: "search.relevance",
    sentence:
      "Results ordered by where the search words were found: the exact name first, then a name that starts with them, then a name that contains them, then a stack or category value, then the tagline. Ties are broken by merged changes in the trailing seven days, then alphabetically. Nothing about who is searching, and no popularity signal, enters this order.",
    computedBy: "DS0",
  },
  "launch.board-rank": {
    id: "launch.board-rank",
    sentence:
      "Launches from one UTC day, ordered by the endorsements that listing received during that day, after the integrity discount. Only endorsements from accounts that already existed when the launch went live are counted toward a position — a brand-new account's endorsement still counts on the listing's own public total, it just does not move a rank, which is how a bought audience is answered without anybody being detected or accused. Ties are broken by the earlier launch time, then by slug so a settled day never reorders. A closed day is final. This is not the directory's order and shares none of its inputs.",
    computedBy: "LC3",
  },
  "launch.leaderboard": {
    id: "launch.leaderboard",
    sentence:
      "Launches from one range — the trailing seven days, or the calendar month so far — ordered by the upvotes each one received on the day it launched, after the integrity discount. It pools the numbers the daily board already published, without counting anything again, so a launch's figure is identical here and on its own day's board. A launch that won a quiet day therefore sits below one that came third on a busy day, which is what a range asks and a day cannot answer. A launch the daily sweep has not counted yet is absent rather than listed at zero. Ties are broken by the earlier launch time, then by slug. There is no all-time range: an ordering that never resets ranks how long a listing has existed.",
    computedBy: "UV2",
  },
  "topic.recent-launches": {
    id: "topic.recent-launches",
    sentence:
      "Topics ordered by how many launches they held in the last thirty days, most first, ties broken alphabetically. A topic with none in that window is not listed. Nothing about who is reading enters this order — not what they opened, not how long they stayed, and not how many people follow the topic, which would make the already-followed more followed. The panel this feeds is named for activity because activity is what it measures.",
    computedBy: "FL1",
  },
  "collection.newest": {
    id: "collection.newest",
    sentence:
      "The most recently published collection, and nothing else about it. There is no editorial `featured` flag anywhere on this estate: a collection is already an attributable editorial act by a named curator, and a second layer of selection over the top would be an unattributable one.",
    computedBy: "FL1",
  },
  "openings.newest": {
    id: "openings.newest",
    sentence:
      "Open roles from published listings, most recently opened first. Nothing about the listing's standing, how many people have already asked to help, or who is reading enters this order — a role on a quiet product is as findable as a role on a busy one, which is most of what a directory of small open products is for.",
    computedBy: "FL1",
  },
  "people.open-to-project": {
    id: "people.open-to-project",
    sentence:
      "People who have themselves ticked `open to one more project` on their public profile, most recently published first. This is NOT a recommendation and orders nobody by merit: not by the upvotes their products earned, not by how much they have launched, and not by how many people already follow them, which would make the already-followed more followed. It is a list of people who put their hand up, in the order they put it up.",
    computedBy: "FL1",
  },
  "maker.launched": {
    id: "maker.launched",
    sentence:
      "Launches of listings this person maintains, most recent day first, and within a day in the order that day's board put them in. It reads the rank the daily sweep already stored rather than computing one here, so a launch's position on a maker's page and on its own day's board cannot disagree. A launch whose day is still open carries no rank yet and says so. A listing that is no longer public takes its launches off this page with it. THIS IS NOT THE NUMBER OF LISTINGS THEY RUN: publishing a listing and launching it are separate acts, so somebody can maintain two products and have launched neither, and somebody can have launched something they have since handed over. `contributor.maintains` counts the listings.",
    computedBy: "MP0",
  },
  "threads.recently-replied": {
    id: "threads.recently-replied",
    sentence:
      "Threads on public listings, most recently replied first — the moment of the latest visible comment, and nothing else. The count beside each is the thread's visible comments, by the same rule the launch row's count uses, so the two are one number. A comment a moderator removed neither counts nor moves a thread up. This is not popularity: a thread with one new reply outranks one with fifty older ones. Nothing about who is reading enters it.",
    computedBy: "HB3",
  },
  "threads.latest": {
    id: "threads.latest",
    sentence:
      "Threads on public listings, newest thread first — the moment the thread was started, and nothing else. Every category counts the same; a reply does not move a thread here. Nothing about who is reading enters it.",
    computedBy: "FO1",
  },
  "threads.most-replied": {
    id: "threads.most-replied",
    sentence:
      "Threads on public listings by how many visible replies each has, most first, ties broken by the latest reply. The count is the thread's own visible comments — the same number its row shows and the launch row shows — so a removed comment neither counts nor ranks. This is not hot: a thread with many old replies stays above one with a few new ones. Nothing about who is reading enters it.",
    computedBy: "FO1",
  },
  "maker.upvoted": {
    id: "maker.upvoted",
    sentence:
      "Listings this person upvoted, most recently upvoted first. An upvote is public and has the voter's name on it — the control says exactly that where it is pressed — and this is that same fact, listed. A withdrawn upvote is absent rather than struck through: withdrawal is the act of unsaying something in public, and a record that survived it would make it unsayable. A save is a different, private act and appears nowhere. The integrity discount changes what a listing's total counts, never whether the person who voted can see their own vote here.",
    computedBy: "MP0",
  },
  "maker.comments": {
    id: "maker.comments",
    sentence:
      "Listings this person has commented on, ordered by their most recent comment on each. The count beside a listing is how many of THEIR comments are on it, not how long the discussion is. The words themselves are not reproduced here: they are public where they were written, in the thread that gives them their meaning, and a per-person index of everything somebody has said is a different artefact from the same sentences in their own conversations. A removed comment is absent, and a listing that is no longer public is absent with it.",
    computedBy: "MP0",
  },
  "maker.first-launch": {
    id: "maker.first-launch",
    sentence:
      "The day the earliest live launch of a listing this person maintains went live, in UTC. A date and not a rank: it says when they first launched, not how it went. Absent until a listing they maintain has launched; a listing that is no longer public takes its launches with it.",
    computedBy: "PE2",
  },
  "maker.history": {
    id: "maker.history",
    sentence:
      "Every public act this person has taken, in the order it happened, newest first: a listing they maintain going live, a comment they wrote, an upvote they gave, a role they confirmed. Each row is their own record and nothing is scored, ranked or totalled — the counters in the header are computed by their own formulas, and this is the ledger beneath them. Paged by moment: the next page is everything before the last row shown. A removed comment, a withdrawn upvote and a listing that is no longer public are absent.",
    computedBy: "PE1",
  },
  "contributor.followers": {
    id: "contributor.followers",
    sentence:
      "How many distinct accounts follow this person and have not unfollowed. A count and never a list: nothing on this estate answers who they are, including to the person followed, because a public follower list turns a private subscription into a graph anyone can crawl. Counted on the request path rather than kept in a column, so it cannot drift. Honest at zero.",
    computedBy: "FL0",
  },
  "comment.votes": {
    id: "comment.votes",
    sentence:
      "Distinct people who upvoted this comment and have not withdrawn. One person counts once, an author cannot upvote their own comment, and the number is the same for every reader. IT ORDERS NOTHING: comments appear in the order they were written, and no ranking anywhere on this site takes this figure as an input. That is also why it carries no integrity discount, unlike a listing's upvotes — the discount exists to protect an ordering that decides what other people are shown, and a brigaded comment count is a wrong number beside one comment rather than a wrong page. If comments are ever ordered by it, the discount comes with that change and not before.",
    computedBy: "DQ1",
  },
} as const satisfies Record<string, Formula>;

export type FormulaId = keyof typeof FORMULAS;

/**
 * The anchor a formula's prose lives at: `/docs/formulas#sort-most-active`.
 *
 * DERIVED FROM THE ID rather than written beside it, so a link and the heading
 * it points at cannot disagree. A `FormulaId` that resolved to published prose
 * but whose LINK went nowhere would satisfy invariant I7 and still leave the
 * reader with a dead anchor — which is the failure OPC-4 is actually about, in
 * the one place it is easiest to ship.
 */
export function formulaAnchor(id: string): string {
  return id.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
}

/** Where a formula's sentence can be read, in full. */
export function formulaHref(id: string): string {
  return `/docs/formulas#${formulaAnchor(id)}`;
}

/** Every published formula, in id order — what `/docs/formulas` renders. */
export function allFormulas(): readonly Formula[] {
  return Object.values(FORMULAS as Record<string, Formula>).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
}
