"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { PRODUCT_LINKS_HINT, facet } from "@openproduct/contracts";

import { BTN_INK, FOCUS } from "../../ui/design";

import type { StageStart } from "../where-it-runs";

import { crewWrite, fieldError } from "./act";
import type { Look } from "./details";
import { StageRow } from "./stage-row";
import { CATEGORY_HINT, FACET_FIELDS, TAGLINE_LIMIT, canSaveDetails, manageRoute, taglineCount, type Facets } from "./model";
import { rememberTagline, setEditing, useMaker } from "./use-maker";

/**
 * The form "Edit details" opens (boards `Product`, `ProductIdea`), with
 * the category, pricing and hosting beside it (LR-11).
 *
 * ITS OWN FILE, FETCHED WHEN THE CREW PRESSES "Edit details"
 * (`details.tsx` imports it with `React.lazy`): a visitor's browser never
 * downloads a form it can never open.
 */
export function DetailsForm({
  slug,
  tagline,
  tryUrl,
  links,
  start,
  look,
  facets,
}: {
  slug: string;
  tagline: string;
  tryUrl: string;
  /** LR-8 — the crew's own links, one `Label | address` per line. */
  links: string;
  start: StageStart;
  look: Look;
  /** LR-11 — the listing's category, hosting and pricing, as the page read them. */
  facets: Facets;
}) {
  const router = useRouter();
  const [picked, setPicked] = React.useState<Facets>(facets);
  const { managing } = useMaker(slug);
  const [pitch, setPitch] = React.useState(tagline);
  const [address, setAddress] = React.useState(tryUrl);
  const [linkLines, setLinkLines] = React.useState(links);
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [failed, setFailed] = React.useState<string | null>(null);
  const count = taglineCount(pitch);
  const pitchError = fieldError(errors, "tagline");
  const addressError = fieldError(errors, "tryUrl");
  const linksError = fieldError(errors, "links");

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !canSaveDetails(pitch)) return;
    setBusy(true);
    setFailed(null);
    void (async () => {
      const result = await crewWrite<unknown>(slug, "profile", {
        tagline: pitch.trim(),
        tryUrl: address.trim(),
        links: linkLines,
        category: picked.category ?? "",
        hosting: picked.hosting ?? "",
        pricing: picked.pricing ?? "",
      });
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

  // The crew's, on Manage, like every maker element (`editing` already
  // implies it; said here so the form holds its own gate).
  if (!managing) return null;

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
      {/* LR-8 — any link (openproduct-left-rail): docs, a demo, a changelog.
          One per line; they show as tiles in the header card, after where
          the product runs. An emptied box clears them. */}
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-foreground">Links</span>
        <textarea
          name="links"
          rows={3}
          value={linkLines}
          onChange={(event) => setLinkLines(event.target.value)}
          aria-invalid={linksError !== null}
          placeholder="Docs | https://docs.example.com"
          className={`box-border w-full resize-y rounded-[14px] border-0 px-3.5 py-2.5 text-nozoom leading-[1.5] text-foreground outline-none ring-1 ring-inset ring-foreground/[0.08] placeholder:text-muted-foreground focus:ring-2 focus:ring-ring ${look === "idea" ? "bg-well" : "bg-card max-sm:bg-well"}`}
        />
        <span className="text-[13px] text-muted-foreground">{PRODUCT_LINKS_HINT}</span>
        {linksError ? <FieldError>{linksError}</FieldError> : null}
      </label>
      {/* LR-11 — the three facets, so the category that puts a listing on
          the products list is set where a crew edits everything else. */}
      <div className="grid grid-cols-3 gap-2.5 max-sm:grid-cols-1">
        {FACET_FIELDS.map(([facetId, label]) => {
          const error = fieldError(errors, facetId);
          return (
            <label key={facetId} className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-foreground">{label}</span>
              <select
                name={facetId}
                value={picked[facetId] ?? ""}
                onChange={(event) => setPicked({ ...picked, [facetId]: event.target.value || null })}
                aria-invalid={error !== null}
                className={`box-border h-[44px] w-full rounded-[14px] border-0 px-3 text-nozoom text-foreground outline-none ring-1 ring-inset ring-foreground/[0.08] focus:ring-2 focus:ring-ring ${look === "idea" ? "bg-well" : "bg-card max-sm:bg-well"}`}
              >
                <option value="">Not stated</option>
                {(facet(facetId)?.values ?? []).map((value) => (
                  <option key={value.value} value={value.value}>
                    {value.label}
                  </option>
                ))}
              </select>
              {facetId === "category" && !picked.category ? (
                <span className="text-[13px] text-muted-foreground">{CATEGORY_HINT}</span>
              ) : null}
              {error ? <FieldError>{error}</FieldError> : null}
            </label>
          );
        })}
      </div>
      {/* SC-2 — the Stage row (board `Product`): the badge, what is next,
          and Change stage, which opens the popup. Its own act: it moves the
          stage at once, and Save below saves the fields above it. */}
      <StageRow slug={slug} start={start} look={look} />
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
