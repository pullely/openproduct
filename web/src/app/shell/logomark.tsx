/**
 * The wordmark's glyph (openproduct-commons XP0).
 *
 * The same open ring and bronze dot the tab icon already wears
 * (`app/icon.svg/route.ts`), drawn inline so the panel's brand block is one
 * paint with no extra request — and re-cut for a 22px box rather than scaled
 * down from a 48px one, which is where a hairline ring goes muddy.
 *
 * `stroke` is the ring's weight in the 24-unit box: 2.6 for the 22px cut,
 * lighter for the bar's 32px mark (CL1), where 2.6 scaled up reads heavy.
 *
 * Deliberately not themed: it sits on the panel, and the panel is dark in
 * both themes.
 */
export function Logomark({ size = 22, stroke = 2.6 }: { size?: number; stroke?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <circle cx="10.5" cy="13" r="7.5" fill="none" stroke="currentColor" strokeWidth={stroke} />
      <circle cx="18.5" cy="5.5" r="3.2" className="fill-endorse" />
    </svg>
  );
}
