import type { PublicProfile } from "@openproduct/contracts";

import { CARD, FOCUS } from "../ui/design";
import { STAGE_TONE } from "../ui/stage-tone";

import { WHERE_IT_RUNS_LABEL, whereItRunsOfProfile, whereItRunsRows } from "./where-it-runs";

/**
 * Where it runs (openproduct-stages-crew SC-2, design §1.5; board
 * `Product`): the strip under the product's header, for everyone — two rows,
 * STAGE and PRODUCTION, each a mono tag in its stage's colour, the address
 * (a link, when there is one) and a quiet line saying what it is and who set
 * it and when. A row with nothing there says so ("Not on stage yet", "Not in
 * production yet") on the sunken ground.
 *
 * A SERVER COMPONENT, the same bytes for every visitor (I6): every word comes
 * off the public document.
 */
export function WhereItRunsStrip({ profile }: { profile: Pick<PublicProfile, "whereItRuns"> }) {
  const rows = whereItRunsRows(whereItRunsOfProfile(profile));
  return (
    <section
      aria-label={WHERE_IT_RUNS_LABEL}
      data-where-it-runs
      className={`${CARD} flex flex-col px-[22px] py-1.5 max-sm:px-[14px]`}
    >
      {rows.map((row, index) => {
        const tone = STAGE_TONE[row.env];
        const live = row.url !== null;
        return (
          <div
            key={row.env}
            data-where-row={row.env}
            className={`flex flex-wrap items-center gap-x-3.5 gap-y-2 py-3 ${index > 0 ? "border-t border-foreground/[0.06]" : ""}`}
          >
            <span
              className={`inline-flex h-[26px] min-w-[120px] shrink-0 items-center gap-1.5 rounded-full px-2.5 font-mono text-mono-label uppercase ${
                live ? `${tone.soft} ${tone.ink}` : "bg-sunken text-muted-foreground"
              }`}
            >
              <span aria-hidden="true" className={`h-[7px] w-[7px] shrink-0 rounded-full ${live ? tone.dot : "bg-border-strong"}`} />
              {row.label}
            </span>
            <span className="flex min-w-0 flex-[1_1_240px] flex-col leading-[1.35]">
              {live ? (
                <a
                  href={row.url!}
                  rel="noreferrer noopener"
                  className={`tap-h flex min-w-0 font-semibold text-foreground no-underline hover:underline hover:underline-offset-[3px] ${FOCUS}`}
                >
                  <span className="truncate">{row.shown}</span>
                </a>
              ) : null}
              <span className="text-[13px] text-muted-foreground">{row.meta}</span>
            </span>
          </div>
        );
      })}
    </section>
  );
}
