"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type { RoleOpeningWriteAnswer } from "@openproduct/contracts";

import { BTN_INK, BTN_SOFT_SMALL, FOCUS, SIDE_TITLE } from "../../ui/design";
import { AppLink } from "../../ui/link";

import { crewWrite, fieldError } from "./act";
import {
  OFFERED_POST_LABEL,
  SEAT_FIELDS,
  canSaveSeat,
  continuePostPath,
  manageRoute,
  seatFormPath,
  seatValuesOf,
  type SeatValues,
} from "./model";
import { AddSeatLink, type SeatOnPage } from "./seats";
import { NEW_SEAT, setSeatForm, useMaker } from "./use-maker";

// The seat form and the crew's own seats card (openproduct-redesign OPR-3).
//
// ITS OWN FILE, FETCHED FOR THE CREW ONLY: `seats.tsx` holds the gates
// (`SeatFormSlot`, `SeatsStarter`) every visitor's bundle carries, and each
// loads this with `React.lazy` once the overlay has said "crew" and the
// switch is on Manage.

type Done =
  | { kind: "added"; title: string; offered: string | null }
  | { kind: "saved"; title: string }
  | { kind: "closed"; title: string }
  | { kind: "removed"; title: string };

const DONE_WORDS: Record<Done["kind"], string> = {
  added: "Seat added",
  saved: "Seat saved",
  closed: "Seat closed",
  removed: "Seat removed",
};

/**
 * Where a seat's form opens: under the seat's own row (`seat`), or at the end
 * of the card for a new one (`seat` null). Crew only, on Manage; nothing on
 * the server and nothing for anybody else.
 *
 * WHAT THE CREW CAN DO, each through `POST /{slug}/manage/seats`:
 *
 *   add     a role, what they'd do, the time — and core prepares the seat's
 *           Help wanted post as a draft: "Draft post ready", with the link
 *           to continue it in the builder
 *   edit    the same three fields
 *   close   the seat stops being open (it leaves the page; its requests stay)
 *   delete  after a confirm; it cannot be undone
 *
 * The seats themselves are the cached page's, which can be a minute behind a
 * write; what was just done is said here, in one line, until it catches up.
 */
export function SeatFormSlotBody({ slug, seat, idea = false }: { slug: string; seat: SeatOnPage | null; idea?: boolean }) {
  const { managing, seatForm } = useMaker(slug);
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [failed, setFailed] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<Done | null>(null);

  if (!managing) return null;
  const target = seat ? seat.id : NEW_SEAT;
  const open = seatForm === target;

  const act = async (fields: Record<string, unknown>, said: (answer: RoleOpeningWriteAnswer | { deleted: boolean }) => Done) => {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    setErrors({});
    const result = await crewWrite<RoleOpeningWriteAnswer | { deleted: boolean }>(slug, "seats", fields);
    setBusy(false);
    if (!result.ok) {
      setErrors(result.fields);
      setFailed(Object.keys(result.fields).some((name) => SEAT_FIELDS.some((field) => field.name === name)) ? null : result.message);
      return;
    }
    setDone(said(result.data));
    setConfirming(false);
    setSeatForm(slug, null);
    router.refresh();
  };

  return (
    <>
      {done ? (
        <p
          role="status"
          data-seat-done={done.kind}
          className="m-0 flex basis-full flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground"
        >
          <span>
            {DONE_WORDS[done.kind]}: <span className="font-semibold text-foreground">{done.title}</span>
          </span>
          {done.kind === "added" && done.offered ? (
            <span data-offered-post className="inline-flex flex-wrap items-center gap-x-3">
              <span className="font-semibold text-foreground">{OFFERED_POST_LABEL}</span>
              <AppLink
                href={continuePostPath(slug, done.offered)}
                className="tap-h inline-flex items-center font-semibold text-link no-underline hover:underline hover:underline-offset-[3px]"
              >
                Continue
              </AppLink>
            </span>
          ) : null}
        </p>
      ) : null}
      {open ? (
        <SeatForm
          slug={slug}
          seat={seat}
          returnTo={seatFormPath(slug, idea)}
          busy={busy}
          errors={errors}
          failed={failed}
          confirming={confirming}
          onCancel={() => {
            setConfirming(false);
            setSeatForm(slug, null);
          }}
          onSave={(values) =>
            void act(
              seat
                ? { intent: "update", seat: seat.id, ...trimmed(values), status: "open" }
                : { intent: "create", ...trimmed(values) },
              (answer) =>
                seat
                  ? { kind: "saved", title: values.title.trim() }
                  : { kind: "added", title: values.title.trim(), offered: "offeredPostId" in answer ? answer.offeredPostId : null },
            )
          }
          onClose={(values) =>
            seat
              ? void act({ intent: "update", seat: seat.id, ...trimmed(values), status: "closed" }, () => ({
                  kind: "closed",
                  title: seat.title,
                }))
              : undefined
          }
          onAskDelete={() => setConfirming(true)}
          onKeep={() => setConfirming(false)}
          onDelete={() =>
            seat ? void act({ intent: "delete", seat: seat.id }, () => ({ kind: "removed", title: seat.title })) : undefined
          }
        />
      ) : null}
    </>
  );
}

function trimmed(values: SeatValues): SeatValues {
  return { title: values.title.trim(), description: values.description.trim(), commitment: values.commitment.trim() };
}

/**
 * The seat form: a role, what they'd do, the time — each with its limit as
 * the field's `maxLength` and a counter. A real form: it posts to the crew
 * handler and comes back with `?notice=` when scripts are off.
 */
function SeatForm({
  slug,
  seat,
  returnTo,
  busy,
  errors,
  failed,
  confirming,
  onSave,
  onClose,
  onAskDelete,
  onKeep,
  onDelete,
  onCancel,
}: {
  slug: string;
  seat: SeatOnPage | null;
  returnTo: string;
  busy: boolean;
  errors: Record<string, string[]>;
  failed: string | null;
  confirming: boolean;
  onSave: (values: SeatValues) => void;
  onClose: (values: SeatValues) => void;
  onAskDelete: () => void;
  onKeep: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [values, setValues] = React.useState<SeatValues>(() => seatValuesOf(seat));
  const ready = canSaveSeat(values);
  return (
    <form
      method="post"
      action={manageRoute(slug, "seats")}
      data-seat-form={seat ? "update" : "create"}
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !busy) onSave(values);
      }}
      className="flex basis-full flex-col gap-2.5 rounded-[14px] bg-card p-3"
    >
      <input type="hidden" name="intent" value={seat ? "update" : "create"} />
      <input type="hidden" name="return_to" value={returnTo} />
      {seat ? <input type="hidden" name="seat" value={seat.id} /> : null}
      {SEAT_FIELDS.map((field) => {
        const error = fieldError(errors, field.name);
        const value = values[field.name];
        const over = value.length > field.max;
        const shared = {
          name: field.name,
          value,
          required: field.required,
          "aria-invalid": error !== null || over,
          onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            setValues({ ...values, [field.name]: event.target.value }),
          className:
            "box-border w-full rounded-[14px] border-0 bg-well px-3.5 text-nozoom text-foreground outline-none ring-1 ring-inset ring-foreground/[0.08] focus:ring-2 focus:ring-ring",
        };
        return (
          <label key={field.name} className="flex flex-col gap-1.5">
            <span className="flex justify-between gap-2.5 text-[13px] font-semibold text-foreground">
              <span>{field.label}</span>
              <span className={`font-mono text-label font-normal ${over ? "text-destructive" : "text-muted-foreground"}`}>
                {value.length}/{field.max}
              </span>
            </span>
            {field.name === "description" ? (
              <textarea rows={3} {...shared} className={`${shared.className} resize-y py-2.5 leading-[1.5]`} />
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
      {failed ? (
        <p role="alert" className="m-0 text-[13px] text-destructive">
          {failed}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          {seat ? (
            confirming ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onDelete}
                  // Red is danger only: this cannot be undone.
                  className={`inline-flex h-[40px] cursor-pointer items-center rounded-full border-0 bg-destructive px-4 text-[13px] font-semibold text-destructive-foreground max-sm:h-[44px] ${FOCUS}`}
                >
                  Delete seat
                </button>
                <SmallButton disabled={busy} onClick={onKeep}>
                  Keep
                </SmallButton>
              </>
            ) : (
              <>
                <SmallButton disabled={busy} onClick={() => onClose(values)}>
                  Close seat
                </SmallButton>
                <SmallButton disabled={busy} onClick={onAskDelete}>
                  Delete
                </SmallButton>
              </>
            )
          ) : null}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <SmallButton disabled={busy} onClick={onCancel}>
            Cancel
          </SmallButton>
          <button
            type="submit"
            disabled={busy || !ready}
            className={`${BTN_INK} cursor-pointer border-0 disabled:cursor-default disabled:bg-border-strong disabled:text-muted-foreground disabled:opacity-100 ${FOCUS}`}
          >
            {seat ? "Save" : "Add seat"}
          </button>
        </span>
      </div>
    </form>
  );
}

function SmallButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${BTN_SOFT_SMALL} cursor-pointer border-0 disabled:cursor-default disabled:opacity-50 ${FOCUS}`}
    >
      {children}
    </button>
  );
}

/**
 * The seats card for a page that has no open seat to show (an idea's page,
 * where the public card is absent): the head and "Add a seat", and the form.
 * Crew only, on Manage — a visitor's page has no card where nothing is open.
 */
export function SeatsStarterBody({ slug }: { slug: string }) {
  const { managing } = useMaker(slug);
  if (!managing) return null;
  return (
    <section
      id="people-wanted"
      aria-labelledby="seats-heading"
      data-seats-starter
      className="flex scroll-mt-[80px] flex-col gap-3 rounded-[16px] bg-card p-[18px] max-sm:gap-2.5 max-sm:p-[14px]"
    >
      <div className="flex items-center justify-between gap-2.5">
        <h2 id="seats-heading" className={SIDE_TITLE}>
          Open seats
        </h2>
        <AddSeatLink slug={slug} />
      </div>
      <div className="flex flex-col gap-2.5 rounded-[14px] bg-well p-0 empty:hidden">
        <SeatFormSlotBody slug={slug} seat={null} idea />
      </div>
    </section>
  );
}
