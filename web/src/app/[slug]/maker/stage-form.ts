// The Change stage popup's rules, as plain functions (openproduct-stages-crew
// SC-2, design §1; boards `Stage`, `PhoneStage`).
//
// THE CONTRACT DECIDES, THIS ONLY WORDS IT. Which stages a product may move
// to, which fields a step asks for and whether each holds an acceptable value
// are `@openproduct/contracts`' (`reachableStages`, `stageStepFields`,
// `stageFieldError`, `validateStageChange`) — the same functions core refuses
// by. This module adds what a person reads: the labels, the hints, the
// "n of m required", the Move button's words, and what each field starts at.
//
// NO COMMENT FIELD AND NO "POST IT TO THE FEED" (a departure, said in the
// epic's status): there is no post kind for a stage change yet, so a box that
// offered to post would promise something nothing does, and a comment would
// have nowhere to be read.
//
// PURE, AND NO JSX: the web test lane is module-level.

import {
  PRODUCTION_ACCESS,
  PRODUCTION_ACCESS_LABELS,
  PRODUCTION_VERSION_MAX,
  PRODUCT_STAGES,
  PRODUCT_STAGE_LABELS,
  PRODUCT_STAGE_SUBS,
  MILESTONE_TITLE_MAX,
  STAGE_BACK_REASONS,
  STAGE_BACK_REASON_LABELS,
  STAGE_NOTE_MAX,
  isoDay,
  nextStage,
  stageDirection,
  stageFieldError,
  stageStepFields,
  validateStageChange,
  type ChangeStageRequest,
  type ProductStage,
  type StageStepField,
} from "@openproduct/contracts";

import type { StageStart } from "../where-it-runs";

export const CHANGE_STAGE_TITLE = "Change stage";

/** A field's name in the popup: a step's input, never the comment. */
export type StageFieldName = Exclude<StageStepField["name"], "comment">;

export type StageFieldKind = "link" | "text" | "area" | "date" | "choice";

export interface StageFormField {
  readonly name: StageFieldName;
  readonly label: string;
  readonly kind: StageFieldKind;
  readonly required: boolean;
  readonly max?: number;
  readonly placeholder?: string;
  /** Half the row from `sm` up (Live since and Version share one). */
  readonly half?: boolean;
  readonly mono?: boolean;
  readonly options?: ReadonlyArray<{ readonly value: string; readonly label: string }>;
}

const SPEC: Record<StageFieldName, Omit<StageFormField, "name" | "required">> = {
  repository: { label: "Repository", kind: "link", placeholder: "https://github.com/…" },
  firstMilestone: { label: "First milestone", kind: "text", max: MILESTONE_TITLE_MAX, placeholder: "What ships first" },
  stageUrl: { label: "Stage link", kind: "link", placeholder: "https://" },
  tryWhat: { label: "What people can try", kind: "area", max: STAGE_NOTE_MAX, placeholder: "What works today, and what to try first" },
  productionUrl: { label: "Production link", kind: "link", placeholder: "https://" },
  liveSince: { label: "Live since", kind: "date", half: true },
  version: { label: "Version", kind: "text", max: PRODUCTION_VERSION_MAX, half: true, mono: true, placeholder: "1.0.0" },
  access: {
    label: "Who can use it",
    kind: "choice",
    options: PRODUCTION_ACCESS.map((value) => ({ value, label: PRODUCTION_ACCESS_LABELS[value] })),
  },
  reason: {
    label: "Why it moves back",
    kind: "choice",
    options: STAGE_BACK_REASONS.map((value) => ({ value, label: STAGE_BACK_REASON_LABELS[value] })),
  },
};

/** The step's fields, in the board's order, with their words. */
export function stageFormFields(from: ProductStage, to: ProductStage): readonly StageFormField[] {
  return stageStepFields(from, to)
    .filter((field): field is StageStepField & { name: StageFieldName } => field.name !== "comment")
    .map((field) => ({ name: field.name, required: field.required, ...SPEC[field.name] }));
}

export interface StageOption {
  readonly stage: ProductStage;
  readonly label: string;
  /** `Now`, `Move back`, the stage's own line, or `After building`. */
  readonly sub: string;
  readonly current: boolean;
  /** Only the next and the previous stage can be picked. */
  readonly pickable: boolean;
}

/** The four stages as the popup's grid draws them (board `Stage`: `steps`). */
export function stageOptions(from: ProductStage): readonly StageOption[] {
  return PRODUCT_STAGES.map((stage, index) => {
    const direction = stageDirection(from, stage);
    const current = stage === from;
    const sub = current
      ? "Now"
      : direction === "back"
        ? "Move back"
        : direction === "forward"
          ? PRODUCT_STAGE_SUBS[stage]
          : index > PRODUCT_STAGES.indexOf(from)
            ? `After ${PRODUCT_STAGE_LABELS[PRODUCT_STAGES[index - 1]!].toLowerCase()}`
            : PRODUCT_STAGE_SUBS[stage];
    return { stage, label: PRODUCT_STAGE_LABELS[stage], sub, current, pickable: direction !== null };
  });
}

/** The stage the popup opens on: the next one, or the previous at the last. */
export function defaultTarget(from: ProductStage): ProductStage | null {
  return nextStage(from) ?? (stageOptions(from).find((option) => option.pickable)?.stage ?? null);
}

export type StageValues = Partial<Record<StageFieldName, string>>;

/**
 * What a step's fields start at: the crew's own words for it, off the public
 * document — the listing's repository, the stage link and what people can
 * try, the production facts — and "Open to everyone" for who can use it, as
 * the board does. Nothing else is filled in for them.
 */
export function initialStageValues(start: StageStart): StageValues {
  const stage = start.whereItRuns.stage;
  const production = start.whereItRuns.production;
  return {
    repository: start.repoUrl ?? "",
    firstMilestone: "",
    stageUrl: start.tryUrl ?? "",
    tryWhat: stage?.note ?? "",
    productionUrl: production?.url ?? "",
    liveSince: production?.since ?? "",
    version: production?.version ?? "",
    access: production?.access ?? "everyone",
    reason: "",
  };
}

/** One field's sentence, while the person types: null when it is fine, or
 *  when it is empty and required (the counter says that; red is for a value
 *  that is wrong, not one that is missing). */
export function liveFieldError(field: StageFormField, value: string, now: Date): string | null {
  if (value.trim().length === 0) return null;
  return stageFieldError(field.name, value, { required: field.required, today: isoDay(now) });
}

/** `2 of 3 required`, and whether all are there. */
export function requiredProgress(
  fields: readonly StageFormField[],
  values: StageValues,
  now: Date,
): { done: number; total: number; label: string } {
  const required = fields.filter((field) => field.required);
  const done = required.filter(
    (field) => stageFieldError(field.name, values[field.name] ?? "", { required: true, today: isoDay(now) }) === null,
  ).length;
  return { done, total: required.length, label: required.length > 0 ? `${done} of ${required.length} required` : "" };
}

/** The request the popup sends: `to` and the step's own fields. */
export function stageRequestOf(to: ProductStage, fields: readonly StageFormField[], values: StageValues): ChangeStageRequest {
  const body: Record<string, unknown> = { to, post: false };
  for (const field of fields) {
    const value = (values[field.name] ?? "").trim();
    if (value.length > 0) body[field.name] = value;
  }
  return body as unknown as ChangeStageRequest;
}

/** Whether Move can be pressed: the contract's own answer for this request. */
export function canMove(from: ProductStage, to: ProductStage | null, values: StageValues, now: Date): boolean {
  if (to === null) return false;
  return validateStageChange(from, stageRequestOf(to, stageFormFields(from, to), values), now).ok;
}

/** `Move to in production`, `Move back to building`, `Pick a stage`. */
export function moveLabel(from: ProductStage, to: ProductStage | null): string {
  if (to === null) return "Pick a stage";
  const word = PRODUCT_STAGE_LABELS[to].toLowerCase();
  return stageDirection(from, to) === "back" ? `Move back to ${word}` : `Move to ${word}`;
}

/** `Moved to on stage.` — said in the Stage row once the step landed. */
export function movedLine(to: ProductStage): string {
  return `Moved to ${PRODUCT_STAGE_LABELS[to].toLowerCase()}. The page catches up in a minute.`;
}

/** A field's hint under its label: `12 / 280`, `Optional`, or nothing. */
export function fieldHint(field: StageFormField, value: string): string {
  if (field.max) return `${value.length} / ${field.max}${field.required ? "" : " · Optional"}`;
  return field.required ? "" : "Optional";
}
