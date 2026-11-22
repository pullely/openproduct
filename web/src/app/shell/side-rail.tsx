"use client";

import { usePathname } from "next/navigation";

import { closeRail } from "./rail-toggle";
import { RailGlyph } from "./rail-glyph";
import { railCurrent } from "./section-for";
import {
  RAIL_GROUPS,
  RAIL_PRIMARY,
  SECTIONS,
  SIGN_IN_PATH,
  type RailLink,
} from "./shell";

/** The rows that are sections: the ones a switch between crossfades (UF3). */
const SECTION_IDS: ReadonlySet<string> = new Set(
  SECTIONS.map((section) => section.id),
);

import { ChevronIcon } from "../ui/icons";
import { AppLink } from "../ui/link";

/**
 * The left rail (openproduct-left-rail LR2, design §4): the whole site's
 * navigation, on every page.
 *
 * PHONE FIRST. Below 960px the rail is not in the page: it is a drawer the
 * bar's menu button opens (`rail-toggle.tsx`), over a scrim, under the bar.
 * From 960px it is pinned beside the content and scrolls on its own. Both
 * are the stylesheet's (`[data-site-rail-nav]` in globals.css); the markup
 * is one tree.
 *
 * ONE LIST, FROM `shell.ts`: the four first rows, then the folding groups.
 * A group folds with `<details>`, so it needs no script and its state is the
 * browser's own.
 *
 * A CLIENT COMPONENT FOR `usePathname`, as the bar is: the lit row is
 * correct in the cached HTML. The path is not personal, so the output is
 * the same for every visitor (I6). The one group only a signed-in visitor
 * sees is in the document for everyone and shown by `data-auth-branch`.
 *
 * AT MOST ONE `aria-current`: `railCurrent` names one row or none.
 *
 * NOT ON THE SIGN-IN DOOR, which is the mark and the way in and nothing
 * else (`top-panel.tsx`).
 */
export function SideRail() {
  const pathname = usePathname() ?? "/";
  const current = railCurrent(pathname);
  if ((pathname.split("?")[0] ?? "/") === SIGN_IN_PATH) return null;

  const row = (link: RailLink) => {
    const on = link.id === current;
    const className = `flex min-h-[44px] items-center gap-3 rounded-[10px] px-3 text-[15px] no-underline transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
      on
        ? "bg-secondary font-semibold text-foreground"
        : "font-normal text-foreground hover:bg-accent"
    }`;
    const body = (
      <>
        <RailGlyph icon={link.icon} className="h-5 w-5 shrink-0" />
        <span className="min-w-0 truncate">{link.label}</span>
      </>
    );
    return (
      <li key={link.id}>
        {link.plain ? (
          <a href={link.href} className={className} onClick={closeRail}>
            {body}
          </a>
        ) : (
          <AppLink
            href={link.href}
            // OFF, like every other chrome link (QE0): a prefetch per row on
            // every page is seventeen documents nobody asked for.
            prefetch={false}
            // The three sections keep UF3's calm switch: the content
            // crossfades and the bar and the rail hold still.
            {...(SECTION_IDS.has(link.id)
              ? { transition: "section" as const }
              : {})}
            aria-current={on ? "page" : undefined}
            className={className}
            onClick={closeRail}
          >
            {body}
          </AppLink>
        )}
      </li>
    );
  };

  return (
    <>
      {/* The scrim behind the drawer. Decoration with one job: a tap outside
          the rail closes it. Not displayed unless the drawer is open. */}
      <div data-site-rail-scrim="" aria-hidden="true" onClick={closeRail} />
      <aside id="site-rail" data-site-rail-nav="" aria-label="Site">
        <nav aria-label="Site" className="flex flex-col gap-2 p-3">
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {RAIL_PRIMARY.map(row)}
          </ul>
          {RAIL_GROUPS.map((group) => {
            const fold = (
              <details
                key={group.id}
                open
                className="group border-t border-border pt-2"
              >
                <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between rounded-[10px] px-3 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-accent [&::-webkit-details-marker]:hidden">
                  {group.title}
                  <ChevronIcon className="h-4 w-4 shrink-0 -rotate-90 transition-transform group-open:rotate-0" />
                </summary>
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                  {group.links.map(row)}
                </ul>
              </details>
            );
            // The one group only a signed-in visitor sees. In the document
            // for everyone (I6); `data-auth-branch` hides it from a browser
            // with no session and `.rail-yours` gives it no height there
            // (globals.css), so the list has no hole.
            return group.signedIn ? (
              <div
                key={group.id}
                data-auth-branch="signed-in"
                className="rail-yours"
              >
                {fold}
              </div>
            ) : (
              fold
            );
          })}
        </nav>
      </aside>
    </>
  );
}
