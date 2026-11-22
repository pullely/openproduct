# openproduct-left-rail — design

The design of record is the board `boards/Main.dc.html`: one interactive
artboard that holds every page (the canvas at version 10, 2026-11-23). Where
this file and the board disagree, this file wins, because it records what
the owner decided after the board was drawn.

This epic reverses four rules of `openproduct-redesign` and
`openproduct-ui-fixes`. Each is named where it is reversed (§6), so nobody
reads the older design as still standing.

## 1. Colour: graphite

1. There is no accent hue. The interface is drawn in neutral greys; a
   selected state is told by weight, a fill and a border, never by colour.
2. Light: page and cards `#FFFFFF`, text `#1F2328`, muted text `#59636E`,
   borders `#D1D9E0`, the subtle fill `#F6F8FA`, the stronger fill
   `#EAEEF2`. The primary button is text-coloured under white.
3. Dark: page and cards `#0D1117`, text `#F0F6FC`, muted text `#9198A1`,
   borders `#3D444D`, the subtle fill `#151B23`, the stronger fill
   `#212830`, the selected fill `#262C36`. The primary button is
   `#F0F6FC` under `#0D1117`.
4. Because a card and the page are the same colour, a card is told by a 1px
   border, not by a step in colour.
5. The four kind colours (amber for shipped, lavender for ideas, slate for
   versions, teal for seats) are retired. A kind is told by its label and
   its icon. Owner decision, 2026-11-23.
6. Green for success and red for danger stay, for those two meanings only.
7. The amber that remains is the dot in the mark (§3) and nothing else.
8. The page's glow and dot grid are removed; the ground is flat.

## 2. Type: the system typeface

1. One family: the system UI stack (`-apple-system`, `BlinkMacSystemFont`,
   `Segoe UI`, `Noto Sans`, `Helvetica`, `Arial`, `sans-serif`). No webfont
   is downloaded for UI text.
2. Two weights do the work: 400 for prose and 600 for headings, names and
   the selected state. 500 is allowed on a button.
3. Page titles are sans 600, not the serif. Titles are 26px, post titles
   20px, body 15px with a 1.6 line height, secondary text 12 to 14px. No
   negative letter spacing.
4. The small label is 12px/600 in the UI face: not monospace, not
   uppercase, not tracked.
5. Monospace is the system monospace stack and is for code and machine
   values only.

## 3. The mark

A near-black rounded tile, a white ring, and an amber dot at its top right.
It replaces the previous mark in the bar. The product `openproduct-live`
wears the same mark as its logo. On the dark theme the tile carries a 1px
outline so it does not sink into the page.

## 4. Layout: one left rail, phone first

1. Every page has the same frame: the bar, the left rail, the content, and
   on wide screens a right column.
2. The rail lists the whole site, in this order: Home, Products, Help
   wanted, Discussions; then the sections Your products (signed in only,
   ending with Open a build), Topics, Explore (People, Stacks, Pricing,
   Collections, Weekly digest) and Resources (Docs, How posting works, What
   runs automatically, Transparency). Each section folds.
3. The bar holds the mark and wordmark, the search, the theme control, the
   activity bell and the account menu. Create post is not in the bar (§5.4).
4. Styles are written for the phone first and widen at breakpoints.
5. On a phone the bottom tab bar stays (Feed, Products, Seats, Activity),
   and a menu button in the bar opens the rail as a drawer over the page.
   Owner decision, 2026-11-23.
6. From 960px the rail is pinned beside the content and scrolls on its own.
7. The right column sits beside the content when there is room and stacks
   under it otherwise. By default it holds Open seats and Following; on a
   product or a post it holds the product's about cards.
8. Content is capped at 720px and prose at 64 characters.

## 5. Posts and actions

1. A post is a tile: a 1px border, a 16px radius, 20px inside, 12px between
   tiles. The border darkens under the pointer.
2. A post's actions are icons: an up arrow with the count (Useful), a
   speech bubble with the count, share, save. They have no fill until
   hovered or selected. Follow is a plus that becomes a tick. Every
   icon-only control has an accessible name and a tooltip.
3. The Try it link inside a post is a shaded tile: the stronger fill, no
   border, darker under the pointer.
4. Create post exists only on a product's page, on its Updates tab, and
   only for a signed-in member of that product's crew. The post is for that
   product, so the dialog has no product picker.
5. Buttons, tabs and the search are pills. Primary actions that would be
   ambiguous as an icon keep their words (Follow on a product page, Open
   it, Take a seat, I'd use this, form buttons).

## 6. What this reverses

| Older rule | Where | Now |
|---|---|---|
| Three sections in the navigation and the list is closed; no People directory in the navigation | `openproduct-redesign` design §2 rule 4, `shell/shell.ts` | The rail lists every section, People included (§4.2) |
| Four colours each mean one kind | `openproduct-redesign` design §3 | Retired (§1.5) |
| Hanken Grotesk for UI, Lora for titles, IBM Plex Mono for labels, Geist in the bar | `openproduct-redesign` design §3, `openproduct-ui-fixes` UF2 | The system typeface (§2) |
| A card is flat white on a warm page with no border | `openproduct-redesign` OPR1 | White on white with a border (§1.4) |
| The frosted centred bar with an amber glow | `openproduct-ui-fixes` UF2 | A plain bar; sections moved to the rail (§4.3) |
