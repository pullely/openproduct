import { describe, expect, it } from "vitest";

import {
  ACT_LEGAL_FROM,
  ACT_RESULT,
  MODERATION_STATES,
  TOMBSTONE_COPY,
  TOMBSTONE_KEYS,
  actIsLegalFrom,
  reasonIsAcceptable,
  stateAfter,
  tombstoneDate,
  type ModerationState,
} from "./moderation.js";
import { MODERATION_ACTS, type ModerationAct } from "./trust.js";

describe("the act/state algebra (openproduct-commons TS3)", () => {
  it("every act that moves a listing has an undo in the same vocabulary", () => {
    // TS0's vocabulary is paired on purpose: an act that cannot be undone in
    // the same vocabulary is an act TS5's report cannot show the reversal of.
    const moving = Object.keys(ACT_RESULT) as ModerationAct[];
    expect(moving.sort()).toEqual(["delist", "relist", "remove", "restore"]);
  });

  it("undoes a removal with restore and a delisting with relist, never crosswise", () => {
    // The ledger is APPEND-ONLY, so an act recorded under the wrong name
    // answers an appeal wrongly for ever. This is the table that stops it.
    expect(actIsLegalFrom("restore", "removed")).toBe(true);
    expect(actIsLegalFrom("restore", "delisted")).toBe(false);
    expect(actIsLegalFrom("relist", "delisted")).toBe(true);
    expect(actIsLegalFrom("relist", "removed")).toBe(false);
  });

  it("escalates delisted → removed, and refuses to de-escalate the other way", () => {
    // Triage learns more, so escalation is allowed. De-escalation would need
    // two acts to describe (a restore AND a delist), and one button writing
    // two ledger rows is a button whose ledger nobody can read back.
    expect(actIsLegalFrom("remove", "delisted")).toBe(true);
    expect(actIsLegalFrom("delist", "removed")).toBe(false);
  });

  it("gives no act a transition out of a state it is already in", () => {
    for (const [act, from] of Object.entries(ACT_LEGAL_FROM)) {
      const result = stateAfter(act as ModerationAct);
      expect(from).not.toContain(result);
    }
  });

  it("moves nothing for the acts that judge a report or a person, not content", () => {
    // deindex moves TS1's `indexable`; the trust and appeal acts move a
    // ladder or record a judgement. A handler that treated one of these as a
    // content act would invent a fourth state.
    for (const act of ["deindex", "reindex", "trust_promote", "report_declined", "appeal_upheld"]) {
      expect(stateAfter(act as ModerationAct)).toBeNull();
    }
  });

  it("names only states the database will accept", () => {
    for (const act of MODERATION_ACTS) {
      const result = stateAfter(act);
      if (result !== null) expect(MODERATION_STATES).toContain(result);
    }
  });
});

describe("the tombstone says the state and the date and nothing else", () => {
  it("carries exactly two fields", () => {
    // I2. Every field anybody has wanted here — the reason, the actor, the
    // report count, an appeal form addressed to a passer-by — is a fact
    // about a person published at their own address before they answered it.
    expect([...TOMBSTONE_KEYS]).toEqual(["state", "at"]);
  });

  it("has copy for every state that is not visible, and none for visible", () => {
    const withCopy = Object.keys(TOMBSTONE_COPY).sort();
    expect(withCopy).toEqual(["delisted", "removed"]);
    expect(withCopy).not.toContain("visible");
  });

  it("never says the reason, the actor, or who reported it", () => {
    const all = Object.values(TOMBSTONE_COPY)
      .flatMap((c) => [c.title, c.says])
      .join(" ")
      .toLowerCase();
    for (const forbidden of ["reported", "reporter", "because", "violat", "moderator"]) {
      expect(all).not.toContain(forbidden);
    }
  });

  it("says the page still exists, in both states", () => {
    // The distinction TS-3 is about: removed content renders as removed. A
    // tombstone that reads like a 404 has failed at its only job.
    expect(TOMBSTONE_COPY.removed.says.toLowerCase()).toContain("address still resolves");
    expect(TOMBSTONE_COPY.delisted.says.toLowerCase()).toContain("page is still here");
  });

  it("renders a date, and nothing at all for one it cannot parse", () => {
    expect(tombstoneDate("2026-08-17T12:00:00.000Z")).toBe("17 August 2026");
    // Better to omit the line than to print `Invalid Date` under a removal.
    expect(tombstoneDate("not a date")).toBe("");
  });
});

describe("a reason is required, and bounded", () => {
  it("refuses an empty or whitespace reason", () => {
    // TS-4: an act nobody wrote a reason for is an act nobody can appeal.
    expect(reasonIsAcceptable("")).toBe(false);
    expect(reasonIsAcceptable("   ")).toBe(false);
    expect(reasonIsAcceptable("ok")).toBe(false);
  });

  it("accepts a real one and refuses an unbounded one", () => {
    expect(reasonIsAcceptable("spam, and the maintainer has been told")).toBe(true);
    expect(reasonIsAcceptable("x".repeat(1001))).toBe(false);
  });
});

describe("the states themselves", () => {
  it("keeps delisted distinct from removed", () => {
    // Delisting is not a weaker removal, it is a different claim. Collapsing
    // them would force every act to be the maximal one, which is how a
    // moderation surface becomes feared.
    const states: readonly ModerationState[] = MODERATION_STATES;
    expect(states).toEqual(["visible", "delisted", "removed"]);
  });
});
