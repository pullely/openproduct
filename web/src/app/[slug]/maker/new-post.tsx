"use client";

import type { ProductPostKind } from "@openproduct/contracts";

import { FOCUS } from "../../ui/design";
import { AppLink } from "../../ui/link";

import { continuePostPath, newPostKinds } from "./model";
import { useMaker } from "./use-maker";

/** Each kind's glyph and tints, as the board draws its pills. */
const KIND_LOOK: Record<ProductPostKind, { d: string; tile: string; ink: string }> = {
  feature: { d: "M5 12l5 5 9-10", tile: "bg-amber-soft", ink: "text-amber-ink" },
  version: { d: "M3 12V4h8l9 9-8 8zM7.5 7.5h.01", tile: "bg-version-soft", ink: "text-version" },
  demo: { d: "M8 5v14l11-7z", tile: "bg-sunken", ink: "text-foreground" },
  idea: {
    d: "M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0012 3z",
    tile: "bg-idea-soft",
    ink: "text-idea",
  },
  seat: {
    d: "M9 11a4 4 0 100-8 4 4 0 000 8zM2 21c1-4 4-6 7-6s6 2 7 6M19 8v6M16 11h6",
    tile: "bg-seat-soft",
    ink: "text-seat-ink",
  },
};

/**
 * "New post" (board `Product`, Updates tab): the row of five kind pills, each
 * to the builder for that kind. On a phone the pills are the board's list of
 * 48px rows.
 *
 * Demo is drawn DISABLED — a pill that is not a link — because a demo is
 * recorded by Orun, not written, and that flow arrives with milestone OPR4.
 *
 * Crew only, on Manage: nothing on the server, nothing for anybody else.
 */
export function NewPostRow({ slug }: { slug: string }) {
  const { managing } = useMaker(slug);
  if (!managing) return null;
  return (
    <section
      id="post"
      aria-label="New post"
      data-new-post
      className="flex scroll-mt-[80px] flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-[16px] border border-border bg-card px-[18px] py-3.5 max-sm:flex-col max-sm:items-stretch max-sm:gap-0.5 max-sm:p-2"
    >
      <h2 className="m-0 text-[15px] font-semibold text-foreground max-sm:px-2 max-sm:py-1.5">New post</h2>
      <div className="flex flex-[1_1_420px] flex-wrap gap-1.5 max-sm:flex-none max-sm:flex-col max-sm:gap-0.5">
        {newPostKinds(slug).map((entry) => {
          const look = KIND_LOOK[entry.kind];
          const inner = (
            <>
              <span className={`grid h-[28px] w-[28px] shrink-0 place-items-center rounded-full max-sm:h-[36px] max-sm:w-[36px] ${look.tile} ${look.ink}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={look.d} />
                </svg>
              </span>
              {entry.label}
            </>
          );
          const shape =
            "inline-flex h-[40px] items-center gap-2 rounded-full bg-well pl-1.5 pr-3.5 text-[13px] font-semibold no-underline max-sm:h-[48px] max-sm:gap-3 max-sm:rounded-[14px] max-sm:bg-transparent max-sm:px-2 max-sm:text-[15px]";
          return entry.href ? (
            <AppLink key={entry.kind} href={entry.href} className={`${shape} text-foreground hover:bg-sunken ${FOCUS}`}>
              {inner}
            </AppLink>
          ) : (
            <span key={entry.kind} aria-disabled="true" data-kind-disabled={entry.kind} className={`${shape} cursor-default text-muted-foreground opacity-60`}>
              {inner}
            </span>
          );
        })}
      </div>
    </section>
  );
}

/**
 * "Edit post" on one of the product's posts: the builder, opened on that
 * post. Crew only, on Manage.
 */
export function EditPostLink({ slug, postId, label = "Edit post" }: { slug: string; postId: string; label?: string }) {
  const { managing } = useMaker(slug);
  if (!managing) return null;
  return (
    <AppLink
      href={continuePostPath(slug, postId)}
      data-edit-post
      className={`tap-h inline-flex items-center font-semibold text-copy no-underline hover:underline hover:underline-offset-[3px] ${FOCUS}`}
    >
      {label}
    </AppLink>
  );
}
