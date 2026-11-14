/**
 * The logo (openproduct-redesign OPR1, design.md §3): a "P" whose head is an
 * "o" — an ink stem and an amber ring.
 *
 * Drawn inline so the header's brand block is one paint with no extra
 * request, and the same two strokes the tab icon wears
 * (`app/icon.svg/route.ts`).
 *
 * THE STEM IS `currentColor`, so it is ink on the light bar and the page's
 * light ink on the dark one without the component reading the theme. THE RING
 * IS THE ACCENT (`--endorse`, which is the amber #B8862F on :root and lifted
 * in the dark ramp) — the one place the chrome spends it besides the bell's
 * badge, exactly as the old mark's dot did (XP-1; `shell.test.ts` counts).
 *
 * `stroke` is both strokes' weight in the 24-unit box: 2.6, the boards'
 * value, with round caps and no fill.
 */
export function Logomark({ size = 22, stroke = 2.6 }: { size?: number; stroke?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={stroke}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <path d="M8 3.5V21" stroke="currentColor" />
      <circle cx="14" cy="9.5" r="6" className="stroke-endorse" />
    </svg>
  );
}
