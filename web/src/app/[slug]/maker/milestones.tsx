"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type { CrewMilestone, CrewProductPost } from "@openproduct/contracts";

import { BTN_INK, BTN_SOFT_SMALL, FOCUS } from "../../ui/design";
import { AppLink } from "../../ui/link";

import { crewRead, crewWrite, fieldError } from "./act";
import { MILESTONE_FIELDS, OFFERED_POST_LABEL, continuePostPath, manageRoute, movedOrder } from "./model";
import { useMaker } from "./use-maker";

type Values = Record<"code" | "title" | "summary", string>;
const EMPTY: Values = { code: "", title: "", summary: "" };

/**
 * Milestones, managed (board `Product`, About tab; design §6.1).
 *
 * CREW ONLY, ON MANAGE. The public list above it is the cached document's;
 * this is the crew's own list, read after load from
 * `GET /{slug}/manage/milestones` (signed in, never cached), because only
 * that read carries the ids the acts are addressed by.
 *
 * What the crew can do here, each through `POST /{slug}/manage/milestones`:
 *
 *   add      code, title, summary — each with the contract's limit
 *   edit     the same three fields
 *   reorder  up and down, one place at a time
 *   delete   after a confirm; it cannot be undone
 *   ship     mark shipped / not shipped. Shipping answers with the draft
 *            Feature shipped post core prepared: "Draft post ready", with a
 *            link to continue it in the builder
 *
 * Every act refreshes the page, so the counts and bars catch up. SC-2: the
 * stage no longer follows the milestones — it moves through Change stage,
 * inside Edit details. An idea's page carries this too (`standalone`): the
 * crew can keep an idea's milestones before it is being built.
 */
export function MilestonesManager({ slug, standalone = false }: { slug: string; standalone?: boolean }) {
  const { managing } = useMaker(slug);
  const router = useRouter();
  const [milestones, setMilestones] = React.useState<CrewMilestone[] | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [failed, setFailed] = React.useState<string | null>(null);
  const [offered, setOffered] = React.useState<CrewProductPost | null>(null);

  const load = React.useCallback(async () => {
    const result = await crewRead<{ milestones?: CrewMilestone[] }>(slug, "milestones");
    if (result.ok && Array.isArray(result.data.milestones)) {
      setMilestones([...result.data.milestones].sort((a, b) => a.position - b.position));
    }
  }, [slug]);

  React.useEffect(() => {
    if (managing) void load();
  }, [managing, load]);

  if (!managing || milestones === null) return null;

  const act = async (fields: Record<string, unknown>, after?: () => void) => {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    setErrors({});
    const result = await crewWrite<{ offeredPost?: CrewProductPost | null }>(slug, "milestones", fields);
    setBusy(false);
    if (!result.ok) {
      setErrors(result.fields);
      setFailed(Object.keys(result.fields).some((name) => MILESTONE_FIELDS.some((field) => field.name === name)) ? null : result.message);
      return;
    }
    if (fields.intent === "ship") setOffered(result.data.offeredPost ?? null);
    after?.();
    await load();
    router.refresh();
  };

  const ids = milestones.map((milestone) => milestone.id);

  return (
    <div
      data-milestones-manager
      // Inside the Milestones card it is a well; on an idea's page, which has
      // no such card yet, it is a card of its own.
      className={`flex flex-col gap-2.5 ${standalone ? "rounded-[16px] bg-card p-[18px] max-sm:p-[14px]" : "rounded-[14px] bg-well p-3"}`}
    >
      <div className="font-mono text-mono-label uppercase text-muted-foreground">Manage milestones</div>
      {offered ? (
        <p role="status" data-offered-post className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-foreground">
          <span className="font-semibold">{OFFERED_POST_LABEL}</span>
          <AppLink href={continuePostPath(slug, offered.id)} className="tap-h font-semibold text-link no-underline hover:underline hover:underline-offset-[3px]">
            Continue
          </AppLink>
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className="m-0 text-[13px] text-destructive">
          {failed}
        </p>
      ) : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {milestones.map((milestone, index) => {
          const shipped = milestone.shippedAt !== null;
          return (
            <li key={milestone.id} className={`flex flex-col gap-2 rounded-[14px] p-3 ${standalone ? "bg-well" : "bg-card"}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="min-w-0 flex-[1_1_200px]">
                  <span className="font-mono text-label text-muted-foreground">{milestone.code}</span>{" "}
                  <span className="break-words text-[15px] font-semibold text-foreground">{milestone.title}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <SmallButton
                    disabled={busy}
                    pressed={shipped}
                    onClick={() => void act({ intent: shipped ? "unship" : "ship", milestone: milestone.id })}
                  >
                    {shipped ? "Mark not shipped" : "Mark shipped"}
                  </SmallButton>
                  <SmallButton
                    disabled={busy || index === 0}
                    label={`Move ${milestone.code} up`}
                    onClick={() => void act({ intent: "reorder", order: movedOrder(ids, milestone.id, -1) })}
                  >
                    <Arrow up />
                  </SmallButton>
                  <SmallButton
                    disabled={busy || index === milestones.length - 1}
                    label={`Move ${milestone.code} down`}
                    onClick={() => void act({ intent: "reorder", order: movedOrder(ids, milestone.id, 1) })}
                  >
                    <Arrow />
                  </SmallButton>
                  <SmallButton disabled={busy} onClick={() => setOpen(open === milestone.id ? null : milestone.id)}>
                    Edit
                  </SmallButton>
                  {confirming === milestone.id ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act({ intent: "delete", milestone: milestone.id }, () => setConfirming(null))}
                        // Red is danger only, and this is the one act here
                        // that cannot be undone.
                        className={`inline-flex h-[40px] cursor-pointer items-center rounded-full border-0 bg-destructive px-4 text-[13px] font-semibold text-destructive-foreground max-sm:h-[44px] ${FOCUS}`}
                      >
                        Delete {milestone.code}
                      </button>
                      <SmallButton disabled={busy} onClick={() => setConfirming(null)}>
                        Keep
                      </SmallButton>
                    </>
                  ) : (
                    <SmallButton disabled={busy} onClick={() => setConfirming(milestone.id)}>
                      Delete
                    </SmallButton>
                  )}
                </span>
              </div>
              {open === milestone.id ? (
                <MilestoneForm
                  slug={slug}
                  returnTo={standalone ? `/${slug}` : `/${slug}/about`}
                  intent="update"
                  milestoneId={milestone.id}
                  initial={{ code: milestone.code, title: milestone.title, summary: milestone.summary ?? "" }}
                  busy={busy}
                  errors={errors}
                  submitLabel="Save"
                  onCancel={() => setOpen(null)}
                  onSubmit={(values) =>
                    void act({ intent: "update", milestone: milestone.id, ...values }, () => setOpen(null))
                  }
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {open === "new" ? (
        <MilestoneForm
          slug={slug}
          returnTo={standalone ? `/${slug}` : `/${slug}/about`}
          intent="create"
          initial={EMPTY}
          busy={busy}
          errors={errors}
          submitLabel="Add milestone"
          onCancel={() => setOpen(null)}
          onSubmit={(values) => void act({ intent: "create", ...values }, () => setOpen(null))}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setErrors({});
            setOpen("new");
          }}
          className={`${BTN_SOFT_SMALL} cursor-pointer self-start border-0 ${FOCUS}`}
        >
          Add a milestone
        </button>
      )}
    </div>
  );
}

/**
 * The milestone form: code, title, summary, each with its limit as the
 * field's `maxLength` and a counter. A real form — it posts to the crew
 * handler and comes back with `?notice=` when scripts are off.
 */
function MilestoneForm({
  slug,
  returnTo,
  intent,
  milestoneId,
  initial,
  busy,
  errors,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  slug: string;
  /** Where a plain form comes back to: the page the manager is on. */
  returnTo: string;
  intent: "create" | "update";
  milestoneId?: string;
  initial: Values;
  busy: boolean;
  errors: Record<string, string[]>;
  submitLabel: string;
  onSubmit: (values: Values) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = React.useState<Values>(initial);
  const complete = MILESTONE_FIELDS.every((field) => !field.required || values[field.name].trim().length > 0);
  return (
    <form
      method="post"
      action={manageRoute(slug, "milestones")}
      data-milestone-form={intent}
      onSubmit={(event) => {
        event.preventDefault();
        if (complete && !busy) onSubmit(values);
      }}
      className="flex flex-col gap-2.5"
    >
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="return_to" value={returnTo} />
      {milestoneId ? <input type="hidden" name="milestone" value={milestoneId} /> : null}
      {MILESTONE_FIELDS.map((field) => {
        const error = fieldError(errors, field.name);
        const value = values[field.name];
        const shared = {
          name: field.name,
          value,
          maxLength: field.max,
          required: field.required,
          "aria-invalid": error !== null,
          onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            setValues({ ...values, [field.name]: event.target.value }),
          className:
            "box-border w-full rounded-[14px] border-0 bg-card px-3.5 text-nozoom text-foreground outline-none ring-1 ring-inset ring-foreground/[0.08] focus:ring-2 focus:ring-ring",
        };
        return (
          <label key={field.name} className="flex flex-col gap-1.5">
            <span className="flex justify-between gap-2.5 text-[13px] font-semibold text-foreground">
              <span>{field.label}</span>
              <span className="font-mono text-label font-normal text-muted-foreground">
                {value.length}/{field.max}
              </span>
            </span>
            {field.name === "summary" ? (
              <textarea rows={2} {...shared} className={`${shared.className} resize-y py-2.5 leading-[1.5]`} />
            ) : (
              <input type="text" {...shared} className={`${shared.className} h-[44px]`} />
            )}
            {error ? (
              <span role="alert" className="text-[13px] leading-[1.4] text-destructive">
                {error}
              </span>
            ) : null}
          </label>
        );
      })}
      <div className="flex flex-wrap justify-end gap-2">
        <SmallButton disabled={busy} onClick={onCancel}>
          Cancel
        </SmallButton>
        <button
          type="submit"
          disabled={busy || !complete}
          className={`${BTN_INK} cursor-pointer border-0 disabled:cursor-default disabled:bg-border-strong disabled:text-muted-foreground disabled:opacity-100 ${FOCUS}`}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function SmallButton({
  children,
  onClick,
  disabled,
  pressed,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      {...(pressed !== undefined ? { "aria-pressed": pressed } : {})}
      {...(label ? { "aria-label": label, title: label } : {})}
      className={`${BTN_SOFT_SMALL} cursor-pointer border-0 disabled:cursor-default disabled:opacity-50 ${FOCUS}`}
    >
      {children}
    </button>
  );
}

function Arrow({ up = false }: { up?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
    </svg>
  );
}
