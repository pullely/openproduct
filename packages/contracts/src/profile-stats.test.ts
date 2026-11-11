// The four numbers on a person's profile (openproduct-commons CG4).
//
// EVERY OTHER FORMULA IN THIS PRODUCT IS ABOUT A LISTING. These four are about
// a PERSON, and that is the whole reason this file exists separately: a wrong
// number beside a product is an embarrassment, and a wrong number beside
// somebody's name is a claim about their work that they did not make and
// cannot correct.
//
// So what is pinned here is the mapping — stat to published sentence — rather
// than any arithmetic. The arithmetic lives in SQL and is proved against a
// real Postgres in `packages/db`. What a contract can prove is that no stat
// reaches a page without a sentence a reader can look up (I7), and that the
// one stat we cannot compute stays absent rather than becoming a zero.

import { describe, expect, it } from "vitest";

import { FORMULAS, formulaHref } from "./provenance.js";
import {
  CONTRIBUTES_TO_NOTE,
  PROFILE_DISCLOSURE,
  PROFILE_STAT_FORMULAS,
  PROFILE_STAT_NOTES,
  PUBLIC_CONTRIBUTOR_KEYS,
} from "./profiles.js";

describe("I7 — every stat names a formula, and every formula is published", () => {
  it("maps all four stats, and nothing else", () => {
    // Asserted as a whole rather than key by key, so ADDING a fifth stat
    // fails here until somebody writes its sentence — which is the only
    // moment anyone would think to.
    expect(Object.keys(PROFILE_STAT_FORMULAS).sort()).toEqual([
      "contributesTo",
      "maintains",
      "reviews",
      "since",
    ]);
  });

  it("each id resolves to a real published sentence, not a dangling string", () => {
    for (const [stat, id] of Object.entries(PROFILE_STAT_FORMULAS)) {
      const formula = FORMULAS[id];
      expect(`${stat} → ${id}: ${formula !== undefined}`).toBe(`${stat} → ${id}: true`);
      // A sentence, not a label. Anything this short would be a restatement
      // of the field name, which tells a reader nothing they did not have.
      expect(formula!.sentence.length).toBeGreaterThan(60);
      expect(formula!.computedBy).toBe("CG4");
    }
  });

  it("each has an anchor a reader can actually reach", () => {
    for (const id of Object.values(PROFILE_STAT_FORMULAS)) {
      expect(formulaHref(id)).toBe(`/docs/formulas#${id.replace(/[^a-z0-9]+/g, "-")}`);
    }
  });

  it("each has a note, and the note is not the field name", () => {
    for (const stat of Object.keys(PROFILE_STAT_FORMULAS)) {
      const note = PROFILE_STAT_NOTES[stat as keyof typeof PROFILE_STAT_NOTES];
      expect(`${stat}: ${typeof note}`).toBe(`${stat}: string`);
      expect(note).not.toBe(stat);
      expect(note.length).toBeGreaterThan(10);
    }
  });
});

describe("the two sentences must not describe the same listing twice", () => {
  it("`maintains` is about a ROLE and `contributes-to` excludes it", () => {
    // THE ONE ARITHMETIC CLAIM A CONTRACT CAN CHECK: a reader who adds the
    // two numbers should get a count of products that exist. The SQL
    // subtracts; these sentences are what tell a reader that it does, and a
    // pair that failed to say so would leave the page looking like it
    // double-counted even when it did not.
    expect(FORMULAS[PROFILE_STAT_FORMULAS.maintains]!.sentence).toMatch(
      /owner or maintainer role/,
    );
    const contributes = FORMULAS[PROFILE_STAT_FORMULAS.contributesTo]!.sentence;
    expect(contributes).toMatch(/does not run/);
    expect(contributes).toMatch(/subtracted rather than counted twice/);
  });

  it("`contributes-to` says a retired place still counts, and why", () => {
    // CG3 made leaving unilateral so it would never be a negotiation. A
    // profile that quietly dropped the listing would put the cost back, and
    // the person would find out by watching their own page shrink.
    const sentence = FORMULAS[PROFILE_STAT_FORMULAS.contributesTo]!.sentence;
    expect(sentence).toMatch(/since left still counts/);
    expect(sentence).toMatch(/the work happened/);
  });

  it("`contributes-to` counts only what the person themselves confirmed", () => {
    // OPC-5. Counting an unanswered invitation would let a maintainer inflate
    // somebody else's profile by naming them, which is the exact move the
    // two-sided edge exists to prevent.
    expect(FORMULAS[PROFILE_STAT_FORMULAS.contributesTo]!.sentence).toMatch(
      /confirmed a place on/,
    );
    expect(FORMULAS[PROFILE_STAT_FORMULAS.contributesTo]!.sentence).toMatch(
      /Invitations nobody answered are not counted/,
    );
  });

  it("`since` is about the PROFILE, not the account", () => {
    // The one number here that could quietly import a platform fact. A join
    // date copied from an Orunbase account would break the footer sentence
    // this whole page rests on (CG-4).
    const sentence = FORMULAS[PROFILE_STAT_FORMULAS.since]!.sentence;
    expect(sentence).toMatch(/Not when their account was created/);
    expect(sentence).toMatch(/not when they first appeared on somebody else's listing/);
  });
});

describe("OPC-C — absence and zero are different, and the difference is observability", () => {
  it("`reviews` keeps its sentence even though it has no number", () => {
    // PUBLISHING THE RULE BEFORE THE NUMBER IS THE POINT. It is what a reader
    // can hold us to when the number arrives — and listing it here, unfilled,
    // is a stronger statement than omitting it: it says we know what we would
    // have to measure and are not pretending we measured it.
    const sentence = FORMULAS[PROFILE_STAT_FORMULAS.reviews]!.sentence;
    expect(sentence).toMatch(/Absent — not zero/);
    expect(sentence).toMatch(/cannot be observed/);
  });

  it("`contributes-to` does NOT hedge, because it is completely observed", () => {
    // We hold every confirmed edge, so its zero is measured. Copying the
    // "absent, not zero" hedge here would have been cargo-culting the shape
    // of an honest statement onto a case that does not need it — and would
    // have left a dash on a page where a real 0 belongs.
    expect(FORMULAS[PROFILE_STAT_FORMULAS.contributesTo]!.sentence).not.toMatch(/Absent/);
  });
});

describe("OD6 — a person is told what becomes public before it does", () => {
  it("every projected field has a disclosure line", () => {
    const disclosed = new Set(PROFILE_DISCLOSURE.map((line) => line.key));
    for (const key of PUBLIC_CONTRIBUTOR_KEYS) {
      expect(`${key}: ${disclosed.has(key)}`).toBe(`${key}: true`);
    }
  });

  it("the listings line says BY NAME, because the count alone understates it", () => {
    // Somebody deciding whether to confirm an invitation is deciding whether
    // that product's name appears beside theirs. "How many" does not tell
    // them that, and it is the part they would care about.
    const line = PROFILE_DISCLOSURE.find((l) => l.key === "contributesToListings")!;
    expect(line.label).toMatch(/by name/);
    expect(line.label).toMatch(/since left/);
  });
});

describe("the section footer says whose act put each name there", () => {
  it("names the consent, not just the fact", () => {
    // Without this sentence the section reads as "products that mention this
    // person", which is precisely the claim CG3's two-sided edge exists to
    // stop us making.
    expect(CONTRIBUTES_TO_NOTE).toMatch(/confirmed themselves/);
    expect(CONTRIBUTES_TO_NOTE).toMatch(/only that person can make it public/);
    expect(CONTRIBUTES_TO_NOTE).toMatch(/still appears here, because the work happened/);
  });
});
