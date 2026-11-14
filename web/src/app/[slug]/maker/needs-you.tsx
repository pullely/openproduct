"use client";

import * as React from "react";

import type { CrewNeedsYou } from "@openproduct/contracts";

import { consoleOrigin } from "@/lib/platform";

import { BTN_SOFT_SMALL, FOCUS } from "../../ui/design";
import { AppLink } from "../../ui/link";

import { crewRead } from "./act";
import {
  NEEDS_YOU_ARIA,
  NEEDS_YOU_LABEL,
  SEAT_REQUEST_ACTION,
  continuePostPath,
  draftLine,
  draftsOf,
  needsYouEmpty,
  seatRequestReviewHref,
  seatRequestText,
  seatRequesterName,
} from "./model";
import { useMaker } from "./use-maker";

/**
 * "Needs you" (boards `Product`, `ProductIdea`): what waits on the crew, one
 * line each, under a lock and a mono label.
 *
 * CREW ONLY, AND READ AFTER LOAD. Nothing is fetched and nothing is drawn
 * until the overlay says this visitor is on the crew and the switch is on
 * Manage; then one signed-in, `no-store` read of
 * `GET /{slug}/manage/needs-you`. The block is absent when nothing waits.
 *
 *   a seat request  the person, the seat, and one link: "Review on Orunbase".
 *                   A request is a join request of the workspace behind the
 *                   listing and is decided in the Orunbase console; this site
 *                   cannot approve or deny one, so it offers no button that
 *                   pretends to.
 *   a draft         "Draft: …" and "Continue", to the builder on that draft.
 *
 * The board's "Demo ready to review" row arrives with demos (OPR4) and its
 * "started a private thread" row with private threads (OPR3).
 */
export function NeedsYou({ slug }: { slug: string }) {
  const { managing } = useMaker(slug);
  const [needsYou, setNeedsYou] = React.useState<CrewNeedsYou | null>(null);

  React.useEffect(() => {
    if (!managing) return;
    let live = true;
    void (async () => {
      const result = await crewRead<{ needsYou?: CrewNeedsYou }>(slug, "needs-you");
      if (live && result.ok && result.data.needsYou) setNeedsYou(result.data.needsYou);
    })();
    return () => {
      live = false;
    };
  }, [managing, slug]);

  if (!managing || needsYouEmpty(needsYou)) return null;
  const origin = consoleOrigin();

  return (
    <section aria-label={NEEDS_YOU_ARIA} data-needs-you className="flex flex-col rounded-[16px] bg-card p-2 max-sm:px-2 max-sm:py-1.5">
      <div className="flex items-center gap-2 px-2.5 pb-2.5 pt-1.5 font-mono text-mono-label uppercase text-muted-foreground max-sm:px-1.5 max-sm:pb-2">
        <LockGlyph />
        {NEEDS_YOU_LABEL}
      </div>
      {(needsYou?.requests ?? []).map((request) => {
        const review = seatRequestReviewHref(origin, request);
        const name = seatRequesterName(request);
        return (
          <div key={request.id} className={ROW}>
            <span className="min-w-0 flex-[1_1_240px] text-[15px] text-foreground max-sm:text-[13px] max-sm:leading-[1.35]">
              {request.requester.handle ? (
                <AppLink href={`/@${request.requester.handle}`} className="tap-h font-semibold text-foreground no-underline hover:underline">
                  {name}
                </AppLink>
              ) : (
                <span className="font-semibold">{name}</span>
              )}{" "}
              {seatRequestText(request)}
            </span>
            {review ? (
              <a href={review} rel="noreferrer noopener" className={`${BTN_SOFT_SMALL} ${FOCUS}`}>
                {SEAT_REQUEST_ACTION}
              </a>
            ) : null}
          </div>
        );
      })}
      {draftsOf(needsYou).map((draft) => (
        <div key={draft.id} className={ROW}>
          <span className="min-w-0 flex-[1_1_240px] break-words text-[15px] text-foreground max-sm:text-[13px] max-sm:leading-[1.35]">
            {draftLine(draft)}
          </span>
          <AppLink href={continuePostPath(slug, draft.id)} className={`${BTN_SOFT_SMALL} ${FOCUS}`}>
            Continue
          </AppLink>
        </div>
      ))}
    </section>
  );
}

/** One line of the block: the sentence, then its one control, under a hairline. */
const ROW = "flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-line px-2.5 py-2 max-sm:px-1.5";

/** The board's lock: this block is the crew's, and nobody else's. */
function LockGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d="M6 11V8a6 6 0 0112 0v3M5 11h14v10H5z" />
    </svg>
  );
}
