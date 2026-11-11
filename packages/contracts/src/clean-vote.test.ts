// The clean-vote mark (openproduct-worldclass PV3).
//
// Two claims, and the second is the one the milestone is really about:
//
//   THE MARK IS A BOOLEAN OVER A RATIO. No count reaches a caller, and the
//   type makes the count unavailable rather than merely unused.
//
//   AN ABSENT MARK IS AMBIGUOUS ON PURPOSE. A listing below the floor and a
//   listing over the ratio are indistinguishable to everything downstream —
//   which is what stops absence being an accusation a machine made in public
//   about somebody's product.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  CLEAN_VOTE_ABSENT_NOTE,
  CLEAN_VOTE_FLOOR,
  CLEAN_VOTE_MAX_RATIO,
  CLEAN_VOTE_TITLE,
  cleanVoteMark,
} from "./clean-vote.js";
import { FORMULAS } from "./provenance.js";

describe("the mark itself", () => {
  it("marks a listing with plenty of upvotes and almost none discounted", () => {
    expect(cleanVoteMark({ counted: 40, discounted: 1 })).toBe(true);
  });

  it("withholds it when too many were discounted", () => {
    expect(cleanVoteMark({ counted: 40, discounted: 6 })).toBe(false);
  });

  it("holds exactly at the published ratio, and refuses just past it", () => {
    // The boundary in both directions. 5 of 100 is 5%, which the rule allows;
    // 6 of 100 is not. An off-by-one here is a threshold that is not the one
    // `/docs/formulas` prints.
    expect(cleanVoteMark({ counted: 95, discounted: 5 })).toBe(true);
    expect(cleanVoteMark({ counted: 94, discounted: 6 })).toBe(false);
    expect(CLEAN_VOTE_MAX_RATIO).toBe(0.05);
  });
});

describe("the floor is the privacy mechanism, not a confidence interval", () => {
  it("withholds the mark below it even when NOTHING was discounted", () => {
    // The listing is perfectly clean and still gets no mark. That is the
    // design: most listings sit here, so an absent mark is unremarkable.
    expect(cleanVoteMark({ counted: CLEAN_VOTE_FLOOR - 1, discounted: 0 })).toBe(false);
    expect(cleanVoteMark({ counted: 0, discounted: 0 })).toBe(false);
  });

  it("gives it at the floor, so the boundary is the published number", () => {
    expect(cleanVoteMark({ counted: CLEAN_VOTE_FLOOR, discounted: 0 })).toBe(true);
  });

  it("makes 'not assessable' and 'not clean' INDISTINGUISHABLE", () => {
    // THE WHOLE POINT. A reader — and anything downstream — sees one value for
    // two very different listings, so absence cannot be read as a finding.
    const tooFew = cleanVoteMark({ counted: 3, discounted: 0 });
    const tooDirty = cleanVoteMark({ counted: 40, discounted: 20 });
    expect(tooFew).toBe(tooDirty);
    expect(tooFew).toBe(false);
  });
});

describe("nothing per-listing and nothing per-person escapes", () => {
  it("returns a boolean, never a number", () => {
    expect(typeof cleanVoteMark({ counted: 40, discounted: 1 })).toBe("boolean");
  });

  it("the module names no subject, voter or account", () => {
    // EN3's fifth decision: nothing per-person is ever exposed — not in an
    // API, not on a page, not in an error. This module reads two integers and
    // has no vocabulary for a person at all.
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, "clean-vote.ts"), "utf-8");
    const code = source
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
      .join("\n");
    expect(code).not.toMatch(/subjectId|voterId|accountId|handle/i);
  });
});

describe("the copy", () => {
  it("says what absence means, because a reader will otherwise decide", () => {
    // Without this sentence the reader supplies their own explanation for a
    // missing mark, and the one they supply is the accusation the floor was
    // spent to avoid.
    expect(CLEAN_VOTE_ABSENT_NOTE.toLowerCase()).toContain("not a finding");
    expect(CLEAN_VOTE_ABSENT_NOTE.toLowerCase()).toContain("most listings");
  });

  it("claims a measurement, never a belief about people", () => {
    // The same refusal `INSTALL_NOTE` makes: this product can say what it
    // checked, not that anybody is honest.
    expect(CLEAN_VOTE_TITLE).not.toMatch(/verified|genuine|real people|trustworthy|authentic/i);
    expect(CLEAN_VOTE_TITLE.toLowerCase()).toContain("says nothing about any individual");
  });
});

describe("the rule is published, like every other one", () => {
  it("resolves to a sentence at an address", () => {
    const formula = FORMULAS["votes.clean"];
    expect(formula.sentence.length).toBeGreaterThan(60);
    // The two numbers a reader would need to check it themselves.
    expect(formula.sentence).toContain(String(CLEAN_VOTE_FLOOR));
    expect(formula.sentence).toContain("5%");
  });

  it("says the mark orders nothing", () => {
    // `sort.most-saved` and the launch board already read the DISCOUNTED
    // total, so an ordering that also read this boolean would count the same
    // defence twice.
    expect(FORMULAS["votes.clean"].sentence.toLowerCase()).toContain("orders nothing");
  });

  it("says what an absent mark does NOT mean", () => {
    expect(FORMULAS["votes.clean"].sentence.toLowerCase()).toMatch(/absen|no mark/);
  });
});
