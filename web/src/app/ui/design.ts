// The design's shared measurements, as class strings (openproduct redesign).
//
// ONE FILE, so a page never spells a card, a title or a button on its own.
// Every value here is read out of the reference artboard rather than
// eyeballed. openproduct-calm (CL1) moved the frame to the calm measurements:
// the 1200px column with 80px above the title, the 44px/600 title, the 20px
// card radius the build tile uses (`specs/epics/openproduct-calm/design.md`). A page that needs a shape not listed
// here adds it HERE, named, rather than inventing it inline — two spellings
// of one card is how a site stops looking like one thing.

/** The page column (CL-R2): 1200px, 44px gutters, 80px above the title and
 *  104px under the page; `16px` gutters and 48px above on a phone. */
export const PAGE =
  "mx-auto box-border w-full max-w-[1200px] px-[44px] pb-[104px] pt-[80px] max-lg:px-7 max-sm:px-4 max-sm:pb-[72px] max-sm:pt-12";

/** A prose page: the 900px column the docs use, with the calm frame's room
 *  above (CL-R2). */
export const PAGE_NARROW =
  "mx-auto box-border w-full max-w-[900px] px-8 pb-[96px] pt-[64px] max-sm:px-4 max-sm:pb-[72px] max-sm:pt-10";

/** The page title (CL-R2): sans 44px/600, line-height 1.08, -0.03em; 32px on
 *  a phone. One size on every page, so a page announces itself the same way
 *  wherever a reader lands. */
export const PAGE_TITLE =
  "m-0 font-sans text-[44px] font-semibold leading-[1.08] tracking-[-0.03em] text-foreground max-sm:text-[32px]";

/** The line under a page title (CL-R2): 17.5px/1.55 in `--muted`, 14px below,
 *  60ch wide; 16px on a phone. */
export const PAGE_SUBTITLE =
  "m-0 mt-[14px] max-w-[60ch] text-[17.5px] leading-[1.55] text-muted-foreground max-sm:text-[16px]";

/** The title row: the title on the left, an action on the right, wrapping. */
export const PAGE_HEAD = "flex flex-wrap items-end justify-between gap-5";

/** The two-column grid: the page beside a 320px rail, 32px between, 48px below
 *  the title (CL-R2's room). */
export const TWO_COL =
  "mt-[48px] grid grid-cols-[minmax(0,1fr)_320px] items-start gap-x-8 gap-y-4 max-lg:grid-cols-[minmax(0,1fr)] max-lg:gap-8 max-sm:mt-8";

/** The rail: sticky 24px from the top (the bar scrolls away from `sm` up,
 *  CL1), its panels 16px apart. */
export const RAIL = "sticky top-[24px] grid gap-4 max-lg:static";

/** A card: 20px radius (the tile's, CL-R3), a `--border` hairline, on
 *  `--card`. Rows inside it clip. */
export const CARD = "overflow-hidden rounded-[20px] border border-border bg-card";

/** A card with its own padding — the rail's panels, a form. The tile's radius
 *  and 24px inside (CL-R3). */
export const PANEL = "rounded-[20px] border border-border bg-card p-6";

/** A card's head: the heading and its meta on one baseline, `16px 20px 12px`. */
export const CARD_HEAD = "flex items-baseline justify-between gap-2.5 px-5 pb-3 pt-4";

/** A section heading inside a card: 16px/600, letter-spacing -0.01em. */
export const H2 = "m-0 text-[16px] font-semibold leading-[1.3] tracking-[-0.01em] text-foreground";

/** A section heading on a reading column (CP-R4): 20px/600 at -0.015em —
 *  a heading a reader finds while scrolling. The 16px `H2` stays for a
 *  card's head and a rail's panel. */
export const H2_SECTION = "m-0 text-[20px] font-semibold leading-[1.25] tracking-[-0.015em] text-foreground";

/** Long prose (CP-R5): 16.5px/1.7 in at most 68ch, in `--copy`; 15.5px on a
 *  phone. */
export const PROSE = "max-w-[68ch] text-[16.5px] leading-[1.7] text-copy max-sm:text-[15.5px]";

/** A panel heading: 15px/600, 4px above its rows. */
export const H3 = "m-0 mb-1 text-[15px] font-semibold leading-[1.3] tracking-[-0.01em] text-foreground";

/** The meta beside a heading: 13px in `--muted`. */
export const HEAD_META = "text-[13px] text-muted-foreground";

/** A list row inside a card: a `--line` rule above, `16px 20px`, hover `--accent`. */
export const ROW =
  "relative flex items-center gap-4 border-t border-line px-5 py-4 transition-colors hover:bg-accent";

/** A rail row: a `--line` rule above, `8px 0`. */
export const RAIL_ROW = "flex items-center justify-between gap-2.5 border-t border-line py-2";

/** The act (CP-R1): the one thing a page asks for — offer, post, publish,
 *  sign in, start a thread — as the bar's *Sign in* draws it: a 36px pill in
 *  `--primary` (the foreground). Never the accent: the endorse colour is the
 *  upvote's (XP-1, CL-R8), and an act filled with it reads as one. */
export const BTN_PRIMARY =
  "inline-flex h-[36px] shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-primary px-[18px] text-[14px] font-medium text-primary-foreground transition-opacity hover:opacity-90";

/** The outlined button: a 36px pill, `--border-strong`, on `--card`. Every
 *  button is a pill (CP1), like the bar's controls. */
export const BTN_OUTLINE =
  "inline-flex h-[36px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-border-strong bg-card px-4 text-[14px] font-medium text-foreground transition-colors hover:border-faint";

/** The quiet outlined button: a 36px pill, on `--border` rather than `--border-strong`. */
export const BTN_QUIET =
  "inline-flex h-[36px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-border bg-card px-4 text-[14px] font-medium text-foreground transition-colors hover:border-faint";

/** The small button: a 30px pill, 13px/500 — a panel's action. */
export const BTN_SMALL =
  "inline-flex h-[30px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-input bg-card px-3.5 text-[13px] font-medium text-foreground transition-colors hover:border-faint";

/** The compact button: a 28px pill, 13px/500 — a rail row's action. */
export const BTN_COMPACT =
  "inline-flex h-[28px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-border-strong bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:border-faint";

/** A 32px chip-shaped button: a filter, a tab that is a pill. */
export const CHIP_BTN =
  "inline-flex h-[32px] shrink-0 items-center rounded-[8px] px-3 text-[13.5px] font-medium transition-colors";

/** The active chip: `--secondary` under `--foreground`. */
export const CHIP_ON = "bg-secondary text-foreground";
/** The inactive chip: `--muted` ink, hover `--accent`. */
export const CHIP_OFF = "text-muted-foreground hover:bg-accent";

/** A tab in a tab strip: 44px tall, a 2px underline when current — in
 *  `--foreground`, not the accent (CL-R8: the accent is the upvote's). */
export const TAB =
  "-mb-px inline-flex h-[44px] items-center border-b-2 px-2.5 text-[15px] font-medium transition-colors";
export const TAB_ON = "border-foreground text-foreground";
export const TAB_OFF = "border-transparent text-muted-foreground hover:text-foreground";

/** The 20px badge in the accent — `#1 today`. */
export const BADGE_ACCENT =
  "inline-flex h-[20px] items-center rounded-[6px] bg-endorse-soft px-[7px] text-[11.5px] font-medium text-endorse-ink";

/** The 20px pill in green — `N contributors wanted`. */
export const BADGE_WANTED =
  "inline-flex h-[20px] items-center rounded-full bg-success-soft px-2 text-[11.5px] font-medium text-success";

/** A field: 38px, 8px radius, on `--background`; the accent ring on focus. */
export const FIELD =
  "box-border h-[38px] w-full rounded-[8px] border border-border bg-background px-3 text-[14.5px] text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:border-endorse focus:ring-[3px] focus:ring-endorse-soft";

/** A multi-line field: the same skin, padded, 1.5 line-height. */
export const TEXTAREA =
  "box-border w-full rounded-[8px] border border-border bg-background px-3 py-2.5 text-[14.5px] leading-[1.5] text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:border-endorse focus:ring-[3px] focus:ring-endorse-soft";

/** A field's label: 13px/500 in `--copy`, 6px above the field. */
export const LABEL = "mb-1.5 block text-[13px] font-medium text-copy";

/** The mono eyebrow: 11.5px uppercase, tracked 0.1em, `--muted`. */
export const EYEBROW =
  "font-mono text-[11.5px] uppercase tracking-[0.1em] text-muted-foreground";

/** The quiet underlined link a footer or a meta line carries. */
export const LINK_QUIET = "underline underline-offset-[3px] hover:text-foreground";

/** A breadcrumb row: 13.5px in `--muted`, 8px between crumbs. */
export const CRUMBS = "flex items-center gap-2 text-[13.5px] text-muted-foreground";

/** The visible focus ring, for controls drawn without a Tailwind focus style. */
export const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
