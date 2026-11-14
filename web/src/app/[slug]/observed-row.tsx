// PV0 — what we read from the repository (openproduct-worldclass).
//
// THE FRAME IS THE MILESTONE. These four values were already on the page —
// well, one of them was — sitting in a list beside Category and Hosting,
// which a maintainer chose. A licence and a category rendered the same way
// are a page saying "these are equally our word for it", and they are not:
// one was read and one was answered.
//
// SO THIS IS ITS OWN HALF OF THE PANEL, under its own heading. `Repository`
// says where the values came from, the moment they were read sits beside it,
// the provenance sentence rides on the heading, and every line links the rule
// that produced it; what happened on this site is a separate list under a
// separate heading. A reader who never learns this estate's vocabulary should
// still come away knowing these four were not typed by the person whose
// product this is.

import {
  OBSERVED_FRAME_HEADING,
  OBSERVED_FRAME_NOTE,
  SIGNAL_WITHDRAWN_NOTE,
  formulaHref,
  observedSentence,
  type ObservedSignal,
} from "@openproduct/contracts";

import { DASH } from "../ui/bits";
import { H3 } from "../ui/design";
import { AppLink } from "../ui/link";
import { absoluteOf, agoOf } from "../ui/time";
import { CodeIcon } from "../ui/icons";

/**
 * The row, or nothing.
 *
 * NOTHING IS A REAL ANSWER (`observedRow` returns an empty list for a listing
 * whose repository has never been read). Four dashes would say "we looked and
 * found nothing", which is a different and false statement.
 */
export function ObservedRow({
  signals,
  now,
}: {
  signals: readonly ObservedSignal[];
  /** The server's clock, passed down. A page that read its own would disagree
   *  with itself between the server render and the first client one. */
  now: number;
}) {
  if (signals.length === 0) return null;
  // Every signal in the row came from ONE read, so the moment belongs to the
  // frame rather than to each line — and a withdrawn row is withdrawn whole.
  const observedAt = signals[0]!.observedAt;
  const withdrawn = signals[0]!.withdrawn;
  // THE FRAME IS THE PANEL'S HEAD: the design draws `Repository` with the
  // moment of the read beside it and the provenance sentence as its title,
  // then the four rows under `--line` rules. The page wraps this in the rail
  // panel and puts `On openproduct` — what happened HERE — under it, so the
  // two halves sit apart even though they share a card.
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {/* OB5 — *Code*, with the site's glyph for the public repository. */}
        <h3 id="observed" title={OBSERVED_FRAME_NOTE} className={`${H3} flex items-center gap-1.5`}>
          <CodeIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          {OBSERVED_FRAME_HEADING}
        </h3>
        {/* VC6's one convention: relative under a week with the absolute in
            `title`, absolute beyond. The moment is not decoration — it is
            what makes the four values observations rather than assertions. */}
        <span className="whitespace-nowrap text-[13px] text-muted-foreground" title={absoluteOf(observedAt)}>
          Read {agoOf(observedAt, now)}
        </span>
      </div>
      {withdrawn ? (
        // WITHDRAWN, NOT REMOVED. A signal that vanished at the horizon would
        // be indistinguishable from one never observed, and the reader would
        // have no way to know the sweep had stopped.
        <p className="m-0 mb-2 mt-1 max-w-[70ch] rounded-[14px] bg-warning-soft px-2.5 py-1.5 text-[13px] leading-[1.5] text-warning-strong">
          {SIGNAL_WITHDRAWN_NOTE}
        </p>
      ) : null}
      <dl className="m-0 grid">
        {signals.map((signal) => (
          <div
            key={signal.id}
            className="flex items-baseline justify-between gap-3 border-t border-line py-[9px]"
          >
            <dt className="text-[13px] text-muted-foreground">
              {/* OPC-4 — a derived value owes a sentence a reader can reach,
                  and the label IS the link rather than a `?` beside it: there
                  are four of these and four question marks would be furniture. */}
              <AppLink
                href={formulaHref(signal.formula)}
                title={observedSentence(signal.id)}
                className="tap-h underline decoration-transparent underline-offset-[3px] hover:text-foreground hover:decoration-inherit focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {signal.label}
              </AppLink>
            </dt>
            <dd
              className={`m-0 text-right text-[13px] tabular-nums ${
                withdrawn ? "text-faint line-through" : "text-foreground"
              }`}
            >
              {signal.value === null ? (
                // Read, and it answered nothing. Never a zero (OPC-C).
                <span className="text-faint">{DASH}</span>
              ) : signal.id === "lastCommit" ? (
                <span title={absoluteOf(signal.value)}>{agoOf(signal.value, now)}</span>
              ) : (
                signal.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
