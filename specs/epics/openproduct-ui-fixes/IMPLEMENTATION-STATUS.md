# openproduct-ui-fixes — implementation status

| Milestone | Task | State | PR |
|---|---|---|---|
| UF1 — one layout on every page | UF-1 | Done | #20 |
| UF2 — frosted centred navbar | UF-2 | In review | this PR |
| UF3 — calm tab switching and feed loading | UF-3 | Not started | — |

## From UF1

What landed:

- `BOARD_PAGE` and the header, footer, sign-in, search, activity, settings,
  your profile and post builder columns are fluid to 1920px with the 24px
  gutter.
- `SECTION_PAGE` (new): Feed, Products and Help wanted share it — columns
  8px under the bar, 16px between. The feed's columns are 240 / fill / 300
  (were 250 / up to 860 / 280).
- `RAIL_LEFT` (new, 240px): Products' and Help wanted's filters, and now
  Search's segments and Activity's switch, which stack in a card in the left
  rail from `md` up.
- Products' and Help wanted's title row is visually hidden from `sm` up and
  stays for the outline; on a phone it is unchanged.

Departures from the design, said plainly:

- **Reading pages keep their measure.** Docs, pricing, transparency,
  digest, launches, the forum, the studio, submit, the not-found body and
  the private-thread reader keep their 760–1200px columns. The canvas
  designed app pages, not long prose, and a 1920px line of prose is
  unreadable. Rule §1.1 is read as applying to app pages.
- **The phone is unchanged.** The owner's layout requests were made on
  desktop boards; phone layouts keep OPR1's spacing.
- **Feed card density (§1 rule 7)** waits for UF2, which touches the same
  cards' surroundings; it is not in this PR.
- **The product, person and post pages keep their 300 / 280px side
  columns as OPR1 drew them** (`BOARD_COLUMNS`, `BOARD_COLUMNS_NARROW`);
  only their outer shell widened.

## From UF2

What landed:

- The bar: 56px (68px on a phone, unchanged), three columns from `sm` up —
  the 30px mark and the Geist wordmark at 21px, the sections as plain 16px
  text centred 36px apart (ink and medium when current, grey otherwise), the
  search at 42px on a faint fill, and the bell and the profile control as
  plain 40px icons.
- The frost: `.bar-frost::before` in globals.css, reaching 10px below the
  bar and fading out over its last 14px; ivory 40% / blur 8px at the top of
  a page, ivory 92% / blur 24px once scrolled 64px (scroll-driven), the deep
  frost everywhere scroll timelines are not supported.
- Geist, restored byte for byte from before OPR1, on the bar only
  (`font-bar`). The phone tab bar marks the current tab with a short ink
  line above its glyph.
- The page ground: the dot grid is gone; ivory and the amber glow remain.
- Feed card density (design §1 rule 7, moved from UF1): post head and body
  16px in from the card's edge, 10px between posts.

Budgets, said plainly: the wire budget is amended 276 → 305 KB and 30 → 31
requests (one more font file on every page, 29,288 bytes; the listing was at
the request limit and measured 31); the font budget is five files
(105,212 bytes, +6,076 headroom) and six with Lora's italic.

Departures from the design:

- The signed-in profile control stays an initials disc (a person's mark),
  not a plain icon; the signed-out one is a plain icon.
- `--page-dot` stays defined (and its dark alias) with nothing drawing it,
  so the dark-ramp pairs keep their shape; removing it is a follow-up.
