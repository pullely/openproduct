// Authorization for the maintainer door — LOCAL since the authority handover
// (openproduct-independence OX4), and WHOLLY local since OX5.
//
// Who may act on a listing is a fact openproduct owns: the subject-keyed
// `listing_maintainers` table, plus a config-borne OPERATOR allowlist for the
// review gate (OX-J). The platform's policy engine no longer carries
// `project.openproduct.*` actions, and this worker no longer imports it.
//
// The last platform question — who may CREATE a listing in a workspace — left
// with the OX5 link grant: the platform answers it ONCE, at link time, by
// minting a signed grant a workspace owner/admin carries over (see seam.ts);
// this worker verifies the signature and stores the attested facts. The
// membership fetchers that used to live in this file (authorization-context,
// workspace visibility, join-request statuses) are gone WITH their binding —
// there is no per-request platform read left on any path.
//
// Deny-by-default is preserved everywhere: an invalid or stale grant refuses,
// an unknown role, an absent maintainer row, and an unset operator list all
// deny.

import type { ListingRole } from "@openproduct/db";

/** The listing-local actions (OX4). `review` is the operator's alone. */
export type ListingAction = "read" | "write" | "publish" | "review";

/** Parse the OPENPRODUCT_OPERATORS env var (comma-separated subject ids). */
export function parseOperators(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}

/**
 * The whole decision table, small enough to read:
 *
 *   read     owner · maintainer · operator
 *   write    owner · maintainer
 *   publish  owner · maintainer
 *   review   operator only — a maintainer must never wave their own listing
 *            through, which is the property OD's admin review carried and
 *            this table keeps.
 */
export function listingActionAllowed(
  action: ListingAction,
  role: ListingRole | null,
  isOperator: boolean,
): boolean {
  switch (action) {
    case "read":
      return role !== null || isOperator;
    case "write":
    case "publish":
      return role !== null;
    case "review":
      return isOperator;
    default:
      return false;
  }
}

export interface ActorContext {
  subjectId: string;
  subjectType: string;
}
