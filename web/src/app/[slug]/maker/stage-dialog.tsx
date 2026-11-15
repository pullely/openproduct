"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import type { OrunbaseSync, ProductStage } from "@openproduct/contracts";

import { BTN_INK, FOCUS } from "../../ui/design";
import { STAGE_TONE } from "../../ui/stage-tone";
import type { StageStart } from "../where-it-runs";

import { crewRead, crewWrite, fieldError } from "./act";
import {
  CHANGE_STAGE_TITLE,
  canMove,
  defaultTarget,
  fieldHint,
  initialStageValues,
  liveFieldError,
  moveLabel,
  requiredProgress,
  stageFormFields,
  stageOptions,
  stageRequestOf,
  syncStateOf,
  syncedValuesOf,
  withSynced,
  USE_SYNCED,
  type StageFormField,
  type StageValues,
  type SyncState,
} from "./stage-form";
import { useMaker } from "./use-maker";

/** Each stage's glyph (board `Stage`). */
const GLYPH: Record<ProductStage, string> = {
  idea: "M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0012 3z",
  building: "M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  stage: "M8 5v14l11-7z",
  production: "M5 12l5 5 9-10",
};

/** The focusable things inside the dialog, in order, for the trap. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const INPUT =
  "box-border w-full rounded-[14px] border-0 bg-card px-3.5 text-nozoom text-foreground outline-none ring-1 ring-inset ring-foreground/[0.08] focus:ring-2 focus:ring-ring aria-[invalid=true]:ring-[1.5px] aria-[invalid=true]:ring-destructive";

/**
 * The Change stage popup (openproduct-stages-crew SC-2, design §1; boards
 * `Stage`, `PhoneStage`), opened from the Stage row inside Edit details.
 *
 * A DIALOG, AND IT BEHAVES LIKE ONE: `role="dialog"`, `aria-modal`, named by
 * its title; focus moves in when it opens, stays in while it is open (Tab and
 * Shift+Tab wrap), and goes back to Change stage when it closes; Escape, ✕,
 * Cancel and a press on the scrim close it. Centred over a scrim from `sm`
 * up; the whole screen on a phone, the stages stacked and the footer pinned.
 *
 * THE FOUR STAGES IN A 2×2 GRID, only the next and the previous pickable
 * (one step at a time, design §1.2). The picked step's own fields follow,
 * required ones marked `*`; the footer says "n of m required" and Move stays
 * locked until the contract's `validateStageChange` says the request is
 * whole. A refusal from the server is drawn under its field.
 *
 * ITS OWN FILE, FETCHED WHEN CHANGE STAGE IS PRESSED (`React.lazy` in the
 * Stage row): nobody but the crew downloads it.
 */
export function StageDialog({
  slug,
  start,
  onClose,
  onMoved,
}: {
  slug: string;
  start: StageStart;
  onClose: () => void;
  onMoved: (to: ProductStage) => void;
}) {
  const { managing } = useMaker(slug);
  const from = start.stage;
  const [target, setTarget] = React.useState<ProductStage | null>(defaultTarget(from));
  const [values, setValues] = React.useState<StageValues>(() => initialStageValues(start));
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [failed, setFailed] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  // SC-4 — what Orunbase synced: the crew's own read, asked once on open.
  // Fields still empty take the synced value; each field a deploy can fill
  // then says whether it holds it (green) or the crew changed it (amber).
  const [sync, setSync] = React.useState<OrunbaseSync | null>(null);
  const synced = React.useMemo(() => syncedValuesOf(sync), [sync]);
  const dialog = React.useRef<HTMLDivElement | null>(null);
  const titleId = React.useId();
  const now = new Date();

  const fields = target ? stageFormFields(from, target) : [];
  const progress = requiredProgress(fields, values, now);
  const movable = !busy && canMove(from, target, values, now);

  React.useEffect(() => {
    let live = true;
    void (async () => {
      const result = await crewRead<OrunbaseSync>(slug, "orunbase");
      if (!live || !result.ok || !result.data.linked) return;
      setSync(result.data);
      setValues((current) => withSynced(current, syncedValuesOf(result.data)));
    })();
    return () => {
      live = false;
    };
  }, [slug]);

  // In on open, trapped while open, back on close.
  React.useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = dialog.current?.querySelector<HTMLElement>("[data-stage-option][aria-pressed='true']")
      ?? dialog.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const head = items[0]!;
      const tail = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault();
        head.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [onClose]);

  const set = (name: StageFormField["name"], value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    if (errors[name]) setErrors((current) => ({ ...current, [name]: [] }));
  };

  const move = () => {
    if (!movable || target === null) return;
    setBusy(true);
    setFailed(null);
    void (async () => {
      const result = await crewWrite<{ stage: ProductStage }>(slug, "stage", { ...stageRequestOf(target, fields, values) });
      setBusy(false);
      if (!result.ok) {
        setErrors(result.fields);
        // A field's sentence goes under the field; the step itself (`to`)
        // and anything else are said once, beside Move.
        const unplaced = fieldError(result.fields, "to");
        setFailed(unplaced ?? (fields.some((field) => fieldError(result.fields, field.name)) ? null : result.message));
        return;
      }
      onMoved(result.data.stage);
    })();
  };

  // Leaving Manage closes the form round it, and this with it; the guard
  // keeps the dialog the crew's on Manage only, like the rest of the folder.
  if (!managing) return null;
  return createPortal(
    <div
      data-stage-scrim
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 grid place-items-center bg-scrim/45 p-6 max-sm:block max-sm:p-0"
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-stage-dialog
        className="box-border flex max-h-[calc(100dvh-48px)] w-full max-w-[640px] flex-col overflow-hidden rounded-[20px] bg-card ring-1 ring-inset ring-foreground/10 max-sm:h-[100dvh] max-sm:max-h-none max-sm:max-w-none max-sm:rounded-none max-sm:ring-0"
      >
        <div className="flex items-center justify-between gap-3 px-6 pb-2 pt-5 max-sm:px-4 max-sm:pt-4">
          <h2 id={titleId} className="m-0 text-[20px] font-semibold tracking-[-0.01em] text-foreground">
            {CHANGE_STAGE_TITLE}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`grid h-[44px] w-[44px] cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground ${FOCUS}`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pb-5 max-sm:px-4">
          <div role="group" aria-label="Stages" className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
            {stageOptions(from).map((option) => {
              const tone = STAGE_TONE[option.stage];
              const picked = option.stage === target;
              return (
                <button
                  key={option.stage}
                  type="button"
                  data-stage-option={option.stage}
                  aria-pressed={picked}
                  aria-disabled={!option.pickable}
                  onClick={() => {
                    if (!option.pickable) return;
                    setTarget(option.stage);
                    setErrors({});
                    setFailed(null);
                  }}
                  className={`flex min-h-[64px] min-w-0 items-center gap-2.5 rounded-[14px] border-0 px-3 py-2.5 text-left ${picked ? tone.ink : "text-foreground"} ${FOCUS} ${
                    picked
                      ? `${tone.soft} cursor-pointer ring-2 ring-inset ring-current`
                      : option.current
                        ? "cursor-default bg-well ring-1 ring-inset ring-foreground/[0.12]"
                        : option.pickable
                          ? "cursor-pointer bg-well hover:bg-sunken"
                          : "cursor-not-allowed bg-transparent opacity-[0.55]"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full ${
                      picked || option.current ? `${tone.dot} text-card` : "bg-sunken text-muted-foreground"
                    }`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
                      <path d={GLYPH[option.stage]} />
                    </svg>
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[15px] font-semibold text-foreground">{option.label}</span>
                    <span className="text-[13px] text-muted-foreground">{option.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {fields.length > 0 ? (
            <div data-stage-fields className="grid grid-cols-2 gap-x-3 gap-y-4 rounded-[16px] bg-well p-4 max-sm:grid-cols-1 max-sm:p-3">
              {fields.map((field) => (
                <StageField
                  key={`${target}.${field.name}`}
                  field={field}
                  value={values[field.name] ?? ""}
                  onChange={(value) => set(field.name, value)}
                  error={fieldError(errors, field.name) ?? liveFieldError(field, values[field.name] ?? "", now)}
                  sync={syncStateOf(field.name, values[field.name] ?? "", synced, sync, now)}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2.5 border-t border-foreground/[0.06] bg-card px-6 py-4 max-sm:px-4 max-sm:pb-[max(16px,env(safe-area-inset-bottom))]">
          {failed ? (
            <span role="alert" className="mr-auto text-[13px] leading-[1.4] text-destructive">
              {failed}
            </span>
          ) : progress.label ? (
            <span
              data-stage-required
              aria-live="polite"
              className={`mr-auto text-[13px] ${progress.done === progress.total ? "text-success" : "text-muted-foreground"}`}
            >
              {progress.label}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex h-[40px] cursor-pointer items-center rounded-full border-0 bg-transparent px-[18px] text-[15px] font-semibold text-muted-foreground hover:text-foreground max-sm:h-[44px] ${FOCUS}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={move}
            disabled={!movable}
            data-stage-move
            className={`${BTN_INK} cursor-pointer border-0 disabled:cursor-default disabled:bg-border-strong disabled:text-muted-foreground disabled:opacity-100 ${FOCUS}`}
          >
            {moveLabel(from, target)}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** One field of a step: its label with `*` or its hint, the control, and
 *  what is wrong with it. */
function StageField({
  field,
  value,
  onChange,
  error,
  sync = null,
}: {
  field: StageFormField;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  /** SC-4 — the synced value's line, for a field a deploy can fill. */
  sync?: SyncState | null;
}) {
  const id = React.useId();
  const errorId = `${id}-error`;
  const hint = fieldHint(field, value);
  const over = field.max !== undefined && value.length > field.max;
  const head = (
    <span className="flex items-baseline justify-between gap-2.5 text-[13px] font-semibold text-foreground">
      <span>
        {field.label}
        {field.required ? (
          <span aria-hidden="true" className="text-destructive">
            {" "}*
          </span>
        ) : null}
        {field.required ? <span className="sr-only"> (required)</span> : null}
      </span>
      {hint ? <span className={`font-mono text-label font-normal ${over ? "text-destructive" : "text-muted-foreground"}`}>{hint}</span> : null}
    </span>
  );
  const cell = `flex min-w-0 flex-col gap-1.5 ${field.half ? "" : "col-span-2 max-sm:col-span-1"}`;
  const described = error ? { "aria-invalid": true as const, "aria-describedby": errorId } : {};

  if (field.kind === "choice") {
    return (
      <fieldset className={`${cell} m-0 border-0 p-0`}>
        <legend className="mb-1.5 p-0">{head}</legend>
        <div role="radiogroup" className="flex flex-wrap gap-1 rounded-full bg-sunken p-1 max-sm:rounded-[14px]" {...described}>
          {(field.options ?? []).map((option) => (
            <label
              key={option.value}
              className={`inline-flex min-h-[36px] cursor-pointer items-center rounded-full px-3.5 text-[13px] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring max-sm:min-h-[44px] max-sm:flex-auto max-sm:justify-center ${
                value === option.value ? "bg-card font-semibold text-foreground" : "font-medium text-muted-foreground"
              }`}
            >
              <input
                type="radio"
                name={field.name}
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
        {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      </fieldset>
    );
  }

  return (
    <label className={cell}>
      {head}
      {field.kind === "area" ? (
        <textarea
          name={field.name}
          rows={3}
          value={value}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
          className={`${INPUT} resize-y py-2.5 leading-[1.5]`}
          {...described}
        />
      ) : (
        <input
          name={field.name}
          type={field.kind === "link" ? "url" : field.kind === "date" ? "date" : "text"}
          inputMode={field.kind === "link" ? "url" : undefined}
          value={value}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
          className={`${INPUT} h-[44px] ${field.mono ? "font-mono" : ""}`}
          {...described}
        />
      )}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      {sync ? <SyncLine sync={sync} onUseSynced={() => onChange(sync.synced)} /> : null}
    </label>
  );
}

/**
 * SC-4 — the line under a field a deploy can fill (boards `Stage`,
 * `PhoneStage`): green "Synced from Orunbase · …" while it holds the synced
 * value; amber "Changed by you · Orunbase has …" and **Use synced** once the
 * crew changed it. Use synced puts the synced value back, and a Move that
 * sends it stores no value of the crew's own — the page follows the deploys
 * again (core, `handleChangeStage`).
 */
function SyncLine({ sync, onUseSynced }: { sync: SyncState; onUseSynced: () => void }) {
  return (
    <span
      data-sync-line={sync.kind}
      className={`flex min-w-0 items-center gap-1.5 text-[13px] ${sync.kind === "synced" ? "text-success" : "text-amber-ink"}`}
    >
      <span className="min-w-0 flex-1 truncate">{sync.text}</span>
      {sync.kind === "changed" ? (
        <button
          type="button"
          data-use-synced
          onClick={(event) => {
            event.preventDefault();
            onUseSynced();
          }}
          className={`inline-flex min-h-[28px] shrink-0 cursor-pointer items-center border-0 bg-transparent p-0 text-[13px] font-semibold text-amber-ink hover:underline max-sm:min-h-[44px] ${FOCUS}`}
        >
          {USE_SYNCED}
        </button>
      ) : null}
    </span>
  );
}

/** A refusal: the one place the popup is red. */
function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <span id={id} role="alert" className="text-[13px] leading-[1.4] text-destructive">
      {children}
    </span>
  );
}
