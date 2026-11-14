// Talk's two glyphs (boards `Product`, `PhoneProduct`): a lock for private,
// a globe for public. Inline SVG, as every icon on the site is.

const LOCK = "M6 11V8a6 6 0 0112 0v3M5 11h14v10H5z";
const GLOBE = "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18";
const CHECK = "M5 12l5 5 9-10";

function Glyph({ d, size }: { d: string; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d={d} />
    </svg>
  );
}

export function LockGlyph({ size = 13 }: { size?: number }) {
  return <Glyph d={LOCK} size={size} />;
}

export function GlobeGlyph({ size = 13 }: { size?: number }) {
  return <Glyph d={GLOBE} size={size} />;
}

export function CheckGlyph({ size = 13 }: { size?: number }) {
  return <Glyph d={CHECK} size={size} />;
}
