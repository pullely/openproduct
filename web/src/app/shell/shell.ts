// The commons shell's data (openproduct-commons XP0).
//
// Everything the chrome renders that is not markup lives here, as plain
// values and pure functions, for one reason: the shell is the first thing this
// program ships and the last thing it stops changing. A destination, a count
// or a footer link is a one-line edit to a list in this file rather than a
// hunt through JSX. openproduct-redesign OPR1 rebuilt the chrome to the
// boards and changed these lists, not that rule.
//
// It is also the only part of the shell a test can hold. The web test lane is
// module-level (no DOM), so the assertions that matter — the three sections
// and their addresses, the phone's four tabs, no menu count invented before
// the overlay answers, the crumb never rendering a raw path — are assertions
// about this module.
//
// NOTHING HERE IS PERSONAL. The section list, the crumb and the menu's shape
// are identical for every visitor; only the *values* of the counts differ, and
// those arrive from the XP2 overlay after paint. That is what keeps invariant
// I6 (public routes render byte-identically signed-in and signed-out) true of
// the chrome as well as of the pages.

/** A destination in the header's section nav. */
export interface Section {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  /**
   * The section's glyph: a key `section-glyph.tsx` resolves into
   * `ui/icons.tsx`, kept as a name here so this module stays plain data a
   * test can hold without JSX. The header's pills are words; the phone's tab
   * bar draws the glyph over the word.
   */
  readonly icon: SectionIcon;
}

/** The glyphs the chrome's destinations wear — one per destination. */
export type SectionIcon = "feed" | "products" | "seats" | "activity";

/**
 * The header's destinations: Feed, Products, Help wanted
 * (openproduct-redesign OPR1; design.md §2 rule 4, locked by the owner).
 *
 * THREE, AND THE LIST IS CLOSED. The bar used to read Builds, Open roles,
 * Topics, People. The redesign's thesis is that the products post for
 * themselves, so the first word is the Feed; the list of builds is Products;
 * and the builds asking for people are Help wanted, at an address of their
 * own (`/help-wanted`; `/builds/roles` redirects to it from the edge, see
 * `next.config.mjs`).
 *
 * TOPICS AND PEOPLE LEFT THE BAR, AND NOTHING LEFT THE SITE. The owner's
 * rule is that there is no People directory in the navigation: a person is
 * found through search and through products. Both routes still exist and
 * both are linked from the footer (`FOOTER_LINKS` below), with every other
 * section that has no board. `section-for.ts` lists their heads as reserved
 * so neither is mistaken for a product's page.
 *
 * EVERY ENTRY IS A LINK. The old list carried a `planned` status for a
 * destination that did not exist yet; all three of these resolve today, so
 * the status went with the sections that needed it.
 */
export const SECTIONS: readonly Section[] = [
  { id: "feed", label: "Feed", href: "/", icon: "feed" },
  { id: "products", label: "Products", href: "/products", icon: "products" },
  { id: "help-wanted", label: "Help wanted", href: "/help-wanted", icon: "seats" },
] as const;

/** Where the Activity bell and the phone's fourth tab go. */
export const ACTIVITY_PATH = "/activity";

/** A cell of the phone's bottom tab bar. */
export interface PhoneTab {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: SectionIcon;
}

/**
 * The phone's four tabs (board `PhoneFeed`): the three sections and Activity.
 *
 * DERIVED FROM `SECTIONS`, so the two navs cannot disagree about what the
 * sections are or where they live. Two things differ on a phone and both are
 * written here rather than in the bar's JSX: Help wanted is labelled "Seats"
 * (an 11px label under a glyph has room for one short word), and Activity is
 * a tab, because the header's bell has no room in a phone's top bar.
 */
export const PHONE_TABS: readonly PhoneTab[] = [
  ...SECTIONS.map((section) => ({
    id: section.id,
    label: section.id === "help-wanted" ? "Seats" : section.label,
    href: section.href,
    icon: section.icon,
  })),
  { id: "activity", label: "Activity", href: ACTIVITY_PATH, icon: "activity" },
];

/** A link in the site footer. */
export interface FooterLink {
  readonly label: string;
  readonly href: string;
  /** A document the client router cannot soft-navigate to (a feed). */
  readonly plain?: boolean;
}

/**
 * The footer's links: every section that has no board
 * (openproduct-redesign design.md §5).
 *
 * THIS IS WHERE THE SECTIONS THAT LEFT THE BAR LIVE. Topics and People were
 * in the header until OPR1; Collections has been here since OB1 and Stacks
 * since CL2; *Open a build* was the header's outlined pill and is here
 * because the board's bar has no room for it. Retiring any of them is a
 * separate decision and not this list's to make, so nothing is dropped.
 *
 * Every `href` is a route this app serves (`shell.test.ts` walks the list
 * against the app directory).
 */
export const FOOTER_LINKS: readonly FooterLink[] = [
  { label: "Topics", href: "/topics" },
  { label: "People", href: "/people" },
  { label: "Stacks", href: "/stack" },
  { label: "Pricing", href: "/pricing" },
  { label: "Collections", href: "/collections" },
  { label: "Discussions", href: "/threads" },
  { label: "Weekly digest", href: "/digest" },
  { label: "RSS", href: "/digest/feed.xml", plain: true },
  { label: "Open a build", href: "/submit" },
  { label: "Docs", href: "/docs" },
  { label: "What runs automatically", href: "/docs/checks" },
  { label: "Transparency", href: "/transparency" },
] as const;

/**
 * The header search's placeholder (board `Feed`).
 *
 * TWO CLASSES, BECAUSE THE CARD ANSWERS TWO. The field used to promise
 * builds, makers and topics; the card under it now holds products and
 * people, and a placeholder naming a class the card does not show would be a
 * promise it does not keep. Topics and stacks are still answered by the
 * results page, one "See all results" away.
 */
export const SEARCH_PLACEHOLDER = "Search products and people";

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
    case "products":
      return "Products";
    case "help-wanted":
      return "Help wanted";
    case "activity":
      return "Activity";
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
  // OPR1 — the saved list and the requests are SECTIONS of `/me` (board
  // `Me`), and the menu names the section's own address rather than the old
  // page's, which only redirects there.
  { id: "saved", label: "Saved products", href: "/me?section=saved", countKey: "saved" },
  {
    id: "applications",
    label: "Your requests",
    href: "/me?section=seats",
    countKey: "applications",
  },
  // NF0 — the inbox, and the only count here that means "waiting for you"
  // rather than "held by you". It is in the same menu because it is the same
  // question — what is mine on this surface. OPR1 moved its address to
  // `/activity` (the old one redirects) and the header's bell goes there too.
  { id: "notifications", label: "Notifications", href: ACTIVITY_PATH, countKey: "unread" },
  // LC5 — the digest's standing is a switch on the settings page, in its
  // Notifications card; the menu only points at it. No count: a subscription
  // is not a number.
  { id: "digest", label: "Weekly digest", href: "/me/settings#notifications" },
] as const;

/** The sign-in door's address. The header reads it too: on the door it
 *  draws the mark and the word and nothing else (`top-panel.tsx`). */
export const SIGN_IN_PATH = "/signin";

/**
 * Where the sign-in round trip starts, returning to where it began.
 *
 * `/signin` is openproduct's OWN door — the card with both ways in — and not
 * `/auth/start`, which is the first step of the Orunbase handshake and was
 * where this used to point. Choosing Orunbase is a control ON the door.
 */
export function signInHref(returnTo: string | null): string {
  if (!returnTo || returnTo === "/") return SIGN_IN_PATH;
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
