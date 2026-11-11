// When a route cannot render (openproduct-commons XP3).
//
// THE RULE IS THAT AN ERROR STATE OFFERS RECOVERY RATHER THAN AN APOLOGY, and
// it is worth being precise about what that rules out, because "Something
// went wrong. Please try again later." passes a casual reading of it and
// helps nobody.
//
// A visitor who hits one of these has ARRIVED SOMEWHERE, and the page owes
// them two things:
//
//   1. WHAT IS TRUE, in their terms. Not "an error occurred" — which they had
//      already worked out — but whether the thing they wanted exists, whether
//      it is theirs, and whether waiting will help. Those lead to different
//      next actions, and a page that collapses them has withheld the only
//      information that mattered.
//
//   2. SOMEWHERE TO GO. At least one route onward that is not a retry,
//      because a retry only helps for one of the three cases above and a page
//      offering nothing else has stranded a visitor on a dead end. Retry is
//      offered too, where retrying could actually work.
//
// AND ONE THING IT MUST NOT DO: apologise at length, or explain the failure
// in our terms. "Our servers are experiencing issues" is a sentence about us
// written for us. The visitor wanted a page.
//
// THE SAME SHAPE SERVES THE STUDIO. A maintainer who cannot load a listing is
// in exactly this position, which is why the studio's stop states are this
// component and not a second one (XP3's frame).

import Link from "next/link";

import type { ReactNode } from "react";

import { BTN_OUTLINE, BTN_PRIMARY, PAGE_NARROW, PAGE_TITLE } from "./design";

/** One way onward. `href` for a place, `onClick` for a retry. */
export interface FailureAction {
  readonly label: string;
  readonly href?: string;
  readonly onClick?: () => void;
}

/**
 * The four failures this product actually has, as copy rather than as codes.
 *
 * WRITTEN AS DATA so that every route says the same thing about the same
 * situation, and so that a reviewer can read all four sentences side by side
 * — which is the only way to notice that two of them are secretly the same
 * failure wearing different words.
 *
 * `retryHelps` is here rather than inferred at the call site because it is a
 * property OF THE FAILURE: waiting cannot conjure a listing that does not
 * exist, and offering a Try again button that provably cannot work is worse
 * than offering none.
 */
export const FAILURES = {
  missing: {
    title: "Not found",
    // Deliberately does not distinguish "no such thing" from "not yours" —
    // the resource-hiding 404. Telling somebody a listing exists but is not
    // theirs answers a question they were not entitled to ask.
    what: "There is nothing here. It may have been removed, or the address may be wrong.",
    retryHelps: false,
  },
  unavailable: {
    title: "Temporarily unavailable",
    // The honest one: it exists, it is not you, and waiting is the remedy.
    what: "This could not be loaded right now. It is not something you did, and trying again in a moment usually works.",
    retryHelps: true,
  },
  broken: {
    title: "Something failed here",
    // An unexpected throw. We do not know what it was, so we do not pretend
    // to — but we do know the two things a visitor can do about it.
    what: "This page stopped part way through. Reloading it may be enough; if it is not, the rest of the site is unaffected.",
    retryHelps: true,
  },
  signedOut: {
    title: "You are signed out",
    what: "This page is yours, and we need to know who you are before we can show it.",
    retryHelps: false,
  },
} as const;

export type FailureKind = keyof typeof FAILURES;

/**
 * The rendered stop.
 *
 * `actions` is required and must not be empty — a failure page with no way
 * onward is the dead end this component exists to prevent, and making the
 * prop required means the compiler asks for one.
 */
export function FailurePanel({
  kind,
  what,
  actions,
  detail,
}: {
  kind: FailureKind;
  /** Overrides the standard sentence where a route can say something truer. */
  what?: string | undefined;
  actions: readonly FailureAction[];
  /** Anything the route wants beneath the actions — rarely used. */
  detail?: ReactNode | undefined;
}) {
  const failure = FAILURES[kind];
  return (
    <main className={`${PAGE_NARROW} pt-16`}>
      <h1 className={PAGE_TITLE}>{failure.title}</h1>
      <p className="m-0 mt-3 max-w-[62ch] text-[16px] leading-[1.55] text-copy">
        {what ?? failure.what}
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-2.5">
        {actions.map((action, i) =>
          action.href ? (
            <Link
              key={action.label}
              href={action.href}
              className={`${i === 0 ? BTN_PRIMARY : BTN_OUTLINE} no-underline`}
            >
              {action.label}
            </Link>
          ) : (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className={i === 0 ? BTN_PRIMARY : BTN_OUTLINE}
            >
              {action.label}
            </button>
          ),
        )}
      </div>
      {detail ? <div className="mt-6">{detail}</div> : null}
    </main>
  );
}

/**
 * The ways onward every public route can offer, because they always exist.
 *
 * Exported so a route adds its OWN best next step to the front rather than
 * rewriting the tail — the nearest useful place first, the whole product
 * behind it.
 *
 * EVERY HREF HERE IS A ROUTE THAT EXISTS, and that is not a truism on a
 * failure page: `/list` reads like the directory's address and is a 404 (the
 * directory is the home page). A dead link is bad anywhere and worst here,
 * where somebody has already hit one wall — a test walks these.
 */
export const PUBLIC_WAYS_ONWARD: readonly FailureAction[] = [
  { label: "Browse products", href: "/" },
];
