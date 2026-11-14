import type { SectionIcon } from "./shell";

import { ActivityIcon, FeedIcon, ProductsIcon, SeatIcon } from "../ui/icons";

/**
 * A destination's glyph (first drawn at OB1, D6; the set is the boards' since
 * openproduct-redesign OPR1). ONE SWITCH: the phone's tab bar is the only nav
 * that draws glyphs — the header's pills are words — but the mapping lives
 * here rather than in the bar, so a destination's name and its picture are
 * each written once.
 */
export function SectionGlyph({ icon, className }: { readonly icon: SectionIcon; readonly className?: string }) {
  switch (icon) {
    case "feed":
      return <FeedIcon className={className} />;
    case "products":
      return <ProductsIcon className={className} />;
    case "seats":
      return <SeatIcon className={className} />;
    case "activity":
      return <ActivityIcon className={className} />;
  }
}
