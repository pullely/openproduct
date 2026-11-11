// Spam, slop and brigading (openproduct-commons TS4).
//
// THE ONE SENTENCE THIS FILE IS BUILT ON: EVERYTHING HERE PRODUCES A SIGNAL,
// AND A SIGNAL IS ADDRESSED TO A PERSON. TS-5 already says only a human
// removes, and `moderation_acts` enforces it with a CHECK. TS4 is the
// milestone that would most like to break that rule — it is the one holding
// the detectors — so it is the milestone that has to make the rule structural
// rather than remembered. `FlagConsequence` below does not have a member that
// deletes anything. There is no threshold to get wrong, because there is no
// code path to reach.
//
// ─── WHY THERE IS NO "IS THIS AI-WRITTEN" DETECTOR ────────────────────────
//
// The milestone asked for "generated-filler detection", and the obvious build
// is a classifier for machine-written text. This deliberately is not that,
// for two reasons, and the second is the one that decided it.
//
//   1. It does not work. Every published detector of machine-written prose
//      reports accuracy on held-out academic corpora and falls apart on a
//      200-word product pitch, which is short, formulaic by genre, and
//      written to a template even when a person writes it.
//
//   2. IT IS BIASED AGAINST THE PEOPLE THIS DIRECTORY EXISTS FOR. Detectors
//      of machine-written English score non-native writers as machine-written
//      at several times the rate of native writers, because both produce
//      lower lexical variance. A directory of open-source products is
//      disproportionately written by people writing in their second or third
//      language. Shipping that detector here would systematically de-index
//      exactly the contributors the estate most wants, silently, with no
//      notice and nothing to appeal — the harm would be invisible to us and
//      total for them.
//
// So this asks a different question, which is BOTH more honest and more
// useful: does this text SAY ANYTHING? A person writing marketing boilerplate
// is exactly as unhelpful to a reader as a model writing it, and the reader —
// who is the party this directory serves — cannot tell the difference and
// should not have to. Emptiness is a property of the text. Authorship is a
// property of a person, and we do not get to guess at it.
//
// ─── WHY THE BOARD DOES NOT NEED A BRIGADE DETECTOR ───────────────────────
//
// The milestone asks that a synthetic brigade on a launch be discounted
// before it reaches the board. The tempting build is a velocity detector on
// the launch window. It cannot work, and the reason is worth writing down: a
// real launch shared in a real newsletter produces EXACTLY the shape of a
// purchased brigade — a wave of accounts, created that morning, all endorsing
// one listing within an hour. No threshold separates them, because in that
// window they are not different.
//
// What separates them is only visible later (a real wave goes on to do other
// things; a bought one stops), and "later" is after the board has already
// ranked. So instead of a detector that must be right inside the window,
// `boardEligible` changes the PRIMITIVE: the board counts endorsements from
// accounts that existed before the launch window opened. That is not a
// judgement about anybody, nothing is flagged and nothing is discounted — a
// brand-new account's endorsement still counts on the listing's own public
// total (EN2). It simply does not move a RANK. You cannot buy history, so the
// attack has nowhere to stand, and no honest person is ever accused of
// anything.
//
// This is the same move CB2 made with the demand floor and LC2 made with the
// publication threshold: when a number can be attacked, change what the
// number is made of rather than defending it with a classifier.

import type { IntegrityReason } from "./integrity.js";

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

/**
 * What a flag may cause. REMOVAL IS NOT A MEMBER OF THIS TYPE, and that is
 * the milestone's central guarantee expressed where the compiler can hold it.
 *
 * `deindex`    — the listing stops being amplified by crawlers. TS0's CHECK
 *                names this and `reindex` as the only acts automation may
 *                take, because de-indexing is the one consequence that is
 *                fully reversible and costs a wrongly-flagged maker nothing
 *                but reach they had not yet had.
 * `discount`   — the endorsement stops counting toward a public total. EN0's
 *                `endorsement_integrity` holds the opinion, the act survives,
 *                and a later sweep can reverse it.
 * `queue-only` — a human is asked to look, and nothing else happens. The
 *                default, and the right answer whenever the signal cannot
 *                distinguish an attack from an honest surge.
 */
export type FlagConsequence = "deindex" | "discount" | "queue-only";

export const FLAG_KINDS = ["filler", "cohort", "ring", "brigade"] as const;
export type FlagKind = (typeof FLAG_KINDS)[number];

/**
 * What each signal is allowed to do on its own.
 *
 * READ THE `queue-only` ROWS FIRST. They are the ones that cost something to
 * leave alone, and they are `queue-only` because the alternative is a machine
 * acting on a pattern it cannot tell apart from an honest one.
 */
export const FLAG_CONSEQUENCE: Record<FlagKind, FlagConsequence> = {
  // A pitch that says nothing is not amplified. It stays published, stays at
  // its address, stays readable by anybody the maker sends the link to — the
  // TS1 posture for a first listing, applied for a different reason.
  filler: "deindex",
  // Assessed only once the accounts have had time to be more than a cohort
  // (see COHORT_MATURITY_MS), which is what makes it safe to act on.
  cohort: "discount",
  // EN3 already applies this one; TS4 is what finally puts it in front of a
  // human as well, because a ring is the one integrity finding somebody
  // should probably look at.
  ring: "discount",
  // The launch board's structural rule already handled the attack. This flag
  // exists so a person can see that it happened, not so a machine can act.
  brigade: "queue-only",
};

/**
 * Can this kind's evidence CHANGE after the fact?
 *
 * The question decides what a dismissal means, and getting it wrong makes the
 * queue punish the person working it.
 *
 * `filler` is about MUTABLE content: a maker can rewrite the pitch, so a
 * listing flagged, dismissed, re-indexed and still empty is a real second
 * observation and should be raised again.
 *
 * The other three are about FROZEN HISTORY. The accounts in a cohort have
 * already gone quiet; the ring has already endorsed what it endorsed; the
 * launch has already happened. The pattern cannot change, so a dismissed flag
 * would come back on the next sweep, and the next, every six hours forever —
 * a queue that re-asks a question a person has already answered is a queue
 * they stop reading.
 *
 * SUPPRESSING THE REPEAT COSTS NOTHING BUT THE NOTIFICATION. The flag is not
 * the defence: a cohort's discount lives in `endorsement_integrity` and stays
 * applied, a ring's is EN3's and stays applied, and the launch board's
 * eligibility rule never depended on a flag at all. What is suppressed is a
 * second telling of something a human already ruled on.
 *
 * The cost, stated: a genuinely NEW ring on a listing whose earlier ring flag
 * was dismissed raises no second flag. Its endorsements are still discounted;
 * nobody is told twice. That is the trade, and it is the right way round —
 * the alternative is a queue nobody works.
 */
export const FLAG_RECURS: Record<FlagKind, boolean> = {
  filler: true,
  cohort: false,
  ring: false,
  brigade: false,
};

/**
 * The prose a triager reads. Describes a PATTERN and never a person, for the
 * same reason EN3's disclosure copy does: a machine observed a shape, and it
 * is not in a position to say what anybody intended by it.
 */
export const FLAG_COPY: Record<FlagKind, { title: string; says: string }> = {
  filler: {
    title: "This pitch may not say anything",
    says:
      "The text is long enough to be judged and contains no specific detail — no version, no " +
      "name, no dependency, no number — while leaning heavily on words that carry no information. " +
      "This is a measure of the TEXT, not of who wrote it: we do not attempt to detect whether a " +
      "person or a model produced it, and a human writing boilerplate scores the same way.",
  },
  cohort: {
    title: "A group of accounts that arrived together",
    says:
      "Several accounts first seen within a short window of one another acted on the same thing, " +
      "and did nothing else in the days afterwards. A launch shared in a newsletter looks the " +
      "same on the day, which is why this is only assessed once those days have passed.",
  },
  ring: {
    title: "Accounts endorsing substantially the same set",
    says:
      "A group whose endorsing overlaps almost completely and which has little independent " +
      "activity. The endorsements are discounted from public totals and remain recorded.",
  },
  brigade: {
    title: "Most of a launch's endorsements came from accounts younger than the launch",
    says:
      "Nothing has been done about this, and nothing needs to be: the launch board only ranks " +
      "endorsements from accounts that existed before the window opened, so these were never " +
      "counted toward its position. The flag is here so a person can see the pattern.",
  },
};

/** The states a flag moves through. `dismissed` is a first-class outcome and
 *  is COUNTED — it is how the false-positive rate stays honest in production
 *  rather than only in a test fixture. */
export const FLAG_STATES = ["open", "actioned", "dismissed"] as const;
export type FlagState = (typeof FLAG_STATES)[number];

/**
 * A flag, as a triager sees it. No score is shown and none is stored for
 * display: a number beside an accusation invites acting on the number.
 */
export interface PublicFlag {
  readonly id: string;
  readonly kind: FlagKind;
  readonly subjectKind: string;
  readonly subjectRef: string;
  readonly state: FlagState;
  readonly evidence: string;
  /**
   * What ALREADY happened when this was raised.
   *
   * On the row rather than looked up from `FLAG_CONSEQUENCE` at render time,
   * because the table can change and a flag raised last month recorded what
   * was actually done to that listing then. Without this line "restore it" is
   * an instruction a triager cannot follow: they cannot tell what state the
   * thing is in.
   */
  readonly consequence: FlagConsequence;
  readonly raisedAt: string;
}

export const PUBLIC_FLAG_KEYS = [
  "id",
  "kind",
  "subjectKind",
  "subjectRef",
  "state",
  "evidence",
  "consequence",
  "raisedAt",
] as const;

// ---------------------------------------------------------------------------
// Filler
// ---------------------------------------------------------------------------

/**
 * Below this, a text is NOT ASSESSED AT ALL.
 *
 * The single most valuable line in this file. You cannot tell whether eight
 * words say nothing; you can tell whether two hundred do. Terse writing is a
 * style, and it is a common one among people who ship tools — "A CLI for
 * tailing logs" is a complete and excellent pitch. Assessing it would flag
 * the best writers on the estate.
 */
export const MIN_ASSESSABLE_WORDS = 40;

/**
 * Words that occupy space without narrowing anything down.
 *
 * NOT A LIST OF BAD WORDS. Every one of these appears in honest writing, and
 * a single hit means nothing — the signal is DENSITY, and density only
 * contributes when the text also has no specificity at all. The list is here
 * as data rather than a regex so it can be read, argued with, and tested.
 */
export const FILLER_WORDS = [
  "revolutionary",
  "cutting-edge",
  "state-of-the-art",
  "game-changing",
  "game-changer",
  "next-generation",
  "world-class",
  "best-in-class",
  "industry-leading",
  "unparalleled",
  "unprecedented",
  "seamless",
  "seamlessly",
  "effortless",
  "effortlessly",
  "robust",
  "powerful",
  "innovative",
  "innovation",
  "leverage",
  "leveraging",
  "empower",
  "empowering",
  "unlock",
  "unlocking",
  "streamline",
  "streamlining",
  "supercharge",
  "elevate",
  "transformative",
  "holistic",
  "synergy",
  "paradigm",
  "ecosystem",
  "solution",
  "solutions",
  "cutting",
  "bleeding-edge",
  "turnkey",
  "scalable",
  "enterprise-grade",
  "mission-critical",
  "frictionless",
  "delightful",
  "intuitive",
  "comprehensive",
  "versatile",
  "dynamic",
  "vibrant",
  "thriving",
] as const;

/**
 * The unambiguous tells. THESE DECIDE ALONE, because none of them appears in
 * text a person meant to publish.
 *
 * Every entry is either an unfilled placeholder, a chat preamble that was
 * pasted along with the answer, or filler so stock it names the genre. A
 * maker who reads their own pitch once removes all of them, which is exactly
 * the bar: this catches text nobody looked at.
 */
export const SCAFFOLD_MARKERS = [
  "as an ai language model",
  "as an ai model",
  "as a language model",
  "i'm sorry, but i can",
  "i cannot fulfill",
  "here is a draft",
  "here's a draft",
  "certainly! here",
  "sure! here",
  "lorem ipsum",
  "[product name]",
  "[your product]",
  "[insert",
  "{{product",
  "your product here",
  "in today's fast-paced world",
  "in today's fast paced world",
  "in the ever-evolving landscape",
  "in an increasingly digital world",
  "in the digital age",
] as const;

/**
 * How much of a text may be filler before that half of the signal fires.
 *
 * MEASURED, NOT GUESSED — see `defence-corpus.test.ts`, which reports the
 * separation this number sits in. Honest technical pitches in the corpus run
 * under 2%; unedited filler runs several times that. The threshold sits above
 * the honest range rather than between the two means, because the two costs
 * are not symmetric: a missed filler pitch is a page a reader ignores, and a
 * wrongly-flagged pitch is a real maker de-indexed with no notice.
 */
export const FILLER_DENSITY = 0.035;

/**
 * Things that make a text SPECIFIC. Any one of them is enough.
 *
 * The point is the ASYMMETRY. A pitch about a real product almost cannot
 * avoid naming something — a language, a protocol, a file, a number, a
 * competitor. Filler avoids all of them because naming a thing is a
 * commitment and filler is written to avoid commitments. So "no specificity
 * markers at all" is a strong statement about a 200-word text and a
 * meaningless one about a sentence, which is what MIN_ASSESSABLE_WORDS is
 * for.
 */
export interface SpecificityBreakdown {
  readonly numbers: number;
  readonly identifiers: number;
  readonly links: number;
  readonly properNouns: number;
}

/**
 * Numbers people write out in words.
 *
 * ADDED AFTER THE CORPUS FAILED. The first version counted only digits, and
 * it flagged an honest pitch that said "you can start in five minutes" and
 * "a business of three or four person" — real, concrete, checkable detail,
 * invisible to a digit scan. Plain and second-language writing spells numbers
 * out far more than technical writing does, so a digits-only rule was biased
 * in precisely the direction the whole design exists to avoid.
 *
 * `one` IS DELIBERATELY ABSENT. It is used as an article far more often than
 * as a count — "one place", "one of the", "one delightful ecosystem" — and
 * including it made the emptiest pitch in the corpus look specific. Ordinals
 * are absent for the same reason ("the very first moment").
 */
const CARDINALS = [
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "hundred",
  "thousand",
  "million",
  "billion",
  "dozen",
];

/**
 * A word that names a thing: `Postgres`, `OAuth`, `Kubernetes`, `SRT`.
 *
 * ONLY MID-SENTENCE CAPITALS COUNT, and the first version's attempt to be
 * cleverer than that is why. It tried to allow sentence-initial capitals that
 * were not in a stop list of common openers, which meant every sentence
 * beginning with an imperative verb or a hyphenated adjective — "Streamline
 * your workflow", "Best-in-class and delightful" — registered as naming
 * something. The emptiest text in the corpus scored as specific.
 *
 * A capital in the MIDDLE of a sentence is unambiguous in English: it is a
 * name. The rule loses the proper noun that happens to open a sentence, which
 * costs a specificity hit on a text that almost always has another one, and
 * failing that way round means failing toward not flagging.
 *
 * Acronyms and internal capitals are counted wherever they appear, because
 * `QMK` and `macOS` are names at any position.
 */
function countNames(text: string): number {
  let found = 0;
  for (const sentence of text.split(/(?<=[.!?\n])\s+/)) {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i += 1) {
      const raw = words[i]!.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      if (raw.length < 2) continue;
      // An acronym, or a word with a capital inside it. Position-independent:
      // these shapes do not occur by accident at the start of a sentence.
      if (/^\p{Lu}{2,6}$/u.test(raw) || /\p{Ll}\p{Lu}/u.test(raw)) {
        found += 1;
        continue;
      }
      if (i === 0) continue;
      if (raw === "I") continue;
      if (/^\p{Lu}/u.test(raw)) found += 1;
    }
  }
  return found;
}

export function specificity(text: string): SpecificityBreakdown {
  return {
    numbers:
      (text.match(/\d/g) ?? []).length +
      (text.match(new RegExp(`\\b(?:${CARDINALS.join("|")})\\b`, "gi")) ?? []).length,
    // snake_case, camelCase, dotted paths, backticked spans, call syntax,
    // flags, extensions — the shapes a technical text carries and prose does
    // not.
    identifiers: (
      text.match(
        /`[^`]+`|\b\w+_\w+\b|\b[a-z]+[A-Z]\w*\b|\b\w+\.\w{1,5}\b|\w+\(\)|(?:^|\s)--?[a-z][\w-]+/g,
      ) ?? []
    ).length,
    links: (text.match(/https?:\/\/\S+/g) ?? []).length,
    properNouns: countNames(text),
  };
}

export function specificityTotal(breakdown: SpecificityBreakdown): number {
  return breakdown.numbers + breakdown.identifiers + breakdown.links + breakdown.properNouns;
}

export type FillerSignal = "scaffold" | "filler-vocabulary" | "no-specificity";

export interface FillerAssessment {
  /** False whenever the text was too short to judge — see
   *  MIN_ASSESSABLE_WORDS. Distinct from "assessed and found fine", and a
   *  caller that conflates them is flagging every terse pitch on the estate. */
  readonly assessable: boolean;
  readonly flagged: boolean;
  readonly signals: readonly FillerSignal[];
  readonly words: number;
  readonly fillerHits: number;
  readonly density: number;
  readonly specificity: SpecificityBreakdown;
  /** The exact scaffold phrases found, for the flag's evidence line. Quoting
   *  the text back is the only evidence a triager can check in one look. */
  readonly scaffolds: readonly string[];
}

/**
 * Does this text say anything?
 *
 * PURE, AND THAT IS LOAD-BEARING (the same argument EN3's assessor makes).
 * It reads no clock, no database and no configuration, so the corpus test can
 * measure exactly what it catches and — the part that matters — exactly what
 * it wrongly catches.
 *
 * THE DECISION RULE, in one line: a scaffold marker decides alone; everything
 * else requires BOTH high filler density AND a total absence of specificity.
 * Either half on its own flags honest writing. Density alone catches the
 * enthusiastic maker who really does think their tool is powerful and
 * intuitive; absence of specificity alone catches every design tool, every
 * writing app, and every pitch aimed at people rather than at engineers.
 */
export function assessFiller(source: string): FillerAssessment {
  const text = source.trim();
  const words = text.split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();

  const scaffolds = SCAFFOLD_MARKERS.filter((marker) => lower.includes(marker));
  const marks = specificity(text);

  // Word-boundary matching against the filler list. Hyphenated entries are
  // matched whole, so "cutting-edge" does not also count its "cutting".
  let fillerHits = 0;
  for (const word of FILLER_WORDS) {
    const pattern = new RegExp(`(?<![\\p{L}-])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}-])`, "giu");
    fillerHits += (lower.match(pattern) ?? []).length;
  }
  const density = words.length === 0 ? 0 : fillerHits / words.length;

  // SCAFFOLD IS ASSESSED EVEN ON SHORT TEXT. "[Product name]" in a one-line
  // tagline is unambiguous at any length, and the length floor exists to
  // protect terse HONEST writing, not to protect a placeholder.
  const signals: FillerSignal[] = [];
  if (scaffolds.length > 0) signals.push("scaffold");

  const assessable = words.length >= MIN_ASSESSABLE_WORDS;
  if (assessable) {
    if (density >= FILLER_DENSITY) signals.push("filler-vocabulary");
    if (specificityTotal(marks) === 0) signals.push("no-specificity");
  }

  const flagged =
    signals.includes("scaffold") ||
    (signals.includes("filler-vocabulary") && signals.includes("no-specificity"));

  return {
    assessable,
    flagged,
    signals,
    words: words.length,
    fillerHits,
    density,
    specificity: marks,
    scaffolds,
  };
}

/** The evidence line on a filler flag. Quotes the text's own words back,
 *  because a triager who has to go and look is a triager who dismisses. */
export function fillerEvidence(assessment: FillerAssessment): string {
  if (assessment.scaffolds.length > 0) {
    return `Contains ${assessment.scaffolds.map((s) => `"${s}"`).join(", ")}.`;
  }
  return (
    `${assessment.fillerHits} filler ${assessment.fillerHits === 1 ? "word" : "words"} in ` +
    `${assessment.words}, and no version, number, identifier, link or named technology anywhere in the text.`
  );
}

// ---------------------------------------------------------------------------
// Cohorts
// ---------------------------------------------------------------------------

/** One account acting on one thing, as the cohort sweep sees it. Ids and
 *  times, and nothing about who anybody is (OPC-6). */
export interface CohortObservation {
  readonly subjectId: string;
  readonly targetRef: string;
  /** ms since epoch. */
  readonly actedAt: number;
  /** ms since epoch — this subject's first act anywhere here. */
  readonly subjectFirstSeenAt: number;
}

export interface Cohort {
  readonly targetRef: string;
  readonly subjectIds: readonly string[];
  /** The span, in ms, that the accounts' first-seen times fall within. */
  readonly firstSeenSpanMs: number;
}

/** How many accounts make a cohort. Three is a coincidence in a small
 *  catalog; four that were all created the same day and all acted on the same
 *  listing within hours is a shape. */
export const COHORT_MIN_SUBJECTS = 4;

/** How close together the accounts came into existence. A day, because a
 *  purchased set is provisioned in one sitting. */
export const COHORT_FIRST_SEEN_WINDOW_MS = 24 * 60 * 60 * 1000;

/** How close together they acted. */
export const COHORT_ACT_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * How long a cohort must be quiet before it is judged.
 *
 * THE WHOLE DEFENCE AGAINST THE FALSE POSITIVE THAT MATTERS. A launch shared
 * in a newsletter produces the same shape on the day: a wave of accounts,
 * created that morning, all endorsing one listing within an hour. Nothing in
 * that window distinguishes it from a purchased set — not velocity, not
 * newness, not clustering — because in that window they are not different.
 *
 * What distinguishes them is what happens next. Real arrivals go on to do
 * other things; a bought set does one thing and stops. So the cohort signal
 * WAITS, and it is the waiting rather than any threshold that makes it safe
 * to act on. The cost is that this never catches anything quickly, which is
 * the correct cost: the launch board's structural rule (`boardEligible`)
 * already handles the fast case without accusing anybody.
 */
export const COHORT_MATURITY_MS = 72 * 60 * 60 * 1000;

/**
 * Find sets of accounts that arrived together, acted on one thing together,
 * and then did nothing.
 *
 * `now` is a parameter rather than a clock read, so the maturity rule is
 * testable and the function stays pure.
 */
export function assessCohorts(
  observations: readonly CohortObservation[],
  now: number,
): readonly Cohort[] {
  // Everything a subject has EVER done is what decides whether they went
  // quiet, so the walk needs the whole set, grouped two ways.
  const lastActBySubject = new Map<string, number>();
  const targetsBySubject = new Map<string, Set<string>>();
  for (const row of observations) {
    const last = lastActBySubject.get(row.subjectId);
    if (last === undefined || row.actedAt > last) lastActBySubject.set(row.subjectId, row.actedAt);
    const targets = targetsBySubject.get(row.subjectId);
    if (targets) targets.add(row.targetRef);
    else targetsBySubject.set(row.subjectId, new Set([row.targetRef]));
  }

  const byTarget = new Map<string, CohortObservation[]>();
  for (const row of observations) {
    const list = byTarget.get(row.targetRef);
    if (list) list.push(row);
    else byTarget.set(row.targetRef, [row]);
  }

  const cohorts: Cohort[] = [];
  for (const targetRef of [...byTarget.keys()].sort()) {
    const rows = byTarget.get(targetRef)!;

    // ONLY ACCOUNTS THAT DID NOTHING ELSE. An account that endorsed this
    // listing and three others is behaving like a person who found the site,
    // which is the outcome this directory wants and must never punish.
    const candidates = rows
      .filter((row) => (targetsBySubject.get(row.subjectId)?.size ?? 0) === 1)
      // Matured: quiet for long enough that "they stopped" is a fact rather
      // than a guess made on the day.
      .filter((row) => now - (lastActBySubject.get(row.subjectId) ?? row.actedAt) >= COHORT_MATURITY_MS)
      .sort((a, b) => a.subjectFirstSeenAt - b.subjectFirstSeenAt || a.subjectId.localeCompare(b.subjectId));

    if (candidates.length < COHORT_MIN_SUBJECTS) continue;

    // A sliding window over first-seen time, keeping the LARGEST run whose
    // creation times fall inside one day and whose acts fall inside one
    // window.
    //
    // LARGEST, NOT FIRST, and the difference is the whole of EN3's third
    // decision applied here: a cohort is judged as a unit, because half a
    // cohort discounted is a cohort that still works. The first version of
    // this loop returned as soon as it had four, so a set of nine was
    // reported as four — understating the evidence line and, worse, leaving
    // five of them counting.
    let best: CohortObservation[] | null = null;
    let start = 0;
    for (let end = 0; end < candidates.length; end += 1) {
      while (
        candidates[end]!.subjectFirstSeenAt - candidates[start]!.subjectFirstSeenAt >
        COHORT_FIRST_SEEN_WINDOW_MS
      ) {
        start += 1;
      }
      const window = candidates.slice(start, end + 1);
      if (window.length < COHORT_MIN_SUBJECTS) continue;
      const actTimes = window.map((row) => row.actedAt);
      if (Math.max(...actTimes) - Math.min(...actTimes) > COHORT_ACT_WINDOW_MS) continue;
      if (best === null || window.length > best.length) best = window;
    }

    // One cohort per target. A second overlapping window is the same set
    // described differently, and two flags for one pattern is a queue a
    // triager stops reading.
    if (best === null) continue;
    cohorts.push({
      targetRef,
      subjectIds: best.map((row) => row.subjectId).sort(),
      firstSeenSpanMs: best[best.length - 1]!.subjectFirstSeenAt - best[0]!.subjectFirstSeenAt,
    });
  }

  return cohorts;
}

export function cohortEvidence(cohort: Cohort): string {
  const hours = Math.round(cohort.firstSeenSpanMs / (60 * 60 * 1000));
  return (
    `${cohort.subjectIds.length} accounts first seen within ${hours} ${hours === 1 ? "hour" : "hours"} ` +
    `of one another acted on this and nothing else, and have been quiet since.`
  );
}

/** The reason recorded against a discounted endorsement. EN0 made this column
 *  open text precisely so TS4 could add to the vocabulary without a
 *  migration; this is the entry it was left open for. */
export const COHORT_INTEGRITY_REASON: IntegrityReason = "cohort";

// ---------------------------------------------------------------------------
// The launch board's eligibility rule
// ---------------------------------------------------------------------------

/**
 * How long before a launch an account must have existed for its endorsement
 * to move the board.
 *
 * ZERO would be the pure rule ("existed before the window opened"), and this
 * is deliberately not zero: an account created eight minutes before a launch
 * it then endorses is the attack, and one created eight minutes before by a
 * person who read about the launch somewhere and signed up is indistinguishable.
 * A day means "you were here before this happened", which is the claim the
 * board is actually making when it ranks.
 */
export const BOARD_ELIGIBILITY_AGE_MS = 24 * 60 * 60 * 1000;

export interface BoardEndorsement {
  readonly subjectId: string;
  /** ms since epoch. */
  readonly subjectFirstSeenAt: number;
}

export interface BoardEligibility {
  readonly eligible: number;
  readonly ineligible: number;
  /** Of everything cast, how much was too young to rank. */
  readonly ineligibleShare: number;
}

/**
 * Partition a launch's endorsements into what ranks and what does not.
 *
 * NOT A JUDGEMENT AND NOT A FLAG. Nothing here is written to
 * `endorsement_integrity`, nobody is discounted, and every endorsement still
 * counts on the listing's own public total (EN2). This decides one thing:
 * whether an endorsement moves a POSITION on a board, which is a scarce
 * ranked resource and therefore the only place the estate rations anything.
 *
 * `launchedAt` rather than "now" on purpose — eligibility is a fact about the
 * moment of the launch, so a board re-ranked next month ranks the same way it
 * did on the day. A rule that drifts as accounts age is a rule that quietly
 * re-orders history.
 */
export function boardEligible(
  launchedAt: number,
  endorsements: readonly BoardEndorsement[],
): BoardEligibility {
  const cutoff = launchedAt - BOARD_ELIGIBILITY_AGE_MS;
  let eligible = 0;
  for (const endorsement of endorsements) {
    if (endorsement.subjectFirstSeenAt <= cutoff) eligible += 1;
  }
  const ineligible = endorsements.length - eligible;
  return {
    eligible,
    ineligible,
    ineligibleShare: endorsements.length === 0 ? 0 : ineligible / endorsements.length,
  };
}

/**
 * How much of a launch may be ineligible before a person is asked to look.
 *
 * A HIGH BAR, because most of a real launch's audience arriving new is a
 * SUCCESS and not a suspicion — it is what a launch is for. This is set where
 * "almost everybody who endorsed this made an account to do it" becomes true,
 * and even then the consequence is `queue-only`.
 */
export const BRIGADE_FLAG_SHARE = 0.9;
export const BRIGADE_FLAG_MIN_ENDORSEMENTS = 15;

export function brigadeFlagged(eligibility: BoardEligibility): boolean {
  const total = eligibility.eligible + eligibility.ineligible;
  return total >= BRIGADE_FLAG_MIN_ENDORSEMENTS && eligibility.ineligibleShare >= BRIGADE_FLAG_SHARE;
}

export function brigadeEvidence(eligibility: BoardEligibility): string {
  const total = eligibility.eligible + eligibility.ineligible;
  return (
    `${eligibility.ineligible} of ${total} endorsements came from accounts younger than the launch. ` +
    `The board ranked the other ${eligibility.eligible}. Nothing was discounted.`
  );
}

// ---------------------------------------------------------------------------
// What is said in public
// ---------------------------------------------------------------------------

/**
 * The published account of what these signals do — OPC-4, which says a
 * ranking or a consequence must resolve to prose somebody can read.
 *
 * It states the miss as plainly as the catch. A page that lists what a system
 * catches and is silent about what it does not is a page that has made a
 * claim it cannot support, and the estate has already decided (EN3, decision
 * 4) that the honest version is the one that survives contact.
 */
export const DEFENCE_PUBLISHED_NOTE =
  "Some things here are checked automatically. None of those checks can remove anything: only a person removes, and every removal is recorded and appealable. " +
  "A pitch with no specific detail in it may stop being shown to search engines until somebody looks — it stays published and stays at its address. " +
  "Endorsements from a group of accounts that arrived together, acted once and went quiet may stop counting toward a public total; the endorsements themselves are kept and a later review can restore them. " +
  "The launch board only ranks endorsements from accounts that existed before the launch, which is why a brand-new account's endorsement counts on a listing and does not move a board position.";

/**
 * What we do NOT do, said in the same breath, because the absence is the part
 * a reader cannot verify for themselves.
 */
export const DEFENCE_REFUSALS = [
  {
    refused: "Guessing whether a person or a model wrote something",
    because:
      "Detectors of machine-written text score people writing in a second language as machine-written far more often than native speakers. On a directory of open-source products that would quietly penalise exactly the contributors we most want. We check whether text contains any specific detail, which is a property of the text and the thing a reader actually cares about.",
  },
  {
    refused: "Removing anything automatically",
    because:
      "A false positive here would erase somebody's work from a public page with no notice. Automation may flag, discount and stop amplifying; the database itself refuses to record a removal that no person made.",
  },
  {
    refused: "Telling anyone which of their endorsements was discounted",
    because:
      "It would be an accusation made by a machine to somebody with no way to answer it, and it would tell a group of accounts exactly which of them we noticed. We publish the totals instead.",
  },
  {
    refused: "Acting on a burst of new accounts on the day it happens",
    because:
      "A launch shared somewhere popular looks exactly like a purchased one for the first few days. We wait until the difference is visible, and until then the launch board's own rule keeps the ranking honest without anyone being accused of anything.",
  },
] as const;

// ---------------------------------------------------------------------------
// The measured rate
// ---------------------------------------------------------------------------
//
// TS4's done-when clause asks for a false-positive rate measured and STATED.
// The measurement lives in `defence-corpus.test.ts`; these are the sentences
// the public page renders, and they live here — where the thresholds are —
// so a change to a threshold and a change to what we claim about it are the
// same edit. `CORPUS_SIZE` is pinned to the corpus by a test in that file,
// which is the only direction the check can run: a page cannot import a test.

/**
 * What the public page says about the number.
 *
 * The caveat is not a disclaimer bolted on, it is the finding. A rate
 * measured against a corpus somebody assembled means something quite
 * different from a rate measured against a random sample, and a number
 * published without that sentence beside it WILL be quoted as the second one.
 */
export const CORPUS_NOTE =
  "This rate is measured against a corpus assembled for the purpose, not a sample of real listings — running an experiment on identifiable makers' words and publishing the results is a thing we would be doing to them. The corpus is deliberately loaded with the hardest honest cases we could think of: pitches written in a second language, products with no numbers or code in them at all, and makers writing in exactly the enthusiastic register the check looks for. It is a floor on what we know, not a claim about what happens in production.";

/** The corpus, so the page states its size rather than rounding it. Pinned to
 *  the actual arrays by `defence-corpus.test.ts`. */
export const CORPUS_SIZE = { honest: 20, filler: 6 } as const;

/**
 * The result. Zero, and the test asserts zero rather than a small rate.
 *
 * The consequence of a false positive here is de-indexing, which is mild —
 * and it is applied silently to somebody who is never told, and the
 * population it would wrongly hit is the one the estate least wants to lose.
 * So the correct response to a future honest pitch flagging is to weaken the
 * detector, never to raise this number.
 */
export const MEASURED_FALSE_POSITIVES = 0;
