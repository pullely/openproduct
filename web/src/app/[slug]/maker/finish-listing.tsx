"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { facet } from "@openproduct/contracts";

import { BTN_INK, FOCUS } from "../../ui/design";
import { AppLink } from "../../ui/link";

import { crewWrite, fieldError } from "./act";
import { CATEGORY_HINT, FINISH_LABEL, finishPlanOf, stackStepHref, type Facets } from "./model";
import { setEditing, useMaker } from "./use-maker";

/**
 * "Finish your listing" (LR-11) — the crew's own card on the product page.
 *
 * A listing with no pitch or no category is held below the products list's
 * floor, and nothing on the page used to say so: the category sat six steps
 * away (Manage, Edit details, More settings, Topics). This card says it in
 * plain words, sets the category in place, and points each other gap at the
 * one control that fills it. When nothing is missing it is not drawn.
 *
 * CREW ONLY, ON MANAGE, AFTER LOAD. It is fetched through `lazy.tsx`, so a
 * visitor's browser never downloads it; the facts it reads are the public
 * ones the page already drew.
 */
export function FinishListing({
  slug,
  tagline,
  facets,
  stackCount,
}: {
  slug: string;
  tagline: string | null;
  facets: Facets;
  stackCount: number;
}) {
  const router = useRouter();
  const { managing, editing, crew } = useMaker(slug);
  const [category, setCategory] = React.useState("");
  const [savedCategory, setSavedCategory] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!managing || editing || crew === null) return null;
  // The cached page can be a minute behind a save: what was just saved here
  // counts as filled.
  const plan = finishPlanOf({ ...facets, category: facets.category ?? savedCategory, tagline, stackCount });
  if (plan === null) return null;

  const onSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || category === "") return;
    setBusy(true);
    setError(null);
    void (async () => {
      const result = await crewWrite<unknown>(slug, "profile", { category });
      setBusy(false);
      if (!result.ok) {
        setError(fieldError(result.fields, "category") ?? result.message);
        return;
      }
      setSavedCategory(category);
      router.refresh();
    })();
  };

  const title = plan.hidden ? `${slug} is hidden from the products list` : "Finish your listing";
  const lead = plan.missingCategory && plan.missingPitch
    ? "Add a one-line pitch and pick a category to show it."
    : plan.missingCategory
      ? "Pick a category to show it."
      : plan.missingPitch
        ? "Add a one-line pitch to show it."
        : "A few details help people find it.";

  return (
    <section
      aria-label="Finish your listing"
      data-finish-listing
      className="flex flex-col gap-3 rounded-[16px] bg-well p-4 ring-1 ring-inset ring-foreground/[0.08] max-sm:p-3.5"
    >
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-[15px] font-semibold leading-[1.35] text-foreground">{title}</h2>
        <p className="m-0 text-[13px] leading-[1.5] text-muted-foreground">
          {savedCategory && !plan.hidden ? "Saved. It shows on the products list within a minute. " : null}
          {lead}
        </p>
      </div>

      {plan.missingCategory ? (
        <form onSubmit={onSave} className="flex flex-wrap items-start gap-2 max-sm:grid max-sm:grid-cols-[1fr_auto]">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 max-sm:min-w-0">
            <span className="sr-only">Category</span>
            <select
              name="category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              aria-invalid={error !== null}
              className="box-border h-[40px] w-full rounded-full border-0 bg-card px-3.5 text-nozoom text-foreground outline-none ring-1 ring-inset ring-foreground/[0.08] focus:ring-2 focus:ring-ring max-sm:h-[44px]"
            >
              <option value="">Pick a category</option>
              {(facet("category")?.values ?? []).map((value) => (
                <option key={value.value} value={value.value}>
                  {value.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={busy || category === ""}
            className={`${BTN_INK} cursor-pointer border-0 disabled:cursor-default disabled:bg-border-strong disabled:text-muted-foreground disabled:opacity-100 ${FOCUS}`}
          >
            Save
          </button>
          {error ? (
            <span role="alert" className="basis-full text-[13px] leading-[1.4] text-destructive max-sm:col-span-2">
              {error}
            </span>
          ) : (
            <span className="sr-only">{CATEGORY_HINT}</span>
          )}
        </form>
      ) : null}

      {plan.missingPitch || plan.also.length > 0 ? (
        <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-[1.5] text-muted-foreground">
          <span>{plan.missingPitch ? "Missing:" : "Also missing:"}</span>
          {plan.missingPitch ? <FixButton onClick={() => setEditing(slug, true)}>One-line pitch</FixButton> : null}
          {plan.also.map((gap) =>
            gap === "stack" ? (
              <AppLink
                key={gap}
                href={stackStepHref(crew)}
                className={`tap-h font-semibold text-link no-underline hover:underline hover:underline-offset-[3px] ${FOCUS}`}
              >
                {FINISH_LABEL[gap]}
              </AppLink>
            ) : (
              <FixButton key={gap} onClick={() => setEditing(slug, true)}>
                {FINISH_LABEL[gap]}
              </FixButton>
            ),
          )}
        </p>
      ) : null}
    </section>
  );
}

/** A gap Edit details fills: opens it. */
function FixButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tap-h cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-link hover:underline hover:underline-offset-[3px] ${FOCUS}`}
    >
      {children}
    </button>
  );
}
