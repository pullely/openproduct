"use client";

import { usePathname } from "next/navigation";

import { STACKS_PATH } from "@openproduct/contracts";

import { SECTIONS } from "./shell";

import { AppLink } from "../ui/link";
import { ThemeToggle } from "../ui/theme-toggle";

/**
 * The site's footer, as the design draws it: one sentence about whose surface
 * this is, and four quiet underlined links.
 *
 * A 1px `--line` rule, then the bar's own gutter (it spans the window, as the
 * bar does since openproduct-calm CL1), the two halves spaced apart at 13.5px
 * in `--muted`, wrapping on a narrow page. The links are the prototype's own words — the digest, its
 * feed, the transparency page ("What we removed, and how often we were
 * wrong") and the checks page ("What runs automatically").
 *
 * A client component for `usePathname` only — the path resolves during the
 * server render too, so the output is static for every visitor (I6). The
 * design gives a product page and a person page footers of their OWN (what
 * was observed at publish, the report door, the page's short address), so
 * this one steps aside on those routes and the page renders its own.
 */
export function SiteFooter() {
  const pathname = usePathname() ?? "/";
  if (hasOwnFooter(pathname)) return null;
  return (
    <footer className="border-t border-line">
      <div className="flex w-full flex-wrap items-center justify-between gap-5 px-[44px] pb-10 pt-7 text-[13.5px] text-muted-foreground max-lg:px-7 max-sm:px-4">
        <span className="max-w-[52ch]">
          Products built in the open. Every build is a public repo and a public workspace on
          Orunbase.
        </span>
        <span className="flex flex-wrap items-center gap-4 max-sm:gap-x-4 max-sm:gap-y-0">
          <AppLink className="tap underline underline-offset-[3px] hover:text-foreground" href="/digest">
            Weekly digest
          </AppLink>
          {/* OB1 — collections left the bar; this is their door now. */}
          <AppLink className="tap underline underline-offset-[3px] hover:text-foreground" href="/collections">
            Collections
          </AppLink>
          {/* CL2 — the stack index's door. It was the front page margin's
              *Built with* panel until the margin left with render C (CL-R5). */}
          <AppLink className="tap underline underline-offset-[3px] hover:text-foreground" href={STACKS_PATH}>
            Stacks
          </AppLink>
          <a
            className="tap underline underline-offset-[3px] hover:text-foreground"
            href="/digest/feed.xml"
          >
            RSS
          </a>
          <AppLink className="tap underline underline-offset-[3px] hover:text-foreground" href="/transparency">
            What we removed, and how often we were wrong
          </AppLink>
          {/* AG0 — THE API'S FRONT DOOR, and its absence is the finding. This
              footer linked `/docs/checks`, a CHILD of a page it did not link,
              so the only ways to `/docs` were from its own two children —
              themselves reached from footnotes under a formula. The audit
              browsed the entire site and did not find the API. It is shipped,
              it is anonymous, it is cached, and it has been running for
              months; an API nobody can find has the same value as one that
              does not exist. */}
          <AppLink className="tap underline underline-offset-[3px] hover:text-foreground" href="/docs">
            The API
          </AppLink>
          <AppLink className="tap underline underline-offset-[3px] hover:text-foreground" href="/docs/checks">
            What runs automatically
          </AppLink>
          {/* FR1 — the theme control, at the end of the page rather than in
              the bar. A preference that is not content belongs here on a
              text-first site, and the header has 343px at 375 with four
              things in it already. */}
          <ThemeToggle />
        </span>
      </div>
    </footer>
  );
}

/** Top-level routes that are neither a section nor a product's page. */
const RESERVED_TOP_LEVEL = new Set([
  "api",
  "auth",
  // OB1 — no longer sections, still routes with the site footer.
  "collections",
  "leaderboard",
  "create",
  "digest",
  "docs",
  "launches",
  "list",
  "me",
  "people",
  "report",
  "search",
  "studio",
  "submit",
  "threads",
  "transparency",
]);

/**
 * A product page (`/kettleworks`) or a person's page (`/people/ada`, served
 * at `/@ada`) carries its own footer. Everything else takes this one.
 */
export function hasOwnFooter(pathname: string): boolean {
  const segments = pathname.split("?")[0]!.split("/").filter((s) => s.length > 0);
  if (segments.length === 1) {
    const head = segments[0]!;
    if (head.startsWith("@")) return true;
    if (RESERVED_TOP_LEVEL.has(head)) return false;
    if (SECTIONS.some((s) => s.href === `/${head}`)) return false;
    return true;
  }
  return segments.length === 2 && segments[0] === "people";
}
