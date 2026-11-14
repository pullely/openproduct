"use client";

import { usePathname } from "next/navigation";

import { hasOwnFooter } from "./section-for";
import { FOOTER_LINKS } from "./shell";

import { AppLink } from "../ui/link";
import { ThemeToggle } from "../ui/theme-toggle";

/**
 * The site's footer (restyled at openproduct-redesign OPR1): one sentence
 * about whose surface this is, the links to every section that has no board,
 * and the theme control.
 *
 * THE HOME OF WHAT LEFT THE BAR. The header is Feed, Products and Help
 * wanted (design.md §2 rule 4). Topics, People, Stacks, Pricing,
 * Collections, the forum, the digest and its feed, the docs and the
 * transparency report keep their routes and are linked from here
 * (`FOOTER_LINKS` in `shell.ts`); design.md §5 says so in as many words.
 * Nothing was removed from the site.
 *
 * In the page's own column (1180px, 24px gutters) under a hairline, 13px in
 * `--muted`; the links are a wrapping row of plain words, each a 44px target
 * on a phone (`tap`).
 *
 * A client component for `usePathname` only — the path resolves during the
 * server render too, so the output is static for every visitor (I6). A
 * product page and a person page carry footers of their OWN (what was
 * observed at publish, the report door, the page's short address), so this
 * one steps aside on those routes and the page renders its own.
 */
export function SiteFooter() {
  const pathname = usePathname() ?? "/";
  if (hasOwnFooter(pathname)) return null;
  const link = "tap text-muted-foreground no-underline hover:text-foreground hover:underline hover:underline-offset-[3px]";
  return (
    <footer className="mx-auto box-border w-full max-w-[1180px] px-6 max-sm:px-4">
      <div className="flex flex-col gap-4 border-t border-line pb-10 pt-6 text-[13px] text-muted-foreground">
        <nav aria-label="More" className="flex flex-wrap items-center gap-x-5 gap-y-1 max-sm:gap-y-0">
          {FOOTER_LINKS.map((item) =>
            // A feed is a document, not a page: the client router cannot
            // soft-navigate to it, so it is a real anchor.
            item.plain ? (
              <a key={item.href} className={link} href={item.href}>
                {item.label}
              </a>
            ) : (
              <AppLink key={item.href} className={link} href={item.href}>
                {item.label}
              </AppLink>
            ),
          )}
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
          <span className="max-w-[60ch]">
            Products built in the open. Every build is a public repo and a public workspace on
            Orunbase.
          </span>
          {/* FR1 — the theme control, at the end of the page. A preference
              that is not content belongs here on a text-first site; the
              account menu carries it too, for a signed-in visitor. */}
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
