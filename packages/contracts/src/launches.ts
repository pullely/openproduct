// The launch (openproduct-commons LC0).
//
// PUBLISHING MAKES A PAGE EXIST. LAUNCHING PUTS IT IN FRONT OF PEOPLE. They
// are two acts and this module exists because conflating them costs a maker
// the only thing they get one of: the day their product is introduced.
//
// Under a conflated model, a listing is announced on the day its page first
// works — which is the worst possible day, because that is the day the pitch
// is half-written, the screenshot is a placeholder and the repo README still
// says "TODO". Separating them lets somebody publish quietly, sit with it,
// fix the tagline twice, and then choose the morning.
//
// ─── THE ONCE-PER-VERSION RULE, AND WHAT A VERSION HAD TO BE ──────────────
//
// LC-1 says a listing launches once per MAJOR VERSION, and gives the reason:
// it is what stops the board becoming a re-post treadmill. The epic does not
// say what a major version is, and the obvious answer does not work.
//
// The obvious answer is a label the maintainer types. That stops nothing: a
// treadmill is a maintainer typing "2.0" every Tuesday, and a rule they can
// satisfy by typing is not a rule. The opposite answer — a number we derive
// from the listing's own edits — is worse, because it puts us in the business
// of judging whether somebody's release was significant, which we cannot do
// and should not claim to.
//
// SO IT IS BOTH, AND EACH HALF DOES A DIFFERENT JOB:
//
//   the LABEL is theirs      distinct from every version they have already
//                            launched. Only they know whether this is really
//                            2.0, and this half catches the honest mistake —
//                            "wait, did I already launch this?"
//
//   the COOLDOWN is ours     a published minimum between two launches of the
//                            same listing. This half catches the deliberate
//                            treadmill, and it is the half a maintainer
//                            cannot argue their way past.
//
// The cooldown is CONFIGURATION and it is PUBLISHED (`/docs`), for the same
// reason TS2's velocity limits are: a limit a person cannot read is a limit
// they experience as the product being broken. Six months is the default, and
// it is not a number this file invented — it is roughly where the rest of the
// field landed, which matters, because a maker arriving from elsewhere should
// not have to learn a new rule.
//
// ─── FOUR STATES, AND ONE OF THEM IS AN APOLOGY ───────────────────────────
//
// `missed` is the interesting one. A launch cannot fire while its listing is
// unpublished (LC0's own rule), so a maintainer who unpublishes on Thursday
// night has a Friday launch that cannot happen. Three things could be done
// with it, and two are bad:
//
//   fire anyway     announces a page that 404s. Never.
//   stay scheduled  fires at some arbitrary later moment, whenever they
//                   happen to republish — a surprise announcement is worse
//                   than a missed one.
//   miss it         says plainly that the moment passed and why, and offers
//                   a reschedule. Costs one state and one sentence.
//
// A missed launch does NOT consume its version. Nothing was announced, so
// there is nothing for the once-per-version rule to be protecting anybody
// from — and the alternative is a maker who unpublished for an hour losing
// their 2.0 launch forever.

/** Where a launch is in its life. */
export const LAUNCH_STATES = ["scheduled", "live", "cancelled", "missed"] as const;
export type LaunchState = (typeof LAUNCH_STATES)[number];

/**
 * The states that have consumed their version label.
 *
 * `live` because it happened. `scheduled` because it is ABOUT to happen and
 * two launches racing for one version is not a state anybody wants to reason
 * about. Cancelled and missed release theirs: nothing was announced.
 */
export const VERSION_CONSUMING_STATES: readonly LaunchState[] = ["scheduled", "live"];

/** The states a visitor can ever see. Exactly one. */
export const PUBLIC_LAUNCH_STATES: readonly LaunchState[] = ["live"];

/**
 * One launch, as the studio sees it.
 *
 * THE ONLY SURFACE THIS SHAPE REACHES IS A MAINTAINER'S OWN, which is why it
 * carries `scheduledFor` on an unfired launch — a moment nobody outside the
 * listing may know. LC3's public board gets its own, narrower projection when
 * it ships; widening this one to serve both is how an embargo leaks.
 */
export interface StudioLaunch {
  /** The prefixed public id — what a URL carries. Never the raw row id. */
  readonly id: string;
  readonly state: LaunchState;
  readonly versionLabel: string;
  readonly scheduledFor: string;
  readonly launchedAt: string | null;
  readonly cancelledAt: string | null;
  readonly missedAt: string | null;
}

export const STUDIO_LAUNCH_KEYS = [
  "cancelledAt",
  "id",
  "launchedAt",
  "missedAt",
  "scheduledFor",
  "state",
  "versionLabel",
] as const;

// ---------------------------------------------------------------------------
// Who may do what
// ---------------------------------------------------------------------------

/**
 * The three acts, written as data for the same reason CG3's roster table was:
 * the interesting property is the SHAPE — everything here belongs to the
 * listing's maintainers and nothing belongs to anybody else — and a reviewer
 * can check that against one literal in five seconds.
 *
 * There is no `launch` act, and that absence is load-bearing. A launch fires
 * because its MOMENT ARRIVED, not because somebody pressed a button; the only
 * thing a maintainer chooses is when. A manual fire would make `scheduled_for`
 * decorative and would put the board's ordering at the mercy of who was awake.
 */
export const LAUNCH_ACTS = [
  {
    act: "schedule",
    from: "absent",
    to: "scheduled",
    refusal: "Only this listing's maintainers can schedule its launch.",
  },
  {
    act: "reschedule",
    // A scheduled launch can move. A LIVE one cannot: it has been announced,
    // people have seen it, and moving it would rewrite a public record.
    // A missed one can, which is the whole point of `missed` existing.
    from: ["scheduled", "missed"],
    to: "scheduled",
    refusal: "A launch that has already happened cannot be moved.",
  },
  {
    act: "cancel",
    from: ["scheduled", "missed"],
    to: "cancelled",
    refusal: "A launch that has already happened cannot be cancelled.",
  },
] as const;

export type LaunchAct = (typeof LAUNCH_ACTS)[number]["act"];

export function launchAct(act: LaunchAct): (typeof LAUNCH_ACTS)[number] {
  const found = LAUNCH_ACTS.find((a) => a.act === act);
  // Total by construction, but a throw beats `undefined` reaching an
  // authorization check — the one place a missing rule must not read as
  // "allowed" (CG3's precedent).
  if (!found) throw new Error(`unknown launch act: ${act}`);
  return found;
}

/** May this act be performed on a launch in this state? */
export function mayLaunchAct(act: LaunchAct, state: LaunchState | "absent"): boolean {
  const rule = launchAct(act);
  return rule.from === "absent" ? state === "absent" : rule.from.includes(state as never);
}

// ---------------------------------------------------------------------------
// The rules a maintainer can read
// ---------------------------------------------------------------------------

/** The default minimum between two launches of one listing. */
export const DEFAULT_COOLDOWN_DAYS = 180;

/**
 * How far ahead a launch may be scheduled.
 *
 * NOT UNBOUNDED, and not because of storage. A launch scheduled for 2031 is a
 * row nobody will remember writing, sitting in a table that fires things — and
 * the day it fires, the listing it announces will have moved on without it.
 * A year is generous for a real plan and short enough that a forgotten row
 * surfaces as a missed launch rather than a surprise one.
 */
export const MAX_LEAD_DAYS = 365;

/**
 * How far ahead a launch MUST be scheduled.
 *
 * A launch scheduled for two minutes' time is a launch that fires before its
 * maker has read the page they are announcing. It is also the shape a mistake
 * takes: the moment somebody meant to type is almost never now.
 */
export const MIN_LEAD_MINUTES = 30;

export interface LaunchPolicy {
  readonly cooldownDays: number;
  readonly maxLeadDays: number;
  readonly minLeadMinutes: number;
}

export const DEFAULT_LAUNCH_POLICY: LaunchPolicy = {
  cooldownDays: DEFAULT_COOLDOWN_DAYS,
  maxLeadDays: MAX_LEAD_DAYS,
  minLeadMinutes: MIN_LEAD_MINUTES,
};

/**
 * Read the policy from configuration, falling back to the default.
 *
 * A BAD VALUE FALLS BACK RATHER THAN THROWING, and the direction matters: a
 * malformed cooldown must never become `0`, which would silently open the
 * treadmill this rule exists to close. Every branch here lands on the
 * published default or on a stricter number, never on a looser one.
 */
export function parseLaunchPolicy(raw: string | undefined): LaunchPolicy {
  if (!raw) return DEFAULT_LAUNCH_POLICY;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_LAUNCH_POLICY;
  }
  if (typeof parsed !== "object" || parsed === null) return DEFAULT_LAUNCH_POLICY;
  const input = parsed as Record<string, unknown>;
  const positive = (value: unknown, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) && value > 0
      ? Math.trunc(value)
      : fallback;
  return {
    cooldownDays: positive(input.cooldownDays, DEFAULT_COOLDOWN_DAYS),
    maxLeadDays: positive(input.maxLeadDays, MAX_LEAD_DAYS),
    minLeadMinutes: positive(input.minLeadMinutes, MIN_LEAD_MINUTES),
  };
}

/** Why a launch could not be scheduled. Each is a sentence, not a code. */
export const LAUNCH_REFUSALS = {
  "not-published": {
    reason: "not-published",
    says: "This listing is not published, so there is nothing to launch yet. Publish the page first — it can sit quietly for as long as you like before you announce it.",
  },
  "version-already-launched": {
    reason: "version-already-launched",
    says: "You have already launched this version. Give the next launch a different version, so a reader can tell the two apart.",
  },
  cooldown: {
    reason: "cooldown",
    says: "This listing launched recently. A listing can be launched again once the cooldown has passed — the board is for new things, and re-posting is what makes a board stop being worth reading.",
  },
  "too-soon": {
    reason: "too-soon",
    says: "That moment is too close. Pick one a little further out, so there is time to change your mind.",
  },
  "too-far": {
    reason: "too-far",
    says: "That moment is too far ahead. Schedule it nearer the time — a launch nobody remembers scheduling is a launch that surprises its own maker.",
  },
  "already-scheduled": {
    reason: "already-scheduled",
    says: "This listing already has a launch scheduled. Move it or cancel it rather than adding a second.",
  },
} as const;

export type LaunchRefusalReason = keyof typeof LAUNCH_REFUSALS;

/**
 * Can this listing be launched at this moment, with this version?
 *
 * ONE FUNCTION, ASKED BY EVERY WRITE PATH. The handler asks it, the studio
 * asks it to decide what to render, and a test asks it directly — which is
 * what keeps "the form let me do it and the API refused" from happening.
 *
 * Returns the FIRST reason it fails. Not all of them: a form that lists four
 * problems at once is a form that reads as hostile, and the first one is the
 * one to fix.
 */
export function checkLaunchable(input: {
  readonly isPublished: boolean;
  readonly scheduledFor: number;
  readonly now: number;
  /** The version this launch would claim. */
  readonly versionLabel: string;
  /** Versions already consumed by a scheduled or live launch. */
  readonly consumedVersions: readonly string[];
  /** When this listing last went live, if ever. */
  readonly lastLaunchedAt: number | null;
  /** Whether a scheduled launch already exists. */
  readonly hasScheduled: boolean;
  readonly policy?: LaunchPolicy;
}): { ok: true } | { ok: false; reason: LaunchRefusalReason; says: string } {
  const policy = input.policy ?? DEFAULT_LAUNCH_POLICY;
  const no = (reason: LaunchRefusalReason) => ({
    ok: false as const,
    reason,
    says: LAUNCH_REFUSALS[reason].says,
  });

  // ORDERED FROM MOST FUNDAMENTAL TO MOST NEGOTIABLE, because the first
  // failure is the one reported and it should be the one that matters most.
  // "This is not published" is a truer answer than "that moment is too soon"
  // for a draft somebody tried to launch in ten minutes.
  if (!input.isPublished) return no("not-published");
  if (input.hasScheduled) return no("already-scheduled");
  if (input.consumedVersions.some((v) => sameVersion(v, input.versionLabel))) {
    return no("version-already-launched");
  }
  if (input.lastLaunchedAt !== null) {
    const elapsed = input.now - input.lastLaunchedAt;
    if (elapsed < policy.cooldownDays * 86_400_000) return no("cooldown");
  }
  const lead = input.scheduledFor - input.now;
  if (lead < policy.minLeadMinutes * 60_000) return no("too-soon");
  if (lead > policy.maxLeadDays * 86_400_000) return no("too-far");
  return { ok: true };
}

/**
 * Are these the same version?
 *
 * Compared case- and whitespace-insensitively, because `2.0`, `2.0 ` and
 * `V2.0` are one version to every reader and three to a naive `===`. The
 * once-per-version rule would be trivially defeated by a capital letter
 * otherwise, which is not a rule so much as a spelling test.
 */
export function sameVersion(a: string, b: string): boolean {
  return normaliseVersion(a) === normaliseVersion(b);
}

export function normaliseVersion(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").replace(/^v(?=\d)/, "");
}

/** The bound on a version label. Bounded here AND in the schema. */
export const VERSION_LABEL_MAX = 40;

/** Is this a version label we will store? */
export function parseVersionLabel(
  value: unknown,
): { ok: true; label: string } | { ok: false; says: string } {
  if (typeof value !== "string") return { ok: false, says: "A version is required." };
  const label = value.trim().replace(/\s+/g, " ");
  if (label.length === 0) {
    return {
      ok: false,
      says: "Give this launch a version — `1.0`, `2026 rewrite`, whatever you call it. A reader seeing the same product twice needs to know what changed.",
    };
  }
  if (label.length > VERSION_LABEL_MAX) {
    return { ok: false, says: `A version can be at most ${VERSION_LABEL_MAX} characters.` };
  }
  return { ok: true, label };
}

// ---------------------------------------------------------------------------
// What people are told
// ---------------------------------------------------------------------------

/** The studio's own sentence, above the scheduler. */
export const LAUNCH_MEANING =
  "Publishing makes your page exist. Launching puts it on the board on a day you choose. You can publish quietly, get it right, and announce it whenever you are ready.";

/** Beside a scheduled launch. */
export const SCHEDULED_NOTE =
  "Nobody sees this until the moment arrives — not the board, not the digest, not your page. You can move it or cancel it until then.";

/** Beside a missed one. */
export const MISSED_NOTE =
  "This launch did not happen: the listing was not published when its moment came, and we will not announce a page nobody can open. Nothing was announced and this version is still free, so you can schedule it again.";

/** Beside a live one. */
export const LIVE_NOTE =
  "This launch happened and is part of the public record. It cannot be moved or cancelled — people have already seen it.";

/** The cooldown, said in the studio where a maker meets it. */
export function cooldownNote(policy: LaunchPolicy = DEFAULT_LAUNCH_POLICY): string {
  return `A listing can be launched again ${policy.cooldownDays} days after its last launch, with a different version. The board is for new things.`;
}
