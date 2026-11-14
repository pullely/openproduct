import { ACTIVITY_PATH, SECTIONS } from "./shell";

/**
 * Which destination a path belongs to, and therefore which pill or tab is
 * lit.
 *
 * ITS OWN MODULE SINCE FR1, because there are two navs: the header's pills at
 * `sm` and up, and `section-bar.tsx` at the bottom of a phone. Both render
 * from the same list and both must light the same cell — a second copy of
 * this function is a second answer to "where am I", and the two would
 * disagree within an epic. It is also testable here: the web test lane is
 * module-level and has no JSX, so a rule inside a `.tsx` is a rule no test
 * can hold.
 *
 * THE ANSWERS ARE THE BOARDS' (openproduct-redesign OPR1):
 *
 *   feed         `/` and nothing else
 *   products     `/products`, the page after it, the list's other orders
 *                under `/builds/`, and a product's own page (boards
 *                `Products`, `Product`, `ProductIdea` all light Products)
 *   help-wanted  `/help-wanted` — and `/builds/roles`, its old address,
 *                for the one hop before the edge redirect lands
 *   activity     `/activity` — the header's bell and the phone's fourth tab
 *
 * A path nothing owns lights NOTHING — a person's page, `/me`, `/search`,
 * `/topics`, `/studio`, `/digest`. Topics and People left the bar at OPR1,
 * so their heads are reserved below, never a product.
 */
export function sectionFor(pathname: string): string {
  const path = pathname.split("?")[0] ?? "/";
  const segments = path.split("/").filter((segment) => segment.length > 0);
  const head = segments[0] ?? "";
  if (head === "") return "feed";
  // The list's other orders are views of Products, except the one that was
  // the Help wanted section's address before it had its own.
  if (head === "builds") return segments[1] === "roles" ? "help-wanted" : "products";
  if (head === ACTIVITY_PATH.slice(1)) return "activity";
  // A person's page is `/@ada` in the address bar (rewritten to
  // `/people/ada` at the router). It is nobody's section: the owner's rule is
  // that People is not in the navigation.
  if (head.startsWith("@")) return "";
  const owner = SECTIONS.find(
    (section) => section.href !== "/" && section.href.slice(1) === head,
  );
  if (owner) return owner.id;
  if (RESERVED_HEADS.has(head)) return "";
  // Anything else at the top level is a product's page.
  return "products";
}

/**
 * Top-level routes that are neither a section nor a product's page.
 *
 * ONE LIST, TWO READERS: `sectionFor` above (a reserved head lights nothing)
 * and the footer's `hasOwnFooter` (a reserved head takes the site footer
 * rather than a product page's own). They were two lists, and they had
 * drifted — `/stack` and `/pricing` were in neither, so both lit a section
 * and lost their footer as if they were products.
 */
export const RESERVED_HEADS: ReadonlySet<string> = new Set([
  // Lit by `sectionFor` before this list is consulted; here for the footer.
  "activity",
  "api",
  "auth",
  // OB1 — no longer sections, still routes.
  "collections",
  "leaderboard",
  "create",
  "digest",
  "docs",
  // A day's archived board (`/launches/{day}`): outside the nav since OB4.
  "launches",
  "list",
  "me",
  // OPR1 — these left the bar and are linked from the footer.
  "people",
  "pricing",
  "stack",
  "topics",
  "report",
  "search",
  // openproduct-calm-pages CP1 — the sign-in door and the share and comment
  // routes are not a product's page; `/signin` lit Builds.
  "signin",
  "badge",
  "comment",
  "og",
  "studio",
  "submit",
  "threads",
  "transparency",
]);

/**
 * A product page (`/kettleworks`) or a person's page (`/people/ada`, served
 * at `/@ada`) carries its own footer. Everything else takes the site's
 * (`site-footer.tsx`).
 *
 * HERE, BESIDE `sectionFor`, because it is the same question asked for a
 * different reason — is this top-level path a product, a person, or one of
 * ours — and because a pure function in a `.ts` is one a test can call.
 */
export function hasOwnFooter(pathname: string): boolean {
  const segments = pathname.split("?")[0]!.split("/").filter((s) => s.length > 0);
  if (segments.length === 1) {
    const head = segments[0]!;
    if (head.startsWith("@")) return true;
    if (RESERVED_HEADS.has(head)) return false;
    if (SECTIONS.some((s) => s.href === `/${head}`)) return false;
    return true;
  }
  return segments.length === 2 && segments[0] === "people";
}
