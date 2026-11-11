"use client";

import * as React from "react";

import type { ListingSection } from "./sections";


/**
 * The product bar (openproduct redesign): the hero's name, its outline and
 * its one action, pinned under the shell's bar once the hero card has
 * scrolled out of view.
 *
 * A CLIENT ISLAND THAT READS NO SESSION AND NO DATA. Everything it draws
 * arrived as props from the document; the only thing it decides is whether
 * the hero is still on screen, which is an `IntersectionObserver` on the
 * hero's id. The server render is nothing at all — the bar has no place on a
 * page that has not been scrolled — so the document is the same bytes for
 * everybody (I6) and the bar's arrival moves nothing: it is `fixed`, not in
 * flow, which is also why the sections carry a `scroll-mt` that allows for
 * it.
 *
 * NOT A SECOND VOTE BOX. The design draws the count in the bar too; the box
 * is a form with the listing's id, and two of them on one page would give
 * `u` two targets. The act stays in the hero, one scroll up.
 *
 * ABSENT ON A PHONE (`max-sm:hidden`), as the sticky outline was before it:
 * a second bar on a 56px-header screen costs more than it gives.
 */
export function ProductBar({
  slug,
  tile,
  tagline,
  sections,
  heroId,
  primary,
}: {
  slug: string;
  /** The 32px `ProductTile`, rendered by the server page (openproduct-studio
   *  OSD3) — the maker's logo or the monogram, the same face as the hero. */
  tile: React.ReactNode;
  tagline: string | null;
  sections: readonly ListingSection[];
  heroId: string;
  primary: { href: string; label: string };
}) {
  const [stuck, setStuck] = React.useState(false);

  React.useEffect(() => {
    const hero = document.getElementById(heroId);
    if (!hero || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Stuck once the hero's bottom edge has passed under the shell's
        // 60px bar — the root margin puts the observed line there.
        if (entry) setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { rootMargin: "-60px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [heroId]);

  if (!stuck) return null;

  return (
    <div
      data-product-bar=""
      className="fixed inset-x-0 top-0 z-30 border-b border-border bg-card/[0.94] backdrop-blur-[10px] max-sm:hidden"
    >
      <div className="mx-auto box-border flex w-full max-w-[1180px] items-center gap-4 overflow-hidden px-7">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          title="Back to the top of this listing"
          className="flex min-w-0 max-w-[34%] shrink items-center gap-2.5 border-0 bg-transparent py-2 text-left"
        >
          {tile}
          <span className="grid min-w-0 leading-[1.3]">
            <span className="truncate text-[14px] font-semibold text-foreground">{slug}</span>
            {tagline ? (
              <span className="max-w-[36ch] truncate text-[12.5px] text-muted-foreground max-lg:hidden">
                {tagline}
              </span>
            ) : null}
          </span>
        </button>
        <span aria-hidden="true" className="h-6 w-px shrink-0 bg-border" />
        <nav aria-label="Jump to a section" className="min-w-[100px] flex-1 overflow-x-auto">
          <ul className="m-0 flex list-none gap-1 p-0">
            {sections.map((section) => (
              <li key={section.id} className="shrink-0">
                <a
                  href={`#${section.id}`}
                  className="inline-flex h-[48px] items-center border-b-2 border-transparent px-3 text-[14px] font-medium text-muted-foreground no-underline hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <a
          href={primary.href}
          className="inline-flex h-[32px] shrink-0 items-center whitespace-nowrap rounded-full bg-primary px-4 text-[13.5px] font-medium text-primary-foreground no-underline transition-opacity hover:opacity-90"
        >
          {primary.label}
        </a>
      </div>
    </div>
  );
}
