import { SECTIONS } from "./shell";

/**
 * Which section a path belongs to, and therefore which cell is lit.
 *
 * MOVED OUT OF `top-panel.tsx` BY FR1, because there are two navs now: the
 * header's pills at `sm` and up, and `section-bar.tsx` at the bottom of a
 * phone. Both render the same list from the same source and both must light
 * the same cell — a second copy of this function is a second answer to "where
 * am I", and the two would disagree within an epic.
 *
 * It also becomes testable by moving: the web test lane is module-level and
 * has no JSX, so a rule inside a `.tsx` is a rule no test here can hold.
 *
 * THE ROOT IS BUILDS (id `launches`), and so is everything that is a view
 * of the builds: a product's own page, a day's archived board, the other
 * orders under `/builds/` — except `/builds/roles`, which is Open roles. Topics owns
 * `/topics`. Collections and the leaderboard left the bar at OB1, so their
 * routes light nothing — they are reserved heads below, never a product.
 *
 * A path no section owns lights NOTHING — `/me`, `/studio`, `/digest`.
 */
export function sectionFor(pathname: string): string {
  const path = pathname.split("?")[0] ?? "/";
  const segments = path.split("/").filter((segment) => segment.length > 0);
  const head = segments[0] ?? "";
  if (head === "" || head === "launches") return "launches";
  // OB4 — the builds' other orders are views of the Builds list, except the
  // one that IS the Open roles section's address.
  if (head === "builds") return segments[1] === "roles" ? "roles" : "launches";
  // A person's page is the People section, and its address is `/@ada` —
  // rewritten to `/people/ada` at the router, but the bar reads the address
  // bar. Matching the sigil is what keeps the pill lit where a reader would
  // expect it rather than only on the index.
  if (head.startsWith("@")) return "people";
  const owner = SECTIONS.find(
    (section) => section.href && section.href !== "/" && section.href.slice(1) === head,
  );
  if (owner) return owner.id;
  if (RESERVED_HEADS.has(head)) return "";
  // Anything else at the top level is a product's page — a launch.
  return "launches";
}

/** Top-level routes that are neither a section nor a product's page.
 *  `people` left this list when it became a section again — the lookup above
 *  now owns it. */
const RESERVED_HEADS = new Set([
  "api",
  "auth",
  // OB1 — no longer sections, still routes.
  "collections",
  "leaderboard",
  "create",
  "digest",
  "docs",
  "list",
  "me",
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
