// Velocity, the policy (openproduct-commons TS2).
//
// THE ASSERTIONS THAT MATTER MOST HERE ARE ABOUT FAILING SAFE. A rate limiter
// has two catastrophic failure modes and they point in opposite directions:
// fail open and it is not a limiter, fail closed and it is an outage. Almost
// everything below is about the config parser landing on neither.
//
// The second theme is that the limits are chosen for the ENTHUSIAST, not the
// attacker. Somebody who finds this directory on a Sunday and endorses
// everything they have ever used is the visitor we most want, and a limit
// that refuses them has cost us the person who was going to tell their
// friends.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_VELOCITY_RULES,
  GENERIC_REFUSAL,
  MIN_CONFIGURABLE_LIMIT,
  MIN_CONFIGURABLE_WINDOW_SEC,
  WRITE_ACTIONS,
  parseVelocityConfig,
  publishedRules,
} from "./velocity.js";

describe("the default policy", () => {
  it("gives every rule two windows, and the burst is the tighter one", () => {
    // A burst window catches a script; a sustained window catches the patient
    // version of the same script, which a burst limit alone waves through
    // forever. A "burst" that was longer than its sustained window would be
    // one window wearing two names.
    for (const rule of DEFAULT_VELOCITY_RULES) {
      expect([rule.action, rule.burst.windowSec < rule.sustained.windowSec]).toEqual([
        rule.action,
        true,
      ]);
      expect(rule.burst.limit).toBeLessThanOrEqual(rule.sustained.limit);
      expect(rule.burst.limit).toBeGreaterThanOrEqual(MIN_CONFIGURABLE_LIMIT);
    }
  });

  it("names only actions that exist", () => {
    for (const rule of DEFAULT_VELOCITY_RULES) {
      expect(WRITE_ACTIONS).toContain(rule.action);
    }
  });

  it("has at most one rule per (action, dimension)", () => {
    const seen = new Set<string>();
    for (const rule of DEFAULT_VELOCITY_RULES) {
      const key = `${rule.action}/${rule.dimension}`;
      expect([key, seen.has(key)]).toEqual([key, false]);
      seen.add(key);
    }
  });

  it("tells the person what happened, in a sentence, never a code", () => {
    for (const rule of DEFAULT_VELOCITY_RULES) {
      // The two readings of a bare "Too many requests" are "the site is
      // broken" and "I am being punished", and neither is true.
      expect(rule.refusal.length).toBeGreaterThan(30);
      expect(rule.refusal).not.toMatch(/^Too many requests/);
      // ...and none of them accuses anybody of anything. Most people who hit
      // a velocity limit are enthusiastic rather than hostile.
      expect(rule.refusal).not.toMatch(/abuse|spam|violat|banned|suspicious/i);
    }
  });

  it("is generous where refusing costs us the best visitor", () => {
    const report = DEFAULT_VELOCITY_RULES.find(
      (r) => r.action === "report" && r.dimension === "subject",
    )!;
    // Somebody walking a spam wave and reporting fifteen listings is the most
    // useful person on the site that day. A limit that turns them away has
    // sent our best moderator home.
    expect(report.burst.limit).toBeGreaterThanOrEqual(10);
    expect(report.sustained.limit).toBeGreaterThanOrEqual(100);
    expect(report.refusal).toMatch(/recorded/i);

    const endorse = DEFAULT_VELOCITY_RULES.find(
      (r) => r.action === "endorse" && r.dimension === "subject",
    )!;
    // Faster than a person reads a product page and decides.
    expect(endorse.burst.limit).toBeGreaterThanOrEqual(10);

    // And a SAVE is private, counted nowhere, with nothing to inflate.
    const save = DEFAULT_VELOCITY_RULES.find((r) => r.action === "save")!;
    expect(save.burst.limit).toBeGreaterThan(endorse.burst.limit);
  });

  it("is tightest where the act is squatting a namespace", () => {
    const handle = DEFAULT_VELOCITY_RULES.find((r) => r.action === "handle-claim")!;
    // The one rule chosen against an attacker rather than for an enthusiast:
    // there is exactly one of each name (OPC-B), and a person legitimately
    // changing theirs does it once and thinks about it for a week.
    expect(handle.burst.limit).toBeLessThanOrEqual(3);
    expect(handle.sustained.limit).toBeLessThanOrEqual(10);
    // And it EXPLAINS the tightness rather than just imposing it.
    expect(handle.refusal).toMatch(/never re-issued|deliberately slow/i);
  });

  it("bounds a listing across ALL subjects, not just each subject alone", () => {
    // The only shape that catches a brigade. Fifty accounts each politely
    // under their own per-subject limit are still fifty accounts arriving at
    // one listing in a minute.
    const target = DEFAULT_VELOCITY_RULES.find(
      (r) => r.action === "endorse" && r.dimension === "target",
    );
    expect(target).toBeDefined();
    expect(target!.burst.limit).toBeGreaterThan(
      DEFAULT_VELOCITY_RULES.find((r) => r.action === "endorse" && r.dimension === "subject")!
        .burst.limit,
    );
  });
});

describe("what is published and what is not", () => {
  it("publishes every per-SUBJECT rule", () => {
    // A person refused deserves the rule they hit — the same discipline
    // OPC-4 applies to rankings.
    for (const rule of DEFAULT_VELOCITY_RULES) {
      if (rule.dimension === "subject") expect([rule.action, rule.publish]).toEqual([rule.action, true]);
    }
  });

  it("publishes NO per-TARGET rule", () => {
    // Different in kind: a threshold about other people's behaviour toward
    // one listing, whose exact width is an instruction to a brigade about how
    // many accounts to bring.
    for (const rule of DEFAULT_VELOCITY_RULES) {
      if (rule.dimension === "target") expect([rule.action, rule.publish]).toEqual([rule.action, false]);
    }
    expect(publishedRules().every((r) => r.dimension === "subject")).toBe(true);
  });

  it("publishes something for every action a person performs", () => {
    // The failure this catches: a new limited action shipping with no
    // published rule, so somebody hits a wall the docs do not describe.
    const published = new Set(publishedRules().map((r) => r.action));
    for (const action of WRITE_ACTIONS) expect([action, published.has(action)]).toEqual([action, true]);
  });
});

describe("the config parser fails to the DEFAULTS, never to no limit", () => {
  const cases: Array<[string, string | null]> = [
    ["absent", null],
    ["empty", ""],
    ["whitespace", "   "],
    ["not JSON", "{oh no"],
    ["not an array", '{"endorse":1}'],
    ["an array of nothings", '[null, 3, "x"]'],
    ["an array of empty objects", "[{}]"],
    ["a rule that does not exist", '[{"action":"fly","dimension":"subject","burst":{"limit":9,"windowSec":60}}]'],
    ["a dimension that does not exist", '[{"action":"endorse","dimension":"galaxy","burst":{"limit":9,"windowSec":60}}]'],
    ["a non-numeric limit", '[{"action":"endorse","dimension":"subject","burst":{"limit":"lots","windowSec":60}}]'],
  ];

  for (const [name, raw] of cases) {
    it(`survives ${name}`, () => {
      const result = parseVelocityConfig(raw);
      // EVERY failure mode lands on the defaults. Not on an empty rule set,
      // which is "no limit" — the one outcome this sub-epic exists to
      // prevent, and the one a `try/catch` returning `[]` produces.
      expect(result.rules).toEqual(DEFAULT_VELOCITY_RULES);
    });
  }

  it("refuses a limit of zero — that is an outage, not a configuration change", () => {
    const result = parseVelocityConfig(
      '[{"action":"endorse","dimension":"subject","burst":{"limit":0,"windowSec":60}}]',
    );
    expect(result.rules).toEqual(DEFAULT_VELOCITY_RULES);
    expect(result.problems.join(" ")).toMatch(/below the floor/);
    expect(MIN_CONFIGURABLE_LIMIT).toBe(1);
  });

  it("refuses a window so short it is a zero in disguise", () => {
    const result = parseVelocityConfig(
      `[{"action":"endorse","dimension":"subject","burst":{"limit":1,"windowSec":1}}]`,
    );
    expect(result.rules).toEqual(DEFAULT_VELOCITY_RULES);
    expect(MIN_CONFIGURABLE_WINDOW_SEC).toBeGreaterThan(1);
  });

  it("records a PROBLEM for everything it rejected — never silently", () => {
    // A misconfiguration that quietly reverted to defaults is a limit
    // somebody believes they changed and did not, which is worse than either
    // value: it is a value nobody knows.
    for (const [, raw] of cases) {
      if (raw === null || raw.trim() === "") continue;
      expect(parseVelocityConfig(raw).problems.length).toBeGreaterThan(0);
    }
  });

  it("applies a VALID override, and only to the rule it names", () => {
    const result = parseVelocityConfig(
      '[{"action":"endorse","dimension":"subject","burst":{"limit":4,"windowSec":30}}]',
    );
    expect(result.problems).toEqual([]);
    const endorse = result.rules.find((r) => r.action === "endorse" && r.dimension === "subject")!;
    expect(endorse.burst).toEqual({ limit: 4, windowSec: 30 });
    // The other window is untouched...
    expect(endorse.sustained).toEqual(
      DEFAULT_VELOCITY_RULES.find((r) => r.action === "endorse" && r.dimension === "subject")!
        .sustained,
    );
    // ...and so is every other rule.
    expect(result.rules.filter((r) => r.action !== "endorse")).toEqual(
      DEFAULT_VELOCITY_RULES.filter((r) => r.action !== "endorse"),
    );
  });

  it("keeps BOTH defaults when half an override is invalid", () => {
    // Half a limit is a limit nobody chose. Taking the valid half would give
    // a rule a burst somebody configured and a sustained somebody did not,
    // which is a third thing neither party asked for.
    const result = parseVelocityConfig(
      '[{"action":"endorse","dimension":"subject","burst":{"limit":4,"windowSec":30},"sustained":{"limit":0,"windowSec":86400}}]',
    );
    expect(result.rules).toEqual(DEFAULT_VELOCITY_RULES);
    expect(result.problems.length).toBeGreaterThan(0);
  });

  it("cannot ADD a rule, only replace one", () => {
    // An action nothing enforces is a rule that looks like protection and is
    // not. Creating one from configuration would let somebody believe a new
    // write is limited when no code checks it.
    const result = parseVelocityConfig(
      '[{"action":"launch","dimension":"subject","burst":{"limit":5,"windowSec":60},"sustained":{"limit":50,"windowSec":86400}}]',
    );
    expect(result.rules).toHaveLength(DEFAULT_VELOCITY_RULES.length);
    expect(result.rules.some((r) => r.action === ("launch" as never))).toBe(false);
  });

  it("defaults a missing dimension to `subject`, the common case", () => {
    const result = parseVelocityConfig(
      '[{"action":"endorse","burst":{"limit":6,"windowSec":60}}]',
    );
    expect(result.problems).toEqual([]);
    expect(result.rules.find((r) => r.action === "endorse" && r.dimension === "subject")!.burst)
      .toEqual({ limit: 6, windowSec: 60 });
  });

  it("does not mutate the defaults it was handed", () => {
    const before = JSON.stringify(DEFAULT_VELOCITY_RULES);
    parseVelocityConfig('[{"action":"endorse","dimension":"subject","burst":{"limit":4,"windowSec":30}}]');
    expect(JSON.stringify(DEFAULT_VELOCITY_RULES)).toBe(before);
  });
});

describe("the fallback sentence", () => {
  it("exists, so a rule with no copy still says something human", () => {
    // A limiter that throws on a missing message is a limiter that fails open
    // the first time somebody adds an action and forgets a sentence.
    expect(GENERIC_REFUSAL.length).toBeGreaterThan(30);
    expect(GENERIC_REFUSAL).toMatch(/nothing has been lost/i);
  });
});
