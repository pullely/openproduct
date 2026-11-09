// CV2 — the maintainer badge (openproduct-worldclass).
//
// ONE COMPONENT, ONE RULE, AND THE RULE IS NOT HERE. What the badge means
// lives in the contract (`isMaintainerPost`) and is decided by core over
// subject ids; this file draws it. That split is the milestone: the badge
// used to be a comparison written inline on one page, and the comparison was
// wrong in a way nobody would have noticed.
//
// IT COMPARED HANDLES. A handle is a public profile somebody opted into
// (CG1); a maintainer is somebody on the listing's published roster (OPC-5).
// A maintainer who never published a profile has no handle, so the comparison
// said "not a maintainer" — turning an opt-in into a status, which is the
// opposite of what OPC-5 is for. Answering a question about a person by
// looking at whether they chose to be findable is the shape of that bug, and
// it is worth recognising again elsewhere.

import { MAINTAINER_BADGE, MAINTAINER_BADGE_NOTE } from "@openproduct/contracts";

/**
 * The one badge. Rendered when — and only when — the projection says so.
 *
 * Neutral, on `--secondary` (CP-R1): green means "this is open to you" and
 * this is not that, and the endorse accent is the upvote's (XP-1). The word
 * carries the meaning; a colour of its own would be a fourth semantic one.
 *
 * `title` carries the whole rule, because the word alone invites a bigger
 * reading than it deserves — not "trust this", not a moderator, not staff.
 */
export function MaintainerBadge() {
  return (
    <span
      title={MAINTAINER_BADGE_NOTE}
      className="inline-flex h-[18px] items-center rounded-[4px] bg-secondary px-1.5 text-[11px] font-medium text-foreground"
    >
      {MAINTAINER_BADGE}
    </span>
  );
}
