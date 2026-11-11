import { describe, expect, it } from "vitest";

import {
  DEMAND_FLOOR,
  DEMAND_FLOOR_NOTE,
  DEMAND_QUIET_DAYS,
  OPENING_DEMAND_KEYS,
  chooseDemand,
  demandLine,
  takingOffersLine,
  type Demand,
} from "./demand.js";

const at = (pending: number, openedDaysAgo = 30) => chooseDemand({ pending, openedDaysAgo });

describe("OPC-F — the floor, and what it refuses to be able to say", () => {
  it("gives an exact number at three and above", () => {
    expect(at(3)).toEqual({ kind: "counted", pending: 3 });
    expect(at(11)).toEqual({ kind: "counted", pending: 11 });
  });

  it("says 'a few' for one and for two — the reader cannot subtract", () => {
    // THE MOCK'S OWN STRING, refused. On a small opening, beside a visible
    // recent-activity feed, "1 waiting" IS a name.
    expect(at(1)).toEqual({ kind: "few" });
    expect(at(2)).toEqual({ kind: "few" });
    expect(demandLine(at(1))).toBe(demandLine(at(2)));
  });

  it("CANNOT REPRESENT an exact number below the floor at all", () => {
    // The shape is a union, not `pending: number | null`, so there is no
    // field in which a dangerous value could sit beside a safe one and be
    // confused for it by a consumer who forgot which was which.
    for (let n = 0; n < DEMAND_FLOOR; n += 1) {
      const demand = at(n);
      expect(demand).not.toHaveProperty("pending");
      expect(JSON.stringify(demand)).not.toContain(`:${n}`);
    }
  });

  it("never renders a zero", () => {
    // OPC-C: absence is not zero. A brand new opening with an emptiness
    // announced under it is a listing arguing against itself.
    expect(demandLine(at(0, 0))).toBeNull();
    for (const n of [0, 1, 2, 3, 10]) {
      const line = demandLine(at(n));
      if (line) expect(line).not.toMatch(/\b0\b/);
    }
  });

  it("says 'nobody yet' only once the opening is old enough to mean it", () => {
    // An opening posted an hour ago has nobody waiting, and saying so reads
    // as a verdict on the product rather than a fact about the clock.
    expect(at(0, 0).kind).toBe("none");
    expect(at(0, DEMAND_QUIET_DAYS - 1).kind).toBe("none");
    expect(at(0, DEMAND_QUIET_DAYS).kind).toBe("quiet");
    expect(demandLine(at(0, DEMAND_QUIET_DAYS))).toContain("Nobody yet");
  });

  it("floors a negative or fractional count rather than trusting it", () => {
    expect(chooseDemand({ pending: -5, openedDaysAgo: 30 }).kind).toBe("quiet");
    expect(chooseDemand({ pending: 3.9, openedDaysAgo: 1 })).toEqual({ kind: "counted", pending: 3 });
  });
});

describe("the sidebar summary", () => {
  it("says a number only when the opening line would", () => {
    expect(takingOffersLine(at(4))).toBe("Taking offers · 4 pending");
    expect(takingOffersLine(at(2))).toBe("Taking offers · a few pending");
    // Never "· 0 pending".
    expect(takingOffersLine(at(0))).toBe("Taking offers");
    expect(takingOffersLine(at(0, 99))).toBe("Taking offers");
  });
});

describe("the estate says why the number is vague", () => {
  it("publishes the floor and the reason", () => {
    // A count that is sometimes exact and sometimes "a few" looks broken
    // unless the reason is available — and saying it commits us, because a
    // version that dropped the floor would have to delete this first.
    expect(DEMAND_FLOOR_NOTE).toContain(String(DEMAND_FLOOR));
    expect(DEMAND_FLOOR_NOTE).toContain("identify");
  });
});

describe("the wire shape", () => {
  it("carries the opening and the decision, and nothing else", () => {
    expect([...OPENING_DEMAND_KEYS]).toEqual(["roleOpeningId", "demand"]);
    // Never a subject id, never a list, never a timestamp somebody could
    // join against.
    for (const forbidden of ["subjectId", "applicants", "appliedAt", "handles"]) {
      expect(OPENING_DEMAND_KEYS).not.toContain(forbidden);
    }
  });

  it("has a line for every kind the union admits", () => {
    const kinds: Demand[] = [
      { kind: "none" },
      { kind: "quiet", days: 9 },
      { kind: "few" },
      { kind: "counted", pending: 5 },
    ];
    for (const demand of kinds) {
      expect(() => demandLine(demand)).not.toThrow();
      expect(() => takingOffersLine(demand)).not.toThrow();
    }
  });
});
