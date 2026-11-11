// The dash says what it means (openproduct-worldclass VC3).
//
// OPC-C is the rule that a zero is a claim: `0` says *we counted and found
// nobody*; `—` says *we have not counted*. Keeping them apart is one of the
// most defensible things this product does — and on 7 Sep a reader met `0` on
// one row and `—` on the next with no explanation anywhere on the page. The
// vote box's `title` was literally `undefined` for exactly the case that
// needed one.
//
// A distinction a reader cannot see is not a distinction. It is a
// typographical inconsistency, and it reads as a bug in a product whose whole
// pitch is that its numbers can be trusted.

import { describe, expect, it } from "vitest";

import { ENDORSEMENT_TOTAL_TITLE, ENDORSEMENT_UNCOUNTED_TITLE, UNCOUNTED_LEGEND } from "./endorsements.js";

describe("the dash explains itself (VC3)", () => {
  it("says what the dash is NOT, because that is the confusion", () => {
    // Somebody meeting `—` beside `0` assumes it is a prettier zero. The
    // sentence has to spend a clause refusing that, or it has not helped.
    expect(ENDORSEMENT_UNCOUNTED_TITLE.toLowerCase()).toContain("not zero");
    expect(UNCOUNTED_LEGEND.toLowerCase()).toContain("not the same as zero");
  });

  it("does not read as an apology or a defect", () => {
    // "Not counted yet" is the system working. A reader who concludes the site
    // is broken has been told the wrong thing about a deliberate convention.
    for (const copy of [ENDORSEMENT_UNCOUNTED_TITLE, UNCOUNTED_LEGEND]) {
      expect(copy.toLowerCase()).not.toMatch(/error|failed|sorry|unavailable|problem/);
    }
  });

  it("is a different sentence from the counted one", () => {
    // The whole point is that the two states differ. One string reused for
    // both would put the box back where it started.
    expect(ENDORSEMENT_UNCOUNTED_TITLE).not.toBe(ENDORSEMENT_TOTAL_TITLE);
  });

  it("keeps the legend to one line", () => {
    // It sits under a list, not on a documentation page. P1·10's finding —
    // that every empty state here is an essay — applies to this too, and the
    // fix for an invisible convention must not be a paragraph.
    expect(UNCOUNTED_LEGEND.length).toBeLessThanOrEqual(90);
    expect(UNCOUNTED_LEGEND.split(". ").length).toBe(1);
  });
});
