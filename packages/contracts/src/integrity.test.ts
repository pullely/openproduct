// Endorsement integrity (openproduct-commons EN3).
//
// TWO KINDS OF TEST HERE, and the second kind is the unusual one.
//
// The first kind is ordinary: a synthetic ring is caught, and caught AS A
// UNIT. The second kind asserts what this model does NOT catch — a patient
// adversary — as EXPECTED BEHAVIOUR rather than as a gap. That is deliberate
// and it is the most important thing in the file.
//
// The reason: the natural response to "we miss the patient version" is to
// lower a threshold until we stop missing it. Every threshold here trades a
// miss against a false positive, and a false positive silences a real
// person's honest opinion in a system that never tells them it happened.
// Writing the miss down as a passing test means the next person to reach for
// the dial has to delete an assertion that explains why it is there, rather
// than quietly tightening a number nobody documented.

import { describe, expect, it } from "vitest";

import { FORMULAS } from "./provenance.js";
import {
  BURST_MIN_ENDORSEMENTS,
  BURST_WINDOW_MS,
  INTEGRITY_DISCLOSURE_NOTE,
  INTEGRITY_REASONS,
  INTEGRITY_REASON_COPY,
  NEW_ACCOUNT_MS,
  RING_MIN_JACCARD,
  RING_MIN_SHARED,
  RING_MAX_LISTING_FANOUT,
  RING_MIN_SUBJECTS,
  assessIntegrity,
  type IntegrityObservation,
} from "./integrity.js";

const T0 = Date.parse("2026-08-01T00:00:00.000Z");
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function obs(
  subjectId: string,
  profileId: string,
  atMs: number,
  firstSeenMs = atMs,
): IntegrityObservation {
  return { subjectId, profileId, createdAt: T0 + atMs, subjectFirstSeenAt: T0 + firstSeenMs };
}

/** N accounts endorsing exactly the same M listings, close together. */
function ring(subjects: number, listings: number, startMs = 0, firstSeenMs = 0): IntegrityObservation[] {
  const out: IntegrityObservation[] = [];
  for (let s = 0; s < subjects; s += 1) {
    for (let l = 0; l < listings; l += 1) {
      out.push(obs(`ring-${s}`, `listing-${l}`, startMs + s * MINUTE + l * 1000, firstSeenMs));
    }
  }
  return out;
}

describe("a synthetic ring is discounted, as a unit", () => {
  it("catches a group endorsing the same listings", () => {
    const findings = assessIntegrity(ring(RING_MIN_SUBJECTS, RING_MIN_SHARED)).discount;
    const subjects = new Set(findings.map((f) => f.subjectId));
    expect(subjects.size).toBe(RING_MIN_SUBJECTS);
    expect(findings.every((f) => f.reason === "ring")).toBe(true);
    // AS A UNIT: every endorsement of every member, not a sample. Half a ring
    // discounted is a ring that still works.
    expect(findings).toHaveLength(RING_MIN_SUBJECTS * RING_MIN_SHARED);
  });

  it("reports the ring's membership for the audit, and nothing else", () => {
    const assessment = assessIntegrity(ring(4, 6));
    expect(assessment.rings).toHaveLength(1);
    expect(assessment.rings[0]).toHaveLength(4);
    // Sorted, so a sweep's output is stable and a restatement that changed
    // nothing looks like nothing changed.
    expect([...assessment.rings[0]!]).toEqual([...assessment.rings[0]!].sort());
  });

  it("discounts a ring member's OTHER endorsements too", () => {
    // A ring account that also endorses one unrelated listing is still a ring
    // account. Discounting only its overlapping endorsements would leave the
    // useful half of the account working.
    const rows = [...ring(3, 5), obs("ring-0", "unrelated", 30 * MINUTE)];
    const findings = assessIntegrity(rows).discount;
    expect(findings.some((f) => f.subjectId === "ring-0" && f.profileId === "unrelated")).toBe(true);
  });

  it("finds TWO separate rings separately", () => {
    const a = ring(3, 5, 0);
    const b = ring(3, 5, DAY).map((o) => ({ ...o, subjectId: o.subjectId.replace("ring", "other") , profileId: o.profileId.replace("listing", "product") }));
    const assessment = assessIntegrity([...a, ...b]);
    expect(assessment.rings).toHaveLength(2);
    // Two rings, not one merged blob: they share no listing, so they are not
    // connected, and merging them would make one ring's members answerable
    // for another's.
    expect(assessment.rings.flat()).toHaveLength(6);
  });

  it("leaves everybody else alone", () => {
    const rows = [
      ...ring(3, 5),
      // Two honest people with overlapping taste: they both like three of the
      // same things and each likes several others.
      obs("ada", "listing-0", 2 * HOUR),
      obs("ada", "listing-1", 3 * HOUR),
      obs("ada", "listing-2", 5 * HOUR),
      obs("ada", "ada-only-1", 6 * HOUR),
      obs("ada", "ada-only-2", 8 * HOUR),
      obs("bo", "listing-0", 9 * HOUR),
      obs("bo", "listing-1", 11 * HOUR),
      obs("bo", "listing-2", 13 * HOUR),
      obs("bo", "bo-only-1", 15 * HOUR),
      obs("bo", "bo-only-2", 18 * HOUR),
    ];
    const flagged = new Set(assessIntegrity(rows).discount.map((f) => f.subjectId));
    expect(flagged.has("ada")).toBe(false);
    expect(flagged.has("bo")).toBe(false);
    expect(flagged.size).toBe(3);
  });
});

describe("the thresholds are set where an HONEST pattern cannot reach them", () => {
  it("does not call two accounts a ring", () => {
    // Two accounts that agree are a coincidence. Three or more that agree on
    // everything and on nothing else are a pattern.
    expect(assessIntegrity(ring(2, 10)).discount).toEqual([]);
    expect(RING_MIN_SUBJECTS).toBeGreaterThanOrEqual(3);
  });

  it("does not call a small overlap a ring", () => {
    // Everybody who uses this directory endorses the two most popular
    // listings on it. That is not a conspiracy, it is a directory working.
    const rows: IntegrityObservation[] = [];
    for (let s = 0; s < 5; s += 1) {
      for (let l = 0; l < RING_MIN_SHARED - 1; l += 1) {
        rows.push(obs(`person-${s}`, `popular-${l}`, s * HOUR + l * MINUTE));
      }
    }
    expect(assessIntegrity(rows).discount).toEqual([]);
  });

  it("does not call PARTIAL overlap a ring, however many people share it", () => {
    // Ten people who each endorsed the same five popular listings AND fifteen
    // different ones each. High shared count, low Jaccard — which is exactly
    // the signature of a real community rather than a ring.
    const rows: IntegrityObservation[] = [];
    for (let s = 0; s < 10; s += 1) {
      for (let l = 0; l < 5; l += 1) rows.push(obs(`p-${s}`, `popular-${l}`, s * HOUR + l * MINUTE));
      for (let l = 0; l < 15; l += 1) {
        rows.push(obs(`p-${s}`, `own-${s}-${l}`, s * HOUR + (10 + l) * MINUTE));
      }
    }
    expect(assessIntegrity(rows).discount).toEqual([]);
    expect(RING_MIN_JACCARD).toBeGreaterThanOrEqual(0.8);
  });
});

describe("a burst, and the rule that newness alone is never enough", () => {
  it("catches one account endorsing faster than a person reads", () => {
    const rows = Array.from({ length: BURST_MIN_ENDORSEMENTS }, (_, i) =>
      obs("fast", `p-${i}`, i * 1000, -30 * DAY),
    );
    const findings = assessIntegrity(rows).discount;
    expect(findings).toHaveLength(BURST_MIN_ENDORSEMENTS);
    // An established account bursting is `burst`, not `burst-new-account`:
    // the reason recorded has to be the one that was actually true.
    expect(findings.every((f) => f.reason === "burst")).toBe(true);
  });

  it("records the sharper reason when the account has no history here", () => {
    const rows = Array.from({ length: BURST_MIN_ENDORSEMENTS }, (_, i) =>
      obs("fresh", `p-${i}`, i * 1000, 0),
    );
    expect(assessIntegrity(rows).discount.every((f) => f.reason === "burst-new-account")).toBe(true);
    expect(NEW_ACCOUNT_MS).toBeLessThanOrEqual(HOUR);
  });

  it("NEVER discounts an account for being new alone", () => {
    // THE FAILURE THAT MATTERS MOST. A directory that quietly discounts
    // newcomers has made itself a club — and a new person endorsing a handful
    // of things they already used is the single most valuable event this
    // product has.
    const rows = Array.from({ length: BURST_MIN_ENDORSEMENTS - 1 }, (_, i) =>
      obs("newcomer", `p-${i}`, i * MINUTE, 0),
    );
    expect(assessIntegrity(rows).discount).toEqual([]);
  });

  it("does not catch the same count spread over a normal afternoon", () => {
    // Twenty endorsements in ten minutes is a script. Twenty over an
    // afternoon is somebody enjoying themselves, and that is the point of the
    // window being part of the rule rather than just the count.
    const rows = Array.from({ length: BURST_MIN_ENDORSEMENTS + 10 }, (_, i) =>
      obs("enthusiast", `p-${i}`, i * 20 * MINUTE, -7 * DAY),
    );
    expect(assessIntegrity(rows).discount).toEqual([]);
  });

  it("sits above TS2's gateway limit, so it does not re-flag everybody", () => {
    // TS2 already refuses more than twelve endorsements a minute at the door.
    // A retrospective signal that fired at the same rate would just re-punish
    // everybody who used their allowance.
    expect(BURST_MIN_ENDORSEMENTS / (BURST_WINDOW_MS / MINUTE)).toBeLessThan(12);
  });
});

describe("what this model does NOT catch — asserted, not omitted", () => {
  it("misses the patient adversary, and that is expected behaviour", () => {
    // THE MOST IMPORTANT TEST IN THIS FILE.
    //
    // Ten accounts, each endorsing the target once, spread over a week, and
    // each also endorsing several different unrelated listings. No burst
    // (nobody is fast). No ring (their sets barely overlap). This inflates
    // the target's total by ten and the model sees nothing.
    //
    // Catching it would need behavioural or identity signals this program has
    // deliberately refused to collect (OPC-6) — or thresholds low enough to
    // start catching real communities, which is the trade this file exists to
    // hold. The correct response to this test failing in the future is to ask
    // what changed, not to lower a number.
    const rows: IntegrityObservation[] = [];
    for (let s = 0; s < 10; s += 1) {
      rows.push(obs(`patient-${s}`, "target", s * 16 * HOUR, -60 * DAY));
      for (let l = 0; l < 4; l += 1) {
        rows.push(obs(`patient-${s}`, `cover-${s}-${l}`, s * 16 * HOUR + (l + 1) * HOUR, -60 * DAY));
      }
    }
    expect(assessIntegrity(rows).discount).toEqual([]);
  });

  it("misses a ring that also endorses enough unrelated things", () => {
    // The same trade from the other direction: a ring that pads its accounts
    // with independent behaviour drops below the Jaccard floor. Raising the
    // floor to catch it would catch every real community that shares taste.
    const rows: IntegrityObservation[] = [];
    for (let s = 0; s < 5; s += 1) {
      for (let l = 0; l < 5; l += 1) rows.push(obs(`padded-${s}`, `target-${l}`, s * HOUR + l * MINUTE));
      for (let l = 0; l < 20; l += 1) {
        rows.push(obs(`padded-${s}`, `pad-${s}-${l}`, s * HOUR + (10 + l) * MINUTE));
      }
    }
    expect(assessIntegrity(rows).discount).toEqual([]);
  });
});

describe("the model is pure, deterministic, and knows nothing about people", () => {
  it("reads no clock and no configuration — only what it was handed", () => {
    const rows = ring(3, 5);
    expect(assessIntegrity(rows)).toEqual(assessIntegrity(rows));
  });

  it("gives the same answer whatever order the rows arrive in", () => {
    // A sweep whose output shuffled would make the audit trail unreadable and
    // every restatement look like a change.
    const rows = [...ring(3, 5), obs("ada", "x", HOUR), obs("bo", "y", 2 * HOUR)];
    const forward = assessIntegrity(rows);
    const backward = assessIntegrity([...rows].reverse());
    expect(backward.discount).toEqual(forward.discount);
    expect(backward.rings).toEqual(forward.rings);
  });

  it("answers nothing for an empty window", () => {
    expect(assessIntegrity([])).toEqual({ discount: [], rings: [] });
  });

  it("carries no identity beyond the opaque subject id", () => {
    // OPC-6 — the model reasons about behaviour ON THIS SURFACE. It does not
    // know, and must not learn, how old an Orunbase account is or what else
    // its holder does.
    const source = Object.keys(assessIntegrity(ring(3, 5)).discount[0]!).sort();
    expect(source).toEqual(["profileId", "reason", "subjectId"]);
  });
});

describe("nothing per-person is ever said in public (EN-4)", () => {
  it("the disclosure is by REASON, and says so", () => {
    expect(INTEGRITY_DISCLOSURE_NOTE).toMatch(/in aggregate/i);
    expect(INTEGRITY_DISCLOSURE_NOTE).toMatch(/never which listings/i);
    expect(INTEGRITY_DISCLOSURE_NOTE).toMatch(/never who/i);
    // And it says the act survives — a discounted endorsement is not deleted,
    // and a review can restore it.
    expect(INTEGRITY_DISCLOSURE_NOTE).toMatch(/still recorded/i);
  });

  it("every reason has prose a person could read in a report", () => {
    for (const reason of INTEGRITY_REASONS) {
      const copy = INTEGRITY_REASON_COPY[reason];
      expect(copy.length).toBeGreaterThan(40);
      // No accusation of intent: the report describes a PATTERN, because that
      // is all a machine observed.
      expect(copy).not.toMatch(/fraud|fake|cheat|malicious/i);
    }
    // And the newness reason states its own guard-rail in its own words.
    expect(INTEGRITY_REASON_COPY["burst-new-account"]).toMatch(/Newness alone is never enough/i);
  });
});

describe("the discount resolves to published prose (OPC-4)", () => {
  it("`sort.most-saved` names the discount, as DS2 promised it would", () => {
    expect(FORMULAS["sort.most-saved"].sentence).toMatch(/after the integrity discount is applied/);
  });

  it("`endorsements.total` and `endorsements.7d` name it too", () => {
    for (const id of ["endorsements.total", "endorsements.7d"] as const) {
      expect(FORMULAS[id].sentence).toMatch(/integrity discount/);
    }
  });

  it("the discount has a sentence of its OWN, naming both signals and the guard-rail", () => {
    const sentence = FORMULAS["integrity.discount"].sentence;
    expect(sentence).toMatch(/same set of listings/i);
    expect(sentence).toMatch(/faster than a person reads/i);
    expect(sentence).toMatch(/Newness alone is never a reason/i);
    expect(sentence).toMatch(/nothing is deleted/i);
    expect(sentence).toMatch(/never which listings and never who/i);
    expect(FORMULAS["integrity.discount"].computedBy).toBe("EN3");
  });
});

describe("the sweep can actually finish", () => {
  it("handles the sweep's own bound without going quadratic", () => {
    // A MEASURED BUG, PINNED. The first version compared every pair of
    // subjects, which at the sweep's bound of 50,000 observations is over a
    // billion comparisons — a 116-second test run, and in production a sweep
    // that times out and therefore restates nothing at all. That is the
    // integrity model silently switching itself off, which is worse than
    // having no model, because the totals still claim to be defended.
    //
    // The fix is two cheap facts: somebody with fewer than RING_MIN_SHARED
    // listings cannot be in a ring, and two people who share no listing
    // cannot share four.
    const rows: IntegrityObservation[] = Array.from({ length: 50_000 }, (_, i) =>
      obs(`usr-${i}`, `p-${i}`, i),
    );
    const started = performance.now();
    expect(assessIntegrity(rows).discount).toEqual([]);
    expect(performance.now() - started).toBeLessThan(3_000);
  });

  it("treats a very popular listing as no evidence at all", () => {
    // Both a bound and a judgement, and they agree. Two accounts both
    // endorsing the most popular thing on the site tells you the thing is
    // popular, not that they are connected — and pairing them all up is the
    // quadratic blow-up above arriving through one listing.
    const rows: IntegrityObservation[] = [];
    const crowd = RING_MAX_LISTING_FANOUT + 50;
    for (let s = 0; s < crowd; s += 1) {
      // Each person endorses the popular listing and three others they share
      // with everybody — enough to clear RING_MIN_SHARED if the fanout cap
      // did not stop the pairing.
      for (let l = 0; l < 4; l += 1) rows.push(obs(`crowd-${s}`, `shared-${l}`, s * 1000 + l));
    }
    const started = performance.now();
    const findings = assessIntegrity(rows).discount;
    expect(performance.now() - started).toBeLessThan(3_000);
    // Nothing is flagged: every listing in this fixture is over the fanout
    // cap, so no candidate pair is ever formed.
    expect(findings).toEqual([]);
  });

  it("still catches a ring hiding inside a crowd", () => {
    // The cap must not become a hiding place. A ring whose members share
    // listings that are NOT over the fanout cap is still caught, even when
    // they all also endorse the popular thing everybody endorses.
    const rows: IntegrityObservation[] = [];
    for (let s = 0; s < RING_MAX_LISTING_FANOUT + 50; s += 1) {
      rows.push(obs(`crowd-${s}`, "everybody-likes-this", s * 1000));
    }
    for (let s = 0; s < 3; s += 1) {
      for (let l = 0; l < 6; l += 1) rows.push(obs(`ring-${s}`, `quiet-${l}`, 10_000 + s * 60 + l));
      rows.push(obs(`ring-${s}`, "everybody-likes-this", 20_000 + s));
    }
    const flagged = new Set(assessIntegrity(rows).discount.map((f) => f.subjectId));
    expect([...flagged].sort()).toEqual(["ring-0", "ring-1", "ring-2"]);
  });
});
