"use client";

import * as React from "react";

import { composePostPagePath, productLinksToText, type ProductLink } from "@openproduct/contracts";

import { BTN_INK, BTN_SOFT, FOCUS } from "../../ui/design";
import { PlusIcon } from "../../ui/icons";
import { AppLink } from "../../ui/link";
import type { StageStart } from "../where-it-runs";

import { setEditing, useMaker } from "./use-maker";

/** The form, fetched when it is opened: nobody but the crew can open it. */
const DetailsForm = React.lazy(() => import("./details-form").then((module) => ({ default: module.DetailsForm })));

export type Look = "shipping" | "idea";

/** The pitch as each page draws it: 18px copy under a shipping product's
 *  name; the serif italic quote on an idea's note. */
const PITCH_CLASS: Record<Look, string> = {
  shipping: "m-0 max-w-[640px] text-card-title font-normal leading-[1.5] text-copy [text-wrap:pretty] max-sm:text-[15px]",
  idea: "m-0 font-serif text-title italic leading-[1.3] text-idea-deep [text-wrap:pretty] max-sm:text-card-title max-sm:leading-[1.35]",
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
 * counter and limit), the stage link ("Try it"), and — through the Stage row
 * and its Change stage popup (SC-2) — the stage itself. NOT THE NAME. A product's name
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
  links,
  start,
  look,
}: {
  slug: string;
  tagline: string | null;
  tryUrl: string | null;
  /** LR-8 — the crew's own links, as the page read them. */
  links: readonly ProductLink[];
  /** SC-2 — where the product is, for the Stage row and Change stage. */
  start: StageStart;
  look: Look;
}) {
  const { editing, savedTagline } = useMaker(slug);
  // `undefined` is "nothing saved from this page": the document's own value.
  const shown = savedTagline === undefined ? tagline : savedTagline;

  const pitch = shown ? (
    <p data-product-pitch className={PITCH_CLASS[look]}>
      {look === "idea" ? `“${shown}”` : shown}
    </p>
  ) : null;
  if (editing) {
    // The pitch stays where it is until the form has arrived.
    return (
      <React.Suspense fallback={pitch}>
        <DetailsForm slug={slug} tagline={shown ?? ""} tryUrl={tryUrl ?? ""} links={productLinksToText(links)} start={start} look={look} />
      </React.Suspense>
    );
  }
  return pitch;
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
