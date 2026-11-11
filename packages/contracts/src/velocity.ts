// Velocity — how fast a person may act (openproduct-commons TS2).
//
// EVERY WRITE THIS EPIC ADDS IS A WAY TO SHOUT. Endorse a thousand listings,
// claim a hundred handles, republish a listing every second — each is cheap
// for whoever does it and expensive for everyone reading. TS2 is the bound,
// and it is the gate EN2 and CB1 wait on (OPC-8): a public count that
// anybody can move at machine speed is not a count, and a discussion board
// without a velocity limit is a spam board with extra steps.
//
// FOUR DECISIONS, and the first three are the reason this file exists at all
// rather than a constant beside the limiter:
//
//   1. PER ACTION, NOT PER SUBJECT. One blanket "60 writes a minute" is the
//      shape every service starts with and it is wrong in both directions at
//      once: it lets somebody claim sixty handles a minute (which is
//      squatting the whole namespace) while refusing a maintainer who edits
//      their listing sixty-one times while getting the wording right.
//      Endorsing is not publishing is not claiming a name.
//
//   2. TWO WINDOWS, ALWAYS. A burst window catches a script; a sustained
//      window catches the patient version of the same script, which a burst
//      limit alone waves through forever. Both must pass. The interesting
//      case is the one a single window cannot express: a legitimate burst
//      (a maintainer answering ten things in a minute) is FINE, and ten
//      thousand of them over a week is not.
//
//   3. THE PER-SUBJECT LIMITS ARE PUBLISHED. THE PER-TARGET ONES ARE NOT.
//      A person refused deserves to know the rule they hit — that is the
//      same discipline OPC-4 applies to rankings, and the alternative is a
//      product that says "no" and will not say why. But the per-TARGET
//      bound is different in kind: it is a threshold about OTHER people's
//      behaviour toward one listing, and publishing its exact width tells a
//      brigade precisely how many accounts to bring. So `publish: false`
//      exists, and `publishedRules()` is what `/docs` renders.
//
//   4. CONFIGURATION, NOT CONSTANTS. `parseVelocityConfig` reads an operator
//      override so a limit can move during an incident without a deploy. It
//      is deliberately hard to get wrong in the dangerous direction: an
//      unparseable override falls back to these defaults rather than to no
//      limit, an unknown action is ignored rather than added, and a limit of
//      zero is refused outright — "nobody may ever endorse again" is not a
//      configuration change, it is an outage, and it should take a deploy.

/** Every write surface this epic added, and the ones it is about to. */
export const WRITE_ACTIONS = [
  "endorse",
  "handle-claim",
  "listing-publish",
  "listing-write",
  // CB1 — the two discussion writes, kept SEPARATE because they cost
  // different amounts. Starting a thread adds a card to somebody else's page
  // and a row to its filter; replying adds a line inside a conversation
  // somebody already chose to open. One limit for both would have to be the
  // tighter of the two, which would throttle an argument to stop a flood.
  "post",
  "thread-create",
  "profile-write",
  "report",
  "save",
  // LC4 — creating a collection. ONE ACTION FOR THE WHOLE SURFACE, unlike
  // CB1's split: adding an item and reordering are edits to a thing the
  // curator already made and cost a reader nothing, while CREATING is the
  // act that can flood. So this bounds creation and the rest rides the
  // ordinary write path.
  "collection-create",
  // TS5 — filing an appeal. Bounded for the reason reports are, and with the
  // opposite generosity: a report is somebody helping and the limit exists
  // only to stop a script, while an appeal is somebody arguing about a
  // decision that concerns them, and the honest number of those is small.
  // Standing already bounds it far harder than any rate could — you can only
  // appeal acts against listings you maintain, and each act once — so this is
  // the backstop for a scripted account working through a long history, not
  // the mechanism.
  "appeal",
  // FL0 — following a topic or a person. ONE ACTION FOR BOTH KINDS, matching
  // the one table and the one control: they cost the same, they are refused
  // the same, and two limits for one act is two numbers to keep in step.
  "follow",
] as const;
export type WriteAction = (typeof WRITE_ACTIONS)[number];

/**
 * What a limit counts by.
 *
 * `subject` is the person acting. `target` is the thing acted upon — one
 * listing, counted across ALL subjects, which is the only shape that catches
 * a brigade: fifty accounts each politely under their own per-subject limit
 * are still fifty accounts arriving at one listing in a minute.
 */
export const VELOCITY_DIMENSIONS = ["subject", "target"] as const;
export type VelocityDimension = (typeof VELOCITY_DIMENSIONS)[number];

export interface VelocityWindow {
  /** How many actions the window allows. */
  readonly limit: number;
  /** How long the window is. */
  readonly windowSec: number;
}

export interface VelocityRule {
  readonly action: WriteAction;
  readonly dimension: VelocityDimension;
  /** Catches a script. Small window, small count. */
  readonly burst: VelocityWindow;
  /** Catches the patient version of the same script. */
  readonly sustained: VelocityWindow;
  /**
   * Whether this rule is published at `/docs`.
   *
   * True for everything keyed by `subject` — a person refused deserves the
   * rule. False for `target` bounds, which are thresholds about other
   * people's behaviour and whose exact width is an instruction to a brigade.
   */
  readonly publish: boolean;
  /**
   * What the person is told, in their words, when this rule refuses them.
   *
   * A sentence rather than "Too many requests", because the two possible
   * readings of a bare 429 are "the site is broken" and "I am being
   * punished", and neither is true. Each of these says what happened and
   * what to do, and none of them accuses anybody of anything: the
   * overwhelming majority of people who hit a velocity limit are enthusiastic
   * rather than hostile.
   */
  readonly refusal: string;
}

const MINUTE = 60;
const HOUR = 60 * 60;
const DAY = 24 * HOUR;

/**
 * The defaults, chosen so that the honest version of each act passes.
 *
 * The number that mattered most while picking these was not the attacker's —
 * it was the enthusiast's. Somebody who finds this directory on a Sunday and
 * endorses everything they have ever used is doing exactly what we want, and
 * a limit that refuses them has cost us the one visitor who was going to
 * tell their friends. So the burst windows are sized for a person clicking
 * quickly, and the sustained windows for a person having a good afternoon.
 */
export const DEFAULT_VELOCITY_RULES: readonly VelocityRule[] = [
  {
    action: "endorse",
    dimension: "subject",
    // Twelve a minute is faster than a person reads a product page and
    // decides; three hundred a day is more listings than exist for a long
    // while yet.
    burst: { limit: 12, windowSec: MINUTE },
    sustained: { limit: 300, windowSec: DAY },
    publish: true,
    refusal:
      "You have endorsed a lot of products very quickly. Give it a minute and try again — nothing has been lost.",
  },
  {
    action: "endorse",
    dimension: "target",
    // The brigade bound. Sixty in a minute on ONE listing is not a launch
    // going well, it is a coordinated arrival — and EN3's integrity model
    // wants that slowed down enough to be visible rather than refused
    // invisibly after the fact.
    burst: { limit: 60, windowSec: MINUTE },
    sustained: { limit: 600, windowSec: HOUR },
    publish: false,
    refusal:
      "This listing is getting a lot of attention right now. Try again shortly.",
  },
  {
    action: "follow",
    dimension: "subject",
    // GENEROUS, FOR THE SAVE'S REASON AND ONE MORE. A follow is private and
    // moves no public ranking, so there is nothing to inflate — and unlike a
    // save, the honest way to use it is a burst: somebody who has just found
    // `/topics` will follow six of them in twenty seconds, and a limit that
    // treated that as suspicious would be punishing the exact behaviour the
    // page is for.
    //
    // NO `target` RULE, deliberately, and this is the one place FL0 departs
    // from the endorsement's shape. A target bound catches a BRIGADE — fifty
    // accounts arriving at one listing to move a public number. Following
    // cannot brigade: the number it moves is a follower count, which ranks
    // nothing and decides nothing about what anyone else is shown. Adding a
    // target rule would slow a crowd discovering a topic and stop no attack.
    burst: { limit: 30, windowSec: MINUTE },
    sustained: { limit: 500, windowSec: DAY },
    publish: true,
    refusal: "That is a lot of following at once. Give it a moment.",
  },
  {
    action: "save",
    dimension: "subject",
    // A save is PRIVATE and counted nowhere (OPC-3), so it can be generous:
    // there is nothing to inflate and nobody to shout at. The limit exists
    // only so a runaway script cannot fill a table.
    burst: { limit: 40, windowSec: MINUTE },
    sustained: { limit: 2000, windowSec: DAY },
    publish: true,
    refusal: "That is a lot of saving at once. Give it a moment.",
  },
  {
    action: "handle-claim",
    dimension: "subject",
    // THE TIGHTEST RULE HERE, and the only one whose number is chosen
    // against an attacker rather than for an enthusiast. Claiming handles in
    // bulk is squatting a namespace that has exactly one of each name
    // (OPC-B), and a person legitimately changing their handle does it once
    // and then thinks about it for a week.
    burst: { limit: 3, windowSec: MINUTE },
    sustained: { limit: 10, windowSec: DAY },
    publish: true,
    refusal:
      "You have changed your handle several times just now. Handles are one-per-person and a released one is never re-issued, so this one is deliberately slow — try again in a few minutes.",
  },
  {
    action: "profile-write",
    dimension: "subject",
    // Editing your own bio until it reads right is a normal evening.
    burst: { limit: 20, windowSec: MINUTE },
    sustained: { limit: 500, windowSec: DAY },
    publish: true,
    refusal: "You are editing very quickly. Give it a minute and your changes will save.",
  },
  {
    action: "listing-write",
    dimension: "subject",
    burst: { limit: 20, windowSec: MINUTE },
    sustained: { limit: 500, windowSec: DAY },
    publish: true,
    refusal: "You are editing very quickly. Give it a minute and your changes will save.",
  },
  {
    action: "listing-publish",
    dimension: "subject",
    // Publishing is the act that puts something in front of everybody, and
    // TS1 already caps how many UNREVIEWED listings a new maker may hold.
    // This is the other half: the rate, rather than the total.
    burst: { limit: 5, windowSec: MINUTE },
    sustained: { limit: 40, windowSec: DAY },
    publish: true,
    refusal:
      "You have published or unpublished several listings in a row. Give it a minute — this one is slow on purpose, because publishing puts something in front of everybody.",
  },
  {
    action: "post",
    dimension: "subject",
    // A real argument is fast. Somebody mid-discussion, replying to three
    // people who all answered at once, is the person this surface exists for
    // — and a limit that catches them has thrown out the conversation to
    // stop the spam. CG-2's eligibility bound already did most of the work
    // here: you cannot post at all without a profile, and you cannot have a
    // profile without being on a listed product.
    burst: { limit: 10, windowSec: MINUTE },
    sustained: { limit: 300, windowSec: DAY },
    publish: true,
    refusal:
      "You are posting very quickly. Give it a minute — nothing you wrote has been lost.",
  },
  {
    action: "post",
    dimension: "target",
    // The brigade bound, on ONE thread, across ALL subjects. Forty posts in
    // a minute in a single thread is not a discussion, it is an arrival —
    // and a thread is the one place on this estate where a coordinated group
    // can bury what somebody said by volume alone.
    burst: { limit: 40, windowSec: MINUTE },
    sustained: { limit: 400, windowSec: HOUR },
    publish: false,
    refusal: "This discussion is moving very fast right now. Try again shortly.",
  },
  {
    action: "thread-create",
    dimension: "subject",
    // TIGHTER THAN POSTING, on purpose. A new thread is a card on somebody
    // else's product page: five of them is a page nobody can read, and
    // unlike a reply it cannot be scrolled past. Nobody legitimately opens
    // four separate discussions in a minute; they open one and make four
    // points in it.
    burst: { limit: 3, windowSec: MINUTE },
    sustained: { limit: 40, windowSec: DAY },
    publish: true,
    refusal:
      "You have started several discussions in a row. Give it a minute — if these are all about the same product, one thread will get better answers than four.",
  },
  {
    action: "thread-create",
    dimension: "target",
    // On ONE listing. A maintainer waking up to thirty new threads has been
    // targeted, not discovered.
    burst: { limit: 10, windowSec: MINUTE },
    sustained: { limit: 100, windowSec: HOUR },
    publish: false,
    refusal: "This listing is getting a lot of new discussions right now. Try again shortly.",
  },
  {
    action: "collection-create",
    dimension: "subject",
    // TIGHT, AND IT COSTS AN HONEST CURATOR NOTHING. Making a collection is
    // slow work — you choose eight things and say why — so nobody
    // legitimately starts three in a minute. The published-collection cap
    // bounds what reaches the index; this bounds DRAFTS, which that cap does
    // not see and which would otherwise be unlimited rows anybody signed in
    // could create.
    burst: { limit: 2, windowSec: MINUTE },
    sustained: { limit: 20, windowSec: DAY },
    publish: true,
    refusal:
      "You have just made a couple of collections. Give it a minute — a collection is worth more when it is finished than when it is started.",
  },
  {
    action: "report",
    dimension: "subject",
    // DELIBERATELY GENEROUS. Somebody walking through a spam wave and
    // reporting fifteen listings is the single most useful person on the
    // site that day, and a limit that refuses them has turned our best
    // moderator away at the door. Tight enough only to stop a script.
    burst: { limit: 10, windowSec: MINUTE },
    sustained: { limit: 100, windowSec: DAY },
    publish: true,
    refusal:
      "Thank you — that is a lot of reports in a short time. They have all been recorded. Give it a minute before the next one.",
  },
  {
    action: "appeal",
    dimension: "subject",
    // Deliberately tight WITHOUT being punitive, and the two bounds do
    // different jobs. The burst catches a script; the sustained bound is set
    // where it is because somebody appealing twenty separate acts in a day is
    // either an operator's mistake being cleaned up — in which case the
    // reversals are the fix, not more appeals — or an account that has been
    // acted on twenty times, which is a conversation rather than a form.
    burst: { limit: 3, windowSec: MINUTE },
    sustained: { limit: 20, windowSec: DAY },
    publish: true,
    refusal:
      "That is several appeals in a very short time. They have all been recorded and will be read in the order they arrived. Give it a minute before the next one.",
  },
] as const;

/** The rules a person may read, at `/docs`. See decision 3 in the header. */
export function publishedRules(
  rules: readonly VelocityRule[] = DEFAULT_VELOCITY_RULES,
): VelocityRule[] {
  return rules.filter((rule) => rule.publish);
}

/**
 * The sentence a refusal carries.
 *
 * Falls back to a generic one rather than throwing: a limiter that can crash
 * is a limiter that fails open the first time somebody adds an action and
 * forgets a rule, and failing open is the one outcome this file exists to
 * prevent.
 */
export const GENERIC_REFUSAL =
  "That was a lot of requests in a short time. Give it a minute and try again — nothing has been lost.";

// ---------------------------------------------------------------------------
// Operator configuration
// ---------------------------------------------------------------------------

/**
 * The smallest window an operator may configure, and the smallest limit.
 *
 * A limit of zero is not a rate limit, it is a feature being switched off,
 * and switching a feature off for everybody should be a deploy somebody
 * reviews rather than a dashboard field somebody fat-fingers at 3am. The
 * floor on `windowSec` is the same argument from the other side: a one-second
 * window with a limit of one is a zero in disguise.
 */
export const MIN_CONFIGURABLE_LIMIT = 1;
export const MIN_CONFIGURABLE_WINDOW_SEC = 10;

export interface VelocityConfigResult {
  readonly rules: readonly VelocityRule[];
  /**
   * What was rejected, if anything.
   *
   * NOT thrown, and not silent: the caller logs these. A misconfiguration
   * that quietly reverted to defaults is a limit somebody believes they
   * changed and did not, which is worse than either the old value or the new
   * one — it is a value nobody knows.
   */
  readonly problems: readonly string[];
}

interface RawOverride {
  action?: unknown;
  dimension?: unknown;
  burst?: unknown;
  sustained?: unknown;
}

function parseWindow(value: unknown, label: string, problems: string[]): VelocityWindow | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as { limit?: unknown; windowSec?: unknown };
  const limit = typeof raw.limit === "number" ? Math.trunc(raw.limit) : NaN;
  const windowSec = typeof raw.windowSec === "number" ? Math.trunc(raw.windowSec) : NaN;
  if (!Number.isFinite(limit) || !Number.isFinite(windowSec)) {
    problems.push(`${label}: limit and windowSec must both be numbers`);
    return null;
  }
  if (limit < MIN_CONFIGURABLE_LIMIT) {
    problems.push(`${label}: limit ${limit} is below the floor of ${MIN_CONFIGURABLE_LIMIT}`);
    return null;
  }
  if (windowSec < MIN_CONFIGURABLE_WINDOW_SEC) {
    problems.push(
      `${label}: windowSec ${windowSec} is below the floor of ${MIN_CONFIGURABLE_WINDOW_SEC}`,
    );
    return null;
  }
  return { limit, windowSec };
}

/**
 * Read an operator override over the defaults.
 *
 * SHAPE: a JSON array of `{action, dimension, burst?, sustained?}`. Anything
 * else is ignored with a problem recorded. Every failure mode lands on the
 * defaults, never on "no limit" — including the mode nobody tests, which is
 * an override that parses as JSON and means nothing.
 *
 * An override may only replace a rule that EXISTS. Adding one here would mean
 * a new limited action could be created without a code change, and an action
 * nothing enforces is a rule that looks like protection and is not.
 */
export function parseVelocityConfig(
  raw: string | null | undefined,
  base: readonly VelocityRule[] = DEFAULT_VELOCITY_RULES,
): VelocityConfigResult {
  if (raw === null || raw === undefined || raw.trim().length === 0) {
    return { rules: base, problems: [] };
  }

  const problems: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { rules: base, problems: ["velocity config is not valid JSON; using defaults"] };
  }
  if (!Array.isArray(parsed)) {
    return { rules: base, problems: ["velocity config must be an array; using defaults"] };
  }

  const rules = base.map((rule) => ({ ...rule }));
  for (const entry of parsed as RawOverride[]) {
    if (typeof entry !== "object" || entry === null) {
      problems.push("velocity config entry is not an object");
      continue;
    }
    const action = entry.action;
    const dimension = entry.dimension ?? "subject";
    if (typeof action !== "string" || typeof dimension !== "string") {
      problems.push("velocity config entry needs a string action and dimension");
      continue;
    }
    const index = rules.findIndex((r) => r.action === action && r.dimension === dimension);
    if (index < 0) {
      // Not an error worth failing on, but not silent either: the operator
      // believes they changed something.
      problems.push(`velocity config names no such rule: ${action}/${dimension}`);
      continue;
    }
    const label = `${action}/${dimension}`;
    const burst = entry.burst === undefined ? rules[index]!.burst : parseWindow(entry.burst, `${label} burst`, problems);
    const sustained =
      entry.sustained === undefined
        ? rules[index]!.sustained
        : parseWindow(entry.sustained, `${label} sustained`, problems);
    // A rejected window keeps its default rather than taking the other half
    // of a half-valid override — half a limit is a limit nobody chose.
    if (burst === null || sustained === null) continue;
    rules[index] = { ...rules[index]!, burst, sustained };
  }

  return { rules, problems };
}
