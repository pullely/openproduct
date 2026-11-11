import { BTN_OUTLINE, FIELD, LABEL, TEXTAREA } from "./design";

import {
  REPORT_CONTROL_LABELS,
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  MAX_REPORT_DETAIL,
  type ReportSubjectKind,
} from "@openproduct/contracts";

/**
 * The report control, on every public surface (openproduct-commons TS3).
 *
 * TS0 built the door and nothing that opened it. This is the handle, and it
 * is deliberately the LAST thing on the page and the quietest — a report
 * control that competes with the endorse button changes what the page is
 * about.
 *
 * A SERVER COMPONENT WITH NO CLIENT JS AND NO SESSION READ. It renders inside
 * `[slug]`, which is anonymous and edge-cached: reading a session here would
 * either break the cache or leak whose page it is (I6). The markup is
 * therefore identical for every visitor, signed in or not, and the session is
 * read exactly once — on the POST, in the route handler, which is where every
 * other act on this page reads it too.
 *
 * `<details>` RATHER THAN A DIALOG, for the same reason: a dialog needs
 * JavaScript, and this must work on a page that has none. It also gets the
 * behaviour right for free — closed by default, opened by intent, and
 * keyboard-reachable without a single line of ARIA.
 *
 * SIGNED OUT, THE FORM STILL POSTS. The route bounces through sign-in and
 * returns here. Nothing in this markup says "sign in first", because the
 * intent is the click, and making somebody declare their identity before
 * expressing an intent loses the intent — the same reasoning as SaveControl.
 * The one line about accounts is a NOTE, not a gate: it explains why a report
 * has a name behind it, which is TS-1's first layer.
 */
export function ReportControl({
  subjectKind,
  subjectRef,
  returnTo,
  bare = false,
}: {
  subjectKind: ReportSubjectKind;
  subjectRef: string;
  returnTo: string;
  /** Inside a page's own footer row (the design's "Report this listing"):
   *  the link at the row's type, with no rule or margin of its own. */
  bare?: boolean;
}) {
  // From the contract's map, never a conditional here: a branch that
  // defaults every unknown kind to "listing" is how a discussion page came to
  // say "Report this listing".
  const label = REPORT_CONTROL_LABELS[subjectKind];

  return (
    <details id="report" className={bare ? "px-1" : "mt-10 border-t border-border pt-5"}>
      {/* The design's quiet link: a flag glyph and the label, 13.5px in
          `--muted`, no rule of its own. */}
      <summary
        className={`tap inline-flex cursor-pointer list-none items-center gap-1.5 text-[13.5px] text-muted-foreground marker:content-none hover:text-foreground [&::-webkit-details-marker]:hidden`}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
        >
          <path d="M4 13.5V3M4 3.5h7L9.5 6 11 8.5H4" />
        </svg>
        {label}
      </summary>

      <form
        method="post"
        action="/report"
        className="mt-3 max-w-[62ch] rounded-[12px] border border-border bg-card px-5 py-4"
      >
        <input type="hidden" name="subjectKind" value={subjectKind} />
        <input type="hidden" name="subjectRef" value={subjectRef} />
        <input type="hidden" name="returnTo" value={returnTo} />

        <label className="block">
          <span className={LABEL}>What is wrong with it?</span>
          <select name="reason" required defaultValue="" className={`${FIELD} max-w-[36ch]`}>
            <option value="" disabled>
              Choose a reason
            </option>
            {REPORT_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {REPORT_REASON_LABELS[reason]}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 block">
          <span className={LABEL}>
            Anything else we should know?{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <textarea name="detail" rows={3} maxLength={MAX_REPORT_DETAIL} className={TEXTAREA} />
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="submit" className={`tap ${BTN_OUTLINE}`}>
            Send report
          </button>
        </div>
      </form>
    </details>
  );
}
