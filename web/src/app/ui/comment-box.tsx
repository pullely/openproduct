import { AppLink } from "./link";

/**
 * The comment box — the discussion count, in the design's own box.
 *
 * THE ROW'S SECOND BOX. Product Hunt draws two boxes at the right edge of a
 * launch row, side by side: the thread and the vote. They are the same
 * geometry because they are the same kind of object — a number a reader can
 * act on — and this one is drawn here so the two cannot drift apart:
 *
 *   box    58×58, radius 12, 1px --border on --card, hover --faint
 *   icon   15px outline bubble in --muted
 *   count  Geist Mono 14px/500, tabular
 *
 * THE COUNT LEFT THE META LINE to get here. It used to ride between the
 * topics and the stack as `12 comments`; in the row layout it is a
 * destination of its own, which is what a box means.
 *
 * A ZERO RENDERS AS `0`, and it is the honest one (OPC-C). The thread was
 * counted and found empty — that is a fact, and an invitation to be the first
 * — where a dash would say the number was never measured. Nothing here has to
 * decide between them: a card that carries no count does not render this box
 * at all (`feed/build-tile.tsx`), so there is no absent count to spell.
 *
 * A LINK, NOT A BUTTON, and therefore a SERVER COMPONENT: it takes nobody's
 * vote, reads nothing personal, and is byte-identical in every visitor's HTML
 * (I6). It is a SIBLING of the row's other links rather than a child — an
 * anchor inside an anchor is invalid HTML that browsers repair by splitting
 * the outer one.
 */
export function CommentBox({
  slug,
  /** The thread's size, as the cached document counted it. */
  count,
}: {
  slug: string;
  count: number;
}) {
  return (
    <AppLink
      href={`/${slug}#discussion`}
      aria-label={`${count} ${count === 1 ? "comment" : "comments"} on ${slug}`}
      className="grid h-[52px] w-[52px] shrink-0 content-center place-items-center gap-[2px] rounded-[10px] border border-border-strong bg-card text-foreground transition-colors hover:border-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {/* The mark is decoration: the accessible name above already says
          "12 comments on kettleworks", so a reader on a screen reader hears
          the sentence once rather than twice. */}
      <svg
        width="15"
        height="15"
        viewBox="0 0 15 15"
        aria-hidden="true"
        className="text-muted-foreground"
      >
        <path
          d="M3.4 2.4h8.2a1.7 1.7 0 0 1 1.7 1.7v4.4a1.7 1.7 0 0 1-1.7 1.7H6.9l-3 2.4v-2.4h-.5a1.7 1.7 0 0 1-1.7-1.7V4.1a1.7 1.7 0 0 1 1.7-1.7Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
      {/* The figure itself. The link's own label carries it to a screen
          reader, so this is the sighted reader's copy of the same fact. */}
      <span className="text-[14px] font-semibold leading-[1.2] tabular-nums">
        {count}
      </span>
    </AppLink>
  );
}
