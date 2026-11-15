# openproduct-ui-fixes — design

Every decision below was made by the owner on the Claude Design canvas
(`openproduct redesign`, versions 73–89, 2026-11-15). The boards in
`boards/` are copies of the canvas at version 89; where a board and this
file disagree, this file wins.

## 1. One layout on every page (UF1)

1. **One fluid shell.** Every page body is one container: `max-width:
   1920px`, centred, `24px` side gutter. The page fills the window up to
   1920px; only past that does it stop growing, so lines never run across
   an ultrawide screen. No page caps its content narrower (no 1180px, 1080px
   or 760px columns).
2. **Fixed rails.** A left rail is `240px` (filters, sections, steps); a
   right rail is `300px` (about, related). The main column takes the rest.
   Columns wrap at narrow widths as they do today.
3. **Gaps.** `24px` between columns on ordinary pages; `16px` on the three
   tab pages (rule 5).
4. **Filters live in the left rail**, never as pill rows above a list.
   Activity's All / Mentions / Seats and Search's All / Products / People /
   Posts move into a left rail nav, in the same style as Products' stage
   nav (icon tile, label, count).
5. **The three tab pages share one layout.** Feed, Products and Help wanted
   have no title row (the `h1` stays for screen readers) and start their
   columns `8px` under the bar, so switching between them swaps only the
   content (§3).
6. **Other pages keep their head**: a Lora 40px title with the mono meta on
   the same line; detail pages (product, person, post) lead with their hero
   card. Task pages (post builder, record a demo) keep back + breadcrumb in
   the bar.
7. **Feed density.** Post gap `10px`; post-card side padding about a
   quarter smaller than OPR1 (24/22/20/18px → 18/16/16/14px).
8. **No inner width caps** that leave empty space: cards, panels and grids
   fill their column; grids add columns as the window widens. Product pitch
   and idea quote are not capped.

## 2. The bar (UF2)

1. **Shape.** `56px` tall (`6px` vertical padding), full width with the
   page's `24px` gutter, so the mark and the account control line up with
   the page edges. A three-column grid: the mark and wordmark left, the
   sections centred, search + Activity + account right. One row, never
   wrapping (FR1's rule, kept).
2. **Sections are plain text.** Feed · Products · Help wanted, `16px`,
   `36px` apart, grey (`#6B6A66`); the current one ink (`#141413`) at
   medium weight. No pills, no capsule, no icons in the links.
3. **Type.** The whole bar is set in **Geist** (400/500/600), self-hosted
   like the other faces. The rest of the site keeps Hanken Grotesk (UI),
   Lora (display) and IBM Plex Mono (labels).
4. **Mark.** The logomark at `30px`; the wordmark in Geist 600, `21px`,
   `-0.035em`.
5. **Right side.** The search field `42px` tall, borderless on a faint fill
   (`rgba(20,20,19,0.045)`); Activity and account as plain `40px` icon
   buttons (ink when current, grey otherwise).
6. **Frost, not a line.** Behind the bar is a frosted band: a blur plus a
   white-to-clear gradient, extending `10px` below the bar and fading out
   over its last `14px`, so there is no edge or hairline: content melts
   into the bar. At the top of a page it is light (ivory 40%, blur 8px);
   once the page scrolls (over the first 64px) it deepens to ivory 92%,
   blur 24px. Without scroll-driven animation support it is the deep frost
   at all times.
7. **Background.** Ivory `#F6F4EE` with the soft amber glow at the top
   (`radial-gradient(1100px 460px at 50% -8%, rgba(184,134,47,0.18),
   transparent 62%)`, fixed). **No dot grid anywhere**: the owner rejected
   it.
8. **Phone.** The bottom tab bar keeps its four tabs; the current tab is
   ink with a short `18px × 2px` line above its icon, others grey. No pill.

## 3. Switching and loading (UF3)

1. **Switching never feels like a reload.** Between Feed, Products and Help
   wanted the bar, the background and the page frame stay perfectly still.
   Only the content area crossfades (old out in ~0.14s, new in ~0.22s).
   No sideways slide, no page fade-up, **no navigation progress bar**.
2. **The section underline.** A `2px` ink line under the current section
   (5px below the text) glides to the new section when it changes (~0.45s,
   `cubic-bezier(0.2, 0.8, 0.2, 1)`). Hovering a section previews a faint
   line under it.
3. **Feed loading.** While posts are loading, the feed shows three skeleton
   posts with a soft shimmer. When they arrive, the posts rise in one after
   another (18px, 80ms apart). Never when the posts are already there:
   returning to the feed shows them at once.
4. **Reduced motion** turns every one of these off.
5. **Speed.** The three section pages should be warm before the click
   (prefetch on intent, as `AppLink` already does), so the crossfade is the
   only thing the visitor sees.

## Rejected on the way (owner, 2026-11-15)

- A 1280px shell, then a 1200px bar: "make it wide".
- A track with a sliding white pill; a frosted capsule around the links;
  icons in the links: "calm", "plain look".
- A dotted background, in any colour: "I don't like it".
- A 64px and a 68px bar ("too big" / "reduce the padding"); 56px stayed.
- A progress line and a whole-page slide on navigation: "I don't want to
  feel like a page reload".
