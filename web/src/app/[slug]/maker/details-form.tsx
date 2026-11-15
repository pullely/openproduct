"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { BTN_INK, FOCUS } from "../../ui/design";
import { AppLink } from "../../ui/link";

import type { StageStart } from "../where-it-runs";

import { crewWrite, fieldError } from "./act";
import type { Look } from "./details";
import { StageRow } from "./stage-row";
import { TAGLINE_LIMIT, canSaveDetails, manageRoute, moreSettingsLinks, taglineCount } from "./model";
import { rememberTagline, setEditing, useMaker } from "./use-maker";

/**
 * The form "Edit details" opens (boards `Product`, `ProductIdea`), with
 * "More settings" inside it.
 *
 * ITS OWN FILE, FETCHED WHEN THE CREW PRESSES "Edit details"
 * (`details.tsx` imports it with `React.lazy`): a visitor's browser never
 * downloads a form it can never open.
 */
export function DetailsForm({
  slug,
  tagline,
  tryUrl,
  start,
  look,
}: {
  slug: string;
  tagline: string;
  tryUrl: string;
  start: StageStart;
  look: Look;
}) {
  const router = useRouter();
  const [pitch, setPitch] = React.useState(tagline);
  const [address, setAddress] = React.useState(tryUrl);
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [failed, setFailed] = React.useState<string | null>(null);
  const count = taglineCount(pitch);
  const pitchError = fieldError(errors, "tagline");
  const addressError = fieldError(errors, "tryUrl");

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !canSaveDetails(pitch)) return;
    setBusy(true);
    setFailed(null);
    void (async () => {
      const result = await crewWrite<unknown>(slug, "profile", { tagline: pitch.trim(), tryUrl: address.trim() });
      setBusy(false);
      if (!result.ok) {
        setErrors(result.fields);
        // A field error is said under its field; anything else, once.
        setFailed(Object.keys(result.fields).length > 0 ? null : result.message);
        return;
      }
      rememberTagline(slug, pitch.trim());
      setEditing(slug, false);
      router.refresh();
    })();
  };

  return (
    <form
      method="post"
      action={manageRoute(slug, "profile")}
      onSubmit={onSubmit}
      data-edit-details
      className={`flex max-w-[640px] flex-col gap-3 rounded-[16px] p-4 max-sm:p-0 ${look === "idea" ? "bg-card max-sm:bg-transparent" : "bg-well max-sm:bg-transparent"}`}
    >
      <input type="hidden" name="return_to" value={`/${slug}`} />
      <label className="flex flex-col gap-1.5">
        <span className="flex justify-between gap-2.5 text-[13px] font-semibold text-foreground">
          <span>{look === "idea" ? "The idea in one line" : "One-line pitch"}</span>
          <span className={`font-mono text-label font-normal ${count.over ? "text-destructive" : "text-muted-foreground"}`}>
            {count.label}
          </span>
        </span>
        <textarea
          name="tagline"
          rows={2}
          value={pitch}
          onChange={(event) => setPitch(event.target.value)}
          aria-invalid={pitchError !== null || count.over}
          data-limit={TAGLINE_LIMIT}
          className={`box-border w-full resize-y rounded-[14px] border-0 px-3.5 py-2.5 text-nozoom leading-[1.5] text-foreground outline-none ring-1 ring-inset ring-foreground/[0.08] focus:ring-2 focus:ring-ring ${look === "idea" ? "bg-well" : "bg-card max-sm:bg-well"}`}
        />
        {pitchError ? <FieldError>{pitchError}</FieldError> : null}
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-foreground">Stage link</span>
        <input
          name="tryUrl"
          type="url"
          inputMode="url"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          aria-invalid={addressError !== null}
          className={`box-border h-[44px] w-full rounded-[14px] border-0 px-3.5 text-nozoom text-foreground outline-none ring-1 ring-inset ring-foreground/[0.08] focus:ring-2 focus:ring-ring ${look === "idea" ? "bg-well" : "bg-card max-sm:bg-well"}`}
        />
        {addressError ? <FieldError>{addressError}</FieldError> : null}
      </label>
      {/* SC-2 — the Stage row (board `Product`): the badge, what is next,
          and Change stage, which opens the popup. Its own act: it moves the
          stage at once, and Save below saves the fields above it. */}
      <StageRow slug={slug} start={start} look={look} />
      {failed ? <FieldError>{failed}</FieldError> : null}
      <MoreSettings slug={slug} />
      <div className="flex flex-wrap items-center justify-end gap-2 max-sm:grid max-sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setEditing(slug, false)}
          className={`inline-flex h-[40px] cursor-pointer items-center justify-center rounded-full border-0 bg-transparent px-[18px] text-[15px] font-semibold text-muted-foreground hover:text-foreground max-sm:h-[44px] max-sm:bg-foreground/[0.06] max-sm:text-foreground ${FOCUS}`}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !canSaveDetails(pitch)}
          className={`${BTN_INK} cursor-pointer border-0 disabled:cursor-default disabled:bg-border-strong disabled:text-muted-foreground disabled:opacity-100 ${FOCUS}`}
        >
          Save
        </button>
      </div>
    </form>
  );
}

/**
 * "More settings": what this page does not do, and where each is done — the
 * listing's own settings pages (publish and unpublish, the details beyond
 * the pitch, media, topics, the roster, launches, discussions).
 *
 * ONE ENTRY, CLOSED UNTIL PRESSED, inside the form "Edit details" opens. The
 * links are built here, in the crew's own browser, from the ids the overlay
 * answered: the cached page carries no address of a maintainer's surface.
 */
function MoreSettings({ slug }: { slug: string }) {
  const { crew } = useMaker(slug);
  const [open, setOpen] = React.useState(false);
  if (crew === null) return null;
  return (
    <div data-more-settings className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`tap-h inline-flex cursor-pointer items-center gap-1.5 self-start border-0 bg-transparent p-0 text-[13px] font-semibold text-link hover:underline hover:underline-offset-[3px] ${FOCUS}`}
      >
        More settings
      </button>
      {open ? (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {moreSettingsLinks(crew).map((link) => (
            <li key={link.href}>
              <AppLink
                href={link.href}
                className={`inline-flex h-[40px] items-center rounded-full bg-foreground/[0.06] px-4 text-[13px] font-semibold text-copy no-underline hover:bg-foreground/[0.1] max-sm:h-[44px] ${FOCUS}`}
              >
                {link.label}
              </AppLink>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** A refusal: the one place the page is red. */
function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <span role="alert" className="text-[13px] leading-[1.4] text-destructive">
      {children}
    </span>
  );
}
