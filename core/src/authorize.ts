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

/**
 * The listing-local actions (OX4; SC-3 gave them three roles).
 *
 *   read          the crew's own reads of the listing: its manage view, its
 *                 settings pages, its crew list
 *   write         every change to the product: details, the stage, posts,
 *                 milestones, seats, media, launches, publish/unpublish, the
 *                 link grant, the published roster, discussion moderation
 *   read_crew     the crew's own list of itself (names, roles, counts)
 *   manage_crew   changing who does what — the role routes
 *   read_private  the product's private threads and their notices
 *   review        the curation gate, the operator's alone
 */
export type ListingAction = "read" | "write" | "read_crew" | "manage_crew" | "read_private" | "review";

export const LISTING_ACTIONS: readonly ListingAction[] = ["read", "write", "read_crew", "manage_crew", "read_private", "review"];

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
 * THE WHOLE DECISION TABLE (design §2.3), small enough to read. A row names
 * who may take the action: which roles, and whether the operator allowlist
 * does on its own.
 *
 *                  lead  maintainer  member  operator
 *   read            ✓        ✓         ✓        ✓
 *   write           ✓        ✓
 *   read_crew       ✓        ✓         ✓
 *   manage_crew     ✓
 *   read_private    ✓        ✓         ✓
 *   review                                      ✓
 *
 * `review` stays the operator's alone — a crew must never wave its own
 * listing through, which is the property OD's admin review carried. An
 * operator reads a listing (to review it) and writes nothing on it, and is
 * not let into its private threads (the author's and the crew's) or its
 * crew list (who is on a crew who has not published themselves is the
 * crew's to know).
 *
 * DENY BY DEFAULT: no role (`null`), a role outside the three, an action
 * outside the table and an unset operator list all refuse.
 */
export const LISTING_DECISIONS: Readonly<Record<ListingAction, { roles: readonly ListingRole[]; operator: boolean }>> = {
  read: { roles: ["lead", "maintainer", "member"], operator: true },
  write: { roles: ["lead", "maintainer"], operator: false },
  read_crew: { roles: ["lead", "maintainer", "member"], operator: false },
  manage_crew: { roles: ["lead"], operator: false },
  read_private: { roles: ["lead", "maintainer", "member"], operator: false },
  review: { roles: [], operator: true },
};

export function listingActionAllowed(
  action: ListingAction,
  role: ListingRole | null,
  isOperator: boolean,
): boolean {
  const row = Object.prototype.hasOwnProperty.call(LISTING_DECISIONS, action) ? LISTING_DECISIONS[action] : undefined;
  if (!row) return false;
  if (row.operator && isOperator) return true;
  return role !== null && row.roles.includes(role);
}

export interface ActorContext {
  subjectId: string;
  subjectType: string;
}
