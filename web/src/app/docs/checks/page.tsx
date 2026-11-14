import type { Metadata } from "next";

import {
  CORPUS_NOTE,
  CORPUS_SIZE,
  DEFENCE_PUBLISHED_NOTE,
  DEFENCE_REFUSALS,
  FLAG_COPY,
  FLAG_CONSEQUENCE,
  FLAG_KINDS,
  INGESTION_COPY,
  SCREENSHOT_COPY,
  MEASURED_FALSE_POSITIVES,
  RUNBOOK_PATH,
  SWEEP_PHASE_COPY,
  SWEEP_STANDING_COPY,
  SWEEP_UNREACHABLE_COPY,
  ingestionBudgetCopy,
  screenshotBudgetCopy,
  phaseRunbookAnchor,
  sweepPhaseStanding,
  sweepStaleAfterCopy,
  type SweepPhaseHealth,
  SLOS,
  SLO_HEADING,
  SLO_INTRO,
  shortVersion,
} from "@openproduct/contracts";

import { fetchSweepHealth } from "../../public-api";
import { PAGE_NARROW, PAGE_TITLE, PANEL } from "../../ui/design";
import { AppLink } from "../../ui/link";
import { absoluteOf, agoOf } from "../../ui/time";
import {
  DOC_ARTICLE,
  DOC_ARTICLES,
  DOC_ARTICLE_BODY,
  DOC_ARTICLE_H,
  DOC_ARTICLE_META,
  DOC_ARTICLE_TITLE,
  DOC_BODY,
  DOC_H2,
  DOC_KEY,
  DOC_LEDE,
  DOC_ROW,
  DOC_ROWS,
  DOC_SECTIONS,
  DOC_VALUE,
  DocsTabs,
} from "../docs-nav";

/**
 * `/docs/checks` (openproduct-commons TS4) — what runs automatically, what it
 * may do, and what it gets wrong.
 *
 * WHY THIS PAGE EXISTS AT ALL. TS4's done-when clause asks for a
 * false-positive rate measured AND STATED, and "stated" was written into the
 * milestone rather than the measurement alone for a reason: a moderation
 * system whose rules are internal is one nobody can argue with, and a maker
 * whose listing quietly stopped appearing in search has no way to find out
 * why. `/docs/formulas` already publishes every ordering on the estate. This
 * is the same promise applied to the checks — OPC-4 does not carve out
 * moderation.
 *
 * THE REFUSALS ARE HALF THE PAGE, and the more important half. What a system
 * catches is visible from outside; what it declines to attempt is not, and it
 * is exactly where the harm would be. So the page publishes the decision not
 * to guess at authorship next to the checks that do run, with the actual
 * reason — that detectors of machine-written English penalise people writing
 * in a second language, who are a large share of the people this directory
 * exists for.
 *
 * IT NAMES NOBODY AND COUNTS NOTHING PER-PERSON, so it is static and
 * anonymous like every other public page here (OPC-1). Every number on it
 * comes from the contract, and the corpus sizes are pinned to the corpus by a
 * test — a page that quoted its own figures would drift the first time
 * somebody added an entry.
 */
// LI3 (openproduct-worldclass-v2): the sweep section reads /health, whose
// phases move on a ten-minute cron; ten minutes of page cache over a document
// that says "last ran 4m ago" would have the page contradict its own number
// for most of its life. One minute, matching the public read's own revalidate.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "What runs automatically",
  description:
    "The checks that run on openproduct without a person, what each may do, what none of them can do, and the false-positive rate we measured.",
};

/** The standing line under a phase: 14px/1.6 in `--foreground`. */
const STANDING = "m-0 mt-2 text-[14px] leading-[1.6] text-foreground";

/**
 * One phase's row: the copy from the contract, the values from /health.
 * Times render the way every timestamp on the site does (VC6): relative under
 * a week with the absolute in `title`.
 */
function SweepPhaseRow({ health, now }: { health: SweepPhaseHealth; now: number }) {
  const copy = SWEEP_PHASE_COPY[health.phase];
  const standing = sweepPhaseStanding(health);
  const instant = standing === "failed" ? health.errorAt : health.lastRunAt;
  return (
    <article className={DOC_ARTICLE} data-sweep-phase={health.phase} data-standing={standing}>
      <h3 className={DOC_ARTICLE_H}>
        <span className={DOC_ARTICLE_TITLE}>{copy.title}</span>
        <span className={DOC_ARTICLE_META}>{copy.cadence}</span>
      </h3>
      <p className={DOC_ARTICLE_BODY}>{copy.does}</p>
      <p className={STANDING}>
        <span className={standing === "running" ? "" : "font-medium"}>{SWEEP_STANDING_COPY[standing]}</span>
        {instant ? (
          <>
            {" "}
            <time dateTime={instant} title={absoluteOf(instant)}>
              {agoOf(instant, now)}
            </time>
          </>
        ) : null}
        {standing === "failed" && health.error ? (
          <>
            {" — "}
            <code className="font-mono text-[13px]">{health.error}</code>
          </>
        ) : null}
        {standing === "stale" ? (
          <span className="text-muted-foreground">
            {" "}
            · counted stale after {sweepStaleAfterCopy(health.phase)}
          </span>
        ) : null}
      </p>
      {/* OO4 — the page for this phase's degraded state, by its anchor from
          the contract: what a visitor sees, which route re-fires it, what
          recovered looks like. */}
      <p className="m-0 mt-2 text-[13px]">
        <AppLink href={`${RUNBOOK_PATH}#${phaseRunbookAnchor(health.phase)}`} className="tap underline underline-offset-[3px] text-muted-foreground hover:text-foreground" data-runbook-link={health.phase}>
          What to do when this is stale →
        </AppLink>
      </p>
    </article>
  );
}

export default async function ChecksPage() {
  const health = await fetchSweepHealth();
  const sweep = health?.sweep ?? null;
  const now = Date.now();
  return (
    <main className={PAGE_NARROW}>
      <h1 className={PAGE_TITLE}>What runs automatically</h1>
      <p className={DOC_LEDE}>{DEFENCE_PUBLISHED_NOTE}</p>
      {/* OO3 — which build is answering, read off /health: the Worker version
          and when it was uploaded. The line WC-H needed: whether the deploy
          under measurement is the one that is live is a read, not an
          inference. Unknown is said rather than invented. */}
      <p className="m-0 mt-2 text-[13.5px] text-muted-foreground" data-build={health?.build?.version ?? "unknown"}>
        {health?.build?.version && health.build.deployedAt ? (
          <>
            Deployed{" "}
            <time dateTime={health.build.deployedAt} title={absoluteOf(health.build.deployedAt)}>
              {agoOf(health.build.deployedAt, now)}
            </time>
            {" · version "}
            <span className="font-mono">{shortVersion(health.build.version)}</span>
          </>
        ) : (
          "Deployed: unknown — this gateway reports no version."
        )}
      </p>

      <DocsTabs current="checks" />

      <div className={DOC_SECTIONS}>
        {/* ── the checks ──────────────────────────────────────────────── */}
        <section id="checks">
          <h2 className={DOC_H2}>The checks</h2>
          <p className={DOC_BODY}>
            Four, and each says what it can do to what it finds. Everything here raises a flag for a
            person to read; the two that do anything else do the least reversible thing available.
          </p>
          <div className={DOC_ARTICLES}>
            {FLAG_KINDS.map((kind) => (
              <article key={kind} className={DOC_ARTICLE}>
                <h3 className={DOC_ARTICLE_H}>
                  <span className={DOC_ARTICLE_TITLE}>{FLAG_COPY[kind].title}</span>
                  <span className={DOC_ARTICLE_META}>{CONSEQUENCE_LABEL[FLAG_CONSEQUENCE[kind]]}</span>
                </h3>
                <p className={DOC_ARTICLE_BODY}>{FLAG_COPY[kind].says}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── the measured rate ───────────────────────────────────────── */}
        <section id="rate">
          <h2 className={DOC_H2}>How often the pitch check is wrong</h2>
          <p className={DOC_BODY}>
            Only one of the four reads anybody's writing, and it is the only one that could be wrong
            about a person rather than about a pattern. So it is the one we measured.
          </p>

          <div className={`${PANEL} mt-3.5`}>
            <p className="m-0 text-[15.5px] leading-[1.7] text-foreground">
              <span className="font-medium">
                {MEASURED_FALSE_POSITIVES} of {CORPUS_SIZE.honest}
              </span>{" "}
              genuine pitches were wrongly flagged.{" "}
              <span className="font-medium">
                {CORPUS_SIZE.filler} of {CORPUS_SIZE.filler}
              </span>{" "}
              empty ones were caught.
            </p>
            <p className="m-0 mt-3 max-w-[68ch] text-[14px] leading-[1.7] text-muted-foreground">
              {CORPUS_NOTE}
            </p>
          </div>

          <p className="m-0 mt-3.5 max-w-[68ch] text-[14.5px] leading-[1.7] text-muted-foreground">
            When a person reviewing a flag decides the check was wrong, that is recorded as a
            dismissal and counted. Those counts are what tell us whether the number above still means
            anything once real listings are involved, and they appear in the transparency record
            alongside everything else.
          </p>
        </section>

        {/* ── the refusals ────────────────────────────────────────────── */}
        <section id="refusals">
          <h2 className={DOC_H2}>What we do not do</h2>
          <p className={DOC_BODY}>
            The more important half of this page. What a system catches is visible from outside; what
            it declines to attempt is not, and it is where the harm would have been.
          </p>
          <dl className={DOC_ROWS}>
            {DEFENCE_REFUSALS.map((refusal) => (
              <div key={refusal.refused} className={DOC_ROW}>
                <dt className={DOC_KEY}>{refusal.refused}</dt>
                <dd className={DOC_VALUE}>{refusal.because}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── the sweep (LI3) ─────────────────────────────────────────── */}
        <section id="sweep" aria-labelledby="sweep-heading">
          <h2 className={DOC_H2}>What computes the numbers</h2>
          <p id="sweep-heading" className={DOC_BODY}>
            Seven phases, on a schedule, with no person in the loop. Each says what it computes, how
            often it is asked to, and — read live from the same document the operators read — when it
            last did, and whether it is failing. A phase that has never run says so rather than
            rendering a zero.
          </p>
          {sweep === null ? (
            <p className={`${PANEL} m-0 mt-3.5 text-[14.5px] leading-[1.7] text-muted-foreground`}>
              {SWEEP_UNREACHABLE_COPY}
            </p>
          ) : (
            <div className={DOC_ARTICLES}>
              {sweep.phases.map((phase) => (
                <SweepPhaseRow key={phase.phase} health={phase} now={now} />
              ))}
              {/* LI4 — the outward phase keeps no health row (RS2: opt-in per
                  environment), so it is described by its budget instead. */}
              <article className={DOC_ARTICLE} data-sweep-phase="ingestion">
                <h3 className={DOC_ARTICLE_H}>
                  <span className={DOC_ARTICLE_TITLE}>{INGESTION_COPY.title}</span>
                  <span className={DOC_ARTICLE_META}>{INGESTION_COPY.cadence}</span>
                </h3>
                <p className={DOC_ARTICLE_BODY}>{INGESTION_COPY.does}</p>
                <p className={STANDING} data-authenticated={health?.ingestion?.authenticated ?? "unknown"}>
                  {health?.ingestion ? ingestionBudgetCopy(health.ingestion) : "The budget was not reported by this gateway."}
                </p>
              </article>
              {/* MD4 — the other outward phase, described the same way: by its
                  budget, and by whether this environment captures at all. An
                  environment that does not says so here, and claims nothing. */}
              <article className={DOC_ARTICLE} data-sweep-phase="screenshots">
                <h3 className={DOC_ARTICLE_H}>
                  <span className={DOC_ARTICLE_TITLE}>{SCREENSHOT_COPY.title}</span>
                  <span className={DOC_ARTICLE_META}>{SCREENSHOT_COPY.cadence}</span>
                </h3>
                <p className={DOC_ARTICLE_BODY}>{SCREENSHOT_COPY.does}</p>
                <p className={STANDING} data-configured={health?.screenshots?.configured ?? "unknown"}>
                  {health?.screenshots ? screenshotBudgetCopy(health.screenshots) : "The capture budget was not reported by this gateway."}
                </p>
              </article>
            </div>
          )}
        </section>

        {/* OO0 — the three sentences. Promises a reader could check, written
            before anything alerts on them, each with the constant its number
            is read from — so the page cannot drift from the code — and the
            query that finds the moments it was broken, committed beside it. */}
        <section id="promises" aria-labelledby="slo-heading" data-slos={SLOS.length}>
          <h2 className={DOC_H2}>{SLO_HEADING}</h2>
          <p id="slo-heading" className={DOC_BODY}>
            {SLO_INTRO}
          </p>
          <ol className={`${DOC_ARTICLES} m-0 list-none p-0`}>
            {SLOS.map((slo, index) => (
              <li key={slo.id} className={DOC_ARTICLE} data-slo={slo.id}>
                <p className="m-0 max-w-[68ch] text-[15.5px] leading-[1.6] text-foreground">
                  <span className="mr-2 font-mono text-[13px] text-muted-foreground">{index + 1}.</span>
                  {slo.sentence}
                </p>
                <p className="m-0 mt-2 text-[13px] leading-[1.6] text-muted-foreground">
                  Read from{" "}
                  {slo.thresholds.map((t, i) => (
                    <span key={t.constant}>
                      {i > 0 ? " · " : ""}
                      <code className="font-mono text-[12.5px] text-foreground">{t.constant}</code>
                      {` = ${t.value} ${t.unit}`}
                    </span>
                  ))}
                </p>
                <p className="m-0 mt-2 text-[13px] leading-[1.6] text-muted-foreground">
                  Where a breach is found ({slo.query.source === "workers-logs" ? "Workers Logs" : "cache analytics"}):{" "}
                  <code className="font-mono text-[12.5px] text-foreground">{slo.query.text}</code>
                </p>
              </li>
            ))}
          </ol>
        </section>

        <p className="m-0 max-w-[68ch] text-[15.5px] leading-[1.7] text-copy">
          If something here happened to a listing you maintain and you think it was wrong,{" "}
          <AppLink href="/docs" className="tap text-link underline underline-offset-4">
            every act is appealable
          </AppLink>{" "}
          — including the automatic ones, which is why each of them leaves a record with a reason
          attached.
        </p>
      </div>
    </main>
  );
}

/** The enum, in words a reader who has never seen the code would use. */
const CONSEQUENCE_LABEL: Record<string, string> = {
  deindex: "may withhold from search engines",
  discount: "may stop counting toward a total",
  "queue-only": "does nothing on its own",
};
