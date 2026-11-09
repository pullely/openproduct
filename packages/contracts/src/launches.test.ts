// The launch (openproduct-commons LC0).
//
// WHAT IS PINNED HERE IS MOSTLY THE ONCE-PER-VERSION RULE, because it is the
// one decision in this milestone that the epic left open and that a future
// change is most likely to get wrong in a way nobody notices: the rule has
// TWO halves doing TWO different jobs, and dropping either leaves something
// that still looks like a rule and stops nothing.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_COOLDOWN_DAYS,
  DEFAULT_LAUNCH_POLICY,
  LAUNCH_ACTS,
  LAUNCH_REFUSALS,
  LAUNCH_STATES,
  MISSED_NOTE,
  PUBLIC_LAUNCH_STATES,
  SCHEDULED_NOTE,
  VERSION_CONSUMING_STATES,
  checkLaunchable,
  cooldownNote,
  launchAct,
  mayLaunchAct,
  normaliseVersion,
  parseLaunchPolicy,
  parseVersionLabel,
  sameVersion,
} from "./launches.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-01T09:00:00.000Z");

function base(over: Partial<Parameters<typeof checkLaunchable>[0]> = {}) {
  return {
    isPublished: true,
    scheduledFor: NOW + 2 * DAY,
    now: NOW,
    versionLabel: "1.0",
    consumedVersions: [] as string[],
    lastLaunchedAt: null as number | null,
    hasScheduled: false,
    ...over,
  };
}

describe("the once-per-version rule has two halves, and both must hold", () => {
  it("the LABEL half: a version already launched is refused", () => {
    // The half that catches the honest mistake — "wait, did I already launch
    // this?" — which is the common case and the one a maker thanks you for.
    expect(checkLaunchable(base({ consumedVersions: ["1.0"] }))).toMatchObject({
      ok: false,
      reason: "version-already-launched",
    });
  });

  it("the COOLDOWN half: a NEW version inside the window is still refused", () => {
    // THE TEST THAT MATTERS. A rule made only of labels stops nothing: a
    // treadmill is somebody typing "2.0" every Tuesday, and a rule you satisfy
    // by typing is not a rule. This is the half they cannot argue past.
    expect(
      checkLaunchable(base({ versionLabel: "2.0", lastLaunchedAt: NOW - 30 * DAY })),
    ).toMatchObject({ ok: false, reason: "cooldown" });
  });

  it("...and allows it once the window has passed", () => {
    // The other side of the same coin: a genuine 2.0 a year later deserves its
    // day. A rule that only ever said no would just be "launch once, ever".
    expect(
      checkLaunchable(
        base({ versionLabel: "2.0", lastLaunchedAt: NOW - (DEFAULT_COOLDOWN_DAYS + 1) * DAY }),
      ),
    ).toEqual({ ok: true });
  });

  it("refuses the SAME version even after the cooldown", () => {
    // Neither half subsumes the other. Time passing does not make a second
    // "1.0" a different thing.
    expect(
      checkLaunchable(
        base({
          consumedVersions: ["1.0"],
          lastLaunchedAt: NOW - (DEFAULT_COOLDOWN_DAYS + 1) * DAY,
        }),
      ),
    ).toMatchObject({ ok: false, reason: "version-already-launched" });
  });

  it("compares versions the way a READER does, not the way `===` does", () => {
    // `2.0`, `2.0 ` and `V2.0` are one version to everybody who is not a
    // computer. A rule defeated by a capital letter is a spelling test.
    expect(sameVersion("2.0", "V2.0")).toBe(true);
    expect(sameVersion("2.0", " 2.0 ")).toBe(true);
    expect(sameVersion("2  0", "2 0")).toBe(true);
    expect(sameVersion("2.0", "2.1")).toBe(false);
    // A leading `v` is only dropped before a DIGIT: `vinyl` is a version name
    // and `inyl` is not.
    expect(normaliseVersion("vinyl")).toBe("vinyl");
    expect(normaliseVersion("v2")).toBe("2");
  });

  it("catches a case-varied duplicate through the full check", () => {
    expect(checkLaunchable(base({ versionLabel: "V1.0", consumedVersions: ["1.0"] }))).toMatchObject(
      { ok: false, reason: "version-already-launched" },
    );
  });
});

describe("which states hold a version, and which release it", () => {
  it("scheduled and live consume; cancelled and missed do not", () => {
    // A missed launch announced NOTHING, so there is nothing for the rule to
    // protect anybody from — and the alternative is somebody who unpublished
    // for an hour losing their 2.0 launch forever.
    expect([...VERSION_CONSUMING_STATES].sort()).toEqual(["live", "scheduled"]);
    expect(VERSION_CONSUMING_STATES).not.toContain("missed");
    expect(VERSION_CONSUMING_STATES).not.toContain("cancelled");
  });

  it("the public sees exactly one state", () => {
    // The embargo, as a set. `scheduled` reaching a public surface is this
    // milestone's central promise broken in the one place it would be seen.
    expect([...PUBLIC_LAUNCH_STATES]).toEqual(["live"]);
    expect([...LAUNCH_STATES]).toEqual(["scheduled", "live", "cancelled", "missed"]);
  });
});

describe("a launch that happened cannot be un-happened", () => {
  it("a LIVE launch can neither move nor be cancelled", () => {
    // It has been announced and people have seen it. Moving it would rewrite a
    // public record, which is the one thing this table must never allow.
    expect(mayLaunchAct("reschedule", "live")).toBe(false);
    expect(mayLaunchAct("cancel", "live")).toBe(false);
  });

  it("a MISSED one can do both, which is the whole point of the state", () => {
    expect(mayLaunchAct("reschedule", "missed")).toBe(true);
    expect(mayLaunchAct("cancel", "missed")).toBe(true);
  });

  it("nothing can be done to a cancelled launch", () => {
    for (const act of LAUNCH_ACTS) {
      expect([act.act, mayLaunchAct(act.act, "cancelled")]).toEqual([act.act, false]);
    }
  });

  it("has NO `launch` act, and that absence is load-bearing", () => {
    // A launch fires because its MOMENT ARRIVED. A manual fire would make the
    // scheduled moment decorative and would order LC-2's board by who happened
    // to be awake.
    expect(LAUNCH_ACTS.map((a) => a.act)).toEqual(["schedule", "reschedule", "cancel"]);
  });

  it("refuses an unknown act loudly rather than answering `undefined`", () => {
    expect(() => launchAct("fire" as never)).toThrow(/unknown launch act/);
  });
});

describe("the other refusals, in the order they are reported", () => {
  it("an unpublished listing is refused BEFORE anything about the moment", () => {
    // The first failure is the one reported, so it should be the one that
    // matters most. "This is not published" is a truer answer than "that
    // moment is too soon" for a draft somebody tried to launch in ten minutes.
    const verdict = checkLaunchable(base({ isPublished: false, scheduledFor: NOW + 60_000 }));
    expect(verdict).toMatchObject({ ok: false, reason: "not-published" });
  });

  it("a second scheduled launch is refused — move the first instead", () => {
    expect(checkLaunchable(base({ hasScheduled: true }))).toMatchObject({
      ok: false,
      reason: "already-scheduled",
    });
  });

  it("refuses a moment that is too close, and one that is too far", () => {
    // Too close: a launch that fires before its maker has read the page they
    // are announcing, and the shape a mistyped moment takes.
    expect(checkLaunchable(base({ scheduledFor: NOW + 60_000 }))).toMatchObject({
      ok: false,
      reason: "too-soon",
    });
    // Too far: a row nobody will remember writing, in a table that fires
    // things.
    expect(checkLaunchable(base({ scheduledFor: NOW + 400 * DAY }))).toMatchObject({
      ok: false,
      reason: "too-far",
    });
  });

  it("refuses a moment in the PAST", () => {
    expect(checkLaunchable(base({ scheduledFor: NOW - DAY }))).toMatchObject({
      ok: false,
      reason: "too-soon",
    });
  });

  it("every refusal carries a sentence a person can act on", () => {
    for (const [reason, refusal] of Object.entries(LAUNCH_REFUSALS)) {
      expect(`${reason}: ${refusal.reason}`).toBe(`${reason}: ${reason}`);
      // Not a code, not a field name — a sentence long enough to say what to
      // do next.
      expect(refusal.says.length).toBeGreaterThan(50);
      expect(refusal.says).not.toMatch(/error|invalid|failed/i);
    }
  });
});

describe("the policy is configuration, and a bad value never opens the door", () => {
  it("reads a valid override", () => {
    expect(parseLaunchPolicy('{"cooldownDays":90}').cooldownDays).toBe(90);
  });

  it("falls back to the published default on anything malformed", () => {
    // THE DIRECTION MATTERS. A malformed cooldown becoming `0` would silently
    // open the treadmill this rule exists to close, and nothing would look
    // broken — which is how a configuration bug becomes a product change.
    for (const bad of [undefined, "", "not json", "[]", "null", '{"cooldownDays":0}',
                       '{"cooldownDays":-5}', '{"cooldownDays":"90"}', '{"cooldownDays":null}']) {
      expect(`${bad}: ${parseLaunchPolicy(bad).cooldownDays}`).toBe(`${bad}: ${DEFAULT_COOLDOWN_DAYS}`);
    }
  });

  it("the sentence a maker reads states the policy IN FORCE", () => {
    // Not the compiled-in default: the cooldown is per-environment, and a
    // studio stating 180 days against a 90-day deployment has told somebody
    // something false on the surface meant to explain the rules.
    expect(cooldownNote({ ...DEFAULT_LAUNCH_POLICY, cooldownDays: 90 })).toContain("90 days");
    expect(cooldownNote()).toContain(`${DEFAULT_COOLDOWN_DAYS} days`);
  });
});

describe("a version label is required, and bounded", () => {
  it("refuses an empty one with a reason, not a field name", () => {
    const verdict = parseVersionLabel("   ");
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.says).toMatch(/what changed/);
  });

  it("normalises whitespace but keeps the maker's words", () => {
    expect(parseVersionLabel("  2026   rewrite ")).toEqual({ ok: true, label: "2026 rewrite" });
  });

  it("refuses one that is too long, and a non-string", () => {
    expect(parseVersionLabel("x".repeat(41)).ok).toBe(false);
    expect(parseVersionLabel(undefined).ok).toBe(false);
    expect(parseVersionLabel(42).ok).toBe(false);
  });
});

describe("what a maker is told", () => {
  it("the scheduled note promises the embargo in plain words", () => {
    expect(SCHEDULED_NOTE).toMatch(/Nobody sees this until the moment arrives/);
    expect(SCHEDULED_NOTE).toMatch(/move it or cancel it/);
  });

  it("the missed note says WHY, and that the version is still free", () => {
    // The sentence this state exists to be able to say. Without the second
    // half a maker assumes they have burned their 2.0 and stops trying.
    expect(MISSED_NOTE).toMatch(/was not published when its moment came/);
    expect(MISSED_NOTE).toMatch(/this version is still free/);
    // And it does not apologise or blame.
    expect(MISSED_NOTE).not.toMatch(/sorry|unfortunately|you failed/i);
  });
});
