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
 *   products     `/products`, the page after it, and a product's own page
 *                (boards `Products`, `Product`, `ProductIdea` all light
 *                Products)
 *   help-wanted  `/help-wanted`
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
 * ONE LIST. It had a second reader — the footer, which stepped aside on a
 * product's page and asked this list what a product's page was — and before
 * that it was two lists that had drifted (`/stack` and `/pricing` were in
 * neither, so both lit a section as if they were products). The footer is on
 * every page since OPR1, so `sectionFor` is the only reader left.
 */
export const RESERVED_HEADS: ReadonlySet<string> = new Set([
  // The path Next renders an UNMATCHED address under on the server
  // (`/_not-found`). Without it the not-found page for an address no route
  // owns — `/builds/zzz`, `/a/b/c` — was served with Products lit, as if it
  // were a product's page (seen in a browser at OPR1).
  "_not-found",
  "api",
  "auth",
  // OPR1 — every `/builds/{order}` address redirects (`next.config.mjs`);
  // what is left under the head is a 404, which lights nothing.
  "builds",
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
