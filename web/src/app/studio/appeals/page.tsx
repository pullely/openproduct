import {
  APPEAL_DECISION_COPY,
  APPEAL_REFUSALS,
  APPEAL_SAYS_LABEL,
  APPEAL_STATE_COPY,
  APPEAL_UPHELD_ALREADY_REVERSED,
  ACT_LABELS,
  MAX_APPEAL_SAYS,
  MIN_APPEAL_SAYS,
  type AppealableAct,
} from "@openproduct/contracts";

import { readSession } from "../../auth/session-server";
import { BTN_OUTLINE, BTN_PRIMARY, LABEL, TEXTAREA } from "../../ui/design";
import { FailurePanel } from "../../ui/failure";
import { STUDIO_INSET, STUDIO_RECORD, StudioFrame, StudioPanel, StudioSection } from "../frame";
import { noticeFrom, APPEAL_VOCABULARY } from "../notices";
import { fetchAppealQueue, fetchMyAppealableActs, type QueuedAppealView } from "../studio-api";

/**
 * `/studio/appeals` (openproduct-commons TS5) — what was done, and the answer
 * to it.
 *
 * ONE PAGE, TWO AUDIENCES, AND THE SPLIT IS BY WHAT THE READER HOLDS rather
 * than by a role flag on the page: everybody signed in sees the acts taken
 * against listings they maintain, and an operator additionally sees the queue
 * of appeals waiting to be decided. A person who is both — which every
 * operator here also is — sees both, which is correct: an operator's own
 * listing being delisted is not a different kind of event.
 *
 * THE ACT'S REASON IS SHOWN HERE and nowhere else public. TS3 kept it off the
 * tombstone deliberately — a reason at the listing's own address is a
 * judgement about a person, published to strangers, before they have had any
 * chance to answer it. The asymmetry is the whole design: the person it is
 * about gets the reason, because telling somebody "a decision was made, argue
 * with it" is not a hearing.
 *
 * NO CLIENT JS (OX5b). Every form posts to the sibling `actions` route, which
 * reads the session server-side; the token never reaches the browser.
 */
export const dynamic = "force-dynamic";


interface PageProps {
  searchParams: Promise<{ notice?: string; refused?: string }>;
}

export default async function AppealsPage(props: PageProps) {
  const page = "/studio/appeals";
  const session = await readSession();
  if (!session) {
    return (
      <FailurePanel
        kind="signedOut"
        what="Appealing a decision needs an account."
        actions={[{ label: "Sign in", href: `/signin?return_to=${encodeURIComponent(page)}` }]}
      />
    );
  }

  // BOTH READS IN ONE ROUND TRIP, and the second is allowed to fail. The
  // queue is operator-only and refuses with 403 for everybody else, which is
  // the ordinary case rather than an error — so it is read as "no queue"
  // rather than as a failed page.
  const [mine, queue] = await Promise.all([
    fetchMyAppealableActs(session.accessToken),
    fetchAppealQueue(session.accessToken),
  ]);

  if (mine.kind === "unauthorized") {
    return (
      <FailurePanel
        kind="signedOut"
        what="Your session has expired."
        actions={[{ label: "Sign in", href: `/signin?return_to=${encodeURIComponent(page)}` }]}
      />
    );
  }
  if (mine.kind !== "ok") {
    return (
      <FailurePanel
        kind="unavailable"
        what="The record of what was done could not be loaded. It is not something you did, and trying again in a moment usually works."
        actions={[
          { label: "Try again", href: page },
          { label: "Your listings", href: "/studio" },
        ]}
      />
    );
  }

  const search = await props.searchParams;
  const acts = mine.data.acts;
  const appeals = queue.kind === "ok" ? queue.data.appeals : [];

  return (
    <StudioFrame
      vocabulary={APPEAL_VOCABULARY}
      crumbs={[{ label: "Listings", href: "/studio" }, { label: "Appeals" }]}
      title="Decisions about your listings"
      notice={noticeFrom(search, APPEAL_VOCABULARY)}
    >
      {acts.length === 0 ? (
        <StudioPanel>Nothing has been done to your listings.</StudioPanel>
      ) : (
        <StudioSection title={`${acts.length} ${acts.length === 1 ? "decision" : "decisions"}`}>
          {acts.map((act) => (
            <ActRow key={act.actId} act={act} action={`${page}/actions`} />
          ))}
        </StudioSection>
      )}

      {appeals.length > 0 ? (
        <StudioSection title={`${appeals.length} waiting to be decided`}>
          {appeals.map((appeal) => (
            <QueueRow key={appeal.id} appeal={appeal} action={`${page}/actions`} />
          ))}
        </StudioSection>
      ) : null}
    </StudioFrame>
  );
}

/**
 * One act, with either the appeal form or the appeal's standing.
 *
 * THE FORM IS NOT BEHIND A CLICK. An appeal path that takes three navigations
 * to reach is one most people give up on, and the population that persists
 * through it is not the population the path exists for.
 */
function ActRow({ act, action }: { act: AppealableAct; action: string }) {
  return (
    <div className={STUDIO_RECORD}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[15px] font-semibold text-foreground">
          {ACT_LABELS[act.act] ?? act.act}
        </span>
        <span className="font-mono text-[13px] text-muted-foreground">{act.subjectRef}</span>
      </div>

      <p className="m-0 mt-2 text-[13px] text-muted-foreground">{dateOf(act.occurredAt)}</p>

      {/* The reason, shown to the person it is about. Rendered as text by
          React, like every other operator-authored string on this estate. */}
      <p className="m-0 mt-2 text-[13px] leading-[1.55] text-foreground">{act.reason}</p>

      {act.appeal ? (
        <div className={`mt-3 ${STUDIO_INSET}`}>
          <p className="m-0 text-[13px] font-medium text-foreground">
            {APPEAL_STATE_COPY[act.appeal.state].title}
          </p>
          <p className="m-0 mt-1 text-[13px] leading-[1.55] text-muted-foreground">
            {act.appeal.state === "upheld" && act.appeal.reversed === false
              ? APPEAL_UPHELD_ALREADY_REVERSED
              : APPEAL_STATE_COPY[act.appeal.state].says}
          </p>
          <p className="m-0 mt-2 text-[13px] text-muted-foreground">
            Filed {dateOf(act.appeal.filedAt)}
            {act.appeal.decidedAt ? ` · decided ${dateOf(act.appeal.decidedAt)}` : ""}
          </p>
        </div>
      ) : act.appealable ? (
        <form method="post" action={action} className="mt-3">
          <input type="hidden" name="intent" value="file" />
          <input type="hidden" name="actId" value={act.actId} />
          <label
            htmlFor={`says-${act.actId}`}
            className={LABEL}
          >
            {APPEAL_SAYS_LABEL}
          </label>
          <textarea
            id={`says-${act.actId}`}
            name="says"
            rows={4}
            required
            minLength={MIN_APPEAL_SAYS}
            maxLength={MAX_APPEAL_SAYS}
            className={TEXTAREA}
          />
          <button type="submit" className={`${BTN_PRIMARY} mt-2.5`}>
            Appeal this decision
          </button>
        </form>
      ) : (
        <p className="m-0 mt-3 text-[13px] leading-[1.5] text-muted-foreground">
          {APPEAL_REFUSALS["not-appealable"].says}
        </p>
      )}
    </div>
  );
}

/**
 * One appeal in the operator queue, with the act it disputes above it.
 *
 * UPHOLD IS THE FIRST BUTTON, for the reason TS4's flag queue puts "the check
 * was wrong" first: the reversal rate is the estate's only production
 * measurement of how often it acts wrongly, and putting the agreeable answer
 * second makes "the original stands" the path of least resistance.
 */
function QueueRow({ appeal, action }: { appeal: QueuedAppealView; action: string }) {
  return (
    <div className={STUDIO_RECORD}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[15px] font-semibold text-foreground">
          {ACT_LABELS[appeal.act] ?? appeal.act}
        </span>
        <span className="font-mono text-[13px] text-muted-foreground">
          {appeal.subjectKind} · {appeal.subjectRef}
        </span>
      </div>

      <p className="m-0 mt-2 text-[13px] text-muted-foreground">
        Act taken {dateOf(appeal.actOccurredAt)} · appealed {dateOf(appeal.filedAt)}
      </p>

      <p className="m-0 mt-2 text-[13px] leading-[1.55] text-muted-foreground">
        <span className="font-medium text-foreground">Reason given: </span>
        {appeal.actReason}
      </p>

      <blockquote className="m-0 mt-2.5 border-l-2 border-line pl-3 text-[13px] leading-[1.55] text-foreground">
        {appeal.says}
      </blockquote>

      <form method="post" action={action} className="mt-3">
        <input type="hidden" name="intent" value="decide" />
        <input type="hidden" name="appealId" value={appeal.id} />
        <label htmlFor={`why-${appeal.id}`} className={LABEL}>
          Why
        </label>
        <textarea id={`why-${appeal.id}`} name="reason" rows={3} required minLength={3} className={TEXTAREA} />
        <div className="mt-2.5 flex flex-wrap gap-2.5">
          <button type="submit" name="decision" value="uphold" className={BTN_PRIMARY}>
            {APPEAL_DECISION_COPY.uphold}
          </button>
          <button type="submit" name="decision" value="refuse" className={BTN_OUTLINE}>
            {APPEAL_DECISION_COPY.refuse}
          </button>
        </div>
      </form>
    </div>
  );
}


function dateOf(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "";
  return new Date(parsed).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
