import {
  FLAG_COPY,
  REPORT_REASON_LABELS,
  TRIAGE_COPY,
  MODERATION_REFUSALS,
  type FlagKind,
  type PublicFlag,
  type QueuedReport,
} from "@openproduct/contracts";

import { readSession } from "../../auth/session-server";
import { BTN_OUTLINE, FIELD, LABEL } from "../../ui/design";
import { FailurePanel } from "../../ui/failure";
import { StudioFrame, StudioPanel, StudioSection } from "../frame";
import { noticeFrom, REPORT_VOCABULARY } from "../notices";
import { fetchFlagQueue, fetchReportQueue } from "../studio-api";

/**
 * The moderation queue (openproduct-commons TS3), in XP3's studio frame.
 *
 * TS0 built this read and nothing that acted on it. Now every row carries the
 * three decisions a triager actually has — claim it, decline it, or act on
 * the thing it names — and each writes a row in the append-only ledger.
 *
 * OLDEST FIRST, and the API decides that, not this page. A moderation queue
 * worked newest-first never reaches its tail, and the reports it never
 * reaches are the ones about the listings nobody else is watching.
 *
 * WHAT THIS PAGE DOES NOT SHOW: the reporter. Not their handle, not their
 * subject id, not a count of reports they have filed. A triager who can see
 * who reported something can be lobbied about who reported something, and the
 * queue's own integrity is the first thing TS-1's standing layer protects.
 * `alsoReported` is a NUMBER for exactly this reason — it is the one fact
 * that changes a triager's priority, carrying none of the identity that would
 * change their judgement.
 *
 * PROGRESSIVE ENHANCEMENT, no client JS (OX5b). Every act posts to the
 * sibling `actions` route, which reads the session server-side; the token
 * never reaches the browser.
 */
export const dynamic = "force-dynamic";


interface PageProps {
  searchParams: Promise<{ notice?: string; refused?: string }>;
}

export default async function ReportQueuePage(props: PageProps) {
  const page = "/studio/reports";
  const session = await readSession();
  if (!session) {
    return (
      <FailurePanel
        kind="signedOut"
        what="The moderation queue needs an account with standing to work it."
        actions={[{ label: "Sign in", href: `/signin?return_to=${encodeURIComponent(page)}` }]}
      />
    );
  }

  // BOTH QUEUES IN ONE ROUND TRIP. They are separate tables for the reasons
  // 1480 sets out, and one page because a triager has one attention.
  const [result, flagResult] = await Promise.all([
    fetchReportQueue(session.accessToken),
    fetchFlagQueue(session.accessToken),
  ]);

  // A NON-OPERATOR AND AN EMPTY QUEUE MUST NOT LOOK DIFFERENT from the
  // outside, but they are different to the person here: one is "you may not",
  // the other is "there is nothing". The API refuses with 403 and this page
  // says which, because the person reading it already knows who they are.
  if (result.kind === "refused" || result.kind === "unauthorized") {
    return (
      <FailurePanel
        kind="missing"
        what={MODERATION_REFUSALS["not-an-operator"].says}
        actions={[{ label: "Your listings", href: "/studio" }]}
      />
    );
  }
  if (result.kind === "unavailable") {
    return (
      <FailurePanel
        kind="unavailable"
        what="The queue could not be loaded. It is not something you did, and trying again in a moment usually works."
        actions={[
          { label: "Try again", href: page },
          { label: "Your listings", href: "/studio" },
        ]}
      />
    );
  }

  const search = await props.searchParams;
  const reports = result.data.reports;
  // A FAILED FLAG READ IS AN EMPTY LIST, never a failed page. The reports
  // queue is the surface somebody came here for; losing it because a second
  // read was unavailable would trade the important half for the new one.
  const flags = flagResult.kind === "ok" ? flagResult.data.flags : [];

  return (
    <StudioFrame
      vocabulary={REPORT_VOCABULARY}
      crumbs={[{ label: "Listings", href: "/studio" }, { label: "Reports" }]}
      title="Reports"
      notice={noticeFrom(search, REPORT_VOCABULARY)}
    >
      {reports.length === 0 ? (
        <StudioPanel title="Nothing in the queue">Reports about listings appear here as they are filed.</StudioPanel>
      ) : (
        <StudioSection title={`${reports.length} open`}>
          {reports.map((report) => (
            <ReportRow key={report.id} report={report} action={`${page}/actions`} />
          ))}
        </StudioSection>
      )}

      {flags.length > 0 ? (
        <StudioSection title={`${flags.length} noticed automatically`}>
          {flags.map((flag) => (
            <FlagRow key={flag.id} flag={flag} action={`${page}/actions`} />
          ))}
        </StudioSection>
      ) : null}
    </StudioFrame>
  );
}

/**
 * One flag, and the two things a person may say about it.
 *
 * NO SCORE IS SHOWN, because none is stored: the evidence is prose quoting
 * what was found, and a number beside an accusation invites deferring to the
 * number instead of checking the thing.
 *
 * DISMISS IS THE FIRST BUTTON. The estate wants this path used — the
 * dismissal rate is its only production measurement of how often the checks
 * are wrong — and putting it second would make "agree with the machine" the
 * easy answer, which is the failure mode of every automated queue.
 */
function FlagRow({ flag, action }: { flag: PublicFlag; action: string }) {
  const copy = FLAG_COPY[flag.kind as FlagKind];
  return (
    <div className="mb-3 max-w-[74ch] rounded-[12px] border border-border bg-card px-4 py-3.5 last:mb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[15.5px] font-semibold text-foreground">{copy.title}</span>
        <span className="font-mono text-[12.5px] text-muted-foreground">
          {flag.subjectKind} · {flag.subjectRef}
        </span>
      </div>

      {/* The detector's own words, quoting the text or reporting the shape.
          Rendered as text by React, like every other untrusted string here. */}
      <p className="m-0 mt-2 text-[13.5px] leading-[1.55] text-foreground">{flag.evidence}</p>

      <p className="m-0 mt-2 text-[12.5px] leading-[1.5] text-muted-foreground">
        {copy.says}
      </p>

      <p className="m-0 mt-2 text-[12.5px] text-muted-foreground">
        {new Date(flag.raisedAt).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
        {" · "}
        {CONSEQUENCE_COPY[flag.consequence] ?? flag.consequence}
      </p>

      <form method="post" action={action} className="mt-3 flex flex-wrap gap-2.5">
        <input type="hidden" name="flagId" value={flag.id} />
        <button type="submit" name="intent" value="flag-dismiss" className={BTN_OUTLINE}>
          The check was wrong
        </button>
        <button type="submit" name="intent" value="flag-action" className={BTN_OUTLINE}>
          Acted on it
        </button>
      </form>
    </div>
  );
}

/**
 * What already happened, in a triager's words rather than the contract's
 * enum. Without this line "restore it" is an instruction nobody can follow,
 * because they cannot tell what state the thing is in.
 */
const CONSEQUENCE_COPY: Record<string, string> = {
  deindex: "withheld from search engines",
  discount: "upvotes not counted",
  "queue-only": "no action taken",
};

/**
 * One report, and the three things that may be done about it.
 *
 * THE ACTS ARE ORDERED BY WHAT THEY COST THE PERSON REPORTED. Decline first,
 * then delist, then remove — the layout should not make the maximal act the
 * easiest one to reach, and a row whose first button erases somebody's work
 * is a row that will erase somebody's work by accident.
 */
function ReportRow({ report, action }: { report: QueuedReport; action: string }) {
  return (
    <div className="mb-3 max-w-[74ch] rounded-[12px] border border-border bg-card px-4 py-3.5 last:mb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[15.5px] font-semibold text-foreground">
          {REPORT_REASON_LABELS[report.reason]}
        </span>
        <span className="font-mono text-[12.5px] text-muted-foreground">
          {report.subjectKind} · {report.subjectRef}
        </span>
      </div>

      {report.detail ? (
        // The reporter's own words, as written. Rendered as text by React,
        // never as markup: this is untrusted input from the open internet and
        // the one place on the estate where somebody types about somebody else.
        <p className="m-0 mt-2 whitespace-pre-wrap text-[13.5px] leading-[1.55] text-foreground">
          {report.detail}
        </p>
      ) : null}

      <p className="m-0 mt-2 text-[12.5px] text-muted-foreground">
        {new Date(report.createdAt).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
        {report.state === "triaged" ? " · being looked at" : ""}
        {/* The one number that changes priority, carrying none of the
            identity that would change judgement. */}
        {report.alsoReported > 0 ? ` · ${report.alsoReported} other open report${report.alsoReported === 1 ? "" : "s"}` : ""}
      </p>

      {report.state === "open" ? (
        <form method="post" action={action} className="mt-3 inline-block">
          <input type="hidden" name="intent" value="claim" />
          <input type="hidden" name="reportId" value={report.id} />
          <button type="submit" className={QUIET}>
            {TRIAGE_COPY.claim}
          </button>
        </form>
      ) : null}

      <form method="post" action={action} className="mt-3 border-t border-border pt-3">
        <input type="hidden" name="reportId" value={report.id} />
        <input type="hidden" name="subjectRef" value={report.subjectRef} />
        <label className="block">
          <span className={LABEL}>Why</span>
          <input name="reason" required minLength={3} maxLength={1000} className={`${FIELD} max-w-[52ch]`} />
        </label>
        <div className="mt-2.5 flex flex-wrap gap-2.5">
          <button type="submit" name="intent" value="decline" className={BTN_OUTLINE}>
            {TRIAGE_COPY.decline}
          </button>
          {report.subjectKind === "listing" ? (
            <>
              <button type="submit" name="intent" value="delist" className={BTN_OUTLINE}>
                Delist it
              </button>
              <button type="submit" name="intent" value="remove" className={DANGER}>
                Remove it
              </button>
            </>
          ) : null}
        </div>
      </form>
    </div>
  );
}

// The one destructive act, and the only place on the estate that colours a
// button by its consequence. Not the endorsement gold — that token means one
// thing and this is not it.
const DANGER =
  "inline-flex h-[36px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-destructive/40 bg-destructive/5 px-3.5 text-[14px] font-medium text-destructive";
const QUIET = "text-[13.5px] text-muted-foreground underline underline-offset-4";
