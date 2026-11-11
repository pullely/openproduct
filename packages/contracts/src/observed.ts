// PV0 — the observed row (openproduct-worldclass).
//
// A LISTING SHOWS TWO KINDS OF THING AND MUST NEVER BLUR THEM. A tagline is
// what a maintainer wrote; a licence is what this product read. Both are true
// and they are true in different ways, and the whole of OPC-2 is that a
// reader can tell which is which without being told how the estate works.
//
// So an observed signal is not a styled string. It is a value, the moment it
// was read, and the address of the rule that produced it — and if any of the
// three is missing there is nothing to render, because a number without its
// moment is a claim wearing a fact's clothes.

import { FORMULAS, type FormulaId } from "./provenance.js";

/** The four a public repository read can see. `tests` is deliberately not
 *  among them — see `FORMULAS["repo.licence"]` and its neighbours. */
export const OBSERVED_SIGNALS = ["licence", "language", "lastCommit", "openIssues"] as const;
export type ObservedSignalId = (typeof OBSERVED_SIGNALS)[number];

export const OBSERVED_SIGNAL_LABEL: Readonly<Record<ObservedSignalId, string>> = {
  licence: "Licence",
  language: "Language",
  lastCommit: "Last commit",
  openIssues: "Open issues",
};

/** Each signal's published rule. One id, one sentence, one address (OPC-4). */
export const OBSERVED_SIGNAL_FORMULA: Readonly<Record<ObservedSignalId, FormulaId>> = {
  licence: "repo.licence",
  language: "repo.language",
  lastCommit: "repo.last-commit",
  openIssues: "repo.open-issues",
};

/**
 * WHEN AN OBSERVATION STOPS BEING ONE.
 *
 * A signal read ninety days ago is not a fact about the repository today; it
 * is a fact about the repository in June, still on the page, indistinguishable
 * from one read this morning. That is the failure mode an observed frame is
 * most likely to have — not a wrong number, a stale one presented as current.
 *
 * THIRTY DAYS, and the number is a judgement rather than a derivation: it is
 * long enough that an ordinary listing is never withdrawn between sweeps, and
 * short enough that a withdrawn signal means the sweep has actually stopped
 * rather than merely been slow. It is published in the frame's own copy so a
 * reader meets the rule rather than inferring it from a date.
 */
export const SIGNAL_STALE_AFTER_DAYS = 30;

// OB5 — the build page's rail calls the observed repository facts *Code*:
// the public repo is half of what a build is, and the word is the reader's.
export const OBSERVED_FRAME_HEADING = "Code";

export const OBSERVED_FRAME_NOTE =
  "Read from the linked public repository, not written by its maintainers. Each line links the rule that produced it.";

export const SIGNAL_WITHDRAWN_NOTE =
  `Withdrawn: this was last read more than ${SIGNAL_STALE_AFTER_DAYS} days ago, so it is no longer a statement about the repository today.`;

export interface ObservedSignal {
  readonly id: ObservedSignalId;
  readonly label: string;
  /** What to render. `null` where the repository was read and answered
   *  nothing — which the row shows as a dash, never as a zero (OPC-C). */
  readonly value: string | null;
  /** ISO 8601 — when it was read. Required by construction: a signal with no
   *  moment is not renderable in this frame at all. */
  readonly observedAt: string;
  readonly formula: FormulaId;
  /** Older than the horizon. The row still renders — a withdrawn signal that
   *  vanished would leave a reader unable to tell it apart from one that was
   *  never observed. */
  readonly withdrawn: boolean;
}

/**
 * Is this observation older than the horizon?
 *
 * Takes `now` rather than reading the clock, for the reason every dated
 * function on this estate does: a page renders on a server and hydrates in a
 * browser, and a rule that read two different clocks would withdraw a signal
 * in one of them.
 */
export function signalWithdrawn(observedAt: string, now: Date): boolean {
  const at = Date.parse(observedAt);
  if (Number.isNaN(at)) return true;
  return now.getTime() - at > SIGNAL_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * The observed row for a listing, or nothing at all.
 *
 * NOTHING AT ALL IS A REAL ANSWER. A listing whose repository has never been
 * read has no observed row — not an empty one, and not four dashes. Four
 * dashes would say "we looked and found nothing", which is a different and
 * false statement.
 *
 * EVERY SIGNAL IN THE ROW CARRIES THE SAME MOMENT, because they came from one
 * read. Per-signal moments would be a shape that could go wrong: the day
 * somebody adds a signal from a different source, the frame would keep
 * presenting them as one observation.
 */
export function observedRow(
  /**
   * THE PUBLIC SHAPE, not the maintainer one. This row renders on the public
   * listing, so it reads the projection that page already holds — a function
   * taking the storage names would make the page translate, and a page that
   * translates is a page that can translate wrongly.
   */
  profile: {
    observedAt: string | null;
    licence: string | null;
    language: string | null;
    lastCommitAt: string | null;
    openIssues: number | null;
  },
  now: Date,
): ObservedSignal[] {
  const observedAt = profile.observedAt;
  if (observedAt === null) return [];
  const withdrawn = signalWithdrawn(observedAt, now);
  const values: Record<ObservedSignalId, string | null> = {
    licence: profile.licence,
    language: profile.language,
    lastCommit: profile.lastCommitAt,
    // A ZERO IS A CLAIM AND THIS ONE IS EARNED: the repository was read and
    // it has none open. `null` — never read — is the dash.
    openIssues: profile.openIssues === null ? null : String(profile.openIssues),
  };
  return OBSERVED_SIGNALS.map((id) => ({
    id,
    label: OBSERVED_SIGNAL_LABEL[id],
    value: values[id],
    observedAt,
    formula: OBSERVED_SIGNAL_FORMULA[id],
    withdrawn,
  }));
}

/** Every formula the row links, for a test that wants to walk them. */
export function observedFormulas(): readonly FormulaId[] {
  return OBSERVED_SIGNALS.map((id) => OBSERVED_SIGNAL_FORMULA[id]);
}

/** The sentence behind one signal, for a page that shows it. */
export function observedSentence(id: ObservedSignalId): string {
  return FORMULAS[OBSERVED_SIGNAL_FORMULA[id]].sentence;
}
