import { describe, expect, it } from "vitest";

import {
  BOARD_ELIGIBILITY_AGE_MS,
  BRIGADE_FLAG_MIN_ENDORSEMENTS,
  COHORT_ACT_WINDOW_MS,
  COHORT_FIRST_SEEN_WINDOW_MS,
  COHORT_MATURITY_MS,
  COHORT_MIN_SUBJECTS,
  DEFENCE_PUBLISHED_NOTE,
  DEFENCE_REFUSALS,
  FLAG_CONSEQUENCE,
  FLAG_COPY,
  FLAG_KINDS,
  FLAG_RECURS,
  FLAG_STATES,
  MIN_ASSESSABLE_WORDS,
  assessCohorts,
  assessFiller,
  boardEligible,
  brigadeEvidence,
  brigadeFlagged,
  cohortEvidence,
  fillerEvidence,
  type CohortObservation,
} from "./defence.js";
import { INTEGRITY_REASONS } from "./integrity.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("no automated path removes anything (TS4's done-when)", () => {
  it("no flag kind has a consequence that deletes", () => {
    for (const kind of FLAG_KINDS) {
      expect(["deindex", "discount", "queue-only"]).toContain(FLAG_CONSEQUENCE[kind]);
    }
  });

  it("the signal that cannot tell an attack from a surge does nothing at all", () => {
    // The brigade signal is the one a naive build would wire to a discount.
    // It is queue-only because a launch shared in a newsletter produces the
    // same shape, and the board's structural rule already handled the attack.
    expect(FLAG_CONSEQUENCE.brigade).toBe("queue-only");
  });

  it("every flag kind has prose describing a pattern rather than a person", () => {
    for (const kind of FLAG_KINDS) {
      const copy = FLAG_COPY[kind];
      expect(copy.title.length).toBeGreaterThan(10);
      expect(copy.says.length).toBeGreaterThan(80);
      // The same bar EN3's reason copy is held to: a machine saw a shape and
      // is not in a position to say what anybody meant by it.
      expect(copy.says).not.toMatch(/fraud|fake|cheat|malicious|abuse/i);
    }
  });

  it("dismissed is a first-class flag state", () => {
    // Because the false-positive rate has to stay measurable in production
    // and not only in a fixture. A queue with no way to say "this was wrong"
    // is a queue that cannot report on itself.
    expect(FLAG_STATES).toContain("dismissed");
  });
});

describe("filler: what is assessed and what is left alone", () => {
  it("says nothing about text too short to judge", () => {
    const assessment = assessFiller("A CLI for tailing Kubernetes logs.");
    expect(assessment.assessable).toBe(false);
    expect(assessment.flagged).toBe(false);
    // Terse writing is a style and a common one among people who ship tools.
    // Assessing it would flag the best writers on the estate.
    expect(assessment.words).toBeLessThan(MIN_ASSESSABLE_WORDS);
  });

  it("flags a placeholder at any length, because a placeholder is unambiguous", () => {
    // The length floor protects terse HONEST writing. It is not a licence for
    // an unfilled template.
    const assessment = assessFiller("[Product Name] — the leading solution.");
    expect(assessment.assessable).toBe(false);
    expect(assessment.signals).toContain("scaffold");
    expect(assessment.flagged).toBe(true);
  });

  it("does not flag enthusiasm on its own", () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const enthusiastic = `This robust, powerful, seamless and intuitive tool for Postgres. ${words}`;
    const assessment = assessFiller(enthusiastic);
    // The maker really does think their tool is powerful, and one named
    // technology is the whole difference between a pitch and a brochure.
    expect(assessment.flagged).toBe(false);
  });

  it("does not flag an absence of specifics on its own", () => {
    const plain =
      "A place to keep the notes you take while reading. You highlight a passage, you write what " +
      "you thought about it, and later you can find every note you made about a theme rather than " +
      "every note you made in a book. There is no account and nothing leaves your machine. It has " +
      "been the way I read for about a year and I finally cleaned it up enough to give away.";
    const assessment = assessFiller(plain);
    expect(assessment.assessable).toBe(true);
    // Not everything worth listing is a database. A pitch aimed at people
    // rather than at engineers is still a pitch.
    expect(assessment.flagged).toBe(false);
  });

  it("quotes the text back as evidence rather than reporting a score", () => {
    const scaffolded = assessFiller("Lorem ipsum dolor sit amet, a leading solution.");
    expect(fillerEvidence(scaffolded)).toContain('"lorem ipsum"');
    // A triager who has to go and look is a triager who dismisses.
    expect(fillerEvidence(scaffolded)).not.toMatch(/score|0\.\d/);
  });
});

// ---------------------------------------------------------------------------
// Cohorts
// ---------------------------------------------------------------------------

function cohortRows(options: {
  count: number;
  target: string;
  firstSeenBase: number;
  firstSeenSpread: number;
  actedAt: number;
  extraTargets?: number;
}): CohortObservation[] {
  const rows: CohortObservation[] = [];
  for (let i = 0; i < options.count; i += 1) {
    const subjectId = `${options.target}-sub-${i}`;
    rows.push({
      subjectId,
      targetRef: options.target,
      actedAt: options.actedAt + i * 60_000,
      subjectFirstSeenAt: options.firstSeenBase + i * options.firstSeenSpread,
    });
    for (let extra = 0; extra < (options.extraTargets ?? 0); extra += 1) {
      rows.push({
        subjectId,
        targetRef: `other-${extra}`,
        actedAt: options.actedAt + extra * HOUR,
        subjectFirstSeenAt: options.firstSeenBase + i * options.firstSeenSpread,
      });
    }
  }
  return rows;
}

describe("cohorts: accounts that arrived together and then stopped", () => {
  const acted = 1_000 * DAY;
  const now = acted + COHORT_MATURITY_MS + HOUR;

  it("finds a set that was created together, acted once, and went quiet", () => {
    const cohorts = assessCohorts(
      cohortRows({
        count: COHORT_MIN_SUBJECTS + 1,
        target: "listing-a",
        firstSeenBase: acted - 2 * HOUR,
        firstSeenSpread: 20 * 60_000,
        actedAt: acted,
      }),
      now,
    );
    expect(cohorts).toHaveLength(1);
    expect(cohorts[0]!.targetRef).toBe("listing-a");
    expect(cohorts[0]!.subjectIds).toHaveLength(COHORT_MIN_SUBJECTS + 1);
  });

  it("does not judge a cohort on the day it happens", () => {
    // THE DEFENCE AGAINST THE FALSE POSITIVE THAT MATTERS. A launch shared in
    // a newsletter produces exactly this shape within the hour, and on the
    // day there is nothing that distinguishes it. So on the day, nothing.
    const sameDay = assessCohorts(
      cohortRows({
        count: COHORT_MIN_SUBJECTS + 3,
        target: "listing-a",
        firstSeenBase: acted - HOUR,
        firstSeenSpread: 10 * 60_000,
        actedAt: acted,
      }),
      acted + HOUR,
    );
    expect(sameDay).toEqual([]);
  });

  it("leaves accounts alone once they have done anything else", () => {
    // An account that endorsed this listing and three others is behaving like
    // a person who found the site, which is the outcome the directory wants.
    const cohorts = assessCohorts(
      cohortRows({
        count: COHORT_MIN_SUBJECTS + 3,
        target: "listing-a",
        firstSeenBase: acted - HOUR,
        firstSeenSpread: 10 * 60_000,
        actedAt: acted,
        extraTargets: 2,
      }),
      now,
    );
    expect(cohorts).toEqual([]);
  });

  it("needs more than a handful", () => {
    const cohorts = assessCohorts(
      cohortRows({
        count: COHORT_MIN_SUBJECTS - 1,
        target: "listing-a",
        firstSeenBase: acted - HOUR,
        firstSeenSpread: 60_000,
        actedAt: acted,
      }),
      now,
    );
    expect(cohorts).toEqual([]);
  });

  it("does not group accounts that merely acted together", () => {
    // Four people who all endorsed the same listing in an afternoon are four
    // people who all endorsed the same listing in an afternoon. What makes it
    // a cohort is that they came into existence together too.
    const spreadOut = cohortRows({
      count: COHORT_MIN_SUBJECTS + 2,
      target: "listing-a",
      firstSeenBase: acted - 400 * DAY,
      firstSeenSpread: 30 * DAY,
      actedAt: acted,
    });
    expect(assessCohorts(spreadOut, now)).toEqual([]);
  });

  it("does not group accounts that merely arrived together", () => {
    // The mirror of the previous case: everybody who signed up the day a
    // popular article mentioned the site arrived together, and they are not a
    // cohort unless they also acted on the same thing at the same time.
    const rows = cohortRows({
      count: COHORT_MIN_SUBJECTS + 2,
      target: "listing-a",
      firstSeenBase: acted - HOUR,
      firstSeenSpread: 10 * 60_000,
      actedAt: acted,
    }).map((row, index) => ({ ...row, actedAt: row.actedAt + index * (COHORT_ACT_WINDOW_MS / 2) }));
    expect(assessCohorts(rows, now)).toEqual([]);
  });

  it("raises one flag per target, not one per overlapping window", () => {
    const cohorts = assessCohorts(
      cohortRows({
        count: COHORT_MIN_SUBJECTS + 6,
        target: "listing-a",
        firstSeenBase: acted - 2 * HOUR,
        firstSeenSpread: 5 * 60_000,
        actedAt: acted,
      }),
      now,
    );
    // Two flags for one pattern is a queue a triager stops reading.
    expect(cohorts).toHaveLength(1);
  });

  it("is deterministic across input order", () => {
    const rows = cohortRows({
      count: COHORT_MIN_SUBJECTS + 2,
      target: "listing-a",
      firstSeenBase: acted - HOUR,
      firstSeenSpread: 10 * 60_000,
      actedAt: acted,
    });
    const forwards = assessCohorts(rows, now);
    const backwards = assessCohorts([...rows].reverse(), now);
    expect(backwards).toEqual(forwards);
  });

  it("reports its window in the evidence line", () => {
    const cohorts = assessCohorts(
      cohortRows({
        count: COHORT_MIN_SUBJECTS,
        target: "listing-a",
        firstSeenBase: acted - 3 * HOUR,
        firstSeenSpread: 30 * 60_000,
        actedAt: acted,
      }),
      now,
    );
    const evidence = cohortEvidence(cohorts[0]!);
    expect(evidence).toContain(`${COHORT_MIN_SUBJECTS} accounts`);
    expect(evidence).toMatch(/quiet since/);
    // Never a subject id: the flag is about a pattern, and the queue is not
    // where per-person integrity records are kept (EN-4).
    expect(evidence).not.toContain("sub-0");
  });

  it("the maturity delay is longer than the window it is protecting", () => {
    // If a cohort could mature inside the window it formed in, the delay
    // would not be doing the thing it exists to do.
    expect(COHORT_MATURITY_MS).toBeGreaterThan(COHORT_FIRST_SEEN_WINDOW_MS);
    expect(COHORT_MATURITY_MS).toBeGreaterThan(COHORT_ACT_WINDOW_MS);
  });

  it("its discount reason is in the published vocabulary", () => {
    // OPC-4: a consequence must resolve to prose somebody can read, and the
    // transparency report groups by this exact string.
    expect(INTEGRITY_REASONS).toContain("cohort");
  });
});

// ---------------------------------------------------------------------------
// The board's eligibility rule
// ---------------------------------------------------------------------------

describe("the launch board ranks only what existed before the launch", () => {
  const launchedAt = 1_000 * DAY;
  const old = { subjectId: "old", subjectFirstSeenAt: launchedAt - 30 * DAY };
  const fresh = { subjectId: "fresh", subjectFirstSeenAt: launchedAt - 5 * 60_000 };

  it("counts accounts older than the eligibility age and no others", () => {
    const result = boardEligible(launchedAt, [old, fresh]);
    expect(result.eligible).toBe(1);
    expect(result.ineligible).toBe(1);
    expect(result.ineligibleShare).toBe(0.5);
  });

  it("treats the boundary as inclusive", () => {
    const exactly = {
      subjectId: "exact",
      subjectFirstSeenAt: launchedAt - BOARD_ELIGIBILITY_AGE_MS,
    };
    expect(boardEligible(launchedAt, [exactly]).eligible).toBe(1);
  });

  it("ranks the same way next month as it did on the day", () => {
    // `launchedAt` rather than "now": a rule that drifts as accounts age is a
    // rule that quietly re-orders history.
    const onTheDay = boardEligible(launchedAt, [old, fresh]);
    const aMonthLater = boardEligible(launchedAt, [old, fresh]);
    expect(aMonthLater).toEqual(onTheDay);
  });

  it("flags nothing when a launch simply did well", () => {
    // Most of a real launch's audience being people who already had accounts
    // is the normal case, and a launch bringing SOME new people is a success.
    const endorsements = [
      ...Array.from({ length: 20 }, (_, i) => ({
        subjectId: `old-${i}`,
        subjectFirstSeenAt: launchedAt - 100 * DAY,
      })),
      ...Array.from({ length: 8 }, (_, i) => ({
        subjectId: `new-${i}`,
        subjectFirstSeenAt: launchedAt - 10 * 60_000,
      })),
    ];
    const result = boardEligible(launchedAt, endorsements);
    expect(result.eligible).toBe(20);
    expect(brigadeFlagged(result)).toBe(false);
  });

  it("flags when almost everybody made an account to endorse", () => {
    const endorsements = Array.from({ length: BRIGADE_FLAG_MIN_ENDORSEMENTS + 5 }, (_, i) => ({
      subjectId: `new-${i}`,
      subjectFirstSeenAt: launchedAt - 10 * 60_000,
    }));
    const result = boardEligible(launchedAt, endorsements);
    expect(brigadeFlagged(result)).toBe(true);
    // And even then, nothing happens automatically.
    expect(FLAG_CONSEQUENCE.brigade).toBe("queue-only");
  });

  it("does not flag a small launch whose handful of endorsers were all new", () => {
    // Four people is not evidence of anything, and a flag on every quiet
    // launch is a queue nobody reads.
    const endorsements = Array.from({ length: 4 }, (_, i) => ({
      subjectId: `new-${i}`,
      subjectFirstSeenAt: launchedAt - 10 * 60_000,
    }));
    expect(brigadeFlagged(boardEligible(launchedAt, endorsements))).toBe(false);
  });

  it("says in its evidence that nothing was discounted", () => {
    const endorsements = Array.from({ length: BRIGADE_FLAG_MIN_ENDORSEMENTS + 1 }, (_, i) => ({
      subjectId: `new-${i}`,
      subjectFirstSeenAt: launchedAt - 10 * 60_000,
    }));
    const evidence = brigadeEvidence(boardEligible(launchedAt, endorsements));
    expect(evidence).toMatch(/Nothing was discounted/);
  });

  it("handles a launch nobody endorsed without dividing by zero", () => {
    const result = boardEligible(launchedAt, []);
    expect(result).toEqual({ eligible: 0, ineligible: 0, ineligibleShare: 0 });
    expect(brigadeFlagged(result)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// What is published
// ---------------------------------------------------------------------------

describe("the published account (OPC-4)", () => {
  it("states the one thing a reader most needs to know", () => {
    expect(DEFENCE_PUBLISHED_NOTE).toMatch(/only a person removes/i);
    expect(DEFENCE_PUBLISHED_NOTE).toMatch(/appealable/i);
  });

  it("describes each consequence in terms of what survives it", () => {
    // De-indexing keeps the page; a discount keeps the endorsement. A note
    // that named the consequences without saying what is kept would read as
    // a list of punishments.
    expect(DEFENCE_PUBLISHED_NOTE).toMatch(/stays published/i);
    expect(DEFENCE_PUBLISHED_NOTE).toMatch(/restore/i);
  });

  it("publishes the refusals, not only the capabilities", () => {
    expect(DEFENCE_REFUSALS.length).toBeGreaterThanOrEqual(4);
    for (const refusal of DEFENCE_REFUSALS) {
      expect(refusal.refused.length).toBeGreaterThan(10);
      // Each one says WHY. A list of things we do not do, with no reasons, is
      // a list somebody will shorten.
      expect(refusal.because.length).toBeGreaterThan(80);
    }
  });

  it("names the authorship refusal and its actual reason", () => {
    const authorship = DEFENCE_REFUSALS.find((r) => /person or a model/i.test(r.refused));
    expect(authorship).toBeDefined();
    // The bias against second-language writers is the reason the whole design
    // took the shape it did, and it is stated in public rather than only in a
    // source comment.
    expect(authorship!.because).toMatch(/second language/i);
  });
});

describe("which kinds may be raised again", () => {
  it("only the kind whose evidence can change", () => {
    // A pitch can be rewritten. A cohort's accounts have already gone quiet,
    // a ring has already endorsed what it endorsed, a launch has already
    // happened — those patterns are frozen, so a dismissed flag about one
    // would come back on every sweep forever.
    expect(FLAG_RECURS.filler).toBe(true);
    for (const kind of FLAG_KINDS.filter((k) => k !== "filler")) {
      expect(FLAG_RECURS[kind]).toBe(false);
    }
  });

  it("covers every kind, so a new detector must answer the question", () => {
    for (const kind of FLAG_KINDS) expect(typeof FLAG_RECURS[kind]).toBe("boolean");
  });
});
