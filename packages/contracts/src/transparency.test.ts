import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ACTS_AGAINST,
  ACTS_REVERSING,
  ACT_LABELS,
  APPEAL_STATE_LABELS,
  DISCOUNT_REASON_LABELS,
  REPORT_STATE_LABELS,
  TRANSPARENCY_LEDE,
  TRANSPARENCY_NAMES_NOBODY_NOTE,
  TRANSPARENCY_NO_DENOMINATOR_NOTE,
  TRANSPARENCY_REFUSALS,
  TRANSPARENCY_REPORT_KEYS,
  TRANSPARENCY_REVERSAL_NOTE,
  TRANSPARENCY_SOURCES,
  TRANSPARENCY_WINDOW_DAYS,
  TRANSPARENCY_WINDOW_NOTE,
  TRANSPARENCY_ZERO_NOTE,
  actsAgainst,
  actsReversing,
  countBy,
  discountTotal,
  formatShare,
  share,
  total,
  transparencySince,
  type ActCount,
  type TransparencyReport,
} from "./transparency.js";
import { INTEGRITY_REASONS } from "./integrity.js";
import { APPEAL_STATES } from "./appeals.js";
import { MODERATION_ACTS, REPORT_STATES } from "./trust.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("every number has an English name, and none can leak an enum", () => {
  it("labels every act in the vocabulary", () => {
    // A TOTAL RECORD. An act with no label fails the typecheck rather than
    // appearing on a public page as `trust_demote`, which is what makes a
    // transparency report read as a database dump somebody left unfinished.
    for (const act of MODERATION_ACTS) {
      expect(ACT_LABELS[act], act).toBeTruthy();
      expect(ACT_LABELS[act]).not.toMatch(/_/);
    }
  });

  it("labels every report state, appeal state and discount reason", () => {
    for (const state of REPORT_STATES) expect(REPORT_STATE_LABELS[state]).toBeTruthy();
    for (const state of APPEAL_STATES) expect(APPEAL_STATE_LABELS[state]).toBeTruthy();
    for (const reason of INTEGRITY_REASONS) {
      expect(DISCOUNT_REASON_LABELS[reason], reason).toBeTruthy();
      expect(DISCOUNT_REASON_LABELS[reason]).not.toMatch(/-/);
    }
  });

  it("splits the vocabulary into acts against and acts undoing, exhaustively", () => {
    // Every act is one, the other, or neither — and "neither" must be a
    // deliberate list rather than whatever fell through. `report_declined`
    // and the two appeal outcomes are the neither.
    const classified = new Set<string>([...ACTS_AGAINST, ...ACTS_REVERSING]);
    const neither = MODERATION_ACTS.filter((act) => !classified.has(act));
    expect(neither).toEqual(["report_declined", "appeal_upheld", "appeal_refused"]);
    // And nothing is in both, which would double-count it in the rate.
    for (const act of ACTS_AGAINST) expect(ACTS_REVERSING).not.toContain(act);
  });

  it("pairs each act against with the reversal that undoes it", () => {
    expect(ACTS_AGAINST).toHaveLength(ACTS_REVERSING.length);
  });
});

describe("a rate over nothing is not zero", () => {
  it("returns null rather than 0 when there is no denominator", () => {
    // "0% of appeals were upheld" over zero appeals is a lie with a percent
    // sign: it reads as "we granted none of them" when the truth is "nobody
    // has asked".
    expect(share(0, 0)).toBeNull();
    expect(share(3, 0)).toBeNull();
    expect(share(0, 4)).toBe(0);
    expect(share(2, 4)).toBe(0.5);
  });

  it("refuses a nonsense denominator rather than producing Infinity", () => {
    expect(share(1, -1)).toBeNull();
    expect(share(Number.NaN, 4)).toBeNull();
    expect(share(1, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("renders the null as a dash, and the dash has a published meaning", () => {
    expect(formatShare(null)).toBe("—");
    expect(formatShare(0)).toBe("0%");
    expect(formatShare(0.5)).toBe("50%");
    expect(TRANSPARENCY_NO_DENOMINATOR_NOTE).toMatch(/nothing to take a share of/i);
    expect(TRANSPARENCY_NO_DENOMINATOR_NOTE).toMatch(/not that the share was nought/i);
  });
});

describe("the arithmetic the page must not do by hand", () => {
  const acts: ActCount[] = [
    { act: "remove", count: 3 },
    { act: "delist", count: 5 },
    { act: "restore", count: 1 },
    { act: "relist", count: 2 },
    { act: "report_declined", count: 40 },
  ];

  it("counts acts against and acts undoing, ignoring the neither", () => {
    expect(actsAgainst(acts)).toBe(8);
    expect(actsReversing(acts)).toBe(3);
    // The 40 declines are neither — an estate that counted "we looked and did
    // nothing" as an act against people would flatter its own reversal rate.
    expect(actsAgainst(acts) + actsReversing(acts)).toBe(11);
  });

  it("totals and filters without the page reaching into shapes", () => {
    expect(total(acts)).toBe(51);
    expect(countBy(acts, (row) => row.act === "remove")).toBe(3);
    expect(countBy(acts, () => false)).toBe(0);
    expect(discountTotal([{ reason: "ring", discounted: 4 }, { reason: "burst", discounted: 6 }])).toBe(10);
  });

  it("holds an empty report at zero without throwing", () => {
    expect(actsAgainst([])).toBe(0);
    expect(total([])).toBe(0);
    expect(share(actsReversing([]), actsAgainst([]))).toBeNull();
  });
});

describe("the window", () => {
  it("is ninety days, rolling, and computed from the moment asked", () => {
    const now = Date.parse("2026-08-26T12:00:00.000Z");
    const since = transparencySince(now);
    expect(TRANSPARENCY_WINDOW_DAYS).toBe(90);
    expect(Date.parse(since)).toBe(now - 90 * 24 * 60 * 60 * 1000);
  });

  it("says why it is not a running total", () => {
    // A cumulative figure only goes up, so a bad quarter is permanently
    // diluted by every good one before it — comfortable for us, useless to a
    // reader deciding whether to list here.
    expect(TRANSPARENCY_WINDOW_NOTE).toMatch(/not a running total/i);
    expect(TRANSPARENCY_WINDOW_NOTE).toMatch(/comfortable property for us/i);
  });
});

describe("the report's shape", () => {
  it("carries exactly these keys", () => {
    const report: TransparencyReport = {
      since: "2026-05-28T12:00:00.000Z",
      until: "2026-08-26T12:00:00.000Z",
      acts: [],
      reports: [],
      appeals: [],
      appealsReversed: 0,
      discounts: [],
      flags: [],
    };
    expect(Object.keys(report).sort()).toEqual([...TRANSPARENCY_REPORT_KEYS].sort());
  });

  it("has no field that could name anybody", () => {
    for (const forbidden of ["slug", "handle", "subjectId", "subjectRef", "listing", "actor"]) {
      expect(TRANSPARENCY_REPORT_KEYS as readonly string[], forbidden).not.toContain(forbidden);
    }
  });

  it("names no individual anywhere in the module's own source", () => {
    // The module is prose and counts. This is the assertion that notices the
    // day somebody adds a "most removed listings" section, which is the
    // single most requested and least defensible thing this page could grow.
    const source = readFileSync(resolve(__dirname, "transparency.ts"), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    for (const forbidden of ["slug", "handle:", "subjectId", "subject_id", "curator"]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });
});

describe("what the page says about itself", () => {
  it("claims generation rather than authorship, which is checkable", () => {
    expect(TRANSPARENCY_LEDE).toMatch(/append-only/i);
    expect(TRANSPARENCY_LEDE).toMatch(/generated from that record/i);
    expect(TRANSPARENCY_LEDE).toMatch(/not written by hand/i);
  });

  it("puts the reversal figure ahead of the removal figure, in words", () => {
    expect(TRANSPARENCY_REVERSAL_NOTE).toMatch(/how much it put back/i);
    expect(TRANSPARENCY_REVERSAL_NOTE).toMatch(/any estate can publish how much it removed/i);
  });

  it("earns its exception to OPC-C rather than quietly taking it", () => {
    // Everywhere else on this estate a missing number renders as missing. The
    // page that inverts that has to say why, and the reason has to be the
    // real one: these are records of our own acts, written before the act.
    expect(TRANSPARENCY_ZERO_NOTE).toMatch(/did not act, not that we did not look/i);
    expect(TRANSPARENCY_ZERO_NOTE).toMatch(/before the act takes effect/i);
  });

  it("names a real source for every class of figure on the page", () => {
    expect(TRANSPARENCY_SOURCES.length).toBeGreaterThanOrEqual(5);
    for (const source of TRANSPARENCY_SOURCES) {
      expect(source.from.length).toBeGreaterThan(80);
    }
    const figures = TRANSPARENCY_SOURCES.map((s) => s.figures.toLowerCase()).join(" ");
    for (const expected of ["acts", "reports", "appeals", "endorsements", "automatic"]) {
      expect(figures).toContain(expected);
    }
  });

  it("publishes what it will not do, with the cost of each", () => {
    expect(TRANSPARENCY_NAMES_NOBODY_NOTE).toMatch(/names anybody/i);
    const refused = TRANSPARENCY_REFUSALS.map((r) => r.refused.toLowerCase()).join(" ");
    expect(refused).toMatch(/naming a listing/);
    expect(refused).toMatch(/identify anybody/);
    expect(refused).toMatch(/reasons we gave/);
    for (const refusal of TRANSPARENCY_REFUSALS) {
      expect(refusal.because.length).toBeGreaterThan(100);
      expect(refusal.because).not.toMatch(/we may|reserve the right|from time to time/i);
    }
  });

  it("explains the coarseness refusal with the arithmetic that forces it", () => {
    const coarse = TRANSPARENCY_REFUSALS.find((r) => /identify anybody/i.test(r.refused))!;
    // "Three removals in a category with four listings is a name" — the
    // concrete case, because "we aggregate for privacy" persuades nobody.
    expect(coarse.because).toMatch(/is a name/i);
  });
});
