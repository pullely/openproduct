// What becomes public when a maintainer decides (openproduct-commons CB3).
//
// The join is the point of this whole estate — "every accepted contributor
// arrived through this page, and the thread that led to it stays public" is
// the sentence that makes openproduct different from a link directory. So the
// decision has to leave a trail. The question is what KIND of trail, and the
// two halves are not symmetric.
//
// AN ACCEPTANCE IS PUBLISHED. Somebody joined a product; that is a fact about
// the product, it is what a reader came to learn, and the person it names
// consented by applying and being accepted. It rides SN3's consent filter
// like every other name on the page (OPC-5): the event is written, and the
// NAME renders only where the person has confirmed their place.
//
// A DECLINE IS SILENT BY DEFAULT, AND THAT IS THE ASYMMETRY.
//
// "Ada was declined" is a fact about ADA, not about the product, published at
// an address she does not control, permanently, on a page search engines
// crawl. Nobody applies twice to a place that publishes its rejections. The
// harm is entirely hers and the informational value is almost entirely ours.
//
// But a decision trail that only shows acceptances is a boast. So declining
// CAN be published — as an explicit act, with the maintainer's own words, and
// never with the applicant's name. What that publishes is the maintainer's
// reasoning, which is a fact about how this product makes decisions and is
// genuinely useful to the next person considering an offer.
//
// Those two rules together are the whole module: `joined` names a person,
// `declined` never does.

import type { ActivityKind } from "./signals.js";

// ---------------------------------------------------------------------------
// The two outcomes
// ---------------------------------------------------------------------------

/**
 * JR's own vocabulary. CB-5: JR is the source of truth for the join
 * lifecycle, and this renders it rather than mirroring it — so the words are
 * JR's words, and a state JR does not have cannot be represented here.
 */
export const JOIN_DECISIONS = ["approved", "denied"] as const;
export type JoinDecision = (typeof JOIN_DECISIONS)[number];

/** Which activity verb each outcome would write, if it writes one at all. */
export const DECISION_KIND: Record<JoinDecision, ActivityKind> = {
  approved: "joined",
  denied: "declined",
};

// ---------------------------------------------------------------------------
// What gets written
// ---------------------------------------------------------------------------

export interface DecisionPublication {
  /** Write an activity row at all? */
  publish: boolean;
  kind: ActivityKind;
  summary: string;
  /**
   * The subject the row is ATTRIBUTED to, or null for an unattributed one.
   *
   * Null on a decline is the load-bearing part: the row exists, the reasoning
   * is public, and there is no person attached to it anywhere — not in the
   * column, not resolvable later by somebody joining tables.
   */
  actorSubjectId: string | null;
}

export const MAX_DECLINE_REASON = 280;
export const MIN_DECLINE_REASON = 10;

/**
 * The one function, and the shape of the decision.
 *
 * `publishReason` is the maintainer's explicit act: absent or empty means the
 * decline stays silent, which is the default and the answer for every
 * maintainer who never thinks about this feature.
 */
export function decisionPublication(input: {
  decision: JoinDecision;
  applicantSubjectId: string;
  openingTitle: string;
  /** Only ever set by a maintainer deliberately choosing to say something. */
  publishReason?: string | null | undefined;
}): DecisionPublication {
  if (input.decision === "approved") {
    return {
      publish: true,
      kind: "joined",
      // The opening's title, not the person's name: SN3's filter resolves the
      // name at READ time from the consent edge, so a row written today
      // cannot publish somebody who has not confirmed yet.
      summary: `Joined as ${input.openingTitle}`,
      actorSubjectId: input.applicantSubjectId,
    };
  }

  const reason = (input.publishReason ?? "").trim();
  if (reason.length < MIN_DECLINE_REASON || reason.length > MAX_DECLINE_REASON) {
    // SILENT. Not an error and not a refusal — the overwhelmingly common case
    // is a maintainer who declined and said nothing, and that must cost them
    // nothing and produce nothing.
    return { publish: false, kind: "declined", summary: "", actorSubjectId: null };
  }

  return {
    publish: true,
    kind: "declined",
    // The maintainer's own words, bounded. Not a template, not a category
    // from a dropdown: a canned reason is the estate's opinion wearing a
    // maintainer's name, and OPC-6 says the estate holds no such authority.
    summary: reason,
    // NEVER THE APPLICANT. This is the line the whole module exists for.
    actorSubjectId: null,
  };
}

/** Copy for the maintainer's decline form, where the choice is offered. */
export const DECLINE_PUBLISH_LABEL = "Say publicly why, in your own words";

export const DECLINE_PUBLISH_NOTE =
  "Optional, and off unless you write something. It appears on your listing's activity without " +
  "naming anybody — people considering an offer see how you decide, and the person you declined " +
  "is not named anywhere.";

export const DECLINE_SILENT_NOTE = "Leave this empty and nothing is published.";

/** The header's primary action, which depends on whether there is a door. */
export function primaryAction(input: { openRoleCount: number }): {
  label: string;
  kind: "offer" | "thread";
} {
  // reference-design.md, decided: a header whose main button leads to a door
  // that is not there is a header that wastes the one action most visitors
  // take. With nothing open, the useful thing to offer is the conversation.
  return input.openRoleCount > 0
    ? { label: "Offer to contribute", kind: "offer" }
    : { label: "Start a discussion", kind: "thread" };
}
