import type { Metadata } from "next";

import {
  DEPLOY_LAG,
  DEPLOY_UNVERIFIED,
  PHASE_RUNBOOK,
  REFIRE_HOW,
  RUNBOOK,
  RUNBOOK_INTRO,
  RUNBOOK_TITLE,
  SWEEP_PHASES,
  SWEEP_PHASE_COPY,
  phaseRunbookAnchor,
  sweepStaleAfterCopy,
} from "@openproduct/contracts";

import { PAGE_NARROW, PAGE_TITLE } from "../../ui/design";
import {
  DOC_ARTICLE,
  DOC_ARTICLES,
  DOC_ARTICLE_H,
  DOC_ARTICLE_META,
  DOC_ARTICLE_TITLE,
  DOC_BODY,
  DOC_FIELD_BODY,
  DOC_FIELD_LABEL,
  DOC_H2,
  DOC_LEDE,
  DOC_SECTIONS,
  DocsTabs,
} from "../docs-nav";

/**
 * The runbook (openproduct-operations OO4).
 *
 * ONE PAGE PER DEGRADED STATE, READ FROM THE ALERT. Every article here has
 * the id an alert line names — `RUNBOOK`'s anchors for the three promises,
 * `phase-<name>` for each sweep phase, `deploy-lags-main` for the one RS4
 * proved was needed — and the ids come from the contract, never typed here,
 * so an alert cannot point at a page that is not on this document (OO-D).
 *
 * Static: nothing reads a clock or a database. What the page SAYS can go
 * stale the way any prose can; that its anchors EXIST is held by a test.
 */
export const revalidate = 600;

export const metadata: Metadata = {
  title: RUNBOOK_TITLE,
  description: RUNBOOK_INTRO,
  alternates: { canonical: "/docs/runbook" },
};

/** A numbered list of steps: 14.5px/1.6, 4px apart. */
const STEPS = "m-0 mt-3 list-decimal pl-5";
const STEP = "max-w-[70ch] py-1 text-[14.5px] leading-[1.6] text-foreground";

function Route({ path }: { path: string | null }) {
  return path ? (
    <code className="font-mono text-[13px] text-foreground">{path}</code>
  ) : (
    <span className="text-muted-foreground">Nothing to re-fire — the cause is not a schedule.</span>
  );
}

export default function RunbookPage() {
  return (
    <main className={PAGE_NARROW}>
      <h1 className={PAGE_TITLE}>{RUNBOOK_TITLE}</h1>
      <p className={DOC_LEDE} data-runbook-intro>
        {RUNBOOK_INTRO}
      </p>

      <DocsTabs current="runbook" />

      <div className={DOC_SECTIONS}>
        <section aria-labelledby="runbook-refire">
          <h2 id="runbook-refire" className={DOC_H2}>How a phase is re-fired</h2>
          <ol className={STEPS}>
            {REFIRE_HOW.map((step) => (
              <li key={step} className={STEP}>
                {step}
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="runbook-promises">
          <h2 id="runbook-promises" className={DOC_H2}>When a promise breaks</h2>
          <p className={DOC_BODY}>
            The reader of /health judges three promises every five minutes and, when one flips, names one of these.
            Two of them need different people: the sweep not running is an operations problem; the sweep running and
            the page disagreeing is a product defect.
          </p>
          <div className={DOC_ARTICLES}>
            {RUNBOOK.map((entry) => (
              <article key={entry.anchor} id={entry.anchor} data-runbook={entry.anchor} className={DOC_ARTICLE}>
                <h3 className={DOC_ARTICLE_H}>
                  <span className={DOC_ARTICLE_TITLE}>{entry.title}</span>
                  <span className={DOC_ARTICLE_META}>
                    {entry.slo} · {entry.mode}
                  </span>
                </h3>
                <p className={DOC_FIELD_LABEL}>What a visitor sees</p>
                <p className={DOC_FIELD_BODY}>{entry.visitorSees}</p>
                <p className={DOC_FIELD_LABEL}>Re-fire</p>
                <p className={DOC_FIELD_BODY}>
                  <Route path={entry.refire} />
                </p>
                <p className={DOC_FIELD_LABEL}>Recovered</p>
                <p className={DOC_FIELD_BODY}>{entry.recovered}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="runbook-phases">
          <h2 id="runbook-phases" className={DOC_H2}>When a phase is stale</h2>
          <p className={DOC_BODY}>
            One page per sweep phase, in the order /health lists them. Each phase&apos;s row on /docs/checks links here.
          </p>
          <div className={DOC_ARTICLES}>
            {SWEEP_PHASES.map((phase) => {
              const copy = SWEEP_PHASE_COPY[phase];
              const page = PHASE_RUNBOOK[phase];
              return (
                <article key={phase} id={phaseRunbookAnchor(phase)} data-runbook={phaseRunbookAnchor(phase)} className={DOC_ARTICLE}>
                  <h3 className={DOC_ARTICLE_H}>
                    <span className={DOC_ARTICLE_TITLE}>{copy.title}</span>
                    <span className={DOC_ARTICLE_META}>
                      {copy.cadence} · stale after {sweepStaleAfterCopy(phase)}
                    </span>
                  </h3>
                  <p className={DOC_FIELD_LABEL}>What a visitor sees</p>
                  <p className={DOC_FIELD_BODY}>{page.visitorSees}</p>
                  <p className={DOC_FIELD_LABEL}>Re-fire</p>
                  <p className={DOC_FIELD_BODY}>
                    <Route path={page.refire} />
                  </p>
                  <p className={DOC_FIELD_LABEL}>Recovered</p>
                  <p className={DOC_FIELD_BODY}>{page.recovered}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="runbook-deploy">
          <h2 id="runbook-deploy" className={DOC_H2}>When the deploy lags main</h2>
          <div className={DOC_ARTICLES}>
            <article id={DEPLOY_LAG.anchor} data-runbook={DEPLOY_LAG.anchor} className={DOC_ARTICLE}>
              <h3 className={`${DOC_ARTICLE_H} ${DOC_ARTICLE_TITLE}`}>{DEPLOY_LAG.title}</h3>
              <p className={DOC_FIELD_LABEL}>The rule</p>
              <p className={DOC_FIELD_BODY}>{DEPLOY_LAG.rule}</p>
              <p className={DOC_FIELD_LABEL}>How to read the deployed commit</p>
              <ol className={`${STEPS} mt-1`}>
                {DEPLOY_LAG.read.map((step) => (
                  <li key={step} className={STEP}>
                    {step}
                  </li>
                ))}
              </ol>
              <p className={DOC_FIELD_LABEL}>Recovered</p>
              <p className={DOC_FIELD_BODY}>{DEPLOY_LAG.recovered}</p>
            </article>
            {/* OO3 — the line that fires before a promise breaks: a new version
                on /health and, one interval and a grace later, a per-tick phase
                that has not run since it or one of RS4's four walks failed. */}
            <article id={DEPLOY_UNVERIFIED.anchor} data-runbook={DEPLOY_UNVERIFIED.anchor} className={DOC_ARTICLE}>
              <h3 className={`${DOC_ARTICLE_H} ${DOC_ARTICLE_TITLE}`}>{DEPLOY_UNVERIFIED.title}</h3>
              <p className={DOC_FIELD_LABEL}>What a visitor sees</p>
              <p className={DOC_FIELD_BODY}>{DEPLOY_UNVERIFIED.visitorSees}</p>
              <p className={DOC_FIELD_LABEL}>Re-fire</p>
              <p className={DOC_FIELD_BODY}>
                <Route path={DEPLOY_UNVERIFIED.refire} />
              </p>
              <p className={DOC_FIELD_LABEL}>Recovered</p>
              <p className={DOC_FIELD_BODY}>{DEPLOY_UNVERIFIED.recovered}</p>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
