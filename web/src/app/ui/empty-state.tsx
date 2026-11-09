import * as React from "react";

/**
 * An empty state: the fact, then the reasoning if you want it
 * (openproduct-worldclass VC0).
 *
 * ─── THE FINDING THIS ANSWERS ─────────────────────────────────────────────
 *
 * The 7 Sep audit's P1·10: *"Nearly every empty state is an essay."* Four of
 * them opened with a fact and then spent a second sentence — sometimes
 * twenty-five words — defending the methodology behind it.
 *
 * The audit is careful about what is wrong with that, and it is worth
 * repeating because it is easy to over-correct: *"The voice is distinctive and
 * I would not flatten it, but an SRE scanning for 'what launched in
 * observability this week' will not read it."* **The register is right and the
 * density is wrong.** The reasoning is good writing and it is in front of
 * somebody who did not ask.
 *
 * So nothing here is deleted. The fact goes first at one sentence, and the
 * reasoning moves behind a disclosure — still on the page, still in the same
 * voice, one click away from the reader who wants it and out of the way of the
 * reader who does not. A test asserts the reasoning still exists, because the
 * failure mode of a density pass is losing the thing that made the product
 * sound like a person.
 *
 * ─── `<details>` RATHER THAN STATE ────────────────────────────────────────
 *
 * No `useState`, no client component. `<details>` is keyboard-operable, works
 * with JavaScript off, is announced correctly by screen readers, and is
 * findable by the browser's own in-page search when closed (`hidden until
 * found` behaviour in modern engines). A hand-rolled toggle would be three of
 * those things on a good day, and this page is one that renders for a crawler
 * as often as for a person.
 */
export function EmptyState({
  says,
  why,
  action,
  className = "",
}: {
  /** The fact. One sentence — `empty-states.test.ts` holds it to that. */
  says: string;
  /** The reasoning, behind the disclosure. */
  why?: string;
  /** The one thing to do about it, where there is one. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="m-0 text-[15px] leading-[1.55] text-copy">{says}</p>
      {action ? <p className="m-0 mt-3 text-[14px]">{action}</p> : null}
      <details className="group mt-3">
        <summary className="cursor-pointer list-none text-[13px] text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          Why?
        </summary>
        <p className="m-0 mt-2 max-w-[58ch] text-[13.5px] leading-[1.55] text-muted-foreground">
          {why ?? null}
        </p>
      </details>
    </div>
  );
}
