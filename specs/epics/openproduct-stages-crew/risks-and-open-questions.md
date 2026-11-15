# openproduct-stages-crew — risks and open questions

- **R1 — the platform half is in another repo.** SC3 shows nothing until the
  orun-cloud task (membership-worker emits S13, state-worker signals deploys)
  is deployed. SC1 and SC2 do not depend on it.
- **R2 — deploy addresses.** Orunbase environments carry no address. The
  deploy's `url` comes from the component's catalog link for that
  environment when there is one, else null (the crew types it).
- **R3 — rosters of hundreds.** A full snapshot per change is simple and
  self-healing; at the sizes in play (≤ a few hundred) it is small. Revisit
  if a roster passes 2,000.
- **R4 — removal is real.** Losing Orunbase access removes the person from
  the crew and closes private threads to them; an Orunbase mistake shows up
  here at once. That is the intent (design §3.1), and it answers the open
  call from openproduct-redesign that no one could be removed.
- **R5 — no Sync now.** Owner drew one; it is left out on purpose (design
  §3.5). If the daily sweep proves too slow, a signed resync request is the
  next edge to add.
