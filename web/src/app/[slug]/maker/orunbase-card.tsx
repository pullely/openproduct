"use client";

import * as React from "react";

import { MANAGE_ON_ORUNBASE, type OrunbaseCard as OrunbaseCardData } from "@openproduct/contracts";

import { FOCUS, SIDE_CARD, SIDE_ROW, SIDE_TITLE } from "../../ui/design";

import { crewRead } from "./act";
import { ORUNBASE_CARD_TITLE, orunbaseRows, orunbaseSyncLine, showsOrunbaseCard } from "./orunbase-model";
import { useMaker } from "./use-maker";

/**
 * The Orunbase card (openproduct-stages-crew SC-4, design §3.4; board
 * `Product`): at the top of the product page's right rail, for the crew
 * only — in sync and when, how many are on the crew, the last stage and
 * production deploys, and Manage on Orunbase. One sync for the crew and the
 * deploys; the platform pushes on every change and once a day, so there is
 * NO Sync now button (design §3.5).
 *
 * THE CREW'S OWN, READ AFTER LOAD. Nothing here is in the cached page: one
 * signed-in, `no-store` read of `GET /{slug}/manage/orunbase` once the
 * overlay says this visitor is on the crew (any role). A listing with no
 * link grant draws nothing.
 */
export function OrunbaseCard({ slug }: { slug: string }) {
  const { crew, mode } = useMaker(slug);
  const [card, setCard] = React.useState<OrunbaseCardData | null>(null);
  const titleId = React.useId();
  const visible = crew !== null && mode === "manage";

  React.useEffect(() => {
    if (!visible) return;
    let live = true;
    void (async () => {
      const result = await crewRead<OrunbaseCardData>(slug, "orunbase");
      if (live && result.ok) setCard(result.data);
    })();
    return () => {
      live = false;
    };
  }, [visible, slug]);

  if (!visible || !showsOrunbaseCard(card)) return null;
  const now = Date.now();

  return (
    <section aria-labelledby={titleId} data-orunbase-card className={SIDE_CARD}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={titleId} className={SIDE_TITLE}>
          {ORUNBASE_CARD_TITLE}
        </h2>
        <span data-orunbase-sync className="inline-flex items-center gap-1.5 text-[13px] text-success">
          <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-success" />
          {orunbaseSyncLine(card, now)}
        </span>
      </div>
      <div className="grid gap-2.5">
        {orunbaseRows(card, now).map((row) => (
          <div key={row.key} data-orunbase-row={row.key} className={SIDE_ROW}>
            <span className="text-muted-foreground">{row.label}</span>
            <span className="min-w-0 text-right text-foreground">{row.value}</span>
          </div>
        ))}
      </div>
      {card.manageUrl ? (
        <a
          href={card.manageUrl}
          rel="noopener"
          data-orunbase-manage
          className={`tap-h self-start text-[15px] text-link underline-offset-[3px] hover:underline ${FOCUS}`}
        >
          {MANAGE_ON_ORUNBASE}
        </a>
      ) : null}
    </section>
  );
}
