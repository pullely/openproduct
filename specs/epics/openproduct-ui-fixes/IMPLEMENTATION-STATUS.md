# openproduct-ui-fixes — implementation status

| Milestone | Task | State | PR |
|---|---|---|---|
| UF1 — one layout on every page | UF-1 | In review | this PR |
| UF2 — frosted centred navbar | UF-2 | Not started | — |
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
