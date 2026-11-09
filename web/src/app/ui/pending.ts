// "Not yet", said out loud (openproduct-commons XP1).
//
// This program ships a designed surface nine sub-epics before it ships the
// data behind it, which means every screen carries controls that are real in
// the design and inert today. There is exactly one way to get that wrong —
// render them greyed with no explanation — and this module is how it is
// avoided consistently rather than per component.
//
// A pending control names the sub-epic that will make it work and what it
// will then do. That is enough for a visitor to understand they are early
// rather than looking at a bug, and enough for a reviewer to see at a glance
// which parts of a screen are still promises.

export interface Pending {
  /** The two-letter sub-epic cluster that delivers it. */
  readonly cluster: string;
  /** What it will do, in the visitor's terms — not the milestone's. */
  readonly then: string;
}

export function pending(cluster: string, then: string): Pending {
  return { cluster, then };
}

/** The accessible description, and the title attribute. One sentence. */
export function pendingLabel(p: Pending): string {
  return `Not yet — ${p.then}`;
}

/** Shared props for anything rendered inert. */
export function pendingProps(p: Pending): {
  "aria-disabled": true;
  title: string;
  "data-pending": string;
} {
  return { "aria-disabled": true, title: pendingLabel(p), "data-pending": p.cluster };
}

/**
 * Every pending thing on the four route archetypes, in one place.
 *
 * Collected here rather than inlined so that a test can assert the set, and
 * so that the milestone which lights one up deletes an entry from a list
 * instead of hunting for a string in JSX.
 */
export const PENDING = {
  // XP2 lit this: it is live the moment the overlay answers. What remains is
  // the state where it CANNOT be live — a signed-out visitor, or an overlay
  // that did not come back — and those are the same state on purpose.
  savedFacet: pending("XP", "your saved products appear here once you sign in"),
  // DS1 lit six of the seven groups. `team_size` is the one that remains,
  // and it waits on CG3 rather than on more UI: answering it from the
  // published maintainer list would count people who never agreed to appear.
  facetGroup: pending("CG", "team size will count the people who confirmed their place on a listing"),
  // SN2 lit the stat card and the sort. What remains is the TIMELINE — the
  // seven-verb feed — which waits on TS4, because a `merged` line carries a
  // commit message and that is attacker-influenced text on a crawled page.
  activity: pending("SN", "the work landing on this product will show here"),
  discussions: pending("CB", "questions and proposals about this product will live here"),
  componentTests: pending("SN", "test counts and last-touched will be observed from the repository"),
  // CG1 lit the profile PAGE. What remains is the link FROM a name: a person
  // is only linkable once they have opted in, and the mock's rule is that a
  // name which is not a link renders as plain text rather than as a dead one.
  profile: pending("CG", "this person has not published a profile"),
} as const;
