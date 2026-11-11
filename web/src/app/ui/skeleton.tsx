// What a route shows while it is still arriving (openproduct-commons XP3).
//
// A GENERIC SPINNER IS WRONG HERE, and the reason is the design's density: a
// product page is four stat cards, a tab strip and a roster, and a centred
// dot in the middle of all that reads as "the page is broken" rather than as
// "the page is coming". What a visitor needs to see is the SHAPE of what is
// about to appear, so that when it appears nothing moves.
//
// WHICH LEADS TO THE ONE RULE THIS MODULE EXISTS TO ENFORCE: a skeleton is a
// PROMISE ABOUT LAYOUT, and a promise it cannot keep costs a layout shift —
// the thing skeletons are supposed to prevent. So a skeleton reproduces only
// what is CERTAIN about a route, and stops where the page becomes
// data-dependent.
//
//   certain     the stat strip is always four cards; a listing row is always
//               one height; the facet rail is the same seven groups
//   uncertain   how many products come back, how many people are on a roster,
//               whether somebody wrote a bio
//
// Where the count is uncertain these draw a SMALL, FIXED number of uniform
// rows. A uniform row has a known height, so being wrong about the count
// moves what is below by whole rows rather than by an unpredictable amount —
// and drawing three where there will be twenty is a smaller lie than drawing
// twenty where there will be three.
//
// EVERY MEASUREMENT HERE WAS TAKEN FROM A BROWSER, not guessed from the class
// names. The first draft of this file guessed, and a measuring pass found the
// stat card 37px short, the listing row 13px tall, and a mark drawn beside a
// row that has none. All three were invisible in review and would have been a
// visible jolt on every load. The numbers in the comments below are what the
// real elements measure at 1100px, so the next person can check rather than
// re-derive.
//
// NOTHING HERE IS ANNOUNCED. Every block is `aria-hidden`, and the route's
// `loading.tsx` carries one live region saying what is loading. A screen
// reader user does not want forty grey rectangles read out; they want one
// sentence, once.

/**
 * The base block. A width and a height and nothing else — every skeleton in
 * this app is made of these, so the texture is one decision.
 *
 * The sweep is `motion-safe` only. A visitor who asked their system for less
 * motion is asking most loudly on a page that is doing nothing yet, and a
 * still block still says "something belongs here".
 */
export function Shimmer({
  className = "",
  style,
}: {
  className?: string;
  /** For a measured height that no Tailwind step lands on exactly. */
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      style={style}
      className={`relative block overflow-hidden rounded-[6px] bg-muted ${className}`}
    >
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-foreground/[0.045] to-transparent motion-safe:animate-shimmer" />
    </span>
  );
}

/**
 * A LINE OF TEXT: the box the real line occupies, with a bar of ink inside it.
 *
 * THE TWO NUMBERS ARE DIFFERENT AND BOTH MATTER, which is the mistake this
 * shape exists to stop repeating. `line` is what the layout reserves — the
 * rendered line box, which is where the height comes from — and `ink` is how
 * tall the grey bar looks, which is a texture choice. Drawing an 11px bar and
 * calling it a 19px line is how a stat card ends up 37px short.
 *
 * IT TAKES NO WIDTH. The caller wraps it in a sized box, which keeps the two
 * axes in two places: this owns the vertical truth (what the layout reserves)
 * and the call site owns the horizontal texture (how long a name looks). A
 * paragraph of identical-length bars reads as a table, and that variation
 * belongs where the paragraph is.
 */
export function TextLine({
  line,
  ink = 11,
  className = "",
}: {
  /** The real element's rendered height, in px. Measure it; do not guess. */
  line: number;
  ink?: number;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={`flex items-center ${className}`} style={{ height: line }}>
      <Shimmer className="w-full" style={{ height: ink }} />
    </span>
  );
}

/** A bare bar, for anything that is not a line of text. */
export function ShimmerLine({
  width = "w-full",
  className = "",
}: {
  width?: string;
  className?: string;
}) {
  return <Shimmer className={`h-[13px] ${width} ${className}`} />;
}

/**
 * The four-card stat strip.
 *
 * FOUR IS CERTAIN on every surface that has this strip — the product page and
 * the profile both draw precisely four — which makes this the one skeleton
 * here whose count cannot be wrong.
 *
 * MEASURED: label 19, value 30, note 20, margins 5 and 3, padding 13 each
 * side, 1px border. 105px in total, which is the strip at its NATURAL height
 * — before any card's note wraps. The real strip stretches to its tallest
 * card, so a wrapped note makes it 124. Claiming the natural height means the
 * content pushes down by a predictable 19px in that case; claiming the
 * wrapped height would leave a visible gap on every strip that does not wrap,
 * which is the more common outcome and the worse-looking one.
 */
export function StatStripSkeleton() {
  return (
    <div className="mt-6 grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-[12px] border border-border bg-card px-[15px] py-[13px]">
          <div className="w-[64px]">
            <TextLine line={19} ink={10} />
          </div>
          <div className="mt-[5px] w-[46px]">
            <TextLine line={30} ink={17} />
          </div>
          <div className="mt-[3px] w-[110px]">
            <TextLine line={20} ink={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * One row of a PROFILE's listing sections — `Maintains`, `Contributes to`.
 *
 * MEASURED AT 51px: a slug and a tagline on ONE baseline, `py-3.5`, and NO
 * mark. The first draft drew a 38px square here because the directory's rows
 * have one; these do not, and the row came out 13px tall and 38px wide in the
 * wrong place. Two row shapes, two skeletons.
 *
 * THE HEIGHT IS SET, NOT RECONSTRUCTED. Rebuilding it from padding plus line
 * boxes came out 2px short — near enough to look right and wrong enough to
 * drift again the next time somebody edits a margin. The row's height is a
 * CERTAIN fact about this layout, so it is stated as one, and the parts
 * inside it are only texture.
 */
export function ProfileRowSkeleton() {
  return (
    <li className="h-[51px] border-b border-line-soft last:border-b-0">
      <span className="flex h-full items-center gap-3 px-2">
        <span className="w-[110px] shrink-0">
          <TextLine line={23} ink={14} />
        </span>
        <span className="w-[46%] min-w-0">
          <TextLine line={23} ink={11} />
        </span>
      </span>
    </li>
  );
}

export function ProfileRowsSkeleton({ count = 2 }: { count?: number }) {
  return (
    <ul className="m-0 mt-2 list-none p-0">
      {Array.from({ length: count }, (_, i) => (
        <ProfileRowSkeleton key={i} />
      ))}
    </ul>
  );
}

/**
 * One row of the DIRECTORY — the densest thing in the product.
 *
 * MEASURED AT 131px: a 38px mark, a slug-and-licence line, a tagline, and a
 * strip of chips, in `px-3 py-[18px]`. Uniform on every row, because every
 * part of it renders whether or not it has content — which is what makes the
 * height a certain fact, and therefore something to STATE rather than
 * reconstruct from the parts (see the profile row above).
 */
export function DirectoryRowSkeleton() {
  return (
    <li className="flex h-[131px] gap-4 px-3 py-[18px]">
      <Shimmer className="h-[38px] w-[38px] shrink-0 rounded-[10px]" />
      <div className="min-w-0 flex-1">
        <div className="w-[38%]">
          <TextLine line={26} ink={16} />
        </div>
        <div className="mt-1.5 w-[64%]">
          <TextLine line={25} ink={12} />
        </div>
        <div className="mt-2.5 flex gap-2">
          <Shimmer className="h-[25px] w-[56px] rounded-[7px]" />
          <Shimmer className="h-[25px] w-[84px] rounded-[7px]" />
          <Shimmer className="h-[25px] w-[68px] rounded-[7px]" />
        </div>
      </div>
    </li>
  );
}

/**
 * A run of directory rows.
 *
 * `count` defaults to five. Not to a page size: this is the number that is
 * least wrong when the answer might be one row or forty, and it is small
 * enough that a visitor never mistakes the placeholder for the content.
 */
export function DirectoryRowsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <ul className="m-0 mt-2 list-none divide-y divide-line-soft p-0">
      {Array.from({ length: count }, (_, i) => (
        <DirectoryRowSkeleton key={i} />
      ))}
    </ul>
  );
}

/**
 * One card in the contributors grid. MEASURED AT 184px: a round mark and a
 * name line, two lines of bio, and a footer of counts, in `p-[17px]`.
 */
export function CardSkeleton() {
  return (
    <li className="flex h-[184px] flex-col gap-3 rounded-[12px] border border-border bg-card p-[17px]">
      <span className="flex items-center gap-3">
        <Shimmer className="h-[38px] w-[38px] shrink-0 rounded-full" />
        <span className="min-w-0 flex-1">
          <div className="w-[58%]">
            <TextLine line={20} ink={13} />
          </div>
          <div className="mt-1 w-[80%]">
            <TextLine line={17} ink={10} />
          </div>
        </span>
      </span>
      <div className="w-full">
        <TextLine line={19} ink={11} />
      </div>
      <div className="w-[72%]">
        <TextLine line={19} ink={11} />
      </div>
      <div className="mt-auto w-[46%]">
        <TextLine line={18} ink={10} />
      </div>
    </li>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className="m-0 grid list-none gap-3 p-0 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </ul>
  );
}

/**
 * The one thing a screen reader is told while a route loads.
 *
 * `role="status"` rather than `aria-live="assertive"`: a page arriving is not
 * an interruption. `what` names the thing, because "Loading…" on its own is
 * the same announcement on every route in the product and therefore carries
 * no information at all.
 */
export function LoadingAnnouncement({ what }: { what: string }) {
  return (
    <p role="status" className="sr-only">
      Loading {what}
    </p>
  );
}
