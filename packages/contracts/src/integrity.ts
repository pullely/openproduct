// Endorsement integrity (openproduct-commons EN3).
//
// EN2 AND EN3 SHIP TOGETHER OR NEITHER SHIPS. A public count without an
// integrity model is the thing this sub-epic exists to avoid: the moment a
// number decides what a reader sees, moving it is worth something, and a
// count nobody defends is a count somebody owns.
//
// FIVE DECISIONS, and the last two are the ones that make this defensible
// rather than merely functional.
//
//   1. IT DISCOUNTS, IT DOES NOT DELETE. Every endorsement survives. The
//      integrity model's output is an OPINION recorded in a separate table
//      (EN0's `endorsement_integrity`), which the recompute subtracts. A
//      restated total can be restated again; a deleted row cannot.
//
//   2. NO SIGNAL DECIDES ALONE — except the strong one. Velocity on its own
//      catches an enthusiast. Newness on its own catches every real new
//      person, which is the failure that matters most: a directory that
//      quietly discounts newcomers has made itself a club. So newness only
//      ever CONTRIBUTES, and the only signal allowed to decide by itself is
//      co-occurrence, which is a statement about a GROUP rather than a
//      person.
//
//   3. A RING IS DISCOUNTED AS A UNIT. Rings are a property of a set of
//      accounts, not of any one of them, so the unit of judgement is the
//      cluster. Half a ring discounted is a ring that still works.
//
//   4. THE PATIENT ADVERSARY IS NOT CAUGHT, AND WE SAY SO. Every signal here
//      is about clustering — in time, or in what a set of accounts touched.
//      Somebody who endorses one listing a day from accounts that also
//      endorse other things is invisible to all three, and no threshold
//      tuning changes that; it would need behavioural or identity signals
//      this program has deliberately refused to collect. The test suite
//      asserts this MISS as expected behaviour rather than leaving it as a
//      gap somebody later "fixes" by lowering a threshold until honest
//      people start getting caught. Claiming to catch it would be the lie.
//
//   5. NOTHING PER-PERSON IS EVER EXPOSED. Not in an API, not on a page, not
//      in an error, not to the person themselves. A visible integrity state
//      is an accusation, made by a machine, about somebody who has no way to
//      answer it — and it would also be a free oracle telling a ring exactly
//      which of its accounts got caught. The disclosure is aggregate, in
//      TS5's transparency report: "N endorsements discounted this week, by
//      reason". That keeps us honest without accusing anybody in public.

/**
 * Why an endorsement was discounted.
 *
 * The DATABASE column is open text (EN0 chose that deliberately, so a live
 * ring does not wait on a migration). This is the vocabulary the automatic
 * sweep uses, so the transparency report can group by something stable.
 */
export const INTEGRITY_REASONS = ["ring", "burst", "burst-new-account", "cohort"] as const;
export type IntegrityReason = (typeof INTEGRITY_REASONS)[number];

/** Human prose for the transparency report. Never shown to an individual. */
export const INTEGRITY_REASON_COPY: Record<IntegrityReason, string> = {
  ring: "A group of accounts endorsing substantially the same set of listings within a short window.",
  burst: "A single account endorsing many listings faster than a person reads them.",
  "burst-new-account":
    "A burst from an account with almost no history here. Newness alone is never enough; this reason requires both.",
  // Added by TS4, which is what the open text column existed for. Written
  // here rather than in `defence.ts` so the transparency report has one place
  // to read every reason from.
  cohort:
    "A group of accounts first seen within a short window of one another, which acted on the same thing and nothing else, and then went quiet. Assessed days afterwards, never on the day, because a launch shared somewhere popular looks the same at the time.",
};

// ---------------------------------------------------------------------------
// The thresholds
// ---------------------------------------------------------------------------
//
// EVERY NUMBER HERE IS A TRADE, and the direction of the trade is the same
// each time: a false positive silences a real person's honest opinion and
// they are never told, so the thresholds are set where a HONEST pattern
// cannot reach them, and the patient adversary gets away with it.

/** The window the sweep reasons over. Longer than any burst, short enough
 *  that an account's whole history is not one undifferentiated blob. */
export const INTEGRITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A burst: this many endorsements from one subject inside this window.
 *
 * ABOVE TS2's gateway limit ON PURPOSE. The gateway already refuses more than
 * twelve a minute; this is the retrospective signal, and it must not simply
 * re-flag everybody who used their allowance. Twenty inside ten minutes is
 * faster than a person reads twenty product pages.
 */
export const BURST_MIN_ENDORSEMENTS = 20;
export const BURST_WINDOW_MS = 10 * 60 * 1000;

/**
 * An account with almost no history here.
 *
 * NOT "a new account" — a new account is the most valuable thing this
 * directory gets, and discounting newness would make it a club. This is
 * "first seen less than an hour before the burst", which is a different
 * claim: the account came into existence in order to do this.
 */
export const NEW_ACCOUNT_MS = 60 * 60 * 1000;

/** How many listings two subjects must BOTH have endorsed to be comparable
 *  at all. Below this, overlap is coincidence: two people who both like the
 *  two most popular products on the site are not a ring. */
export const RING_MIN_SHARED = 4;

/**
 * How much of their endorsing two subjects must have in common.
 *
 * Jaccard over their listing sets. 0.8 is deliberately severe: two genuinely
 * like-minded people who found the site the same week will overlap heavily,
 * and the thing that distinguishes a ring is that the accounts have
 * essentially NO independent behaviour.
 */
export const RING_MIN_JACCARD = 0.8;

/** How many mutually-overlapping subjects make a ring. Two accounts that
 *  agree are a coincidence; three or more that agree on everything and on
 *  nothing else are a pattern. */
export const RING_MIN_SUBJECTS = 3;

/**
 * How many endorsers a listing may have before it stops being evidence.
 *
 * BOTH A BOUND AND A JUDGEMENT, and they happen to agree.
 *
 * The judgement: a listing everybody has endorsed is the weakest possible
 * co-occurrence signal. Two accounts both endorsing the most popular thing on
 * the site tells you nothing about whether they are connected — it tells you
 * the thing is popular.
 *
 * The bound: candidate pairs are generated per listing, so a listing with
 * `n` endorsers costs n²/2 comparisons. Without this cap, one very popular
 * listing inside the sweep's window makes the sweep quadratic in the whole
 * catalog's audience, and a sweep that times out restates nothing at all —
 * which is the integrity model silently switching itself off. A measured
 * 116-second test run is what put this number here.
 */
export const RING_MAX_LISTING_FANOUT = 500;

// ---------------------------------------------------------------------------
// The assessment
// ---------------------------------------------------------------------------

/** One endorsement, as the sweep sees it. Ids and times — nothing about who. */
export interface IntegrityObservation {
  readonly profileId: string;
  readonly subjectId: string;
  /** ms since epoch. */
  readonly createdAt: number;
  /** ms since epoch — this subject's FIRST endorsement anywhere here. Their
   *  history on this surface, not their identity elsewhere (OPC-6). */
  readonly subjectFirstSeenAt: number;
}

export interface IntegrityFinding {
  readonly profileId: string;
  readonly subjectId: string;
  readonly reason: IntegrityReason;
}

export interface IntegrityAssessment {
  readonly discount: readonly IntegrityFinding[];
  /** Subjects the sweep judged to be acting as one. For the audit row, and
   *  never for a surface. */
  readonly rings: readonly (readonly string[])[];
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let shared = 0;
  for (const value of a) if (b.has(value)) shared += 1;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

function sharedCount(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let shared = 0;
  for (const value of a) if (b.has(value)) shared += 1;
  return shared;
}

/**
 * Assess a window of endorsements.
 *
 * PURE, AND THAT IS LOAD-BEARING. It takes observations and returns opinions;
 * it reads no clock, no database and no configuration. That makes the model
 * testable against synthetic fixtures — which is the only honest way to know
 * what it catches and, more importantly, what it does not.
 *
 * DETERMINISTIC ORDERING throughout, so the same window produces the same
 * findings in the same order. A sweep whose output shuffled would make the
 * audit trail unreadable and every restatement look like a change.
 */
export function assessIntegrity(
  observations: readonly IntegrityObservation[],
): IntegrityAssessment {
  const bySubject = new Map<string, IntegrityObservation[]>();
  for (const observation of observations) {
    const list = bySubject.get(observation.subjectId);
    if (list) list.push(observation);
    else bySubject.set(observation.subjectId, [observation]);
  }

  // Sorted so the walk below is over time, and so the output is stable.
  const subjects = [...bySubject.keys()].sort();
  for (const subject of subjects) {
    bySubject.get(subject)!.sort((a, b) => a.createdAt - b.createdAt || a.profileId.localeCompare(b.profileId));
  }

  // ─── signal 1 and 2: burst, and burst from an account with no history ───
  //
  // Computed together because the second is the first PLUS a condition, and
  // splitting them into two passes would let the two disagree about what a
  // burst is.
  const burstSubjects = new Map<string, IntegrityReason>();
  for (const subject of subjects) {
    const rows = bySubject.get(subject)!;
    if (rows.length < BURST_MIN_ENDORSEMENTS) continue;
    // A sliding window over the sorted times: is there any span of
    // BURST_WINDOW_MS holding BURST_MIN_ENDORSEMENTS of them?
    let burstStart: number | null = null;
    for (let i = BURST_MIN_ENDORSEMENTS - 1; i < rows.length; i += 1) {
      const first = rows[i - (BURST_MIN_ENDORSEMENTS - 1)]!;
      const last = rows[i]!;
      if (last.createdAt - first.createdAt <= BURST_WINDOW_MS) {
        burstStart = first.createdAt;
        break;
      }
    }
    if (burstStart === null) continue;
    // NEWNESS ONLY EVER CONTRIBUTES. It sharpens the reason recorded; it
    // never creates a finding on its own, because a directory that discounts
    // newcomers has made itself a club.
    const firstSeen = rows[0]!.subjectFirstSeenAt;
    burstSubjects.set(
      subject,
      burstStart - firstSeen <= NEW_ACCOUNT_MS ? "burst-new-account" : "burst",
    );
  }

  // ─── signal 3: co-occurrence ────────────────────────────────────────────
  //
  // The only signal allowed to decide alone, because it is a statement about
  // a GROUP rather than about a person: "these accounts have essentially no
  // independent behaviour".
  const listingsBySubject = new Map<string, Set<string>>();
  for (const subject of subjects) {
    listingsBySubject.set(subject, new Set(bySubject.get(subject)!.map((r) => r.profileId)));
  }

  // An undirected graph of "these two overlap far more than chance".
  //
  // CANDIDATE PAIRS COME FROM AN INVERTED INDEX, not from every pair of
  // subjects. Comparing all pairs is O(subjects²), which at the sweep's own
  // bound of 50,000 observations is over a billion comparisons and a sweep
  // that never finishes — and a sweep that never finishes is the integrity
  // model silently switching itself off. Two cheap facts make the honest
  // version fast:
  //
  //   1. A subject with fewer than `RING_MIN_SHARED` listings can never SHARE
  //      that many with anybody, so they cannot be in a ring and are skipped
  //      before any pair is formed. On a real catalog this is most people.
  //   2. Two subjects who share NO listing cannot share four, so pairs are
  //      generated per listing rather than globally.
  //
  // The cost is then the sum over listings of (endorsers choose 2), bounded
  // by `RING_MAX_LISTING_FANOUT` above — which is also the right judgement,
  // since a listing everybody endorsed is no evidence of anything.
  const eligible = subjects.filter(
    (subject) => listingsBySubject.get(subject)!.size >= RING_MIN_SHARED,
  );
  const subjectsByListing = new Map<string, string[]>();
  for (const subject of eligible) {
    for (const listing of listingsBySubject.get(subject)!) {
      const list = subjectsByListing.get(listing);
      if (list) list.push(subject);
      else subjectsByListing.set(listing, [subject]);
    }
  }

  const neighbours = new Map<string, Set<string>>();
  for (const subject of subjects) neighbours.set(subject, new Set());
  const considered = new Set<string>();
  for (const endorsers of subjectsByListing.values()) {
    if (endorsers.length < 2 || endorsers.length > RING_MAX_LISTING_FANOUT) continue;
    for (let i = 0; i < endorsers.length; i += 1) {
      for (let j = i + 1; j < endorsers.length; j += 1) {
        const first = endorsers[i]!;
        const second = endorsers[j]!;
        // Each pair is judged once however many listings they share.
        const pairKey = first < second ? `${first}|${second}` : `${second}|${first}`;
        if (considered.has(pairKey)) continue;
        considered.add(pairKey);
        const a = listingsBySubject.get(first)!;
        const b = listingsBySubject.get(second)!;
        if (sharedCount(a, b) < RING_MIN_SHARED) continue;
        if (jaccard(a, b) < RING_MIN_JACCARD) continue;
        neighbours.get(first)!.add(second);
        neighbours.get(second)!.add(first);
      }
    }
  }

  // Connected components. A RING IS DISCOUNTED AS A UNIT (decision 3): half a
  // ring discounted is a ring that still works, so the component is the unit
  // of judgement rather than the edge.
  const seen = new Set<string>();
  const rings: string[][] = [];
  for (const subject of subjects) {
    if (seen.has(subject)) continue;
    const component: string[] = [];
    const queue = [subject];
    seen.add(subject);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const next of neighbours.get(current)!) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    if (component.length >= RING_MIN_SUBJECTS) rings.push(component.sort());
  }
  rings.sort((a, b) => a[0]!.localeCompare(b[0]!));

  const ringSubjects = new Set(rings.flat());

  // ─── the decision ───────────────────────────────────────────────────────
  const discount: IntegrityFinding[] = [];
  for (const observation of [...observations].sort(
    (a, b) =>
      a.subjectId.localeCompare(b.subjectId) || a.profileId.localeCompare(b.profileId),
  )) {
    // `ring` outranks `burst`: it is the stronger claim, and a ring member who
    // also burst should be recorded under the reason that actually decided.
    const reason: IntegrityReason | null = ringSubjects.has(observation.subjectId)
      ? "ring"
      : (burstSubjects.get(observation.subjectId) ?? null);
    if (reason === null) continue;
    discount.push({ profileId: observation.profileId, subjectId: observation.subjectId, reason });
  }

  return { discount, rings };
}

// ---------------------------------------------------------------------------
// What is said in public
// ---------------------------------------------------------------------------

/**
 * The aggregate disclosure, for TS5's transparency report (EN-4).
 *
 * COUNTS BY REASON, NEVER SUBJECTS AND NEVER LISTINGS. Publishing per-listing
 * discount figures would let anybody compute exactly which products we
 * discounted and by how much — an accusation about a specific product's
 * supporters, made in public, by arithmetic. Publishing per-subject figures
 * would be the same accusation aimed at a person.
 */
export interface IntegrityDisclosure {
  readonly reason: IntegrityReason;
  readonly discounted: number;
}

export const INTEGRITY_DISCLOSURE_NOTE =
  "Some endorsements are not counted toward a listing's public total. We publish how many, and why, in aggregate — never which listings, and never who. An endorsement that is not counted is still recorded, and a later review can restore it.";

/**
 * What a person is told about their own endorsement's integrity state.
 *
 * NOTHING. Exported as a constant so the rule has a name a test can pin, and
 * so the next person to consider adding a "your endorsement was flagged"
 * notice finds the reason written down beside the decision.
 *
 * A visible state is an accusation made by a machine about somebody who has
 * no way to answer it — and a free oracle telling a ring exactly which of its
 * accounts got caught, which is worth more to an attacker than the discount
 * costs them.
 */
export const INTEGRITY_NEVER_DISCLOSED_PER_PERSON = true;
