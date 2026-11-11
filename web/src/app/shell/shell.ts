// The commons shell's data (openproduct-commons XP0).
//
// Everything the top panel renders that is not markup lives here, as plain
// values and pure functions, for one reason: the shell is the first thing this
// program ships and the last thing it stops changing. Eight later sub-epics
// each add a destination, a count, or a crumb, and every one of those is a
// one-line edit to a list in this file rather than a hunt through JSX.
//
// It is also the only part of the shell a test can hold. The web test lane is
// module-level (no DOM), so the assertions that matter — every planned section
// names the sub-epic that will deliver it, no menu count is invented before
// XP2, the crumb never renders a raw path — are assertions about this module.
//
// NOTHING HERE IS PERSONAL. The section list, the crumb and the menu's shape
// are identical for every visitor; only the *values* of the counts differ, and
// those arrive from the XP2 overlay after paint. That is what keeps invariant
// I6 (public routes render byte-identically signed-in and signed-out) true of
// the chrome as well as of the pages.

/** A destination in the top panel's section nav. */
export type SectionStatus = "live" | "planned";

export interface Section {
  readonly id: string;
  readonly label: string;
  /** Null while planned: a planned section is not a link, so it has no href. */
  readonly href: string | null;
  readonly status: SectionStatus;
  /**
   * For a planned section, the sub-epic that delivers it, and what it will
   * hold. Rendered as the accessible description, so "not yet" is a statement
   * rather than a dead control.
   */
  readonly arrivesWith?: { readonly cluster: string; readonly holds: string };
  /**
   * The section's glyph (OB1, D6): a key into `ui/icons.tsx`, kept as a name
   * here so this module stays plain data a test can hold without JSX.
   */
  readonly icon: SectionIcon;
}

/** The glyphs a section may wear — one per section, one meaning each. */
export type SectionIcon = "build" | "role" | "topic" | "people";

/**
 * The bar's destinations: Builds, Open roles, Topics, People (OB1, D5).
 *
 * BUILDS, NOT LAUNCHES. openproduct-open-builds reframes the product as the
 * home for building in public, and the first word a reader sees is the frame.
 * The id stays `launches` because `sectionFor`, the archive's paths and every
 * test that lights a cell key on it; a rename there is churn no reader sees
 * (the `schedule` step precedent in `intake.ts`).
 *
 * OPEN ROLES IS LIVE SINCE OB4: its address is the front page's Roles order,
 * `/builds/roles` — the builds asking for people, in the Most active order.
 * It was `planned` at OB1, the convention this shell has kept since XP0 for
 * a destination that does not exist yet.
 *
 * COLLECTIONS AND LEADERBOARD LEFT THE BAR. The leaderboard folds into the
 * Upvoted order (OB7 redirects its route); collections are reachable from the
 * footer. Both routes still exist, so `section-for.ts` and the footer's
 * `hasOwnFooter` list them as reserved heads rather than mistaking them for
 * a product's page.
 *
 * PEOPLE STAYS. `/people` is half of what this site is for — the builds are
 * here to be joined, and the people are who you would be joining.
 */
export const SECTIONS: readonly Section[] = [
  { id: "launches", label: "Builds", href: "/", status: "live", icon: "build" },
  { id: "roles", label: "Open roles", href: "/builds/roles", status: "live", icon: "role" },
  { id: "topics", label: "Topics", href: "/topics", status: "live", icon: "topic" },
  { id: "people", label: "People", href: "/people", status: "live", icon: "people" },
] as const;

/** The one section that is a destination today. */
export function liveSections(): readonly Section[] {
  return SECTIONS.filter((s) => s.status === "live");
}

/**
 * The panel's search affordance. Chrome at XP0, behaviour at DS3.
 *
 * The placeholder names three classes, and DS3 answers all three — two with
 * results and one, `people`, with an explicit "not yet". That is deliberate:
 * quietly dropping the class would make this string a lie, and a reader who
 * searched a colleague's name would conclude they are not here rather than
 * that we cannot look yet.
 *
 * `SEARCH_PENDING_LABEL` is gone with DS3. An unused pending label is how a
 * surface ends up promising something that already arrived.
 */
export const SEARCH_PLACEHOLDER = "Search builds, makers, topics";

/**
 * The breadcrumb label: mono, uppercase, beside the wordmark.
 *
 * Derived from the path and nothing else, so it is the same for every visitor
 * and can be computed during the server render of a client component. It never
 * returns a raw path — an unrecognised route gets its first segment, which is
 * always either a listing slug or a handle, both of which are the right label.
 */
export function resolveCrumb(pathname: string): string {
  const path = pathname.split("?")[0] ?? "/";
  const segments = path.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return "Discover";

  const head = segments[0]!;
  switch (head) {
    case "people":
      return "People";
    case "launches":
      return "Launches";
    case "collections":
      return "Collections";
    case "docs":
      return "Docs";
    case "submit":
    // SB0 moved the page to `/submit` and left `/create` redirecting. BOTH
    // resolve, because the old address still exists and a crumb that read
    // "openproduct" for one hop would be a flicker somebody notices and
    // nobody can explain.
    case "create":
      // Not "Open a build": the brand block is the facet rail's 272px and
      // cannot grow. The short form of the same act (OB1, D4).
      return "New build";
    case "me":
      return "Your home";
    case "studio":
      return "Studio";
    case "saved":
      return "Saved products";
    default:
      // A listing slug (`/kettleworks`) or, from CG1, a handle (`/@ada`).
      // Both are already the label the design shows.
      return head;
  }
}

/**
 * The four counts the account menu shows. Their VALUES come from the XP2
 * overlay — a per-subject read that happens after paint and is allowed to
 * fail. Until it resolves, and whenever it fails, every count renders as
 * `COUNT_PLACEHOLDER`: never `0`, because zero is a claim and an unread
 * overlay has not made one (the same rule SN applies to unobserved metrics).
 */
export type OverlayCountKey =
  | "saved"
  | "applications"
  | "listings"
  | "endorsements"
  // NF0 — how many inbox rows sit after this visitor's read cursor.
  | "unread";

/** What a count reads before the overlay answers, and if it never does. */
export const COUNT_PLACEHOLDER = "—";

export interface AccountMenuItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly countKey?: OverlayCountKey;
  /** Marks the one item that leaves openproduct for the platform. */
  readonly external?: boolean;
}

/**
 * The menu's own items, in the design's order.
 *
 * The design's first row reads "Your public profile · @ada" and points at a
 * public page that does not exist until CG1 mints a handle namespace. Rather
 * than ship a label that is true later, XP0 ships the destination that is true
 * now — the contributor's home — and CG1 replaces this one row.
 */
export const ACCOUNT_MENU_ITEMS: readonly AccountMenuItem[] = [
  // The "You" section. The profile itself moved up into the menu's own
  // Profile section (account-chip.tsx) once CG1 gave it a public address to
  // show; what is left here is what you HOLD on this surface, counted.
  { id: "listings", label: "Your listings", href: "/studio", countKey: "listings" },
  { id: "saved", label: "Saved products", href: "/me/saved", countKey: "saved" },
  {
    id: "applications",
    label: "Your requests",
    href: "/me/applications",
    countKey: "applications",
  },
  // NF0 — the inbox, and the only count here that means "waiting for you"
  // rather than "held by you". It is in the same menu because it is the same
  // question — what is mine on this surface — and one badge in one place
  // beats a second affordance in the panel competing with it.
  { id: "notifications", label: "Notifications", href: "/me/notifications", countKey: "unread" },
  // LC5 — the digest's standing lives on the profile page; the menu only
  // points at it. No count: a subscription is not a number.
  { id: "digest", label: "Weekly digest", href: "/me#digest" },
] as const;

/**
 * Where the sign-in round trip starts, returning to where it began.
 *
 * `/signin` is openproduct's OWN door — the card with both ways in — and not
 * `/auth/start`, which is the first step of the Orunbase handshake and was
 * where this used to point. Choosing Orunbase is a control ON the door.
 */
export function signInHref(returnTo: string | null): string {
  if (!returnTo || returnTo === "/") return "/signin";
  // The server-side `sanitizeReturnTo` is the authority and refuses anything
  // that is not a same-host path; this only has to avoid sending a loop —
  // through the handshake's own routes, or through the door itself.
  if (returnTo.startsWith("/auth") || returnTo.startsWith("/signin")) return "/signin";
  return `/signin?return_to=${encodeURIComponent(returnTo)}`;
}

/** Two initials for an avatar, from an authored display name. */
export function initialsOf(displayName: string | null): string {
  const name = (displayName ?? "").trim();
  if (name.length === 0) return "··";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase();
}
