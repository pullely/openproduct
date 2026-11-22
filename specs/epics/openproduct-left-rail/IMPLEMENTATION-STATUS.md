# openproduct-left-rail — implementation status

| Milestone | Task | State | PR |
|---|---|---|---|
| LR0 — the spec | LR-1 | Done | #27 |
| LR1 — graphite and system type | LR-2 | In review | this PR |
| LR2 — the left rail on every page, phone first | LR-3 | Not started | |
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
- **The theme colour is light only.** `themeColor` is `#ffffff`, as it was
  one value before.
