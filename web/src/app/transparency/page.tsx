import type { Metadata } from "next";

import {
  ACT_LABELS,
  APPEAL_STATE_LABELS,
  DISCOUNT_REASON_LABELS,
  INTEGRITY_REASON_COPY,
  FLAG_COPY,
  REPORT_STATE_LABELS,
  TRANSPARENCY_APPEAL_INVITATION,
  TRANSPARENCY_LEDE,
  TRANSPARENCY_NAMES_NOBODY_NOTE,
  TRANSPARENCY_NO_DENOMINATOR_NOTE,
  TRANSPARENCY_REFUSALS,
  TRANSPARENCY_REVERSAL_NOTE,
  TRANSPARENCY_SOURCES,
  TRANSPARENCY_TITLE,
  TRANSPARENCY_WINDOW_NOTE,
  TRANSPARENCY_ZERO_NOTE,
  actsAgainst,
  actsReversing,
  countBy,
  discountTotal,
  formatShare,
  share,
  total,
  type ActCount,
  type AppealCount,
  type FlagKind,
  type IntegrityReason,
  type ReportCount,
  type TransparencyReport,
} from "@openproduct/contracts";

import { fetchTransparency } from "../public-api";
import { H2_SECTION, PAGE_SUBTITLE, PAGE_TITLE, PANEL } from "../ui/design";
import { FailurePanel } from "../ui/failure";

import { AppLink } from "../ui/link";

/**
 * `/transparency` (openproduct-commons TS5) — what we did, counted.
 *
 * TS0 named this page in the header of the migration that created the ledger,
 * two dozen milestones before it could exist: "the substrate of TS5's public
 * transparency report, which is GENERATED from these rows rather than written
 * by hand". Nothing on this page is a literal. Every figure arrives from
 * core's read over the append-only record and the arithmetic that turns
 * counts into rates lives in the contract, where a test pins it.
 *
 * A FAILED READ IS NOT A PAGE OF ZEROES, and this is the one route on the
 * estate where getting that wrong would be actively dishonest rather than
 * merely confusing. Everywhere else the OD5 finding applies as "an empty room
 * and a locked door look nothing alike to a visitor"; here a locked door
 * rendered as an empty room publishes the most flattering number available —
 * we removed nothing, we were never wrong — sourced from an outage.
 *
 * IT IS PUBLIC AND ANONYMOUS. A page of numbers about how an intermediary
 * uses its power over people's visibility is worth very little if it can only
 * be read by people who have already signed up to that intermediary.
 *
 * THE ORDER OF THE SECTIONS IS AN ARGUMENT. Acts first, because that is what
 * the reader came to see; the reversal rate immediately after, because the
 * figure that says whether our judgement is any good is how much we put back,
 * and burying it below the removals would be the ordinary way to publish it.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Transparency",
  description:
    "Every act of moderation on openproduct, counted from the append-only record it is written to — including the ones we reversed.",
};

// The page's measurements (openproduct-calm-pages CP4). The column is 880px
// in the calm frame (80px above the title); a section is 56px under the one
// before it and heads at 20px (CP-R4); a count list is a `--border` rule with
// `--line` rules between its rows; every note is 14px/1.7 in `--muted`.
//
// FIGURES FIRST, REASONS ONE CLICK AWAY (CP-R5). Each section says what it
// counts in one line, shows the count, and keeps its reasons — why the page
// is shaped this way — in one `<details>` under it. What the page promises
// (what it will not publish, that a discounted upvote can be restored, that
// no check can remove anything) stays visible.

/** The column. */
const TP_PAGE =
  "mx-auto box-border w-full max-w-[880px] px-[44px] pb-[104px] pt-[80px] max-lg:px-7 max-sm:px-4 max-sm:pb-[72px] max-sm:pt-12";
/** A section: 56px under the previous one. */
const TP_SECTION = "mt-14";
/** The one line under a section's heading: what it counts. 16px/1.6 in `--copy`. */
const TP_LEDE = "m-0 mt-2 max-w-[68ch] text-[16px] leading-[1.6] text-copy";
/** A note under a list: 14px/1.7 in `--muted`, 12px below. */
const TP_NOTE = "m-0 mt-3 max-w-[68ch] text-[14px] leading-[1.7] text-muted-foreground";
/** A count list: a `--border` rule above, 16px under the lede. */
const TP_LIST = "m-0 mt-4 grid gap-0 border-t border-line";
/** A count row: the label and its figure on one baseline, `10px 0`, a `--line` rule under. */
const TP_ROW = "flex items-baseline justify-between gap-4 border-b border-line py-2.5";
/** The label: 14.5px in `--foreground`. */
const TP_LABEL = "text-[14.5px] text-foreground";
/** The figure: mono 14.5px. */
const TP_COUNT = "m-0 font-mono text-[14.5px] text-foreground";
/** A definition row: a fixed-width term beside its prose, `14px 0`. */
const TP_DEF_ROW = "grid gap-1 border-b border-line py-3.5 sm:gap-5";
const TP_DEF_TERM = "text-[14.5px] font-medium text-foreground";
const TP_DEF_BODY = "m-0 text-[14px] leading-[1.7] text-muted-foreground";

export default async function TransparencyPage() {
  const result = await fetchTransparency();

  if (result === null) {
    return (
      <FailurePanel
        kind="unavailable"
        what="The transparency record could not be read. It is generated from the moderation ledger on every request rather than kept as a document, so when the ledger is unreachable there is nothing honest to show — a page of zeroes would be the most flattering possible number, published by accident."
        actions={[
          { label: "Try again", href: "/transparency" },
          { label: "What runs automatically", href: "/docs/checks" },
        ]}
      />
    );
  }

  const report = result.transparency;

  return (
    <main className={TP_PAGE}>
      <h1 className={`${PAGE_TITLE} max-w-[30ch]`}>{TRANSPARENCY_TITLE}</h1>
      <p className={`${PAGE_SUBTITLE} max-w-[68ch]`}>{TRANSPARENCY_LEDE}</p>
      <p className="m-0 mt-4 text-[14px] text-faint" data-transparency-window>
        {windowSentence(report)}
      </p>
      <Why summary="Why a rolling window">{TRANSPARENCY_WINDOW_NOTE}</Why>

      <Judgement report={report} />
      <Acts acts={report.acts} />
      <Appeals appeals={report.appeals} reversed={report.appealsReversed} />
      <Reports reports={report.reports} />
      <Endorsements discounts={report.discounts} />
      <Flags flags={report.flags} />

      {/* ── how to read it ──────────────────────────────────────────── */}
      <section className={TP_SECTION}>
        <h2 className={H2_SECTION}>Where these come from</h2>
        <dl className={TP_LIST}>
          {TRANSPARENCY_SOURCES.map((source) => (
            <div
              key={source.figures}
              className={`${TP_DEF_ROW} sm:grid-cols-[220px_minmax(0,1fr)]`}
            >
              <dt className={TP_DEF_TERM}>{source.figures}</dt>
              <dd className={`${TP_DEF_BODY} max-w-[64ch]`}>{source.from}</dd>
            </div>
          ))}
        </dl>
        <p className={`${TP_NOTE} mt-4`}>{TRANSPARENCY_ZERO_NOTE}</p>
      </section>

      {/* ── what this page will not do ──────────────────────────────── */}
      <section className={TP_SECTION}>
        <h2 className={H2_SECTION}>What this page will not do</h2>
        <p className={TP_LEDE}>{TRANSPARENCY_NAMES_NOBODY_NOTE}</p>
        <dl className={TP_LIST}>
          {TRANSPARENCY_REFUSALS.map((refusal) => (
            <div
              key={refusal.refused}
              className={`${TP_DEF_ROW} sm:grid-cols-[300px_minmax(0,1fr)]`}
            >
              <dt className={TP_DEF_TERM}>{refusal.refused}</dt>
              <dd className={`${TP_DEF_BODY} max-w-[62ch]`}>{refusal.because}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* NO LINK TO THE STUDIO FROM HERE. Most people reading this page do not
          maintain a listing, and a public page advertising a maintainer
          surface is a page sending most of its visitors to a sign-in wall
          (the XP3 rule). Maintainers reach the appeal from the studio, where
          the acts about their own listings are, and where they already are
          when it matters. */}
      <p className={`${TP_NOTE} mt-10`}>
        {TRANSPARENCY_APPEAL_INVITATION} It is offered beside every decision, in the studio for the
        listing it was about. The checks that run without a person are published at{" "}
        <AppLink href="/docs/checks" className="text-link underline underline-offset-4">
          /docs/checks
        </AppLink>
        .
      </p>
    </main>
  );
}

// ---------------------------------------------------------------------------
// The headline
// ---------------------------------------------------------------------------

/**
 * Two numbers and a rate, above everything else.
 *
 * THE RATE IS THE POINT OF THE PAGE. Any estate can publish how much it
 * removed; the figure that says whether its judgement is any good is how much
 * it put back, and a report that lists acts without it is a report you cannot
 * grade. It goes through `share()` so that no acts renders as a sentence
 * rather than as "0%", which over a zero denominator would read as "we
 * reversed none of them" when the truth is "we did nothing to reverse".
 */
function Judgement({ report }: { report: TransparencyReport }) {
  const against = actsAgainst(report.acts);
  const reversing = actsReversing(report.acts);
  const rate = share(reversing, against);

  return (
    <section data-transparency-figures className={`mt-10 ${PANEL}`}>
      <dl className="m-0 grid gap-6 sm:grid-cols-3">
        <Figure label="Acts taken against something" value={against} />
        <Figure label="Acts undone" value={reversing} />
        <Figure label="Undone as a share" value={formatShare(rate)} />
      </dl>
      {rate === null ? <p className={`${TP_NOTE} mt-5`}>{TRANSPARENCY_NO_DENOMINATOR_NOTE}</p> : null}
      <Why summary="Which number to read">{TRANSPARENCY_REVERSAL_NOTE}</Why>
    </section>
  );
}

/** A figure as the tile draws one (CL-R3, CL3's stat strip): a small faint
 *  label said once, over a 30px number. */
function Figure({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dt className="text-[13px] leading-[1.45] text-muted-foreground">{label}</dt>
      <dd className="m-0 mt-2 text-title font-medium leading-none tracking-[-0.02em] tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}

/**
 * A section's reasons, one click away (CP-R5): the paragraph arguing why the
 * page is shaped as it is, under a summary naming what it holds. A
 * `<details>`, not a script — the words stay in the one cacheable document
 * (OPC-1), for a crawler and a reader who opens it.
 */
function Why({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group mt-4 max-w-[68ch]">
      <summary className="tap inline-flex cursor-pointer list-none items-center gap-1.5 text-[13.5px] text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">
          ›
        </span>
        {summary}
      </summary>
      <div className="mt-2 grid gap-2 text-[14.5px] leading-[1.7] text-muted-foreground">{children}</div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// The tables
// ---------------------------------------------------------------------------

/**
 * One count per row, and the label comes from a TOTAL record in the contract.
 *
 * An act with no English name fails the typecheck there rather than appearing
 * here as `trust_demote`, which is the leak that makes a transparency report
 * read as a database dump somebody forgot to finish.
 */
function Counts({
  title,
  lede,
  rows,
  note,
  why,
}: {
  title: string;
  /** What the section counts, in one line. */
  lede: string;
  rows: Array<{ label: string; count: number }>;
  /** A figure in a sentence, under the list — shown only when there is one. */
  note?: React.ReactNode;
  /** Why the section is shaped this way (CP-R5). */
  why?: { summary: string; text: React.ReactNode };
}) {
  return (
    <section className={TP_SECTION}>
      <h2 className={H2_SECTION}>{title}</h2>
      <p className={TP_LEDE}>{lede}</p>
      {rows.length === 0 ? (
        <p className={`${TP_NOTE} text-[14.5px]`}>None in this window.</p>
      ) : (
        <dl className={TP_LIST}>
          {rows.map((row) => (
            <div key={row.label} className={TP_ROW}>
              <dt className={TP_LABEL}>{row.label}</dt>
              <dd className={TP_COUNT}>{row.count}</dd>
            </div>
          ))}
        </dl>
      )}
      {note ? <p className={TP_NOTE}>{note}</p> : null}
      {why ? <Why summary={why.summary}>{why.text}</Why> : null}
    </section>
  );
}

function Acts({ acts }: { acts: readonly ActCount[] }) {
  return (
    <Counts
      title="Every act, by kind"
      lede="Including the decision to do nothing."
      rows={acts.map((row) => ({ label: ACT_LABELS[row.act] ?? row.act, count: row.count }))}
      why={{
        summary: "Why the decisions to do nothing are counted",
        text: "An estate that publishes only its removals is publishing a boast.",
      }}
    />
  );
}

function Appeals({
  appeals,
  reversed,
}: {
  appeals: readonly AppealCount[];
  reversed: number;
}) {
  const decided = countBy(appeals, (row) => row.state !== "open");
  const upheld = countBy(appeals, (row) => row.state === "upheld");
  return (
    <Counts
      title="Appeals"
      lede="Filed by the people the acts were about, refusals counted beside upholds."
      rows={appeals.map((row) => ({
        label: APPEAL_STATE_LABELS[row.state] ?? row.state,
        count: row.count,
      }))}
      note={
        decided > 0 ? (
          <>
            {formatShare(share(upheld, decided))} of the appeals we decided were upheld, and {reversed} of those
            actually put something back.
          </>
        ) : null
      }
      why={{
        summary: "Why refusals are counted, and why the two figures can differ",
        text: (
          <>
            <p className="m-0">
              A page showing only the appeals we granted would be the same boast in a different section.
            </p>
            <p className="m-0">
              An act sometimes gets undone by somebody else while the appeal is waiting, and upholding it then
              changes nothing except the record.
            </p>
          </>
        ),
      }}
    />
  );
}

function Reports({ reports }: { reports: readonly ReportCount[] }) {
  const received = total(reports);
  const waiting = countBy(reports, (row) => row.state === "open" || row.state === "triaged");
  return (
    <Counts
      title="Reports"
      lede="What people told us about listings, by where each one got to."
      rows={reports.map((row) => ({
        label: REPORT_STATE_LABELS[row.state] ?? row.state,
        count: row.count,
      }))}
      note={received > 0 ? `${waiting} of ${received} are still waiting to be worked.` : null}
      why={{
        summary: "Why the waiting ones are shown",
        text: "A growing tail here is a fact about our capacity, and leaving it out would hide exactly the failure worth knowing about.",
      }}
    />
  );
}

/**
 * EN3's discounts, with the shape that produced each one spelled out.
 *
 * THE PROSE IS ON THE PAGE RATHER THAN LINKED FROM IT. "412 endorsements were
 * discounted" without the reason beside it is an accusation with no visible
 * standard — a reader cannot tell whether we caught a ring or decided we did
 * not like somebody. The contract carries a sentence per reason for exactly
 * this, and the count sits beside its own definition.
 */
function Endorsements({
  discounts,
}: {
  discounts: readonly { reason: IntegrityReason; discounted: number }[];
}) {
  return (
    <section className={TP_SECTION}>
      <h2 className={H2_SECTION}>Upvotes not counted</h2>
      <p className={TP_LEDE}>
        Upvotes that did not reach a listing&rsquo;s public total, by the shape that produced them — never
        by listing or by person.
      </p>
      {discounts.length === 0 ? (
        <p className={`${TP_NOTE} text-[14.5px]`}>None in this window.</p>
      ) : (
        <dl className={TP_LIST}>
          {discounts.map((row) => (
            <div key={row.reason} className="border-b border-line py-3.5">
              <dt className="flex items-baseline justify-between gap-4">
                <span className={`${TP_LABEL} font-medium`}>
                  {DISCOUNT_REASON_LABELS[row.reason] ?? row.reason}
                </span>
                <span className={TP_COUNT}>{row.discounted}</span>
              </dt>
              <dd className={`${TP_DEF_BODY} mt-1.5 max-w-[64ch]`}>
                {INTEGRITY_REASON_COPY[row.reason] ?? ""}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className={TP_NOTE}>
        {discounts.length > 0 ? `${discountTotal(discounts)} in total. ` : ""}A discounted upvote is still
        recorded, and a later review can restore it.
      </p>
      <Why summary="Why never by listing or by person">
        A per-listing figure is an accusation about a specific product&rsquo;s supporters, made in public, by
        arithmetic.
      </Why>
    </section>
  );
}

/**
 * The checks, and the number they are accountable to.
 *
 * THE DISMISSAL SHARE IS THE PRODUCTION FALSE-POSITIVE RATE. `/docs/checks`
 * publishes what the pitch check scored against a corpus assembled for the
 * purpose; this is what it scores against real listings, and it is the figure
 * that says whether the first one still means anything.
 */
function Flags({ flags }: { flags: readonly { kind: FlagKind; state: string; count: number }[] }) {
  const raised = total(flags);
  const dismissed = countBy(flags, (row) => row.state === "dismissed");
  const rows = flags.map((row) => ({
    label: `${FLAG_COPY[row.kind]?.title ?? row.kind} — ${row.state}`,
    count: row.count,
  }));
  return (
    <Counts
      title="Automatic checks"
      lede="What the checks at /docs/checks raised, and what a person decided about each. None of them can remove anything."
      rows={rows}
      note={
        raised > 0 ? `${formatShare(share(dismissed, raised))} of what the checks raised was dismissed by the person who read it.` : null
      }
      why={{
        summary: "Why the dismissed share matters",
        text: "That share is the checks' false-positive rate measured against real listings rather than against a corpus, and it is the number the published one has to answer to.",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function windowSentence(report: TransparencyReport): string {
  const from = dateOf(report.since);
  const to = dateOf(report.until);
  if (!from || !to) return "";
  return `${from} to ${to}.`;
}

function dateOf(iso: string): string | null {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
