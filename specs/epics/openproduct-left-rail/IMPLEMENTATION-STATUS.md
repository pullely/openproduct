# openproduct-left-rail — implementation status

| Milestone | Task | State | PR |
|---|---|---|---|
| LR0 — the spec | LR-1 | Done | #27 |
| LR1 — graphite and system type | LR-2 | In review | this PR |
| LR2 — the left rail on every page, phone first | LR-3 | In review | this PR |
| LR3 — tiled posts with icon actions | LR-4 | Not started | |
| LR4 — posting from the product page | LR-5 | Not started | |

## From LR1

What landed:

- **The graphite ramp.** Every colour token in `globals.css` takes the
  design's greys in both ramps (design §1 rules 2 and 3). The page and the
  card are white (`#0D1117` in dark), text is `#1F2328` (`#F0F6FC`), muted
  text `#59636E` (`#9198A1`), borders `#D1D9E0` (`#3D444D`).
- **No kind colour.** The amber, lavender, slate and teal families, the
  warning, info and agent families, the brand amber, the accent (`--endorse`)
  and the link keep their token names and carry greys at their old
  lightness, so every contrast pair `dark-ramp.test.ts` measures still
  holds. Green (success) and red (danger) are unchanged.
- **Bordered cards.** `CARD`, `PANEL`, `TILE`, `TILE_LINK`, `EMPTY_NOTE`,
  `BOARD_CARD`, `SIDE_CARD` and `SEGMENTS` gain a 1px border, since the card
  and the page are now the same colour. The cover bands are the flat subtle
  fill.
- **A flat ground.** The amber glow on `body` is removed.
- **The system typeface.** The five font files and their `next/font`
  declarations are gone; `--font-sans` and `--font-mono` are system stacks,
  and `--font-serif`, `--font-serif-italic` and `--font-bar` resolve to the
  UI face. The font budget in `tests/web-perf/src/budgets.mjs` is 0 bytes
  and 0 files. The page title is 26px/600 (22px on a phone) and the small
  label (`EYEBROW`) is 12px/600.
- **The mark.** The ring tile in the bar, the tab icon and the feed's
  signed-out card.

Tests rewritten to the new rules, not loosened: `redesign-foundations`
(palette, faces, cards, ground, logo), `dark-ramp` (the amber pairing),
`shell` (the mark no longer spends the accent token), `build-page` and
`calm-build-body` (the title and the card strings).

Departures from the design, said plainly:

- **Call sites still say `font-serif`, `font-mono` and `uppercase`.** The
  shared title and label constants moved; pages that spell a serif title or
  a mono uppercase label inline are drawn in the UI face (serif) or the
  system monospace (labels) but keep their old size, weight and case. They
  move with the pages LR2 and LR3 rebuild.
- **Posts in the feed have no border yet.** The feed's rows do not use the
  shared card strings; they become tiles in LR3.
- **The comments in `globals.css` still describe the old palette in
  places.** Each rewritten token carries its new hex; the longer prose notes
  around them were not all rewritten.
- **`[data-accent]` blocks are untouched.** The three optional accent
  families still exist in the stylesheet; nothing sets the attribute.
- **The geometry snapshots are the CI runner's.** With no webfont, text is
  set in whatever the machine has, so `tests/web-perf/snapshots/*.json`
  hold the widths and heights CI's Chromium measured (run 45062888765),
  applied from its log rather than recorded on a laptop. A change of runner
  image can move them by a pixel with no change here; see risk R7.
- **The theme colour is light only.** `themeColor` is `#ffffff`, as it was
  one value before.

## From LR2

What landed:

- **The rail's list is data.** `shell/shell.ts` gains `RAIL_PRIMARY` (the
  three sections, the feed as Home, and Discussions), `RAIL_GROUPS` (Your
  products, Topics, Explore, Resources) and `RAIL_LINKS`; `railCurrent` in
  `shell/section-for.ts` lights one row or none.
- **The rail is in every page's frame.** `shell/side-rail.tsx`, rendered by
  the root layout beside the page's own column. Rows are 44px with a glyph
  (`shell/rail-glyph.tsx`, ten new glyphs in `ui/icons.tsx`); groups fold
  with `<details>`, so folding needs no script.
- **Phone first.** The stylesheet's base rules are the phone's: the rail is
  out of the page and opens as a drawer under the bar, over a scrim, from
  the menu button (`shell/rail-toggle.tsx`). It closes on Escape, on
  navigation and on a tap outside. From 960px the rail is pinned, 248px
  wide, and scrolls on its own. The bottom tab bar is unchanged.
- **The bar lost its sections.** Feed, Products and Help wanted are rows of
  the rail; UF3's crossfade still runs for those three. The footer's links
  are hidden from 960px, where the rail carries every one of them.
- **Your products** is the same two links for every signed-in visitor and is
  in the document for everyone (I6): `data-auth-branch` hides it and
  `.rail-yours` gives it no height for a browser with no session.

Tests rewritten to the new rules: `shell`, `mobile-shell`, `navigation`,
`icons` and `target-size`; `shell` gains the rail's own suite.

Departures from the design, said plainly:

- **Topics lists one link.** The board lists each topic in the rail. Topics
  are data, and the rail is the same bytes on every page, so it links All
  topics only.
- **Your products is two links, not the visitor's products.** The board
  lists each of the maker's products. That is personal data, which the
  shell does not render on the server; the list is the first section of
  `/me`, one tap away.
- **RSS is a row** under Explore, so hiding the footer's links at 960px
  removes nothing.
- **The gliding section line is retired** with the bar's text links; the
  current row is a fill. Its view-transition rules are still in the
  stylesheet and now name nothing.
- **Pages keep their own columns.** The feed's You card and the filters'
  left rail on Products and Help wanted still sit beside the site rail, so
  those pages have two left columns on wide screens. The pages' frames are
  not rewritten phone first in this PR; only the shell is.
- **Between 640px and 960px there is no tab bar and no pinned rail**: the
  menu button is the navigation at those widths.
- **Not on the sign-in door**, which keeps the mark and nothing else.
