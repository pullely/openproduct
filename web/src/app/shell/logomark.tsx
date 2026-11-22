/**
 * The logo (openproduct-left-rail LR1, design §3): a near-black rounded tile,
 * a white ring, and an amber dot at the ring's top right.
 *
 * Drawn inline so the header's brand block is one paint with no extra
 * request, and the same three shapes the tab icon wears
 * (`app/icon.svg/route.ts`).
 *
 * THE COLOURS ARE THE MARK'S OWN, not the theme's: the tile is #17150F and
 * the ring white on either ramp, so the mark is the same picture everywhere.
 * On the dark ramp the tile would sink into the page, so it carries a 1px
 * outline in `--border` there (`.dark-outline` is not needed: the stroke
 * reads the token and is the page's own colour on the light ramp's white).
 * THE DOT IS THE ONLY AMBER LEFT ON THE SITE (design §1 rule 7).
 *
 * `stroke` is the ring's weight in the 24-unit box.
 *
 * `className` is for a size that depends on the viewport: a CSS width and
 * height take precedence over the `size` attributes, which stay as the size
 * before the stylesheet lands.
 */
export function Logomark({
  size = 22,
  stroke = 2.4,
  className = "",
}: {
  size?: number;
  stroke?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      <rect x="0.5" y="0.5" width="23" height="23" rx="6" fill="#17150F" className="stroke-border" strokeWidth="1" />
      <circle cx="11.5" cy="12.5" r="4.6" stroke="#FFFFFF" strokeWidth={stroke} />
      <circle cx="16.8" cy="7.2" r="2.3" fill="#C9952F" />
    </svg>
  );
}
