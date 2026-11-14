import { EYEBROW } from "../ui/design";
import { AppLink } from "../ui/link";
import { GLYPH_PRODUCTS, GLYPH_SAVED, GLYPH_SEATS, Glyph } from "./glyph";
import { meSectionHref, type MeSection } from "./section";

// The switcher between the sections of `/me`, and the columns the signed-in
// pages stand in (openproduct-redesign OPR1). What a section IS, and where
// it lives, is `section.ts`.

interface SectionDef {
  readonly key: MeSection;
  readonly label: string;
  readonly glyph: string;
  /** The 32px tile beside the label, at rest: the kind's tint and ink. */
  readonly tile: string;
  /** The same tile on the current section: the kind's hue, filled. */
  readonly tileOn: string;
}

/**
 * The switcher's rows, in the board's order. A colour here is a KIND
 * (design.md §3): amber is what shipped — your products; ink is what you
 * kept; teal is seats.
 */
export const ME_SECTIONS: readonly SectionDef[] = [
  {
    key: "products",
    label: "Your products",
    glyph: GLYPH_PRODUCTS,
    tile: "bg-amber-soft text-amber-ink",
    tileOn: "bg-amber text-card",
  },
  {
    key: "saved",
    label: "Saved",
    glyph: GLYPH_SAVED,
    tile: "bg-sunken text-foreground",
    tileOn: "bg-foreground text-card",
  },
  {
    key: "seats",
    label: "Seats",
    glyph: GLYPH_SEATS,
    tile: "bg-seat-soft text-seat-ink",
    tileOn: "bg-seat text-card",
  },
];

/**
 * The switcher. A card of rows beside the section on a desktop (board `Me`:
 * a mono label, then a 32px tile, the label and its count); a row of 44px
 * pills that scrolls sideways on a phone (board `PhoneMe`), the current one
 * in ink.
 *
 * `count` is null when that section's read failed: no number is drawn,
 * because a zero would be a claim (OPC-C).
 */
export function MeSections({
  active,
  counts,
}: {
  active: MeSection;
  counts: Record<MeSection, number | null>;
}) {
  return (
    <nav
      aria-label="Your sections"
      className="flex flex-col gap-0.5 rounded-[16px] bg-card p-2.5 [scrollbar-width:none] max-md:-mx-3 max-md:flex-row max-md:gap-1.5 max-md:overflow-x-auto max-md:rounded-none max-md:bg-transparent max-md:px-3 max-md:py-0"
    >
      <div className={`${EYEBROW} px-2.5 pb-2 pt-1.5 max-md:hidden`}>You</div>
      {ME_SECTIONS.map((section) => {
        const on = section.key === active;
        const count = counts[section.key];
        return (
          <AppLink
            key={section.key}
            href={meSectionHref(section.key)}
            {...(on ? { "aria-current": "page" as const } : {})}
            className={`flex min-h-[40px] items-center gap-3 rounded-[14px] px-2.5 text-[15px] no-underline transition-colors max-md:min-h-[44px] max-md:shrink-0 max-md:gap-2 max-md:whitespace-nowrap max-md:rounded-full max-md:px-3.5 ${
              on
                ? "font-semibold text-foreground max-md:bg-primary max-md:text-primary-foreground"
                : "text-copy hover:bg-accent max-md:bg-card max-md:font-medium"
            }`}
          >
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] max-md:h-auto max-md:w-auto max-md:bg-transparent ${
                on ? `${section.tileOn} max-md:text-primary-foreground` : section.tile
              }`}
            >
              <Glyph d={section.glyph} />
            </span>
            <span className="flex-1 text-left">{section.label}</span>
            {count === null ? null : (
              <span
                className={`font-mono text-[11px] ${
                  on ? "text-foreground max-md:text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {count}
              </span>
            )}
          </AppLink>
        );
      })}
    </nav>
  );
}

/** The boards' column for the inbox: 760px, `36px 24px 64px`, 20px between
 *  its blocks; `10px 12px` and 10px on a phone (boards `Activity`,
 *  `PhoneActivity`). */
export const ACTIVITY_MAIN =
  "mx-auto box-border flex w-full max-w-[760px] flex-col gap-5 px-6 pb-16 pt-9 max-sm:gap-2.5 max-sm:px-3 max-sm:pb-6 max-sm:pt-2.5";

/** The boards' column for settings: 1080px, `32px 24px 64px`, 22px between
 *  its blocks; `10px 12px` and 10px on a phone (boards `Settings`,
 *  `PhoneSettings`). */
export const SETTINGS_MAIN =
  "mx-auto box-border flex w-full max-w-[1080px] flex-col gap-[22px] px-6 pb-16 pt-8 max-sm:gap-2.5 max-sm:px-3 max-sm:pb-6 max-sm:pt-2.5";

/** A list of the flat cards a section is made of: 14px between, 10px on a
 *  phone. */
export const ME_LIST = "m-0 grid list-none gap-3.5 p-0 max-sm:gap-2.5";

/** What a section says when it holds nothing: one line in `--muted`, no box
 *  (boards `Me`, `PhoneMe`). */
export const ME_EMPTY = "m-0 text-[15px] text-muted-foreground max-sm:px-1.5 max-sm:py-1";
