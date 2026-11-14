import type { ReactNode } from "react";

/**
 * The line-icon set (openproduct-open-builds OB1, decision D6).
 *
 * ─── ONE ICON, ONE MEANING ────────────────────────────────────────────────
 *
 * The shell spent four epics as a text-only surface, and it said so in its
 * comments: no icon set, no image, five words in a bottom bar. Open builds
 * changes what the page has to carry — changes, upvotes, a plan, open roles,
 * a workspace — and a row that spells all of that out in words is a row
 * nobody scans. So the site gains exactly one vocabulary of glyphs, and each
 * glyph names one concept on every surface. A new meaning is a new icon,
 * never a second job for an old one.
 *
 * ─── WHY NAMED COMPONENTS AND NOT A MAP ───────────────────────────────────
 *
 * The top panel and the phone's bar are client components, so whatever they
 * import ships in their bundle. A `Record<name, path>` would ship every glyph
 * to every page; one export per glyph lets the bundler keep only the ones a
 * surface renders (WC2-8's 250 KB wire budget counts every byte).
 *
 * ─── NEVER THE ONLY LABEL ─────────────────────────────────────────────────
 *
 * Every glyph is `aria-hidden`. The control or the text beside it carries the
 * name: an icon is how a reader scans, never how a screen reader learns what
 * a control does.
 *
 * Drawn on a 20×20 grid at a 1.6 stroke in `currentColor`, so a glyph takes
 * the ink of whatever it sits in and needs no colour of its own (XP-1).
 */
interface IconProps {
  /** Tailwind sizing and colour; defaults to 16px. */
  readonly className?: string | undefined;
}

function Svg({ className, children }: IconProps & { readonly children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ?? "h-4 w-4 shrink-0"}
    >
      {children}
    </svg>
  );
}

/** A build: an open door. The product's own mark for "built in the open". */
export function BuildIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 17h14" />
      <path d="M5 17V3h10v14" />
      <path d="M5 3l5 1.8v13.4L5 17" />
    </Svg>
  );
}

/** An open role: an empty seat. */
export function RoleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.5 3v8.5h7.5" />
      <path d="M6.5 11.5 5.5 17M14 11.5l1 5.5M6.2 14.2h8.3" />
    </Svg>
  );
}

/** A topic. */
export function TopicIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 3.5 6.5 16.5M13.5 3.5 12 16.5M4 7.5h12.5M3.5 12.5H16" />
    </Svg>
  );
}

/** People. */
export function PeopleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7.5" cy="7" r="2.6" />
      <path d="M2.8 16a4.7 4.7 0 0 1 9.4 0" />
      <circle cx="14" cy="7.6" r="2.1" />
      <path d="M13.6 12.2a4 4 0 0 1 3.9 3.8" />
    </Svg>
  );
}

/**
 * The chrome's glyphs (openproduct-redesign OPR1), redrawn from the boards'
 * 24-unit paths onto this set's 20-unit grid. One per destination of the
 * header and the phone's tab bar, and one each for the header's controls.
 */

/** The feed: a house — where a reader starts. */
export function FeedIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.3 9.2 10 3.3l6.7 5.9v7.5H3.3z" />
    </Svg>
  );
}

/** Products: a grid of four tiles. */
export function ProductsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="2.5" width="5.8" height="5.8" rx="1.7" />
      <rect x="11.7" y="2.5" width="5.8" height="5.8" rx="1.7" />
      <rect x="2.5" y="11.7" width="5.8" height="5.8" rx="1.7" />
      <rect x="11.7" y="11.7" width="5.8" height="5.8" rx="1.7" />
    </Svg>
  );
}

/**
 * Help wanted: a person and a plus — a seat to be taken. The redesign's
 * glyph for the section; `RoleIcon` stays the mark of one open role on a
 * row until the page that draws it is rebuilt.
 */
export function SeatIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7.5" cy="6.7" r="2.9" />
      <path d="M2.5 16.7c.7-2.9 2.7-4.6 5-4.6s4.3 1.7 5 4.6" />
      <path d="M15 6.7v5M12.5 9.2h5" />
    </Svg>
  );
}

/** Activity: a bell. */
export function ActivityIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 6.7a5 5 0 0 1 10 0c0 5.8 2.5 6.6 2.5 6.6h-15S5 12.5 5 6.7" />
      <path d="M8.3 16.7a1.7 1.7 0 0 0 3.4 0" />
    </Svg>
  );
}

/** Search: a magnifier. */
export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9.2" cy="9.2" r="5.8" />
      <path d="m16.7 16.7-2.9-2.9" />
    </Svg>
  );
}

/** One person: the profile control, and a signed-out visitor. */
export function PersonIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="6.7" r="3.3" />
      <path d="M3.3 17.5c1.3-3.3 3.8-5 6.7-5s5.4 1.7 6.7 5" />
    </Svg>
  );
}

/** A disclosure: the chevron that opens (down) or closes (up) what is under a row. */
export function ChevronIcon({ up = false, ...props }: IconProps & { readonly up?: boolean }) {
  return (
    <Svg {...props}>
      <path d={up ? "m5 12.5 5-5 5 5" : "m5 7.5 5 5 5-5"} />
    </Svg>
  );
}

/** Opening something new: a plus. */
export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 4.5v11M4.5 10h11" />
    </Svg>
  );
}

/** Merged changes, as observed in the repo. */
export function ChangesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="6" cy="4.5" r="1.8" />
      <circle cx="6" cy="15.5" r="1.8" />
      <circle cx="14" cy="8" r="1.8" />
      <path d="M6 6.3v7.4M14 9.8c0 3.2-3.5 3.6-7.2 4.6" />
    </Svg>
  );
}

/** Most active: a pulse. */
export function ActiveIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 10.5h3l2-5 3.5 9 2-4h4.5" />
    </Svg>
  );
}

/** Newest: a sprout. */
export function NewIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 17v-6.5" />
      <path d="M10 10.5C10 7.2 7.8 5 4.5 5c0 3.3 2.2 5.5 5.5 5.5z" />
      <path d="M10 9c0-2.8 1.9-4.7 4.7-4.7 0 2.8-1.9 4.7-4.7 4.7z" />
    </Svg>
  );
}

/** An upvote. */
export function UpvoteIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5.5 12.2 10 7.7l4.5 4.5" />
    </Svg>
  );
}

/** The public repository. */
export function CodeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 5.5 3 10l4 4.5M13 5.5l4 4.5-4 4.5M11 4 9 16" />
    </Svg>
  );
}

/** The Orunbase workspace: stacked layers. */
export function WorkspaceIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3 17 6.8 10 10.6 3 6.8z" />
      <path d="M3 10.2l7 3.8 7-3.8M3 13.6l7 3.8 7-3.8" />
    </Svg>
  );
}

/** Repo health: a shield with a check. */
export function HealthIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3 16 5.5v4.2c0 3.7-2.6 6.3-6 7.3-3.4-1-6-3.6-6-7.3V5.5z" />
      <path d="M7.5 10l1.8 1.8 3.3-3.6" />
    </Svg>
  );
}

/** A point in time: the last merge, a window. */
export function ClockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l2.5 2" />
    </Svg>
  );
}
