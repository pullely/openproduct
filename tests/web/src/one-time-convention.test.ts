// One timestamp convention (openproduct-worldclass VC6).
//
// P2·17: *"'3 Sept 2026', 'observed 1h ago' — the site mixes both conventions
// on the same page."* The fix the audit asked for is a single rule: relative
// under a week, absolute beyond, with the absolute always reachable.
//
// Two things were wrong, and the second is the one nobody would have noticed:
//
//   1. `agoOf` stayed relative forever — `4mo ago` makes a reader do
//      arithmetic to recover the only thing they still wanted, which is WHEN.
//   2. The tooltip repeated `agoOf`. Somebody hovering a relative time to find
//      the exact moment got the same relative time back, and the exact moment
//      was available NOWHERE on the page.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { absoluteOf, agoOf } from "@openproduct-web/app/ui/time";

const __dirname = dirname(fileURLToPath(import.meta.url));

const NOW = Date.parse("2026-09-07T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("one timestamp convention (VC6)", () => {
  it("is relative inside a week", () => {
    expect(agoOf(ago(30 * MIN), NOW)).toBe("30m ago");
    expect(agoOf(ago(3 * HOUR), NOW)).toBe("3h ago");
    expect(agoOf(ago(3 * DAY), NOW)).toBe("3d ago");
    expect(agoOf(ago(6 * DAY), NOW)).toBe("6d ago");
  });

  it("becomes the date at a week, and stays the date", () => {
    // The crossover is the point of the rule. "6d ago" answers *is this
    // alive*; past that the question changes to *when*, and a relative form
    // makes the reader compute the answer themselves.
    expect(agoOf(ago(7 * DAY), NOW)).toBe("31 Aug 2026");
    expect(agoOf(ago(120 * DAY), NOW)).toBe("10 May 2026");
    expect(agoOf(ago(400 * DAY), NOW)).not.toMatch(/ago/);
  });

  it("never mixes the two forms for one instant", () => {
    // The literal finding: two conventions on one page. For any given moment
    // there is exactly one rendering.
    for (const days of [0, 1, 6, 7, 30, 365]) {
      const rendered = agoOf(ago(days * DAY), NOW);
      const isRelative = rendered.endsWith("ago");
      const isAbsolute = /\d{4}$/.test(rendered);
      expect(isRelative !== isAbsolute).toBe(true);
    }
  });

  it("reads in UTC, like every other date on the site", () => {
    // The board resets at midnight UTC and the digest names a UTC week. A
    // listing rendered in the reader's own zone would disagree with the board
    // it sits on for several hours a day.
    // Both instants fall on the 7th in UTC and on different days in some
    // zones; both must read the 7th.
    expect(absoluteOf("2026-09-07T23:30:00.000Z")).toBe("7 Sept 2026");
    expect(absoluteOf("2026-09-07T00:30:00.000Z")).toBe("7 Sept 2026");
    // `Sept` rather than `Sep` is en-GB's own abbreviation, and it is what the
    // site already renders — the audit quoted "3 Sept 2026" off the page. The
    // convention being unified here is relative-vs-absolute, not the spelling.
  });

  it("says so rather than guessing when the instant is unreadable", () => {
    expect(agoOf("not-a-date", NOW)).toBe("unknown");
    expect(absoluteOf("not-a-date")).toBe("unknown");
  });

  it("puts the absolute in the tooltip, which is where it was missing", () => {
    // The defect worth a source assertion: the title used to repeat `agoOf`,
    // so the exact moment existed nowhere. A behavioural test cannot see an
    // attribute this component renders, so the rule is held over the source.
    const source = readFileSync(
      resolve(__dirname, "../../../web/src/app/ui/metric.tsx"),
      "utf-8",
    );
    expect(source).toContain("title={`Observed ${absoluteOf(metric.observedAt)}");
  });
});
