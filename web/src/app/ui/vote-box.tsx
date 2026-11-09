"use client";

import * as React from "react";

import {
  ENDORSEMENT_MEANING,
  ENDORSEMENT_TOTAL_TITLE,
  ENDORSEMENT_UNCOUNTED_TITLE,
  UPVOTED_LABEL,
  UPVOTE_LABEL,
} from "@openproduct/contracts";

import { isEndorsed, useOverlay } from "./use-overlay";
import { useToggle } from "./use-toggle";

/**
 * The vote box (openproduct-launch UV0) — the design's `▲` over a number.
 *
 * ONE CONTROL, THREE SURFACES, at the design's own measurements
 * (`design-reference.md` §4, and the product hero and leaderboard row beside
 * it). The feed row, the product page and the leaderboard all draw this box,
 * and they draw it at the same measurements because it is the same
 * component.
 *
 *   box   58×58, radius 12, `▲` 11px over Geist Mono 14px/500 — the feed row
 *   pill  32px tall, radius 8, `▲` 10px beside Geist Mono 13px — a table row
 *   hero  44px tall, radius 12, `▲` 12px, the word, the count — the product page
 *
 * THE WORD IS `UPVOTE`, THE OBJECT IS AN ENDORSEMENT (R3). The form still
 * posts to `/me/endorse`, the overlay key is still `endorsed`, and the count
 * is still `endorsements.total`. A rename that reached those would have been a
 * migration pretending to be a copy edit. What a reader sees is one act with
 * one word.
 *
 * THE SERVER RENDER IS THE ANONYMOUS ONE (I6) — a plain form with the public
 * count, byte-identical in every visitor's HTML. After hydration the overlay
 * may say this visitor has already upvoted, and only then does the box change.
 * Signed out, the form still posts: the handler bounces through sign-in and
 * returns by fragment, so the intent survives the round trip (XP2).
 *
 * THE BOX IS WHAT CHANGES, exactly as the design draws it: unvoted is the
 * card on a `--border` hairline in `--fg`; voted is `--accent-soft` inside
 * `--accent-line` in `--accent-ink`, mark and number alike. The accent still
 * means endorsement wherever it appears (XP-1) — it is spent here and only
 * here, on the one act that moves a public number.
 *
 * OPC-3 IS STILL LOAD-BEARING. `SaveControl` is the private act — grey, "only
 * you can see this", counted nowhere. This one is public and moves a number
 * that decides what other people see. The title says so in a sentence, because
 * the likeliest failure of this act is somebody pressing it believing it is a
 * bookmark, and the remedy belongs where they are looking.
 */
export function VoteBox({
  slug,
  count,
  returnTo,
  shape = "box",
}: {
  slug: string;
  /**
   * The public count, already discounted. `null` means it was not measured —
   * a launch the sweep has not reached — and the box renders a dash rather
   * than a zero, because those are different claims (OPC-C). A genuine zero
   * DOES render: we counted a complete record and found nobody, which is the
   * one honest zero in this product.
   */
  count: number | null;
  /** Where sign-in returns to. The row passes its own address so a visitor
   *  who upvoted from the feed lands back on the feed, not on the listing. */
  returnTo: string;
  /** Which geometry the design draws here. */
  shape?: "box" | "pill" | "hero" | "tile";
}) {
  const state = useOverlay(React.useMemo(() => [slug], [slug]));
  const voted = isEndorsed(state, slug);
  // OPP2 — the same act, without the page reload. `voted` is what the
  // overlay says NOW, so the act this control performs is its opposite.
  const { delta, pending, onSubmit } = useToggle("endorsed", slug, !voted);
  const target = `${returnTo}#vote-${slug}`;

  // THE DESIGN'S THREE SHAPES. The row's box is 52×52 at a 10px radius with
  // 2px between the mark and the count; the hero is a 36px, 8px-radius
  // button on `--border-strong`; the pill is 32px on `--border`.
  //
  // THE TILE'S BOX (openproduct-calm CL2) is the row's box grown to the
  // tile: 60×64 at a 16px radius, the count at 14.5px/600.
  const geometry =
    shape === "pill"
      ? "inline-flex h-[32px] items-center gap-[6px] rounded-full px-3 text-[13px] tabular-nums"
      : shape === "hero"
        ? "inline-flex h-[36px] items-center gap-2 rounded-full px-4 text-[14px] font-medium active:scale-[0.97]"
        : shape === "tile"
          ? "grid h-[64px] w-[60px] content-center place-items-center gap-[3px] rounded-[16px] p-0 text-[14.5px] font-semibold tabular-nums active:scale-95"
          : "grid h-[52px] w-[52px] content-center place-items-center gap-[2px] rounded-[10px] p-0 active:scale-95";

  return (
    <form
      onSubmit={onSubmit}
      id={`vote-${slug}`}
      method="post"
      className={shape === "pill" ? "shrink-0 justify-self-end" : "shrink-0"}
      action={
        voted
          ? `/me/unendorse?slug=${encodeURIComponent(slug)}&return_to=${encodeURIComponent(target)}`
          : `/me/endorse?slug=${encodeURIComponent(slug)}&return_to=${encodeURIComponent(target)}`
      }
    >
      <button
        type="submit"
        disabled={pending}
        aria-pressed={voted}
        aria-label={`${voted ? UPVOTED_LABEL : UPVOTE_LABEL} ${slug}`}
        title={ENDORSEMENT_MEANING}
        // FR5 — the estate's own focus ring, where the browser's default used
        // to be. See `ui/save-control.tsx` for the argument; the two controls
        // sit beside each other and had the same gap.
        className={`border transition-[transform,background-color,border-color,color] duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${geometry} ${
          voted
            ? "border-endorse-line bg-endorse-soft text-endorse-ink"
            : shape === "hero"
              ? "border-border-strong bg-card text-foreground hover:border-faint"
              : "border-border bg-card text-foreground hover:border-faint"
        }`}
      >
        {/* THE MARK IS THE ACT. It takes the box's own colour in both states,
            as the design draws it — `--fg` at rest, `--accent-ink` once this
            visitor has upvoted. */}
        <svg
          width={shape === "tile" ? 12 : 10}
          height={shape === "tile" ? 12 : 10}
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="shrink-0"
        >
          <path d="M8 4 13 11.5H3z" fill="currentColor" />
        </svg>
        {/* BOTH LABELS, ONE CELL, so the button is the width of the LONGER
            one in either state (openproduct-performance OPP9/OPP12).

            The overlay lands after paint and flips this word — that is OPC-1
            working — and "Upvoted" is wider than "Upvote", so the button grew,
            the hero's action row rewrapped, and everything under it moved. The
            listing measured CLS 0.18 signed in because of these few pixels.

            Stacking them in one grid cell reserves the max by construction,
            which a tuned `min-w` would only approximate and would drift the
            first time the copy changed. The hidden one is `invisible` rather
            than absent: it must still take part in layout, which is the whole
            point, and `aria-hidden` keeps it out of the accessible name. */}
        {shape === "hero" ? (
          <span className="grid">
            <span
              className={`[grid-area:1/1] ${voted ? "" : "invisible"}`}
              aria-hidden={!voted}
            >
              {UPVOTED_LABEL}
            </span>
            <span
              className={`[grid-area:1/1] ${voted ? "invisible" : ""}`}
              aria-hidden={voted}
            >
              {UPVOTE_LABEL}
            </span>
          </span>
        ) : null}
        <span
          className={`tabular-nums ${
            shape === "pill"
              ? "text-[13px]"
              : shape === "hero"
                ? "text-[14px] font-medium"
                : "text-[14px] font-semibold leading-[1.2]"
          }`}
          // VC3 — the dash gets its own sentence. This read `undefined` for
          // exactly the case that needed explaining: a reader met `0` on one
          // row and `—` on the next with nothing anywhere saying they mean
          // different things. `UNCOUNTED_LEGEND` says it again under the list,
          // because a tooltip only reaches somebody who hovers and waits.
          title={count === null ? ENDORSEMENT_UNCOUNTED_TITLE : ENDORSEMENT_TOTAL_TITLE}
        >
          {/* OPP2 — the visitor's own act moves the public number the moment
              they make it. `null` stays `—`: a count that was never measured
              is not a count this visitor can add one to (OPC-C). */}
          {count === null ? (delta > 0 ? delta : "—") : count + delta}
        </span>
      </button>
    </form>
  );
}
