// The completeness meter (openproduct-worldclass IN3).
//
// IN THE STUDIO, AND NOWHERE ELSE. This is the whole of WC-D's separation: the
// meter is advice to the maker about their own draft, and the eligibility
// floor is the only part that reaches a reader. Nothing computed here is
// projected onto a public surface, and `public-projection.test.ts` asserts
// that a completeness figure appears nowhere in `PublicProfile` — because a
// number about how filled-in somebody's listing is, published beside it,
// becomes a rating of their work the first time anybody sorts by it.
//
// IT SAYS THE QUIET PART. The note under the heading states that filling this
// in changes no ordering, and IN3's done-when requires it: a meter with no
// such line is read as a rating by everybody who sees one, and a maker who
// believes a boost exists will fill fields for the boost rather than for the
// reader. Saying so costs one sentence.
//
// ─── WHY IT IS A LIST AND NOT A BAR ──────────────────────────────────────
//
// A progress bar is a percentage wearing a shape, and WC-E already settled
// what this estate does with a number about somebody's product: "a checklist,
// not a score. There is no number." A bar at 60% says "your product is 60% of
// a product"; four ticks and two gaps say "two fields are empty, here is where
// they live". The second is actionable and the first is a verdict.

import {
  COMPLETENESS_DONE,
  COMPLETENESS_FIELDS,
  COMPLETENESS_HEADING,
  COMPLETENESS_LABEL,
  COMPLETENESS_STEP,
  FLOOR_MET_NOTE,
  FLOOR_NOTE,
  PUBLISH_STEP_LABEL,
  completenessOf,
  formulaHref,
  publishStepHref,
  listingBasePath,
  type CompletenessSubject,
} from "@openproduct/contracts";

import { RAIL_PANEL } from "../../frame";
import { H2 } from "../../../ui/design";
import { AppLink } from "../../../ui/link";

/** Where the step that fills a field lives, so a gap is one click from its fix. */
const STEP_SEGMENT = { details: "details", topics: "topics", people: "people" } as const;

/**
 * The rail's first panel, at the design's measure: the heading and the count
 * on one baseline, the floor's sentence in a soft box, the checklist at
 * 13.5px with a mono tick or dash, and the act the list ends with under a
 * rule.
 */
export function CompletenessPanel({
  org,
  profileId,
  subject,
}: {
  org: string;
  profileId: string;
  subject: CompletenessSubject;
}) {
  const meter = completenessOf(subject);
  const base = listingBasePath(org, profileId);
  const belowFloor = meter.belowFloor.length > 0;

  return (
    <section aria-labelledby="filled-in" className={RAIL_PANEL}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="filled-in" className={H2}>{COMPLETENESS_HEADING}</h2>
        {/* A COUNT, not a percentage and not a bar. See the header. */}
        <span className="font-mono text-[13px] text-muted-foreground">
          {meter.filled.length} of {meter.of} filled in
        </span>
      </div>

      {/* THE FLOOR — the one consequence this panel has, stated where the
          maker can act on it. Rendered in BOTH states deliberately: a note
          that appears only when something is wrong turns its own absence into
          a message a maker has to infer, and the inference they draw from
          silence is rarely the true one. */}
      <p
        className={`m-0 mt-3 rounded-[8px] px-3 py-2 text-[13px] leading-[1.55] ${
          belowFloor ? "bg-warning-soft text-warning-strong" : "bg-muted text-muted-foreground"
        }`}
      >
        {belowFloor ? FLOOR_NOTE : FLOOR_MET_NOTE}{" "}
        {/* OPC-4 — a rule that decides what a reader sees owes a sentence
            they can reach, and so does the maker it is applied to. */}
        <AppLink
          href={formulaHref("catalog.front-page-floor")}
          className="underline underline-offset-[3px]"
        >
          How this is decided
        </AppLink>
      </p>

      {meter.missing.length === 0 ? (
        <p className="m-0 mt-3 text-[13px] text-muted-foreground">{COMPLETENESS_DONE}</p>
      ) : (
        <ul className="m-0 mt-3 grid list-none gap-[7px] p-0">
          {COMPLETENESS_FIELDS.map((field) => {
            const done = meter.filled.includes(field);
            const gate = meter.belowFloor.includes(field);
            return (
              <li key={field} className="flex items-baseline gap-2.5 text-[13.5px]">
                <span
                  aria-hidden="true"
                  className={`shrink-0 font-mono ${done ? "text-foreground" : "text-faint"}`}
                >
                  {done ? "✓" : "—"}
                </span>
                {/* The tick and the dash are for the eye. A screen reader gets
                    the state as a word, because a dash conveys nothing. */}
                <span className="sr-only">{done ? "Filled in:" : "Not filled in:"}</span>
                <span className={done ? "text-muted-foreground" : "text-foreground"}>
                  {done ? (
                    COMPLETENESS_LABEL[field]
                  ) : (
                    <AppLink
                      href={`${base}/${STEP_SEGMENT[COMPLETENESS_STEP[field]]}`}
                      className="underline underline-offset-[3px]"
                    >
                      {COMPLETENESS_LABEL[field]}
                    </AppLink>
                  )}
                  {gate ? (
                    <span className="ml-2 text-[11.5px] text-warning-strong">
                      keeps it off the front page
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* CF5 — THE LIST ENDS WITH THE ACT, rendered in both states. OB6
          changed which act: a build is published, not launched, so the last
          row is the overview's publish panel. The launch scheduler keeps its
          address for anyone holding the link. */}
      <p className="m-0 mt-4 border-t border-line pt-3 text-[13.5px] leading-[1.55]">
        <span aria-hidden="true" className="mr-2.5 font-mono text-faint">
          →
        </span>
        <AppLink
          href={publishStepHref(org, profileId)}
          className="font-medium text-foreground underline underline-offset-[3px]"
        >
          {PUBLISH_STEP_LABEL}
        </AppLink>
      </p>
    </section>
  );
}
