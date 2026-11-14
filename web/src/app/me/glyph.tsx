/**
 * The boards' line glyphs for the signed-in pages (openproduct-redesign
 * OPR1): one 24-unit path, 2px round strokes, in the ink of whatever it sits
 * in. Hidden from assistive technology — every control that carries one also
 * carries a word.
 *
 * Kept beside the pages that draw them rather than in `ui/icons.tsx`: that
 * set is the chrome's, on a 20-unit grid, and these are the boards' own paths
 * for a section, a notification kind and a settings card.
 */
export function Glyph({
  d,
  size = 16,
  className = "",
}: {
  d: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      <path d={d} />
    </svg>
  );
}

/** Your products: a box. */
export const GLYPH_PRODUCTS = "M4 7l8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10";
/** Saved: a bookmark. */
export const GLYPH_SAVED = "M6 3h12v18l-6-4-6 4z";
/** Seats: a person, and a place beside them. */
export const GLYPH_SEATS = "M9 11a4 4 0 100-8 4 4 0 000 8zM2 21c1-4 4-6 7-6s6 2 7 6M19 8v6M16 11h6";
/** Edit: a pencil. */
export const GLYPH_EDIT = "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4";
/** Leaves this page for the public one: an arrow up and out. */
export const GLYPH_OUT = "M7 17L17 7M9 7h8v8";
/** Waiting: a clock. */
export const GLYPH_CLOCK = "M12 20a8 8 0 100-16 8 8 0 000 16zM12 8v4l2.5 2";
/** Back: a chevron. */
export const GLYPH_BACK = "M15 18l-6-6 6-6";

/** A reply: a speech bubble. */
export const GLYPH_REPLY = "M4 5h16v11H9l-5 4z";
/** An upvote: a chevron over its stem. */
export const GLYPH_UPVOTE = "M12 19V6M6 12l6-6 6 6";
/** A launch: a tag. */
export const GLYPH_LAUNCH = "M3 12V4h8l9 9-8 8zM7.5 7.5h.01";
/** First on its day: a flag. */
export const GLYPH_FIRST = "M5 21V4M5 4h13l-3 4.5 3 4.5H5";

/** Settings · Profile: a person. */
export const GLYPH_PERSON = "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6";
/** Settings · Notifications: a bell. */
export const GLYPH_BELL = "M6 16V11a6 6 0 0112 0v5l2 2H4zM10 21h4";
/** Settings · Account: a lock. */
export const GLYPH_LOCK = "M5 11h14v10H5zM8 11V7a4 4 0 018 0v4";
