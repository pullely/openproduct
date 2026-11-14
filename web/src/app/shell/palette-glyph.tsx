// The magnifier, which both halves of the header search need.
//
// It lives alone because OPP11 split the field from its results card: the
// field is eager (it renders in the bar on every page) and the card is lazy,
// and this glyph is drawn by both. A component imported from both sides of a
// lazy boundary belongs to neither, so it is its own module and stays in the
// eager chunk, where the card's import of it costs nothing extra.
//
// The drawing is the icon set's (`ui/icons.tsx`, the board's 16px magnifier
// in `--muted`); this module only fixes its size and ink for the field.
import { SearchIcon } from "../ui/icons";

export function SearchGlyph() {
  return <SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />;
}
