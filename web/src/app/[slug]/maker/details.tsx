"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { composePostPagePath } from "@openproduct/contracts";

import { BTN_INK, BTN_SOFT, FOCUS } from "../../ui/design";
import { PlusIcon } from "../../ui/icons";
import { AppLink } from "../../ui/link";

import { crewWrite, fieldError } from "./act";
import { TAGLINE_LIMIT, canSaveDetails, manageRoute, taglineCount } from "./model";
import { rememberTagline, setEditing, useMaker } from "./use-maker";

type Look = "shipping" | "idea";

/** The pitch as each page draws it: 18px copy under a shipping product's
 *  name; the serif italic quote on an idea's note. */
const PITCH_CLASS: Record<Look, string> = {
  shipping: "m-0 max-w-[640px] text-card-title font-normal leading-[1.5] text-copy [text-wrap:pretty] max-sm:text-[15px]",
  idea: "m-0 max-w-[760px] font-serif text-title italic leading-[1.3] text-idea-deep [text-wrap:pretty] max-sm:text-card-title max-sm:leading-[1.35]",
};

/**
 * The one-line pitch, and — for the crew, on Manage — the form that edits it
 * in place (boards `Product`, `ProductIdea`: "Edit details").
 *
 * THE SERVER RENDER IS THE PITCH AND NOTHING ELSE. The same paragraph for
 * every visitor; the form exists only in the crew's browser, after the
 * overlay has said who they are and they have pressed "Edit details".
 *
 * WHAT IS EDITED HERE: the one-line pitch (the listing's `tagline`, with its
 * counter and limit) and the "Try it" address. NOT THE NAME. A product's name
 * is its slug, so renaming changes its address and breaks every link to it;
 * that is a deliberate act with its own flow, and this form does not send
 * `slug` at all.
 *
 * Save posts to `POST /{slug}/manage/profile`. A field core refuses is said in
 * red under that field. On success the form closes, the page shows the saved
 * pitch at once (the cached document can be a minute behind) and the router
 * refreshes; the public cache is purged by the gateway.
 */
export function ProductPitch({
  slug,
  tagline,
  tryUrl,
  look,
}: {
  slug: string;
  tagline: string | null;
  tryUrl: string | null;
  look: Look;
}) {
  const { editing, savedTagline } = useMaker(slug);
  // `undefined` is "nothing saved from this page": the document's own value.
  const shown = savedTagline === undefined ? tagline : savedTagline;

  if (editing) {
    return <DetailsForm slug={slug} tagline={shown ?? ""} tryUrl={tryUrl ?? ""} look={look} />;
  }
  if (!shown) return null;
  return (
    <p data-product-pitch className={PITCH_CLASS[look]}>
      {look === "idea" ? `“${shown}”` : shown}
    </p>
  );
}

function DetailsForm({ slug, tagline, tryUrl, look }: { slug: string; tagline: string; tryUrl: string; look: Look }) {
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
        <span className="text-[13px] font-semibold text-foreground">Try it address</span>
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
      {failed ? <FieldError>{failed}</FieldError> : null}
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

/** A refusal: the one place the page is red. */
function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <span role="alert" className="text-[13px] leading-[1.4] text-destructive">
      {children}
    </span>
  );
}

/**
 * The maker's header actions (boards `Product`, `ProductIdea`): "Edit
 * details" opens the form above; "New post" goes to the kind pills on the
 * Updates tab of a shipping product, and straight to the builder on an idea.
 * Crew only, on Manage; hidden while the form is open (it has its own Save
 * and Cancel).
 */
export function MakerHeaderActions({ slug, look }: { slug: string; look: Look }) {
  const { managing, editing } = useMaker(slug);
  if (!managing || editing) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setEditing(slug, true)}
        className={`${BTN_SOFT} cursor-pointer border-0 ${look === "idea" ? "!bg-idea-deep/[0.08] !text-idea-deep" : ""} ${FOCUS}`}
      >
        Edit details
      </button>
      <AppLink
        href={look === "idea" ? composePostPagePath(slug) : `/${slug}#post`}
        className={`${BTN_INK} ${look === "idea" ? "!bg-idea-deep !text-idea-wash" : ""} ${FOCUS}`}
      >
        <PlusIcon className="h-[14px] w-[14px]" />
        New post
      </AppLink>
    </>
  );
}

/**
 * What a visitor is offered and the crew, on Manage, is not: Follow and "Take
 * a seat" on a product you already build. The children are public and are in
 * the server render; this only hides them once the overlay has said "crew"
 * and the switch is on Manage. On "Visitor" they are back.
 */
export function VisitorOnly({ slug, children }: { slug: string; children: React.ReactNode }) {
  const { managing } = useMaker(slug);
  // A fragment, not a wrapper: the children stay direct children of the
  // header's action row, so its grid on a phone counts them as it always did.
  return managing ? null : <>{children}</>;
}
