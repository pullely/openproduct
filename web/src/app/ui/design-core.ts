// The handful of class strings the SHELL draws with (openproduct-redesign
// OPR-3), in a file of their own.
//
// `design.ts` holds every shared class string, and a bundler keeps a module
// whole: a client component that imports ONE of them carries all the ones
// any client component anywhere uses. The root layout's own client pieces
// and the error boundary are downloaded by every page, and so is the feed's
// list (every page prefetches `/` for the header's link); between them they
// need six — so those six live here, and what every page pays for them is
// six strings. `design.ts` re-exports them, so there is still one place to
// import a class string from; only a file in every page's bundle needs to
// name this one.

/** A prose page: the 900px column the docs use, with the calm frame's room
 *  above (CL-R2). */
export const PAGE_NARROW =
  "mx-auto box-border w-full max-w-[900px] px-8 pb-[96px] pt-[64px] max-sm:px-4 max-sm:pb-[72px] max-sm:pt-10";

/** The page title (LR1, openproduct-left-rail design §2 rule 3): the UI face
 *  at 26px/600, line-height 1.25; 22px on a phone. One size on every page, so a page announces
 *  itself the same way wherever a reader lands. */
export const PAGE_TITLE =
  "m-0 text-[26px] font-semibold leading-[1.25] text-foreground max-sm:text-[22px]";

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

/** The visible focus ring, for controls drawn without a Tailwind focus style. */
export const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** The soft button: a 40px pill on 6% of ink, 15px/600 — "Take a seat",
 *  "Edit details". 44px on a phone. */
export const BTN_SOFT =
  "inline-flex h-[40px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-foreground/[0.06] px-[18px] text-[15px] font-semibold text-foreground no-underline transition-colors hover:bg-foreground/[0.1] max-sm:h-[44px]";
