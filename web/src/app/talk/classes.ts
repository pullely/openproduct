// Talk's class strings (openproduct-redesign OPR-4; boards `Product` Talk
// tab, `PhoneProduct`). One place, so the composer, the list and the thread
// pages cannot drift apart.
//
// PRIVATE IS SLATE, NOT RED (owner rule: red is danger only). The board
// draws a private thread with the slate of the `version` token: a 1.5px
// slate edge on the card and a slate chip.

/** The sunken pill a group of segments sits in. */
export const TALK_SEGMENTS = "flex gap-0.5 rounded-full bg-foreground/[0.06] p-[3px]";

/** One segment: 34px, 13px; 44px on a phone. */
export const TALK_SEGMENT =
  "inline-flex h-[34px] cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] transition-colors max-sm:h-[44px] max-sm:px-[11px]";
export const TALK_SEGMENT_ON = "bg-card font-semibold text-foreground";
export const TALK_SEGMENT_OFF = "font-medium text-muted-foreground hover:text-foreground";

/** A radio drawn as a segment: the input is the control, the span is its face. */
export const TALK_SEGMENT_FACE = `${TALK_SEGMENT} font-medium text-muted-foreground peer-checked:bg-card peer-checked:font-semibold peer-checked:text-foreground peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring`;

/** The pill field: 44px, 16px so a phone does not zoom. */
export const TALK_FIELD =
  "box-border h-[44px] min-w-0 flex-1 rounded-full border-0 bg-well px-4 text-nozoom text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** A thread's card. The edge is always there so a private card is the same
 *  size as a public one; only its colour says which. */
export const TALK_CARD =
  "flex flex-col gap-3 rounded-[16px] border-[1.5px] bg-card p-[18px] max-sm:p-[14px]";
export const TALK_CARD_PUBLIC = "border-transparent";
export const TALK_CARD_PRIVATE = "border-version/[0.28]";

/** The badge at a card's right: mono, 26px. */
export const TALK_BADGE =
  "inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full px-2.5 font-mono text-mono-label uppercase";
export const TALK_BADGE_PUBLIC_CLASS = "text-muted-foreground";
export const TALK_BADGE_PRIVATE_CLASS = "bg-version-soft text-version";

/** A row's action: the soft pill, 40px; 44px on a phone. */
export const TALK_ACTION =
  "inline-flex h-[40px] shrink-0 items-center justify-center whitespace-nowrap rounded-full px-4 text-[13px] font-semibold no-underline transition-colors max-sm:h-[44px]";
export const TALK_ACTION_SOFT = "bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.1]";
export const TALK_ACTION_INK = "bg-primary text-primary-foreground hover:opacity-90";
export const TALK_ACTION_PLAIN = "bg-transparent text-copy hover:bg-foreground/[0.06]";
export const TALK_ACTION_DONE = "bg-success-soft text-success";

/** "Resolved", as everybody sees it: green, with a check. */
export const TALK_RESOLVED_MARK = "inline-flex items-center gap-1.5 text-[13px] font-semibold text-success";

/** The Crew tag on a crew reply: mono amber. */
export const TALK_CREW_TAG_CLASS = "font-mono text-mono-label uppercase text-amber-ink";

/** A reply's bubble, and the rail replies hang from. */
export const TALK_REPLY = "flex flex-col gap-0.5 rounded-[14px] bg-well px-3 py-2.5";
export const TALK_REPLIES = "flex flex-col gap-2 border-l-2 border-line pl-3.5";
