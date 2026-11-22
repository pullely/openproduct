# openproduct-left-rail — implementation plan

One task per milestone, one PR per task, in order. Each PR keeps the web
tests and every web-perf lane green; a changed assertion or budget says why
in the status file.

## LR1 — graphite and system type (LR-2)

- `globals.css`: the light ramp and both dark scopes take the graphite
  values (design §1); the kind families resolve to greys; the page glow and
  dot grid go.
- `layout.tsx`, `tailwind.config.mjs`: the system stacks replace the four
  webfonts; the font files and their `next/font` declarations are removed.
- `ui/design*.ts`: cards, panels and tiles gain the 1px border; titles
  move from the serif to sans 600; the mono label becomes the 12px/600
  label.
- `shell/logomark.tsx`, `icon.svg`: the ring-tile mark.
- Tests that assert the old ramp, faces or mark are updated to the new
  values, not loosened.

## LR2 — the left rail on every page, phone first (LR-3)

- `shell/shell.ts`: the rail's sections as data; the three-section rule is
  replaced by the rail's list.
- A rail component rendered by the root layout on every page; a drawer on
  a phone opened from a menu button in the bar; the bottom tab bar stays.
- The bar loses its centred sections; the page frames (`BOARD_PAGE`,
  `SECTION_PAGE`, `PAGE`) are rewritten phone first inside the new frame.
- The footer's links move into the rail's sections.

## LR3 — tiled posts with icon actions (LR-4)

- The feed row, the product page's post cards and the post page share one
  tile; icon-only actions with accessible names; the shaded Try it tile.
- Product rows and seat cards follow the same action pattern.

## LR4 — posting from the product page (LR-5)

- Create post is removed from the feed and the bar and shown on the
  product page's Updates tab to the product's crew; the composer loses its
  product picker.
