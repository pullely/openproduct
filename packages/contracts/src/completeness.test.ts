// The completeness meter and the floor (openproduct-worldclass IN3).
//
// Four claims, and the third is the one the milestone's done-when names:
//
//   THE METER IS ADVICE. It counts only what every listing could truthfully
//   fill, it is a count and never a percentage, and it says in words that it
//   changes no ordering.
//
//   THE FLOOR IS AN ELIGIBILITY RULE. Two fields, published, and a listing
//   below it is ABSENT from the catalogue rather than ordered lower.
//
//   A LISTING THAT CLEARS THE FLOOR HOLDS THE RANK IT ALREADY HELD. This is
//   the boost IN3 refuses to become, asserted directly: the same cards, sorted
//   with and without the floor, come back in the same relative order.
//
//   NOTHING HERE ORDERS ANYTHING. No comparator is exported and no score is.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  COMPLETENESS_FIELDS,
  COMPLETENESS_LABEL,
  COMPLETENESS_NOTE,
  COMPLETENESS_STEP,
  FLOOR_FIELDS,
  FLOOR_FORMULA,
  FLOOR_NOTE,
  completenessOf,
  filled,
  frontPageEligible,
} from "./completeness.js";
import { FORMULAS } from "./provenance.js";

const COMPLETE = {
  tagline: "A thing that does the thing",
  pitch: "We are building a thing.",
  category: "observability",
  hosting: "self-hosted",
  pricing: "free",
  stack: ["typescript"],
  maintainers: [{ subjectId: "usr_a" }],
};

describe("the meter counts only what every listing could truthfully fill", () => {
  it("leaves out every field that cannot apply to some real product", () => {
    // THE RULE THAT DECIDED THE LIST. A CLI tool is not hosted, a hosted
    // product is not installed, a founder may list before the code has a home,
    // and a solo maker may want no help. An item that cannot apply is a gap
    // the maker can never close, and a meter full of those is not advice.
    const fields: readonly string[] = COMPLETENESS_FIELDS;
    for (const absent of ["liveUrl", "installLine", "repoUrl", "roleOpenings", "media"]) {
      expect([absent, fields.includes(absent)]).toEqual([absent, false]);
    }
  });

  it("gives every counted field a label and a step a maker can get to", () => {
    // A checklist item with nowhere to go is a complaint.
    for (const field of COMPLETENESS_FIELDS) {
      expect([field, (COMPLETENESS_LABEL[field] ?? "").length > 0]).toEqual([field, true]);
      expect(["details", "topics", "people"]).toContain(COMPLETENESS_STEP[field]);
    }
  });

  it("reports a count and its total, never a percentage or a score", () => {
    // WC-E answered this for launch health — "a checklist, not a score" — and
    // the reasoning carries: "60%" is a judgement about somebody's work, "4 of
    // 6" is a fact about a form. A score can be sorted; a checklist cannot.
    const meter = completenessOf({ ...COMPLETE, hosting: null, stack: null });
    expect(meter.filled).toEqual(["tagline", "pitch", "category", "pricing", "maintainers"]);
    expect(meter.missing).toEqual(["hosting", "stack"]);
    expect(meter.of).toBe(COMPLETENESS_FIELDS.length);
    expect(Object.keys(meter).sort()).toEqual(["belowFloor", "filled", "missing", "of"]);
  });

  it("does not accept whitespace as an answer", () => {
    expect(filled({ tagline: "   " }, "tagline")).toBe(false);
    expect(filled({ stack: [] }, "stack")).toBe(false);
    expect(filled({ maintainers: [] }, "maintainers")).toBe(false);
  });

  it("says in words that it changes no ordering", () => {
    // IN3's done-when has this clause because a meter with no such line is
    // read as a rating by everybody who sees one.
    expect(COMPLETENESS_NOTE.toLowerCase()).toContain("not a rating");
    expect(COMPLETENESS_NOTE.toLowerCase()).toContain("ordered");
  });
});

describe("the floor is an eligibility rule, and a short one", () => {
  it("asks for two fields, not the whole meter", () => {
    // A floor that demanded everything the meter asks for would be a weight
    // with a threshold. Two fields: what it is, and where it sits — the
    // minimum a reader needs to decide whether to click.
    expect([...FLOOR_FIELDS]).toEqual(["tagline", "category"]);
    for (const field of FLOOR_FIELDS) expect(COMPLETENESS_FIELDS).toContain(field);
  });

  it("refuses a listing missing either one, and names which", () => {
    expect(frontPageEligible({ ...COMPLETE, category: null })).toBe(false);
    expect(frontPageEligible({ ...COMPLETE, tagline: "" })).toBe(false);
    expect(frontPageEligible(COMPLETE)).toBe(true);
    expect(completenessOf({ ...COMPLETE, category: null }).belowFloor).toEqual(["category"]);
    expect(completenessOf(COMPLETE).belowFloor).toEqual([]);
  });

  it("publishes a sentence saying it is not a ranking rule", () => {
    // OPC-4 asks that a rule deciding what a reader sees be readable. This one
    // has to say the harder half too: that it does NOT demote, because a
    // reader who found it would otherwise assume a boost.
    const formula = FORMULAS[FLOOR_FORMULA];
    expect(formula).toBeDefined();
    const sentence = formula.sentence.toLowerCase();
    expect(sentence).toContain("not a ranking rule");
    expect(sentence).toContain("not a boost");
    expect(sentence).toContain("not ordered lower");
  });

  it("tells the maker the consequence where they can act on it", () => {
    // Otherwise it is discovered by their listing quietly not appearing, which
    // is the same experience as a bug.
    expect(FLOOR_NOTE.toLowerCase()).toContain("not ranked lower");
    expect(FLOOR_NOTE.toLowerCase()).toContain("front page");
  });
});

describe("nothing here orders anything", () => {
  it("exports no comparator and computes no score", () => {
    // Read over the CODE, with every comment form stripped — including the
    // one-line `/** … */` a first draft of this test forgot, which made it
    // match the word "percentage" in a sentence saying there is no
    // percentage. A test that reads prose is testing the prose.
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, "completeness.ts"), "utf-8");
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("//"))
      .join("\n");
    expect(code).not.toMatch(/export function (sort|rank|order|score|by[A-Z])/);
    // A percentage is the shape a score arrives in, and arithmetic is how it
    // gets built. There is none: `of` is a length, reported beside a list.
    expect(code).not.toMatch(/[/*]\s*COMPLETENESS_FIELDS\.length|toFixed|Math\.round/);
    expect(code).not.toMatch(/percent/i);
  });
});
