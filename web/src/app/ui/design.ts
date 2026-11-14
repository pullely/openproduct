// The design's shared measurements, as class strings (openproduct redesign).
//
// ONE FILE, so a page never spells a card, a title or a button on its own.
// Every value here is read out of the reference boards rather than eyeballed.
// openproduct-redesign (OPR1) moved the SKIN to the redesign's tokens
// (`specs/epics/openproduct-redesign/design.md` §3): a card is flat white at a
// 16px radius with no border and no shadow, every button and chip is a pill,
// the primary button is ink, the page title is Lora 400 at 40px (28 on a
// phone), a text field is 44px. The FRAME — the column, its gutters, the
// two-column grid — is still openproduct-calm's (CL1) until each page is
// rebuilt against its board. A page that needs a shape not listed here adds
// it HERE, named, rather than inventing it inline — two spellings of one card
// is how a site stops looking like one thing.

/** The page column (CL-R2): 1200px, 44px gutters, 80px above the title and
 *  104px under the page; `16px` gutters and 48px above on a phone. */
export const PAGE =
  "mx-auto box-border w-full max-w-[1200px] px-[44px] pb-[104px] pt-[80px] max-lg:px-7 max-sm:px-4 max-sm:pb-[72px] max-sm:pt-12";

/** A prose page: the 900px column the docs use, with the calm frame's room
 *  above (CL-R2). */
export const PAGE_NARROW =
  "mx-auto box-border w-full max-w-[900px] px-8 pb-[96px] pt-[64px] max-sm:px-4 max-sm:pb-[72px] max-sm:pt-10";

/** The page title (OPR1): Lora 400 at 40px, line-height 1.1, -0.015em; 28px
 *  on a phone — the boards' `h1`. One size on every page, so a page announces
 *  itself the same way wherever a reader lands. */
export const PAGE_TITLE =
  "m-0 font-serif text-display font-normal tracking-[-0.015em] text-foreground max-sm:text-title max-sm:leading-[1.1]";

/** The line under a page title (CL-R2): 17.5px/1.55 in `--muted`, 14px below,
 *  60ch wide; 16px on a phone. */
export const PAGE_SUBTITLE =
  "m-0 mt-[14px] max-w-[60ch] text-[17.5px] leading-[1.55] text-muted-foreground max-sm:text-[16px]";

/** The title row: the title on the left, an action on the right, wrapping. */
export const PAGE_HEAD = "flex flex-wrap items-end justify-between gap-5";

/** A card (OPR1): flat white on the page colour — 16px radius, no border, no
 *  shadow. The page is #F6F4EE and the card #FFFFFF, and that step is the
 *  whole of its edge. Rows inside it clip. */
export const CARD = "overflow-hidden rounded-[16px] bg-card";

/** A card with its own padding — the rail's panels, a form. The card's skin
 *  and 24px inside. */
export const PANEL = "rounded-[16px] bg-card p-6";

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

/** The act (CP-R1): the one thing a page asks for — offer, post, publish,
 *  sign in, start a thread: a 40px pill in `--primary`, which is ink
 *  (#141413) under #FAF9F5 on any page (OPR1). Never the accent: the endorse
 *  colour is the upvote's (XP-1, CL-R8), and an act filled with it reads as
 *  one. */
export const BTN_PRIMARY =
  "inline-flex h-[40px] shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-primary px-[18px] text-[14px] font-medium text-primary-foreground transition-opacity hover:opacity-90";

/** The outlined button: a 40px pill, `--border-strong`, on `--card`. Every
 *  button is a pill (CP1, OPR1). */
export const BTN_OUTLINE =
  "inline-flex h-[40px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-border-strong bg-card px-4 text-[14px] font-medium text-foreground transition-colors hover:border-faint";

/** The quiet outlined button: a 40px pill, on `--border` rather than `--border-strong`. */
export const BTN_QUIET =
  "inline-flex h-[40px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-border bg-card px-4 text-[14px] font-medium text-foreground transition-colors hover:border-faint";

/** The small button: a 30px pill, 13px/500 — a panel's action. */
export const BTN_SMALL =
  "inline-flex h-[30px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-input bg-card px-3.5 text-[13px] font-medium text-foreground transition-colors hover:border-faint";

/** A 32px chip: a filter, a tab that is a pill — and a pill it is (OPR1). */
export const CHIP_BTN =
  "inline-flex h-[32px] shrink-0 items-center rounded-full px-3.5 text-[13px] font-medium transition-colors";

/** The active chip: `--secondary` under `--foreground`. */
export const CHIP_ON = "bg-secondary text-foreground";
/** The inactive chip: `--muted` ink, hover `--accent`. */
export const CHIP_OFF = "text-muted-foreground hover:bg-accent";

/** A tab in a tab strip: 44px tall, a 2px underline when current — in
 *  `--foreground`, not the accent (CL-R8: the accent is the upvote's). */
export const TAB =
  "-mb-px inline-flex h-[44px] items-center border-b-2 px-2.5 text-[15px] font-medium transition-colors";

/** A field (OPR1): 44px, 14px radius, white under the hairline, 16px type —
 *  the boards' text field, and 16px is also what stops a phone zooming on
 *  focus. The amber ring on focus. */
export const FIELD =
  "box-border h-[44px] w-full rounded-[14px] border border-border bg-card px-3 text-nozoom text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:border-endorse focus:ring-[3px] focus:ring-endorse-soft";

/** A multi-line field: the same skin, padded, 1.5 line-height. */
export const TEXTAREA =
  "box-border w-full rounded-[14px] border border-border bg-card px-3 py-2.5 text-nozoom leading-[1.5] text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:border-endorse focus:ring-[3px] focus:ring-endorse-soft";

/** A field's label: 13px/500 in `--copy`, 6px above the field. */
export const LABEL = "mb-1.5 block text-[13px] font-medium text-copy";

/** The mono label (OPR1): IBM Plex Mono 10.5px uppercase, tracked 0.12em,
 *  `--muted`. */
export const EYEBROW = "font-mono text-mono-label uppercase text-muted-foreground";

/** The quiet underlined link a footer or a meta line carries. */
export const LINK_QUIET = "underline underline-offset-[3px] hover:text-foreground";

/** A breadcrumb row: 13.5px in `--muted`, 8px between crumbs. */
export const CRUMBS = "flex items-center gap-2 text-[13.5px] text-muted-foreground";

/** The visible focus ring, for controls drawn without a Tailwind focus style. */
export const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

// ── OPR1, the sections with no board (design.md §5: "take the new shell and
// tokens") ── topics, stack, pricing, collections, the digest, the day board,
// the docs, the forum and the studio spell these rather than a tile inline.

/** A tile (OPR1): the flat card as one item of a grid or a list — the card's
 *  skin with no padding of its own, so each list says its own room. */
export const TILE = "rounded-[16px] bg-card";

/** A tile that is itself the link: the card's skin, and `--accent` under the
 *  pointer — the flat design's hover, since there is no border to darken. */
export const TILE_LINK = "rounded-[16px] bg-card transition-colors hover:bg-accent";

/** The empty state of a list (OPR1): one centred sentence on the flat card,
 *  where the dashed panel used to be. */
export const EMPTY_NOTE =
  "m-0 rounded-[16px] bg-card px-5 py-10 text-center text-[15px] leading-[1.6] text-muted-foreground";

/** A block set INTO a card (OPR1): the sunken fill at the field's 14px
 *  radius — a quoted note, a code sample, a nested record. No border. */
export const INSET = "rounded-[14px] bg-sunken";

/** A notice in a page or a card: 13px on the sunken fill, 14px radius. */
export const NOTICE =
  "rounded-[14px] bg-sunken px-3.5 py-2.5 text-[13px] leading-[1.5] text-muted-foreground";

/** A notice that warns (not an error): the same shape on the warning tint. */
export const NOTICE_WARN =
  "rounded-[14px] bg-warning-soft px-3.5 py-2.5 text-[13px] leading-[1.5] text-warning-strong";

/** A notice that something FAILED — the one place red is allowed (OPR1:
 *  red is danger only). */
export const NOTICE_ERROR =
  "rounded-[14px] bg-destructive-soft px-3.5 py-2.5 text-[13px] leading-[1.5] text-destructive";

/** The 20px pill in teal (OPR1: teal is help wanted / seats) — `N
 *  contributors wanted` wherever a page names open roles. */
export const BADGE_SEAT =
  "inline-flex h-[20px] items-center rounded-full bg-seat-soft px-2 text-[11px] font-medium text-seat-ink";

// ── OPR1, the product and person pages (boards `Product`, `Person` and their
// phone boards) ── the frame, the header card, the side cards and the pill
// row both pages share. Read out of the boards' inline styles.

/** The boards' page column: 1180px, `28px 24px 64px`, 24px between the header
 *  card and the columns; `10px 12px` with 10px between on a phone. */
export const BOARD_PAGE =
  "mx-auto box-border flex w-full max-w-[1180px] flex-col gap-6 px-6 pb-16 pt-7 max-sm:gap-2.5 max-sm:px-3 max-sm:pb-6 max-sm:pt-2.5";

/** The boards' two columns: the main column beside a 300px side column, 24px
 *  between; one column once the pair no longer fits (the boards wrap). */
export const BOARD_COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_300px] items-start gap-6 max-[900px]:grid-cols-[minmax(0,1fr)] max-sm:gap-2.5";

/** The same pair beside the `Person` board's 280px side column. */
export const BOARD_COLUMNS_NARROW =
  "grid grid-cols-[minmax(0,1fr)_280px] items-start gap-6 max-[900px]:grid-cols-[minmax(0,1fr)] max-sm:gap-2.5";

/** A column of cards: 18px between them, 10px on a phone. */
export const BOARD_STACK = "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-[18px] max-sm:gap-2.5";

/** A main-column card: the flat card with the boards' `20px 22px` inside,
 *  14px on a phone. */
export const BOARD_CARD = "rounded-[16px] bg-card px-[22px] py-5 max-sm:p-[14px]";

/** A side-column card: the flat card, 18px inside and 12px between its rows;
 *  14px inside on a phone. */
export const SIDE_CARD = "flex flex-col gap-3 rounded-[16px] bg-card p-[18px] max-sm:p-[14px]";

/** A side card's heading: 15px/600. */
export const SIDE_TITLE = "m-0 text-[15px] font-semibold leading-[1.3] text-foreground";

/** A main card's heading: the card title, 18px/600 at -0.015em. */
export const BOARD_CARD_TITLE = "m-0 text-card-title font-semibold tracking-[-0.015em] text-foreground";

/** A label/value row in a side card: 15px, the label muted, no rule. */
export const SIDE_ROW = "flex items-baseline justify-between gap-2.5 text-[15px]";

/** The product header's cover band: 140px of amber wash with a glow at its
 *  top right. Desktop only — the phone board draws no band on a product. */
export const COVER_PRODUCT =
  "h-[140px] bg-[radial-gradient(600px_200px_at_85%_0%,oklch(var(--brand-amber-inverted)/0.55),transparent_70%),linear-gradient(120deg,oklch(var(--amber-soft)),oklch(var(--warning-wash)))] max-sm:hidden";

/** A person's cover band: 120px of the sunken wash under the same glow; 72px
 *  on a phone. */
export const COVER_PERSON =
  "h-[120px] bg-[radial-gradient(600px_200px_at_85%_0%,oklch(var(--brand-amber-inverted)/0.4),transparent_70%),linear-gradient(120deg,oklch(var(--sunken)),oklch(var(--primary-foreground)))] max-sm:h-[72px]";

/** The soft button: a 40px pill on 6% of ink, 15px/600 — "Take a seat",
 *  "Edit details". 44px on a phone. */
export const BTN_SOFT =
  "inline-flex h-[40px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-foreground/[0.06] px-[18px] text-[15px] font-semibold text-foreground no-underline transition-colors hover:bg-foreground/[0.1] max-sm:h-[44px]";

/** The header card's ink button: `BTN_PRIMARY` at the boards' 15px/600 with
 *  room for a glyph — "Try it". 44px on a phone. */
export const BTN_INK =
  "inline-flex h-[40px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-[18px] text-[15px] font-semibold text-primary-foreground no-underline transition-opacity hover:opacity-90 max-sm:h-[44px]";

/** The teal button, a seat's own action (design §3): "Take the seat". */
export const BTN_SEAT =
  "inline-flex h-[40px] shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-seat px-[18px] text-[15px] font-semibold text-card no-underline transition-opacity hover:opacity-90 max-sm:h-[44px]";

/** A pill in a header card's row of sections: 36px, 15px; 44px on a phone.
 *  The current one is ink. */
export const SECTION_PILL =
  "inline-flex h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[15px] no-underline transition-colors max-sm:h-[44px] max-sm:px-4";
export const SECTION_PILL_ON = "bg-primary font-semibold text-primary-foreground";
export const SECTION_PILL_OFF = "font-medium text-copy hover:bg-foreground/[0.06]";

/** An open seat's row in a crew card: the teal wash at a 14px radius. */
export const SEAT_ROW = "flex items-center justify-between gap-2.5 rounded-[14px] bg-seat-wash px-3 py-2.5";

/** The empty seat: a dashed teal ring. */
export const SEAT_RING = "box-border shrink-0 rounded-full border-dashed border-seat";

/** A "Built with" pill: 13px on the lighter well, a dot before the word. */
export const STACK_PILL = "inline-flex items-center gap-1.5 rounded-full bg-well px-2.5 py-1.5 text-[13px] text-foreground";

// ── OPR1, the signed-in pages (boards `Me`, `Activity`, `Settings`) ──

/** `BTN_SOFT` at the secondary size: a row's action — 13px, 16px of
 *  padding. 44px on a phone. */
export const BTN_SOFT_SMALL =
  "inline-flex h-[40px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-foreground/[0.06] px-4 text-[13px] font-semibold text-copy no-underline transition-colors hover:bg-foreground/[0.1] max-sm:h-[44px]";

/** A segmented switch (OPR1): the white pill a page's tabs sit in. */
export const SEGMENTS = "flex gap-0.5 self-start rounded-full bg-card p-1 max-sm:p-[3px]";

/** One segment: 40px, 15px/500; 44px and 13px on a phone. */
export const SEGMENT =
  "inline-flex h-[40px] items-center rounded-full px-[18px] text-[15px] no-underline transition-colors max-sm:h-[44px] max-sm:px-3.5 max-sm:text-[13px]";
/** The current segment: ink under the primary's foreground, 600. */
export const SEGMENT_ON = "bg-primary font-semibold text-primary-foreground";
/** Another segment: body ink, 500. */
export const SEGMENT_OFF = "font-medium text-copy hover:bg-accent";
