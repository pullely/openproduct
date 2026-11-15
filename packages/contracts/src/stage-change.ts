// Changing a product's stage, and where it runs (openproduct-stages-crew
// SC-2, design §1).
//
// ONE STEP AT A TIME, BY HAND. A product moves forward or back by exactly one
// stage (`PRODUCT_STAGES`, in order), and each step asks for its own inputs:
//
//   → building      repository (https), first milestone (≤60)
//   → stage         stage link (https), what people can try (1–280)
//   → production    production link (https), live since (a date, not in the
//                   future), who can use it (everyone · waitlist · invite);
//                   version (≤40) optional
//   ← back one      reason (paused · rebuilding · moved elsewhere)
//
// and every step takes an optional comment (≤280) and `post` (whether to post
// it to the feed). `validateStageChange` is the ONE rule: core refuses by it,
// and the Change stage popup counts "n of m required" and locks Move by it,
// so the two cannot disagree about what a step needs.
//
// WHERE IT RUNS is the public half: the STAGE row (the stage link, what people
// can try, who set it and when) and the PRODUCTION row (the production link,
// live since, version, who can use it, who set it and when). SC3 fills both
// from Orunbase deploys as well (design §3.3): the value a page shows is then
// the crew's ?? the synced one, and `setBy` gains a `{kind: "orun"}` arm. Only
// the crew's values exist in SC1, and nothing here pretends otherwise.
//
// PURE: no I/O. The clock is a parameter, so "not in the future" is testable.

import {
  MILESTONE_TITLE_MAX,
  PRODUCT_STAGES,
  PRODUCT_STAGE_LABELS,
  isProductStage,
  nextStage,
  previousStage,
  type ProductStage,
} from "./product-posts.js";

// ---------------------------------------------------------------------------
// The vocabulary
// ---------------------------------------------------------------------------

/** Who can use a product in production. */
export const PRODUCTION_ACCESS = ["everyone", "waitlist", "invite"] as const;
export type ProductionAccess = (typeof PRODUCTION_ACCESS)[number];

export const PRODUCTION_ACCESS_LABELS: Record<ProductionAccess, string> = {
  everyone: "Open to everyone",
  waitlist: "Waitlist",
  invite: "Invite only",
};

export function isProductionAccess(value: unknown): value is ProductionAccess {
  return typeof value === "string" && (PRODUCTION_ACCESS as readonly string[]).includes(value);
}

/** Why a product moves back a stage. */
export const STAGE_BACK_REASONS = ["paused", "rebuilding", "moved"] as const;
export type StageBackReason = (typeof STAGE_BACK_REASONS)[number];

export const STAGE_BACK_REASON_LABELS: Record<StageBackReason, string> = {
  paused: "Paused",
  rebuilding: "Rebuilding",
  moved: "Moved elsewhere",
};

export function isStageBackReason(value: unknown): value is StageBackReason {
  return typeof value === "string" && (STAGE_BACK_REASONS as readonly string[]).includes(value);
}

/** What people can try on stage: the stored `stage_note`. */
export const STAGE_NOTE_MAX = 280;
/** The comment that rides along with a stage change. */
export const STAGE_COMMENT_MAX = 280;
/** The version in production. */
export const PRODUCTION_VERSION_MAX = 40;
/** Every link a step takes: the try link's own bound (core's `MAX_TRY_URL`),
 *  so a Feature shipped post prefilled from the stage link still fits. */
export const STAGE_LINK_MAX = 200;

// ---------------------------------------------------------------------------
// The request, and the step it becomes
// ---------------------------------------------------------------------------

/** `PUT …/profiles/{id}/stage`. Only the step's own fields are read. */
export interface ChangeStageRequest {
  to: ProductStage;
  /** → building */
  repository?: string;
  firstMilestone?: string;
  /** → stage */
  stageUrl?: string;
  tryWhat?: string;
  /** → production */
  productionUrl?: string;
  /** `YYYY-MM-DD`. */
  liveSince?: string;
  access?: ProductionAccess;
  version?: string | null;
  /** ← back one step */
  reason?: StageBackReason;
  comment?: string | null;
  /** Post it to the feed. Defaults to true, as the popup's box does. */
  post?: boolean;
}

/** Every input a step can take, by name: what a proxy passes through. */
export const CHANGE_STAGE_FIELDS = [
  "repository",
  "firstMilestone",
  "stageUrl",
  "tryWhat",
  "productionUrl",
  "liveSince",
  "access",
  "version",
  "reason",
  "comment",
] as const satisfies readonly (keyof Omit<ChangeStageRequest, "to" | "post">)[];

/** The fields each step reads, in the popup's order, and which it requires. */
export interface StageStepField {
  readonly name: keyof Omit<ChangeStageRequest, "to" | "post">;
  readonly required: boolean;
}

/** A step, validated and normalised: what core writes. */
export type StageChange = { from: ProductStage; comment: string | null; post: boolean } & (
  | { direction: "forward"; to: "building"; repository: string; firstMilestone: string }
  | { direction: "forward"; to: "stage"; stageUrl: string; tryWhat: string }
  | {
      direction: "forward";
      to: "production";
      productionUrl: string;
      liveSince: string;
      access: ProductionAccess;
      version: string | null;
    }
  | { direction: "back"; to: ProductStage; reason: StageBackReason }
);

export type StageChangeResult =
  | { ok: true; change: StageChange }
  | { ok: false; fields: Record<string, string[]> };

const STEP_FIELDS: Record<"building" | "stage" | "production" | "back", readonly StageStepField[]> = {
  building: [
    { name: "repository", required: true },
    { name: "firstMilestone", required: true },
    { name: "comment", required: false },
  ],
  stage: [
    { name: "stageUrl", required: true },
    { name: "tryWhat", required: true },
    { name: "comment", required: false },
  ],
  production: [
    { name: "productionUrl", required: true },
    { name: "liveSince", required: true },
    { name: "version", required: false },
    { name: "access", required: true },
    { name: "comment", required: false },
  ],
  back: [
    { name: "reason", required: true },
    { name: "comment", required: false },
  ],
};

/** Whether `to` is one step from `from`, and which way. */
export function stageDirection(from: ProductStage, to: ProductStage): "forward" | "back" | null {
  if (nextStage(from) === to) return "forward";
  if (previousStage(from) === to) return "back";
  return null;
}

/** The stages a product at `from` may move to: the next and the previous. */
export function reachableStages(from: ProductStage): ProductStage[] {
  return PRODUCT_STAGES.filter((stage) => stageDirection(from, stage) !== null);
}

/** The fields a step from `from` to `to` reads; `[]` for a step that is not
 *  one (a skip, or no move). */
export function stageStepFields(from: ProductStage, to: ProductStage): readonly StageStepField[] {
  const direction = stageDirection(from, to);
  if (direction === null) return [];
  if (direction === "back") return STEP_FIELDS.back;
  return STEP_FIELDS[to as "building" | "stage" | "production"];
}

// ---------------------------------------------------------------------------
// The rules, one field at a time
// ---------------------------------------------------------------------------

const LINK_RULE = `An https:// address of at most ${STAGE_LINK_MAX} characters`;

/**
 * An https link with a real host (it has a dot), normalised as the URL parser
 * writes it — the same normalisation core's other https fields store. Null
 * when it is not one.
 */
export function stageLinkOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length === 0 || /\s/.test(text)) return null;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !parsed.hostname.includes(".") || parsed.username || parsed.password) return null;
  const normal = parsed.toString();
  return normal.length > STAGE_LINK_MAX ? null : normal;
}

/** One line, trimmed, 1..max — or null. */
function lineOf(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length === 0 || text.length > max || /[\r\n]/.test(text)) return null;
  return text;
}

/** Prose, trimmed, 1..max (line breaks allowed) — or null. */
function proseOf(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\r\n?/g, "\n").trim();
  return text.length === 0 || text.length > max ? null : text;
}

/** `YYYY-MM-DD` in UTC. */
export function isoDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** A real calendar day, `YYYY-MM-DD`, not after `today` — or null. */
function pastDayOf(value: unknown, today: string): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || isoDay(parsed) !== value) return null;
  return value <= today ? value : null;
}

/**
 * Whether one field of a step holds an acceptable value: what the popup asks
 * to draw `*` fields as done, and what `validateStageChange` refuses by.
 */
export function stageFieldError(
  name: StageStepField["name"],
  value: unknown,
  options: { required: boolean; today: string },
): string | null {
  const empty = value === undefined || value === null || (typeof value === "string" && value.trim().length === 0);
  if (empty) return options.required ? "Required" : null;
  switch (name) {
    case "repository":
    case "stageUrl":
    case "productionUrl":
      return stageLinkOf(value) ? null : LINK_RULE;
    case "firstMilestone":
      return lineOf(value, MILESTONE_TITLE_MAX) ? null : `One line of at most ${MILESTONE_TITLE_MAX} characters`;
    case "tryWhat":
      return proseOf(value, STAGE_NOTE_MAX) ? null : `At most ${STAGE_NOTE_MAX} characters`;
    case "liveSince":
      return pastDayOf(value, options.today) ? null : "A date, today or earlier";
    case "access":
      return isProductionAccess(value) ? null : "Everyone, waitlist or invite";
    case "version":
      return lineOf(value, PRODUCTION_VERSION_MAX) ? null : `One line of at most ${PRODUCTION_VERSION_MAX} characters`;
    case "reason":
      return isStageBackReason(value) ? null : "Paused, rebuilding or moved elsewhere";
    case "comment":
      return proseOf(value, STAGE_COMMENT_MAX) ? null : `At most ${STAGE_COMMENT_MAX} characters`;
  }
}

/**
 * Design §1.3, exactly. `current` is the product's stage now; `input` is the
 * request body as it arrived (anything). A skipped step, a step to where the
 * product already is, and a step whose required inputs are missing or
 * invalid are refused, each with a sentence under its field (`to` for the
 * step itself).
 */
export function validateStageChange(
  current: ProductStage,
  input: unknown,
  now: Date = new Date(),
): StageChangeResult {
  const body = (typeof input === "object" && input !== null && !Array.isArray(input) ? input : {}) as Record<
    string,
    unknown
  >;
  const to = body.to;
  if (!isProductStage(to)) {
    return { ok: false, fields: { to: ["One of idea, building, stage or production"] } };
  }
  const direction = stageDirection(current, to);
  if (direction === null) {
    const next = nextStage(current);
    const back = previousStage(current);
    const options = [next, back].filter((s): s is ProductStage => s !== null).map((s) => PRODUCT_STAGE_LABELS[s].toLowerCase());
    return {
      ok: false,
      fields: {
        to: [
          to === current
            ? `It is already ${PRODUCT_STAGE_LABELS[current].toLowerCase()}`
            : `A stage moves one step at a time: from ${PRODUCT_STAGE_LABELS[current].toLowerCase()} to ${options.join(" or ")}`,
        ],
      },
    };
  }

  const today = isoDay(now);
  const fields: Record<string, string[]> = {};
  for (const field of stageStepFields(current, to)) {
    const error = stageFieldError(field.name, body[field.name], { required: field.required, today });
    if (error) fields[field.name] = [error];
  }
  if (body.post !== undefined && typeof body.post !== "boolean") fields.post = ["true or false"];
  if (Object.keys(fields).length > 0) return { ok: false, fields };

  const comment = proseOf(body.comment, STAGE_COMMENT_MAX);
  const post = body.post !== false;
  const head = { from: current, comment, post };
  if (direction === "back") {
    return { ok: true, change: { ...head, direction, to, reason: body.reason as StageBackReason } };
  }
  switch (to) {
    case "building":
      return {
        ok: true,
        change: {
          ...head,
          direction,
          to,
          repository: stageLinkOf(body.repository)!,
          firstMilestone: lineOf(body.firstMilestone, MILESTONE_TITLE_MAX)!,
        },
      };
    case "stage":
      return {
        ok: true,
        change: { ...head, direction, to, stageUrl: stageLinkOf(body.stageUrl)!, tryWhat: proseOf(body.tryWhat, STAGE_NOTE_MAX)! },
      };
    case "production":
      return {
        ok: true,
        change: {
          ...head,
          direction,
          to,
          productionUrl: stageLinkOf(body.productionUrl)!,
          liveSince: body.liveSince as string,
          access: body.access as ProductionAccess,
          version: lineOf(body.version, PRODUCTION_VERSION_MAX),
        },
      };
    default:
      // `idea` is never a forward step: nothing comes before it.
      return { ok: false, fields: { to: ["An idea is where a product starts"] } };
  }
}

// ---------------------------------------------------------------------------
// Where it runs — the public projection
// ---------------------------------------------------------------------------

/**
 * Who set a row. SC1 knows only the crew: a person on the public roster by
 * their name and handle, or `null` name and handle for one who is not on it
 * (they have not agreed to be shown) — the row then says "set by the crew".
 * SC3 adds `{kind: "orun", runRef}` for a value a deploy wrote.
 */
export interface WhereItRunsBy {
  kind: "crew";
  name: string | null;
  handle: string | null;
}

export const WHERE_IT_RUNS_BY_KEYS = ["handle", "kind", "name"] as const;

export interface WhereItRunsStage {
  url: string;
  /** What people can try. */
  note: string | null;
  /** Null when the page does not know who put it on stage (the product has
   *  moved on since, or it was on stage before the four stages). */
  setBy: WhereItRunsBy | null;
  at: string | null;
}

export const WHERE_IT_RUNS_STAGE_KEYS = ["at", "note", "setBy", "url"] as const;

export interface WhereItRunsProduction {
  url: string;
  /** `YYYY-MM-DD`. */
  since: string;
  version: string | null;
  access: ProductionAccess;
  setBy: WhereItRunsBy | null;
  at: string | null;
}

export const WHERE_IT_RUNS_PRODUCTION_KEYS = ["access", "at", "setBy", "since", "url", "version"] as const;

/** The strip under a product's header, for everyone. Null rows are "Not on
 *  stage yet" and "Not in production yet". */
export interface WhereItRuns {
  stage: WhereItRunsStage | null;
  production: WhereItRunsProduction | null;
}

export const WHERE_IT_RUNS_KEYS = ["production", "stage"] as const;

/** What a stored product holds, as `whereItRunsOf` reads it. */
export interface WhereItRunsSource {
  stage: ProductStage;
  tryUrl: string | null;
  stageNote?: string | null;
  productionUrl?: string | null;
  productionSince?: string | null;
  productionVersion?: string | null;
  productionAccess?: string | null;
  stageChangedAt?: string | null;
  stageChangedBy?: string | null;
}

/**
 * The projection, field by field. The STAGE row shows while the product is on
 * stage or in production and has a stage link; the PRODUCTION row while it is
 * in production. "Who set it and when" is the last stage change, so it belongs
 * to the row that change made: the STAGE row's while on stage, the
 * PRODUCTION row's once in production. `nameOf` resolves the person through
 * the public roster; it answers null for somebody who is not on it.
 */
export function whereItRunsOf(
  source: WhereItRunsSource,
  nameOf: (subjectId: string) => { name: string | null; handle: string | null } | null,
): WhereItRuns {
  const by = (): WhereItRunsBy | null => {
    if (!source.stageChangedBy) return null;
    const known = nameOf(source.stageChangedBy);
    return { kind: "crew", name: known?.name ?? null, handle: known?.handle ?? null };
  };
  const live = source.stage === "stage" || source.stage === "production";
  const stage: WhereItRunsStage | null =
    live && source.tryUrl
      ? {
          url: source.tryUrl,
          note: source.stageNote ?? null,
          setBy: source.stage === "stage" ? by() : null,
          at: source.stage === "stage" ? (source.stageChangedAt ?? null) : null,
        }
      : null;
  const production: WhereItRunsProduction | null =
    source.stage === "production" &&
    source.productionUrl &&
    source.productionSince &&
    isProductionAccess(source.productionAccess)
      ? {
          url: source.productionUrl,
          since: source.productionSince,
          version: source.productionVersion ?? null,
          access: source.productionAccess,
          setBy: by(),
          at: source.stageChangedAt ?? null,
        }
      : null;
  return { stage, production };
}

/** Nothing runs anywhere: what a document cached before SC1 means. */
export const NO_WHERE_IT_RUNS: WhereItRuns = { stage: null, production: null };
