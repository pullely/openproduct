# openproduct-left-rail — risks and open questions

- **R1 — kinds without colour.** Ideas, versions and seats were told apart
  by hue. They are now told by label and icon only (design §1.5). If people
  stop telling them apart, the next step is a distinct icon per kind, not a
  colour.
- **R2 — selection without colour.** Followed, saved and the current tab
  rely on weight, fill and border. Each must still clear 3:1 against its
  unselected state; the axe gate and `dark-ramp.test.ts` hold the text
  pairs, not this.
- **R3 — the JS budgets.** A rail on every page is in every page's bundle.
  The rail's list is data and its markup is server-rendered; only the
  drawer's open state and the folding sections are client code.
- **R4 — the tests pin the old design.** Many web tests assert the old
  ramp, faces, the three sections and the frosted bar. Each is updated to
  the new rule in the PR that changes it and named in the status file.
- **R5 — neutral values are from memory.** The greys in design §1 are
  GitHub's Primer neutrals as recalled on 2026-11-23, not looked up. They
  are the design of record here regardless of whether Primer has moved.
- **R6 — each merge deploys.** Merging to `main` deploys stage, then prod,
  so the site changes one milestone at a time and is briefly a mix: graphite
  with the old bar after LR1, for example.
- **R7 — snapshots follow the runner's fonts.** The system typeface means
  heading widths depend on the fonts installed where the page is measured.
  The web-perf snapshot lane compares exact pixels, so its baselines are
  CI's own measurements and a new runner image may need them re-recorded.
