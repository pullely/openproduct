// Which destinations a hover or a touch may fetch ahead of the click
// (openproduct-performance OPP13). The policy behind `ui/link.tsx`'s intent
// prefetch, in a `.ts` module so the module-level test lane can assert it.
//
// A personal route is never warmed: `/me`, `/studio`, `/signin` and `/search`
// are dynamic, so a prefetch would be a personal render for a page the visitor
// may never open; `/auth/*` are route handlers that redirect off this origin.
// A prefix is a path SEGMENT — `/mentors` is not under `/me`.

export const UNWARMED_PREFIXES = ["/me", "/studio", "/auth", "/signin", "/search"] as const;

export function warmable(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  const path = href.split(/[?#]/)[0] ?? "";
  return !UNWARMED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
