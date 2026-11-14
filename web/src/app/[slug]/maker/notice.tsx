"use client";

import * as React from "react";

import { PRODUCT_POST_ID_RE } from "@openproduct/contracts";

import { AppLink } from "../../ui/link";

import { OFFERED_POST_LABEL, continuePostPath } from "./model";
import { useMaker } from "./use-maker";

/**
 * What a crew form said when it came back (openproduct-redesign OPR-3): the
 * `?notice=` or `?error=` the `/{slug}/manage/…` handlers redirect with, as
 * ONE quiet line under the header.
 *
 * The line is a sentence from the handlers' closed vocabulary (`crewNotice`,
 * `crewError`) — the query's own text is never printed. `?offered=<ppo>`
 * (shipping a milestone prepared a draft post) adds "Draft post ready" and
 * the link to continue it.
 *
 * READ FROM THE ADDRESS IN THE BROWSER, never on the server: a page that
 * read its query while rendering could not be cached. And crew only — the
 * line answers an act only the crew can make.
 *
 * The vocabulary is imported WHEN THERE IS SOMETHING TO SAY (`import()`), so
 * the handlers' module is not in the bundle every visitor of a product page
 * downloads.
 */
export function CrewNoticeLine({ slug }: { slug: string }) {
  const { crew } = useMaker(slug);
  const [line, setLine] = React.useState<{ notice: string | null; error: string | null; offered: string | null } | null>(null);
  const isCrew = crew !== null;

  React.useEffect(() => {
    if (!isCrew) return;
    const params = new URLSearchParams(window.location.search);
    const asked = { notice: params.get("notice"), error: params.get("error"), offered: params.get("offered") };
    if (!asked.notice && !asked.error && !asked.offered) return;
    let live = true;
    void import("../../posts/crew-handler").then(({ crewError, crewNotice }) => {
      if (!live) return;
      setLine({
        notice: crewNotice(asked.notice),
        error: crewError(asked.error),
        offered: asked.offered && PRODUCT_POST_ID_RE.test(asked.offered) ? asked.offered : null,
      });
    });
    return () => {
      live = false;
    };
  }, [isCrew]);

  if (!isCrew || line === null) return null;
  const { error, notice, offered } = line;
  if (!error && !notice && !offered) return null;

  return (
    <p
      role={error ? "alert" : "status"}
      data-crew-notice
      className={`m-0 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-[13px] leading-[1.5] ${error ? "text-destructive" : "text-muted-foreground"}`}
    >
      {error ?? notice}
      {offered ? (
        <>
          <span className="font-semibold text-foreground">{OFFERED_POST_LABEL}</span>
          <AppLink href={continuePostPath(slug, offered)} className="tap-h font-semibold text-link no-underline hover:underline hover:underline-offset-[3px]">
            Continue
          </AppLink>
        </>
      ) : null}
    </p>
  );
}
