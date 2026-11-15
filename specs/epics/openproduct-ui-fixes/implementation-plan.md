# openproduct-ui-fixes — implementation plan

One task per milestone, one PR per task, in order. Each PR keeps the web
tests and every web-perf lane green; a changed snapshot or budget says why
in its decision file.

## UF1 — one layout on every page (UF-1)

- The page container token: `max-width: 1920px`, `24px` gutter, replacing
  the 1180px column and every narrower page cap.
- Rails: left `240px`, right `300px`; gaps per design §1.
- Activity and Search: their filter pills become a left-rail nav in the
  Products style.
- Feed, Products, Help wanted: no visible title row (h1 kept, visually
  hidden); columns start 8px under the bar; 16px gaps; feed card density.
- Layout snapshots re-recorded from CI's numbers; the doc set lands here.

## UF2 — frosted centred navbar (UF-2)

- `top-panel.tsx`: the three-column bar, plain-text sections, 56px.
- Geist: committed woff2 + OFL text, `next/font/local`, applied to the bar
  only; the font budget and wire budget move with a decision note.
- The frost band (a pseudo-element with blur, gradient and mask; a
  scroll-driven deepening with a static fallback).
- Background: remove the dot grid, keep the amber glow.
- Phone tab bar: line above the current icon.

## UF3 — calm tab switching and feed loading (UF-3)

- Remove the navigation progress bar.
- View transitions for section changes: the bar and background unnamed and
  still, the content named and crossfaded, the section underline named so
  it glides.
- Feed skeleton while posts load (the existing `skeleton.tsx` where it
  fits), staggered entry once.
- Reduced motion off switch; tests pin the absence of the progress bar.
