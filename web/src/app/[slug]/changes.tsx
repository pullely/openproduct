// PV4 — what changed on this listing (openproduct-worldclass).
//
// THE SECTION IS ABSENT WHEN THERE IS NO BASELINE, and that is the whole of
// what makes it honest. A diff computed against nothing renders every field as
// changed: a page announcing that a product rewrote its entire listing on the
// day we happened to start recording. `diffSnapshots` answers `null` for that
// case rather than an empty list, and this component answers nothing at all —
// no heading, no placeholder, no "we have not been watching long enough",
// which would be a sentence about our recording history on a page a reader
// came to for a product (OPC-C).
//
// AN AUTHORED CHANGE AND AN OBSERVED CHANGE DO NOT RENDER ALIKE. This is OPC-2
// applied to time. "The maintainer rewrote the tagline" is somebody's act, and
// the page says so in their voice. "The licence moved from MIT to AGPL-3.0" is
// something we READ, no act of theirs on this site, and it carries the moment
// of the read like every other observation (OPC-7). A section that framed both
// the same way would tell a reader that a product's maintainers changed their
// licence here, which nobody did.
//
// NOTHING HERE IS AN ORDERING INPUT. See `snapshots.ts`: "recently updated" is
// an engagement term wearing a timestamp, there is no comparator for it, and
// no formula id names one.

import { DIFF_HEADING, type Change } from "@openproduct/contracts";

import { SECTION_ATTRIBUTE, SECTION_CARD } from "./sections";

import { H2_SECTION } from "../ui/design";

import { absoluteOf, agoOf } from "../ui/time";

/**
 * The diff, or nothing.
 *
 * `null` is "no earlier snapshot" and renders NOTHING; `[]` is "we compared
 * and nothing moved" and renders the sentence. Collapsing the two would tell
 * a reader a listing is unchanged when nobody has ever looked at it.
 */
export function Changes({
  changes,
  now,
}: {
  changes: readonly Change[] | null;
  /** The server's clock, passed down — a page that read its own would disagree
   *  with itself between the server render and the first client one. */
  now: number;
}) {
  // CP-R3 — a panel only when something changed. Nothing changed is a fact
  // the page states once, in its *Not yet* line; no snapshot is absent.
  if (changes === null || changes.length === 0) return null;
  return (
    <section
      className={SECTION_CARD}
      id="changed"
      aria-labelledby="changed-heading"
      {...{ [SECTION_ATTRIBUTE]: true }}
    >
      <h2
        id="changed-heading"
        tabIndex={-1}
        className={`${H2_SECTION} outline-none`}
      >
        {DIFF_HEADING}
      </h2>
      <ul className="m-0 mt-4 grid list-none gap-2 p-0">
        {changes.map((change) => {
          const observed = change.provenance.class === "observed";
          return (
            <li
              key={change.field}
              className={`rounded-[8px] border px-3.5 py-3 ${
                observed
                  ? // The same dashed frame PV0's observed row uses. A reader
                    // who never learns this estate's vocabulary should still
                    // come away knowing this line was read, not typed.
                    "border-dashed border-border-strong bg-muted"
                  : "border-border bg-card"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-[14.5px] font-semibold text-foreground">{change.label}</span>
                <span className="text-[12.5px] text-muted-foreground">
                  {observed && change.provenance.class === "observed" ? (
                    // OPC-7 — an observation never travels without the
                    // moment of the read that found it.
                    <span title={absoluteOf(change.provenance.observedAt)}>
                      we read this {agoOf(change.provenance.observedAt, now)}
                    </span>
                  ) : (
                    // NO MOMENT, deliberately. We know a maintainer changed
                    // this between two snapshots; a timestamp would be
                    // inventing precision we do not have.
                    "changed by its maintainers"
                  )}
                </span>
              </div>
              <p className="m-0 mt-1.5 flex flex-wrap items-baseline gap-2 text-[14px] leading-[1.5]">
                <span className="font-mono text-[13px] text-muted-foreground line-through decoration-border">
                  {change.from}
                </span>
                {/* The arrow is for the eye; the words are for everyone
                    else. A strikethrough and an arrow convey the direction
                    visually and NOTHING at all to a screen reader, which
                    would hear two values and no relation between them. */}
                <span aria-hidden="true" className="text-faint">
                  →
                </span>
                <span className="sr-only">became</span>
                <span className="font-mono text-[13px] text-foreground">{change.to}</span>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
