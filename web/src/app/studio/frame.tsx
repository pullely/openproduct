// The studio frame (openproduct-commons XP3).
//
// FOUR MAINTAINER SURFACES LAND HERE, and only one of them exists yet:
// OD6's listing editor today, LC0's launch scheduler, CG3's roster manager
// and CB1's moderation view after it. The frame exists so those three cost
// LAYOUT AND NOT INVENTION — but the layout is the least of what it carries.
// What it really encodes is the four decisions that are the same on every
// maintainer surface, and that three separate authors would otherwise each
// answer slightly differently:
//
//   1. WHERE AM I, AND HOW DO I GET BACK. Every studio surface is reached
//      from somewhere, and a maintainer deep in a listing needs one click out
//      that is not the browser's.
//
//   2. WHAT JUST HAPPENED. Every one of these surfaces posts a form and lands
//      back on itself with a result in the URL, so every one of them needs a
//      banner — and they need to be the SAME banner, because a maintainer who
//      learns what "saved" looks like on one screen should not have to learn
//      it again on the next.
//
//   3. WHAT IS BLOCKING ME, AND WHAT DO I DO ABOUT IT. OD6 established that a
//      refusal names the REMEDY, not the state; that rule is worth more than
//      the screen it was written for.
//
//   4. WHEN THERE IS NOTHING TO SHOW. Handled by the public `FailurePanel`,
//      deliberately: a maintainer who cannot load a listing is in the same
//      position as a visitor who cannot load a page, and two components would
//      have drifted into two tones.
//
// A CORRECTION THIS FRAME MAKES ALONG THE WAY. The editor rendered a refusal
// in `text-muted-foreground` and a success in full contrast — an interface
// that whispers bad news and announces good news. A person who needs to read
// one of those two messages carefully needs to read the refusal. So `said`
// and `refused` are distinguished by a marker and by weight, and the refusal
// is not the fainter of the two.
//
// ONE ISLAND, AND OPP15 IS WHY. This frame used to say "no client JS", on the
// reasoning that a frame pulling in an island would put a bundle on every
// maintainer surface to render a heading. That reasoning still holds for the
// heading — and it is exactly backwards for decision 2 above. Every studio
// surface posts a form and lands back on itself with a result: two round
// trips and a discarded document to change one field, measured at 700 ms on a
// production-shaped connection. The banner is where that result appears, so
// the banner is where the island goes (`live-save.tsx`): the same forms post
// in the background, and this says what happened without the reload.
//
// The rest is still server-rendered, the forms are untouched, and the session
// token still never reaches the browser (OX5b) — the act goes to the same
// route, which reads the session server-side. With no JavaScript every form
// posts and redirects exactly as it always has.
//
// THE DESIGN'S FRAME: a 1000px column with `20px 32px 80px` of padding, the
// breadcrumb at 13.5px, the 26px sans title with its status line on the same
// baseline, a 15px lede in `--copy`, and the section strip — 38px tabs on a
// hairline, the current one underlined in `--foreground` (CL-R8) — 20px under it.

import { AppLink } from "../ui/link";

import type { ReactNode } from "react";

import { CHIP_BTN, CHIP_OFF, CHIP_ON, FOCUS, H2, INSET, PAGE_TITLE, PANEL, TILE } from "../ui/design";
import { hueFor } from "../feed/tile";
import { StudioLive } from "./live-save";
import type { StudioNotice, StudioVocabulary } from "./notices";

/** Where the visitor is, as a trail they can walk back up. */
export interface StudioCrumb {
  readonly label: string;
  /** Absent on the last crumb — the page you are on is not a link to itself. */
  readonly href?: string;
}

/** A result to report, from one vocabulary — defined in `notices.ts`, where
 *  the island can read it too, and re-exported here because every surface
 *  already imports it from the frame. */
export type { StudioNotice, StudioVocabulary } from "./notices";

/**
 * Something standing between the maintainer and what they were trying to do.
 *
 * `remedy` is REQUIRED, and that is the whole point (OD6). A blocker with no
 * remedy is a status message dressed as an instruction: it tells somebody
 * they cannot proceed and leaves them to work out why, which is the failure
 * this shape was built to make impossible to ship.
 */
export interface StudioBlocker {
  readonly title: string;
  /** A SENTENCE, not a node. The island renders these after a live act
   *  (OPP15) and a `ReactNode` cannot cross that boundary — which is no loss:
   *  every one of them comes from `blockerCopy`, which answers prose. */
  readonly remedy: string;
}

/**
 * The studio's own sections.
 *
 * DECLARED IN ONE LITERAL, with the ones that do not exist yet marked rather
 * than omitted. A maintainer who can see that launches are coming knows this
 * surface is not finished; one who sees only "Listings" has no way to tell
 * whether the rest was never built or is hidden from them. It is the same
 * discipline `PENDING` applies to the public routes, and the milestone that
 * lights one up deletes a flag here rather than adding a nav entry somewhere.
 */
export const STUDIO_SECTIONS: ReadonlyArray<{
  readonly label: string;
  readonly href: string;
  readonly live: boolean;
  /** What it will do, for the ones that do not exist yet. */
  readonly then?: string;
}> = [
  { label: "Listings", href: "/studio", live: true },
  // openproduct-studio OSD7 — COLLECTIONS AND APPEALS WERE BUILT AND NOT
  // REACHABLE. Both pages existed under `/studio/` with the frame's crumbs,
  // but nothing in the studio linked to them: a maker learned of an appeal
  // from a notice, and of collections from nowhere. A section that exists and
  // is not in the nav is the opposite of the `live: false` discipline above
  // — a finished thing hidden — so they are listed like the others. Both
  // render for every signed-in maker (Collections says who is eligible;
  // Appeals lists what was done to your own listings), so neither needs a gate.
  { label: "Collections", href: "/studio/collections", live: true },
  { label: "Appeals", href: "/studio/appeals", live: true },
  // NO TOP-LEVEL "LAUNCHES" ENTRY, and the reason is worth writing down
  // because it looked obviously right until a browser showed otherwise. LC0's
  // scheduler is PER LISTING — you reach it from the listing, because a launch
  // is a thing you do to one product. A planned top-level section by that name
  // greyed itself out on the very page it named, which reads as the surface
  // not knowing where you are. A cross-listing view may exist one day; it will
  // be added when it is built, not promised in a way that shadows a real page.
  // TS3 made this real. XP3 reserved the slot and greyed it; the queue now
  // exists, so it links. It renders for everybody and refuses inside — an
  // operator-only entry hidden from the nav would tell anybody who found the
  // URL that they had found something.
  // openproduct-studio OSD7 looked at hiding it from non-operators and KEPT
  // IT VISIBLE: the frame knows only the session cookie, which is a pointer
  // and never a claim (`auth.ts`), so knowing "operator" here would be one
  // more read on every studio page — and the reason above still stands.
  { label: "Reports", href: "/studio/reports", live: true },
];

/**
 * The frame itself.
 *
 * `title` is the thing being worked on — a listing's slug, "Your listings" —
 * not the section's name, which the crumbs already carry. `status` is the one
 * fact that belongs beside a title on a maintainer surface: whether the thing
 * is public.
 */
export function StudioFrame({
  crumbs,
  title,
  status,
  lede,
  notice,
  blockers,
  nav,
  vocabulary,
  head,
  children,
}: {
  crumbs: readonly StudioCrumb[];
  title: string;
  status?: ReactNode | undefined;
  lede?: ReactNode | undefined;
  // `| undefined` explicitly, because this app runs with
  // `exactOptionalPropertyTypes`: a surface that computes "no notice this
  // time" as `undefined` must be able to pass it, and forcing every caller to
  // spread-or-omit would be a type rule shaping JSX for no benefit.
  notice?: StudioNotice | undefined;
  blockers?: readonly StudioBlocker[] | undefined;
  /**
   * A second strip under the studio's own sections, for a surface whose
   * children are themselves addresses (IN1's listing steps).
   *
   * A SLOT RATHER THAN A LIST THE FRAME OWNS: the studio's sections are the
   * same everywhere and belong here, but a listing's steps are a fact about
   * one listing — the frame would have to be told which listing, which is the
   * frame knowing about its callers.
   */
  nav?: ReactNode | undefined;
  /**
   * This surface's words (OPP15).
   *
   * REQUIRED, so that adding a studio surface is a compiler error until it
   * says which vocabulary its acts report through. The frame reports a
   * result twice — server-rendered from the address for a plain post, and
   * from the island for a live one — and both readings go through this one
   * map, so the two cannot say different things about one act.
   */
  vocabulary: StudioVocabulary;
  /**
   * THE EDITOR'S HEAD, in place of the crumbs, the title and the section
   * strip. A listing's editor (the design's) carries its name in its own
   * hero card and its way back as one link, so the frame draws that row
   * instead — on the design's 1180px column — and everything else the frame
   * decides (the banner, the blockers, the vocabulary) stays exactly as it
   * is on every other surface.
   */
  head?: ReactNode | undefined;
  children: ReactNode;
}) {
  return (
    <main
      className={
        head
          ? "box-border mx-auto w-full max-w-[1180px] px-7 pb-[72px] pt-5 max-sm:px-4"
          : "box-border mx-auto w-full max-w-[1000px] px-8 pb-20 pt-5 max-sm:px-4"
      }
    >
      {head ? (
        head
      ) : (
        <>
          <StudioCrumbs crumbs={crumbs} />

          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
            <h1 className={PAGE_TITLE}>{title}</h1>
            {status ? <div className="text-[13px] text-muted-foreground">{status}</div> : null}
          </div>
          {lede ? (
            <p className="m-0 mt-2.5 max-w-[68ch] text-[15px] leading-[1.55] text-copy">{lede}</p>
          ) : null}

          <StudioSectionNav crumbs={crumbs} />
          {nav}
        </>
      )}

      <StudioLive vocabulary={vocabulary} notice={notice} blockers={blockers}>
        {children}
      </StudioLive>
    </main>
  );
}

function StudioCrumbs({ crumbs }: { crumbs: readonly StudioCrumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-[13px]">
      <AppLink prefetch="auto" href="/studio" className="text-muted-foreground no-underline hover:text-foreground">
        Studio
      </AppLink>
      {crumbs.map((crumb) => (
        <span key={crumb.label} className="flex items-center gap-2">
          <span aria-hidden="true" className="text-muted-foreground">
            /
          </span>
          {crumb.href ? (
            <AppLink prefetch="auto" href={crumb.href} className="text-muted-foreground no-underline hover:text-foreground">
              {crumb.label}
            </AppLink>
          ) : (
            <span className="text-foreground">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/**
 * The section strip.
 *
 * A section that is not built yet renders as text carrying its sentence, NOT
 * as a link to a page that does not exist — the same rule XP-5 applies to a
 * person's name, for the same reason: a dead link is a worse answer than a
 * plain word.
 *
 * WHICH TAB IS CURRENT IS READ OFF THE CRUMBS rather than told: the section a
 * surface sits under is the one its trail ends on (Collections, Appeals,
 * Reports) or starts from (a listing — reached through Listings). The
 * frame already holds the crumbs, so this costs the callers nothing.
 */
function StudioSectionNav({ crumbs }: { crumbs: readonly StudioCrumb[] }) {
  const last = crumbs[crumbs.length - 1]?.label;
  const current = STUDIO_SECTIONS.find((section) => section.label === last)?.href ?? "/studio";
  return (
    <ul className="m-0 mt-5 flex list-none flex-wrap items-center gap-1.5 p-0">
      {STUDIO_SECTIONS.map((section) =>
        section.live ? (
          <li key={section.label}>
            <AppLink
              prefetch="auto"
              href={section.href}
              {...(section.href === current ? { "aria-current": "page" as const } : {})}
              className={`tap-h ${CHIP_BTN} ${FOCUS} no-underline ${section.href === current ? CHIP_ON : CHIP_OFF}`}
            >
              {section.label}
            </AppLink>
          </li>
        ) : (
          <li key={section.label}>
            <span
              aria-disabled="true"
              title={`Not yet — ${section.then}`}
              data-pending="studio"
              className={`${CHIP_BTN} text-muted-foreground`}
            >
              {section.label}
            </span>
          </li>
        ),
      )}
    </ul>
  );
}

/**
 * A bordered block inside a studio surface — a warning, an empty state, an
 * aside. The container the three existing screens each drew by hand.
 */
export function StudioPanel({
  title,
  children,
}: {
  title?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className={`max-w-[70ch] ${PANEL}`}>
      {title ? <div className="text-[15px] font-semibold text-foreground">{title}</div> : null}
      <div className={`text-[13px] leading-[1.5] text-muted-foreground ${title ? "mt-1" : ""}`}>
        {children}
      </div>
    </div>
  );
}

/** A heading inside a studio surface, above a form or a list: the design's
 *  16px/600 sentence-case heading, 12px above what it heads. */
export function StudioSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7 first:mt-0">
      <h2 className={H2}>{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}


/** The design's status pill: 24px, 12.5px/500 — green for a published
 *  listing, `--muted` for a draft. */
export function StatusChip({ published, children }: { published: boolean; children?: ReactNode }) {
  return (
    <span
      className={`inline-flex h-[24px] shrink-0 items-center whitespace-nowrap rounded-full px-[9px] text-[12px] font-medium ${
        published ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"
      }`}
    >
      {children ?? (published ? "Published" : "Draft")}
    </span>
  );
}

/** The ghost button the design puts beside an outlined one: 36px, no border
 *  until hovered, `--muted` ink. */
export const BTN_GHOST =
  "inline-flex h-[36px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-transparent px-3 text-[14px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

/** A rail panel on the editor: the design's `16px 20px 18px`. */
export const RAIL_PANEL = PANEL;

/** The line under a rail panel's rows: 12.5px/1.55 in `--muted`. */
export const RAIL_NOTE = "m-0 mt-3 text-[13px] leading-[1.55] text-muted-foreground";

/** The design's cover: 96px of the tile's own hue, forty degrees on at the
 *  far edge, in the same `--tile-fill` ramp the tile is painted from. */
export function coverOf(slug: string): string {
  const hue = hueFor(slug);
  return `linear-gradient(105deg, oklch(var(--tile-fill) ${hue}) 0%, oklch(var(--tile-fill) ${(hue + 40) % 360}) 100%)`;
}

/** The 16px stroke glyphs the studio draws: a chevron, a pencil, a plus, a
 *  lock, a cross. One component so every icon is the same weight. */
export function Glyph({
  d,
  size = 16,
  strokeWidth = 1.5,
}: {
  d: string;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d={d} />
    </svg>
  );
}

export const GLYPH_BACK = "M9.5 3.5 5 8l4.5 4.5";
export const GLYPH_PENCIL = "M11.3 2.7a1.4 1.4 0 0 1 2 2L5.5 12.5 2.5 13.5l1-3zM10 4l2 2";
export const GLYPH_PLUS = "M8 3.5v9M3.5 8h9";
export const GLYPH_CROSS = "M4 4l8 8M12 4l-8 8";
export const GLYPH_LOCK = "M3.5 7h9v6.5h-9zM5.5 7V5a2.5 2.5 0 0 1 5 0v2";

/** A moderation record (OPR1) — one act, one appeal, one report, one
 *  collection: the shared flat tile at the reading measure, 12px apart. */
export const STUDIO_RECORD = `mb-3 max-w-[74ch] px-5 py-4 last:mb-0 ${TILE}`;

/** A record set inside a record — an appeal's standing under its act: the
 *  shared sunken inset. */
export const STUDIO_INSET = `px-3.5 py-3 ${INSET}`;
