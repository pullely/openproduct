# openproduct-left-rail — implementation status

| Milestone | Task | State | PR |
|---|---|---|---|
| LR0 — the spec | LR-1 | Done | #27 |
| LR1 — graphite and system type | LR-2 | Done | #28 |
| LR2 — the left rail on every page, phone first | LR-3 | Done | #29 |
| LR3 — tiled posts with icon actions | LR-4 | Done | #30 |
| LR4 — posting from the product page | LR-5 | Done | #31 |
| LR5 — closer to the board | LR-6 | In review | this PR |

**The epic is complete when LR5 lands.** The owner compared the live site
with the board on 2026-11-23 and asked for the bar and the page frames to be
the board's; LR5 is that. Every earlier milestone has landed;
what the build left out of the board is listed under each milestone's
"Departures", and collected under "Known follow-ups" at the end. Marking
EP-6 completed in the Orunbase console is the one leftover outside this
repository.

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

- **Thirteen budgets amended, and recorded.** The rail is in every document
  and every page's script: about 0.6 to 1.1 KB of gzipped document and
  1.4 KB of script, measured in CI (run 45065215237). Thirteen route limits
  that were within that of their measurements move to the measurement plus
  100 bytes (`tests/web-perf/src/budgets.mjs` lists each); every other
  route absorbed it. Twenty desktop snapshots move for the rail's 248px.

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

## From LR3

What landed:

- **One tile for every kind.** `POST_TILE` in `posts/post-card.tsx`: a 1px
  border, a 16px radius, the border a step darker under the pointer. The
  feature's glow, the idea's note shape and wash, and the seat's ticket
  notches are gone; `POST_CARD_SHELL` maps all five kinds to the tile. The
  feed's tiles are 12px apart.
- **The shaded Try it tile.** The stronger fill, no border, the label over
  the host the link goes to, and an arrow; darker under the pointer.
- **Icon actions.** The reaction picker's trigger and the comment link are
  40px icons (44px on a phone) with no fill until hovered or selected, each
  with a name and a tooltip; the comment count is a number beside its
  bubble; what readers have said sits at the row's end. Follow on a post is
  a plus that becomes a tick (`FollowButton`'s new `glyph` prop).
- **The check badge** is the selected fill under the text colour, not amber.

- **Four script budgets amended, and recorded.** `FollowButton`'s glyph form
  costs 189 to 195 bytes on the product page, its About and Crew tabs and
  `/submit`, against the 100 bytes of room LR2 left; each moves to CI's
  measurement plus 100 bytes (run 45067595166). Four post-page snapshots
  move for the icon row.

Tests rewritten to the new rules: `product-post-cards` and `post-page`.

Departures from the design, said plainly:

- **No share and no save on a post in the feed.** The board draws both.
  Share exists on the post's own page only and saving a post does not
  exist; neither is added here.
- **Reactions keep their four choices.** The board draws one Useful arrow
  with a count. The picker stays, behind one icon; the count is the summary
  at the row's end.
- **Compact cards are unchanged inside.** The product page's and a person's
  post cards take the tile's border but keep their text footer (the count
  line and the Try it word).
- **Product rows and seat cards are unchanged.** Their actions are not
  icons yet.

## From LR4

What landed:

- **Nothing had to move.** The site already made posts the way design §5.4
  asks: "New post" is a row on a product's Updates column
  (`[slug]/maker/new-post.tsx`), drawn after load for a browser whose own
  session manages that product and for nobody else, and its kinds link to
  `/[slug]/new`, so the product is the page's and there is no picker. The
  bar, the rail, the phone's tabs and the feed never offered it.
- **It is pinned now.** `shell.test.ts` holds both halves: no chrome or
  feed file starts a post, and the product page's row is gated on
  `managing`.
- **The row is a bordered card**, like every other since LR1.

Departures from the design, said plainly:

- **The row is the site's, not the board's.** The board draws one "Post an
  update" bar that opens a dialog. The site's row of five kind pills, each
  going to the full-page composer, is kept: it is the same act with one
  step fewer.

## From LR5

The owner's review of the live site against the board, 2026-11-23: the
search was on the bar's right, the bar was frosted with no border and no
theme control, the feed had a column on its left, Products and Help wanted
put their filters in a second left column, and other pages sat in wide
frames with 64 to 80px above them.

What landed:

- **The bar is the board's.** A plain surface with a bottom border, the
  window's full width with 16px at its sides. Three columns from `sm` up,
  the outer two equal: the menu button, the mark and the word; the search
  in the centre at up to 560px, on the subtle fill, the same width at rest
  and open; and the theme control (`shell/theme-button.tsx`, new), the bell
  and the account. UF2's frost and its scroll animation are removed.
- **One frame for every page.** `BOARD_PAGE`, `SECTION_PAGE` and `PAGE` are
  centred at 1124px (the board's 720px column, 40px, and the 300px right
  column, in 32px gutters) with 28px above; `PAGE_NARROW` keeps its 900px
  and takes the same room above.
- **The feed has no left column.** Posts in one column beside the right
  column, 40px apart. The You block (the sign-in card, or the reader's own)
  is the last thing in the right column.
- **Filters are a row.** Products' stages and Help wanted's filters are
  pills in a row above their lists at every width; `RAIL_LEFT` is the full
  width. Search's segments follow, since they read the same constant.
- **Product and seat cards are bordered**, and an idea's card is the same
  shape as any other.
- **The rail is 264px**, the board's, with a thin scrollbar.
- **The board is the canvas at version 11**: its rail lists what the site
  draws for every visitor (Your products as two links, Topics as All
  topics, RSS under Explore), the feed has no sort tabs, and a post's row is
  the reaction icon, the comment icon and the count.

- **Search's segments are a row above its results**, as the filters are;
  left as a column they squeezed the results, which the axe lane caught.
- **Six budgets amended, and recorded.** The theme button and the bar's
  frame cost 95 to 196 bytes of script on the product page, its About and
  Crew tabs and `/submit`, and a few bytes of document on About and Talk,
  against the 100 bytes of room LR3 left; each moves to CI's measurement
  plus 100 bytes (run 45106684524). All forty snapshots move: every frame
  changed, and the bar is 57px with its border.

Tests rewritten to the new rules: `shell`, `mobile-shell`, `search-field`,
`calm-builds`, `feed-of-posts`, `products-and-seats`, `product-maker-view`.

Departures from the design, said plainly:

- **The You block is in the right column**, which the board does not draw.
  It carries the sign-in door and a maker's own products; removing it would
  remove both from the feed.
- **Products is a grid of cards, not the board's rows.** The frame and the
  filters moved; the card did not.
- **The footer's theme control stays**, beside the bar's new one. The two
  do not read each other's state until a reload.
- **The theme button is not on a phone's bar**, which has no room; the
  footer's control is.

## Known follow-ups

None is scheduled; each is a departure recorded above.

- Pages that spell a serif title, a mono uppercase label or an amber
  gradient inline still carry their old size and case (LR1).
- Page frames are not rewritten phone first (LR2).
- Between 640px and 960px the menu button is the only navigation (LR2).
- No share or save on a post in the feed; reactions keep four choices;
  product rows and seat cards keep text actions (LR3).
- The prose comments in `globals.css` still describe the old palette in
  places, and the retired section-line transition rules remain (LR1, LR2).
- The web-perf snapshots follow the CI runner's fonts (risk R7).
