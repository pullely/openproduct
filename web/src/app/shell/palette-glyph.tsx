// The magnifier, which both halves of the search field need.
//
// It lives alone because OPP11 split the field from its dropdown: the field
// is eager (it renders in the bar on every page) and the panel is lazy, and
// this glyph is drawn by both — in the field's own box and beside every
// suggested topic. A component imported from both sides of a lazy boundary
// belongs to neither, so it is its own module and stays in the eager chunk,
// where the panel's import of it costs nothing extra.
export function SearchGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
      className="shrink-0 text-muted-foreground"
    >
      <circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.4 9.4 12.6 12.6" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}