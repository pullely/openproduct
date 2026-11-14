# Epic: openproduct-redesign (OPR)

**openproduct.live has thirty products and looks empty. It shows counters
that read zero and hides what every product has actually done: the shipped
milestones and the stage link sit as prose inside each listing. This epic
turns the site into the place where products speak for themselves. A product
is an idea or it is shipping. It posts from five templates and nothing else
(feature shipped, new version, demo, new idea, help wanted), so a feed of
thirty products is never empty and never a social wall. Its page is also its
dashboard: the people on its crew edit it, post for it and answer its threads
in place. The whole site takes one look, designed on a canvas of 29 boards
(desktop and phone) that is copied into this directory as the reference.**

Today the site is a directory of builds with a forum, a studio for makers
and a dozen side sections. When this epic ships there are five places
(Feed, Products, Help wanted, a product's page, your profile), one header,
one type scale and one set of colours, and every page has a phone layout.
Nothing a visitor can reach today stops working: old addresses redirect or
stay, restyled.

The epic, its milestones and its tasks live in Orunbase, in workspace
`openproduct-live` (`ws_VTNEQKAP`). This directory is their design, and
`tasks/` holds their contracts.

## Status

| Field | Value |
|-------|-------|
| Status | In progress: OPR0 and OPR1 shipped; OPR2 (products post for themselves) is next |
| Cluster | **OPR** (OPR0–OPR4) |
| Owner(s) | `web` (every surface) · `packages/contracts` (wire types) · `packages/db` (schema and repository) · `core` (rules) · `gateway` (routes) · `tests/web`, `tests/web-perf` (the guards that pin the surface) |
| Builds on | openproduct-standalone (OPN): the standalone repository, its Supabase data plane and its deploy path. This epic changes no infrastructure. |
| Changes | Every page's look and layout; the navigation; four new stored things (a product's stage and milestones, template posts and their reactions, thread visibility, demos). The seam to the platform, sign-in and the deploy path do not change. |
| Design reference | `boards/` (29 boards, `canvas.json` lists them) · the live canvas: https://claude.ai/artifact/BKRSESCJv3tyqnqrkw6BrJ |
| Decisions locked | The owner's, from the design review of 2026-11-14 (design §2). |
| Gate | OPR4 (demos) waits on one answer about how Orunbase records a demo (risks R1). OPR1–OPR3 wait on nothing. |
| Shipped as | |

## Read order

1. `design.md`: the rules the owner set, the look as tokens, the page map from today's routes to the new ones, the data model, the privacy rule for private threads, and the alternatives rejected.
2. `implementation-plan.md`: OPR0–OPR4 and what "done" means for each.
3. `risks-and-open-questions.md`: what could go wrong and the default for each open call.
4. `IMPLEMENTATION-STATUS.md`: as built.
5. `boards/`: the design itself. Each `*.dc.html` file is one board; open the live canvas to see them rendered.

## Milestones at a glance

| | Milestone | What you can see when it is done | Task |
|---|---|---|---|
| OPR0 | The spec | This doc set on `main` | OPR-1 |
| OPR1 | The new look | Every page that exists today in the new design, on phone and desktop, on today's data | OPR-2 |
| OPR2 | Products post for themselves | A feed of template posts, idea and shipping product pages, and a product page its crew manages in place | OPR-3 |
| OPR3 | Threads, public and private | Talk on every product: public threads for everyone, private ones for the author and the crew | OPR-4 |
| OPR4 | Demos | A product posts a recorded run of its real app, reviewed by its maker first | OPR-5 |
