// What becomes public, generated rather than written (saas-openproduct OD6;
// moved with the maintainer surface into the studio at OX5b).
//
// The plan's requirement: "the dialog's list is generated from the projection
// contract rather than hand-written, so it cannot drift". This module is that
// generation, and it is pure so the property is testable.
//
// WHY IT MATTERS. A hand-written list is a promise about a contract it cannot
// see. Add a field to `PublicProfile` and the dialog keeps reassuring a
// maintainer about the old shape — which is precisely the failure the epic
// refuses everywhere else (a denylist projection, a cut list that names
// directories). Here the dialog is DERIVED from `PUBLIC_PROFILE_KEYS`, and a
// key with no copy is a build-visible gap rather than a silent omission.

import {
  PUBLIC_MAINTAINER_KEYS,
  PUBLIC_PROFILE_KEYS,
  PUBLIC_ROLE_OPENING_KEYS,
  UNREVIEWED_LISTING_CAP,
} from "@openproduct/contracts";

export interface DisclosureLine {
  /** The projection key this line accounts for. */
  key: string;
  /** What a maintainer sees. Plain language, not a field name. */
  label: string;
  /** Present when the value is not the maintainer's own words. */
  note?: string;
}

/**
 * One line per key in `PublicProfile`. Keyed by the contract, so adding a field
 * without adding copy is caught by the OD6 test rather than shipped as a
 * reassurance that is quietly incomplete.
 */
const PROFILE_COPY: Record<string, Omit<DisclosureLine, "key">> = {
  slug: { label: "The project's public address", note: "openproduct.live/<slug>" },
  tagline: { label: "Your one-line description" },
  pitch: { label: "Your pitch, in full" },
  // PV2 — the one disclosed field a READER MAY RUN, so this line says the
  // thing a maintainer most needs to know before publishing: it is presented
  // for copying, and nothing here has checked it.
  installLine: {
    label: "Your install command",
    note: "Shown in a box people can copy. It is your command in your words — nothing here has run it",
  },
  // PV3 — the one disclosed field a maintainer did not write and cannot set.
  // The line says what it is and, more importantly, what its ABSENCE is not:
  // most listings carry no mark because most have too few upvotes to check,
  // and a maintainer reading this list should not conclude that a missing one
  // is a judgement about them.
  // PP1 — a NUMBER, and the only public face of a follow. The people behind
  // it are never listed, to the maintainer least of all: the promise on the
  // control is "nobody can see who they are, including you".
  followers: {
    label: "How many people follow this listing",
    note: "A count, never a list. Nobody can see who follows a listing, including you",
  },
  cleanVotes: {
    label: "Whether your upvotes carry the clean-vote mark",
    note: "Set by us, not by you. Most listings have too few upvotes to check and carry no mark — that is not a finding, and no number about it is ever published",
  },
  // PV4 — THE ONE DISCLOSED FIELD THAT IS ABOUT THE PAST. Every other line
  // here describes what a listing says today; this one says that what it USED
  // to say is kept and shown. A maintainer editing a tagline should know that
  // the old one appears beside the new one for a week, because that changes
  // how some people would write the first one.
  // MD2 — THE FIRST DISCLOSED FIELD THAT IS A PICTURE. The line says two
  // things a maintainer should know before publishing: the alt text they
  // wrote is shown to people who cannot see the image, and a screenshot we
  // captured is dated and is not their upload — the provenance split MD0
  // made is visible on the page, and this is where they learn it.
  media: {
    label: "Your hero image and gallery",
    note: "Shown at the top of the listing with the alt text you wrote. A screenshot we capture ourselves is framed differently and carries the date it was taken; it is never presented as yours",
  },
  changes: {
    label: "What you changed on this listing in the last week",
    note: "We record what your listing says once a day and show what moved — the old value beside the new one. Only the fields on this page; never a draft, and never who edited it",
  },
  pitchDigest: {
    label: "A fingerprint of the pitch",
    note: "So the page can be cached and you can see exactly which version is live",
  },
  stack: { label: "The stack tags you chose" },
  stackCanonical: {
    label: "Which of those tags the catalog recognised",
    note: "What people can filter by — anything unrecognised still shows on your page, it is just not counted",
  },
  category: {
    label: "The category you picked",
    note: "Blank if you left it unanswered — this directory does not guess one for you",
  },
  hosting: {
    label: "How you said it runs",
    note: "Self-hosted, a managed service, or local-first — blank if you left it unanswered",
  },
  pricing: {
    label: "What you said it costs to use",
    note: "Free, open core, paid, or free to self-host — your words, not a price this directory checks; blank if you left it unanswered",
  },
  repoUrl: { label: "A link to the repository" },
  liveUrl: { label: "A link to the running product" },
  // OPR5 (seam S12) — the door INTO the workspace, which exists because the
  // workspace is public and linked. A visitor who follows it signs in to
  // Orunbase and becomes a reader: the catalog and the plan, never secrets,
  // runs, events, members or spend (the reader role, OPR1).
  workspaceRef: {
    label: "A \"View workspace on Orunbase\" door",
    note: "Signed-in visitors become readers of your public workspace: catalog and plan only",
  },
  licence: {
    label: "The licence your repository declares",
    note: "Read from GitHub, not typed here",
  },
  // PV0 — the rest of the observed row. Each says the same thing the frame on
  // the public page says, because a maintainer deciding whether to publish
  // should read the same sentence a visitor will.
  language: {
    label: "The language GitHub reports for your repository",
    note: "GitHub's own determination by bytes of code, read at the last check",
  },
  lastCommitAt: {
    label: "When your repository was last pushed to",
    note: "A push to any branch, as GitHub reported it — not a merge and not a release",
  },
  openIssues: {
    label: "How many open issues your repository has",
    note: "GitHub's own count, which includes open pull requests",
  },
  observedAt: {
    label: "When those four were read",
    note: "Shown beside them, so a reader can tell an old reading from a current one",
  },
  publishedAt: { label: "The date it was first published" },
  indexable: {
    label: "Whether search engines may index the page",
    // TS1 — the line that has to read as a fact rather than a punishment. It
    // is true, it is temporary, and the maker can do something about it.
    note: "Your page is live and readable by anyone you send the link to from the moment you publish. Search engines are asked not to index a first listing until one of yours has been reviewed \u2014 usually quick, and it only happens once",
  },
  launch: {
    label: "Where your launch placed on the day it went live",
    // UV1 — this line exists because the disclosure is DERIVED from the
    // projection: adding a public field with no copy fails the build, which
    // is the point. A maker should not discover a position published about
    // their product by finding it on the page.
    //
    // It says the two things that make the number bearable to read: that the
    // day is a fixed window rather than a running score, and that a quiet day
    // is a quiet day rather than a verdict.
    note: "Only if you launch, and only for the day you chose \u2014 the position is fixed when that day closes at midnight UTC and never moves again. A day nobody else launched on is a day you were first on, which is a fact about the day rather than a claim about the product",
  },
  launches: {
    label: "Every launch you have made, and where each one placed",
    // PP5 — the history, for the same reason `launch` above has a line: a
    // maker should not find a list of their past days on the page before
    // they were told one would be there.
    note: "Newest first, each with the position the board gave it that day and how many people commented. A day the board has not ranked yet says so rather than showing a zero",
  },
  metrics: {
    label: "What we observed about your repository, and when",
    note: "Work merged in the last week, and when it was last pushed to — read from the public repository, with the time we read it shown beside every number",
  },
  components: {
    label: "The components you tick below, as a snapshot",
    note: "Nothing by default; a copy taken at publish, never a live view \u2014 republish to refresh it",
  },
  maintainers: {
    label: "The people you added, by name and label",
    note: "Only the people you added — never your whole workspace, and never an email address",
  },
  roleOpenings: {
    label: "Your open roles, and an apply link for each",
    note: "Applying requires sign-in; an approved applicant can read this one project and nothing else",
  },
};

/** The disclosure list, in the contract's own order. */
export function publishDisclosure(): DisclosureLine[] {
  return PUBLIC_PROFILE_KEYS.map((key) => {
    const copy = PROFILE_COPY[key];
    return copy ? { key, ...copy } : { key, label: key };
  });
}

/** Keys the contract carries that this module has no copy for. Should be empty. */
export function disclosureGaps(): string[] {
  return PUBLIC_PROFILE_KEYS.filter((key) => !PROFILE_COPY[key]);
}

/**
 * What a visitor will NOT see. Stated positively in the dialog, because the
 * reassurance a maintainer actually wants is about the private plane, and
 * "we only send these eleven fields" does not answer it.
 *
 * Each entry names something org `viewer` can read and this page cannot, so the
 * list is a claim the epic's own tests already hold up.
 */
export const NEVER_PUBLIC = [
  "Your secrets, or even their names",
  "Your audit log or activity",
  "Runs, logs, and deployments",
  "Agent sessions and transcripts",
  "Spend and usage",
  "Your service catalog",
  "Any other project in this workspace",
  "Your workspace's member list",
  "Anyone's email address",
] as const;

/** The nested shapes, for the dialog's "and for each person / role" detail. */
export const MAINTAINER_FIELDS = PUBLIC_MAINTAINER_KEYS;
export const ROLE_OPENING_FIELDS = PUBLIC_ROLE_OPENING_KEYS;

export type PublishBlockerCopy = { title: string; remedy: string };

/**
 * A refusal names the remedy, not the state. "Awaiting review" tells a
 * maintainer nothing they can act on; "an owner or admin needs to review this"
 * tells them who to ask.
 */
export const BLOCKER_COPY: Record<string, PublishBlockerCopy> = {
  workspace_private: {
    title: "This workspace is private",
    remedy:
      "Listings live on public workspaces in your openproduct account, and a private workspace cannot be made public. Open a new build for the same repository and publish that listing instead.",
  },
  workspace_link_required: {
    title: "This listing is not linked to its workspace",
    remedy:
      "A workspace owner or admin needs to link this listing to its workspace once \u2014 use \u201cLink a workspace\u201d on this page. Listings created before the link flow start here.",
  },
  pitch_missing: {
    title: "This listing has no pitch",
    remedy: "Write a few lines about what you are building, and save.",
  },
  repo_private: {
    title: "The repository is private",
    remedy:
      "A listing promises that anyone can read the code it links to. Make the repository public on GitHub, then check again \u2014 or, if the link is not a github.com repository, correct or clear it. A listing with no repository can publish; the code attaches when a public one is linked.",
  },
  restricted: {
    title: "Publishing is paused on this account",
    remedy:
      "A report about this account is being reviewed. Nothing you have already published has been removed, and you can appeal \u2014 reply to the message we sent you, or use the report address in the footer.",
  },
  unreviewed_listing_cap: {
    title: "You have reached the limit for unreviewed listings",
    remedy:
      `You can have ${UNREVIEWED_LISTING_CAP} listings published at a time until one of them has been reviewed. Reviews are usually quick \u2014 once your first goes through, this limit stops applying to you. Unpublish one to make room in the meantime.`,
  },
  awaiting_review: {
    title: "Waiting for review",
    remedy: "An owner or admin reviews a listing once, before it can first go public.",
  },
};

export function blockerCopy(blocker: string): PublishBlockerCopy {
  return (
    BLOCKER_COPY[blocker] ?? {
      title: "This listing cannot be published yet",
      remedy: "Check the listing's details and try again.",
    }
  );
}

/**
 * The promotion banner (README §The private-repo case).
 *
 * Shown only when the repo has gone private, and only to someone who could act
 * on that — which the API answers directly as `capabilities.canReview`
 * (review is the openproduct OPERATOR’s act since OX4). Keying off a capability
 * rather than a role string means the console never has to maintain a second,
 * drifting copy of the role model.
 *
 * NOTHING public happens when a repo goes private, by design. This banner is
 * the entire reaction, and it is aimed at the one person who can do something.
 * A builder does not see it, because a builder cannot change repository
 * visibility either.
 */
export function showsPromotionBanner(input: {
  canReview: boolean | null | undefined;
  repoVisibility: string | null | undefined;
}): boolean {
  if (input.repoVisibility !== "private") return false;
  return input.canReview === true;
}
