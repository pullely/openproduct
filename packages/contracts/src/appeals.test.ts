import { describe, expect, it } from "vitest";

import {
  APPEALABLE_ACTS,
  APPEAL_DECISIONS,
  APPEAL_DECISION_COPY,
  APPEAL_ONE_ATTEMPT_NOTE,
  APPEAL_OUTCOME_ACT,
  APPEAL_REFUSALS,
  APPEAL_REVERSAL,
  APPEAL_STANDING_NOTE,
  APPEAL_STATES,
  APPEAL_STATE_COPY,
  APPEAL_VIEW_KEYS,
  MAX_APPEAL_SAYS,
  MIN_APPEAL_SAYS,
  NOT_APPEALABLE,
  actIsAppealable,
  appealSaysIsAcceptable,
  reversalOf,
  type AppealView,
} from "./appeals.js";
import { ACT_LEGAL_FROM, stateAfter } from "./moderation.js";
import { MODERATION_ACTS, type ModerationAct } from "./trust.js";

describe("what can be appealed, and what undoes it", () => {
  it("every appealable act has a reversal, and the reversal is a real act", () => {
    // The pairing 1330 built into the vocabulary on purpose — "an act that
    // cannot be undone in the same vocabulary is an act TS5's report cannot
    // show the reversal of" — finally spent.
    for (const act of APPEALABLE_ACTS) {
      const reversal = reversalOf(act);
      expect(reversal, act).not.toBeNull();
      expect(MODERATION_ACTS).toContain(reversal);
    }
  });

  it("no reversal is itself appealable, so upholding cannot loop", () => {
    for (const act of APPEALABLE_ACTS) {
      expect(actIsAppealable(reversalOf(act)!), act).toBe(false);
    }
  });

  it("the content reversals are legal from the state their act produces", () => {
    // The one place TS3's transition table and TS5's reversal map have to
    // agree: upholding an appeal against `remove` writes `restore`, and
    // `restore` must be legal from `removed`. A mismatch here would be an
    // upheld appeal that silently reversed nothing.
    for (const act of APPEALABLE_ACTS) {
      const produced = stateAfter(act);
      if (produced === null) continue;
      const reversal = reversalOf(act)!;
      expect(ACT_LEGAL_FROM[reversal], `${act} -> ${reversal}`).toContain(produced);
    }
  });

  it("refuses the outcome acts, so an appeal against an appeal has no door", () => {
    expect(actIsAppealable("appeal_upheld")).toBe(false);
    expect(actIsAppealable("appeal_refused")).toBe(false);
  });

  it("refuses report_declined, whose affected party has a better route", () => {
    // The reporter can simply file again — 1330's unique index is partial on
    // the open states — and a second channel would give them a standing
    // conversation about somebody else's listing.
    expect(actIsAppealable("report_declined")).toBe(false);
  });

  it("names an act that is not appealable and says why, for every one of them", () => {
    const explained = new Set(NOT_APPEALABLE.flatMap((entry) => entry.acts as readonly string[]));
    for (const act of MODERATION_ACTS) {
      if (actIsAppealable(act)) continue;
      // A person told "that cannot be appealed" with no reason has been
      // refused twice. Every act in the vocabulary is either appealable or
      // explained.
      expect(explained, act).toContain(act);
    }
    for (const entry of NOT_APPEALABLE) {
      expect(entry.because.length).toBeGreaterThan(60);
    }
    // And explained ONCE. An act appearing under two reasons is two answers
    // to the same question, and the page renders both.
    const listed = NOT_APPEALABLE.flatMap((entry) => entry.acts as readonly string[]);
    expect(listed.length).toBe(explained.size);
  });

  it("leaves the acts nothing can take out of the map, and says so", () => {
    // `lock` and `trust_demote` are in the vocabulary and nothing takes
    // either yet. THIS TEST IS THE THING THAT NOTICES when a milestone starts
    // locking threads: the moment an act becomes reachable it needs a pair
    // here, and the comment in the contract points at this assertion.
    expect(APPEAL_REVERSAL.lock).toBeUndefined();
    expect(APPEAL_REVERSAL.trust_demote).toBeUndefined();
  });
});

describe("the three rules, each with its cost written down", () => {
  it("standing says what it forbids as well as what it allows", () => {
    expect(APPEAL_STANDING_NOTE).toMatch(/only the people who maintain/i);
    // The half that makes it a rule rather than a boast: it says a bystander
    // is not wrong, and why they are refused anyway.
    expect(APPEAL_STANDING_NOTE).toMatch(/not because a bystander is wrong/i);
    expect(APPEAL_REFUSALS["no-standing"].says).toBe(APPEAL_STANDING_NOTE);
  });

  it("one attempt is stated BEFORE the form is submitted, not after", () => {
    expect(APPEAL_ONE_ATTEMPT_NOTE).toMatch(/one appeal per decision/i);
    expect(APPEAL_ONE_ATTEMPT_NOTE).toMatch(/will not get a second attempt/i);
  });

  it("an argument is required, and the bound is a real range", () => {
    expect(appealSaysIsAcceptable("")).toBe(false);
    expect(appealSaysIsAcceptable("no")).toBe(false);
    expect(appealSaysIsAcceptable("   ".repeat(20))).toBe(false);
    expect(appealSaysIsAcceptable("x".repeat(MIN_APPEAL_SAYS))).toBe(true);
    expect(appealSaysIsAcceptable("x".repeat(MAX_APPEAL_SAYS))).toBe(true);
    expect(appealSaysIsAcceptable("x".repeat(MAX_APPEAL_SAYS + 1))).toBe(false);
    expect(MIN_APPEAL_SAYS).toBeLessThan(MAX_APPEAL_SAYS);
  });

  it("says why an empty appeal is refused rather than just refusing it", () => {
    expect(APPEAL_REFUSALS["says-required"].says).toMatch(/easiest thing to do/i);
  });
});

describe("what the appellant is shown", () => {
  it("carries exactly these keys, and none of them is a decider", () => {
    const view: AppealView = {
      id: "a",
      actId: "b",
      act: "delist",
      subjectKind: "listing",
      subjectRef: "thing",
      says: "It was not spam.",
      state: "refused",
      filedAt: "2026-08-01T00:00:00.000Z",
      decidedAt: "2026-08-02T00:00:00.000Z",
      reversed: false,
    };
    expect(Object.keys(view).sort()).toEqual([...APPEAL_VIEW_KEYS].sort());
    // The operator's name and the operator's reason are BOTH absent. What the
    // estate answers for in public it answers for in aggregate.
    expect(APPEAL_VIEW_KEYS).not.toContain("decidedBy");
    expect(APPEAL_VIEW_KEYS).not.toContain("outcomeReason");
  });

  it("has a sentence for every standing, and refusal is not the quiet one", () => {
    for (const state of APPEAL_STATES) {
      expect(APPEAL_STATE_COPY[state].title.length).toBeGreaterThan(4);
      expect(APPEAL_STATE_COPY[state].says.length).toBeGreaterThan(60);
    }
    // A refusal that says less than an uphold is a product whispering bad
    // news, which is the correction XP3's studio frame already made once.
    expect(APPEAL_STATE_COPY.refused.says.length).toBeGreaterThan(
      APPEAL_STATE_COPY.upheld.says.length / 2,
    );
    expect(APPEAL_STATE_COPY.refused.says).toMatch(/counted publicly/i);
  });

  it("tells somebody waiting that the queue is worked oldest first", () => {
    expect(APPEAL_STATE_COPY.open.says).toMatch(/oldest first/i);
    expect(APPEAL_STATE_COPY.open.says).toMatch(/not in the order anybody shouts/i);
  });
});

describe("the decision", () => {
  it("maps each decision to a real ledger act", () => {
    for (const decision of APPEAL_DECISIONS) {
      const act: ModerationAct = APPEAL_OUTCOME_ACT[decision];
      expect(MODERATION_ACTS).toContain(act);
    }
    expect(APPEAL_OUTCOME_ACT.uphold).toBe("appeal_upheld");
    expect(APPEAL_OUTCOME_ACT.refuse).toBe("appeal_refused");
  });

  it("offers uphold FIRST, so agreeing with the original is not the default", () => {
    // The same discipline TS4's flag queue applies to "the check was wrong":
    // the estate wants the reversal path used, because the reversal rate is
    // its only production measurement of how often it acts wrongly.
    expect(APPEAL_DECISIONS[0]).toBe("uphold");
    expect(APPEAL_DECISION_COPY.uphold).toMatch(/got this wrong/i);
  });
});
