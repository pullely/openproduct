# openproduct-stages-crew — design

Made by the owner on the Claude Design canvas, 2026-11-15 (versions 90 to
99). The boards of record are in `boards/`: `Product.dc.html` (the product
page with Where it runs, the Orunbase card and the Stage row inside Edit
details), `Stage.dc.html` and `PhoneStage.dc.html` (the Change stage popup),
`Crew.dc.html` and `PhoneCrew.dc.html` (the crew tab and the Edit crew
popup).

Three gaps the owner found on openproduct.live started it: nobody can move an
idea to its next stage, a product cannot say it is in production or where it
runs, and the crew does not follow who has access to the project on Orunbase.

## 1. Stages (SC1)

1. **Four stages**: `idea` → `building` → `stage` → `production`, shown as
   IDEA, BUILDING, ON STAGE, IN PRODUCTION. Colours: lavender, amber, slate,
   green (the colour rule: no red unless it is danger).
2. **Set by hand, one step at a time.** Forward or back by exactly one
   stage. Milestones no longer change the stage (the OPR-3 `syncStage` rule
   is retired). A skipped step is refused.
3. **Each step asks for its own inputs.** The server enforces them; the form
   marks required fields with * and the Move button stays locked, with
   "n of m required" beside it, until they are filled:

   | Step | Required | Optional |
   |---|---|---|
   | → Building | repository (https), first milestone (≤60) | comment |
   | → On stage | stage link (https), what people can try (≤280) | comment |
   | → In production | production link (https), live since (a date, not in the future), who can use it (everyone · waitlist · invite) | version (≤40), comment |
   | ← back one step | reason (paused · rebuilding · moved elsewhere) | comment |

   The comment (≤280) rides along with the post when "Post it to the feed"
   is on (the default).
4. **Change stage lives inside Edit details**: a Stage row (current badge,
   "Next: …", Change stage) opens the popup. There is no stage button on the
   page itself, and no stage history (owner: "no need for stage history").
5. **Where it runs**, under the product's header, for everyone: a STAGE row
   and a PRODUCTION row, each with its address, version, and who set it and
   when ("deployed by Orun" or the person's name); production reads "Not in
   production yet" until it is.
6. Who may change the stage: Maintainers and Leads (§2).
7. Migration: `shipping` becomes `stage` when the product has a try link,
   else `building`. The try link becomes the stage link.

## 2. Crew roles (SC2)

1. **One role per person, no permission switches** (owner: "keep it
   simple"): **Lead** — everything, and decides who does what. **Maintainer**
   — edits the product, changes its stage, posts, handles seats. **Member** —
   on the crew, reads private threads.
2. Today's `owner` becomes Lead and `maintainer` stays Maintainer.
3. Every write checks the role: details, stage, posts, milestones, seats and
   publishing need Maintainer or Lead; changing roles needs Lead; reading
   private threads needs any role.
4. An approved seat request adds the person as a Member (today it adds
   nobody).
5. **The crew tab is a summary**: avatar stack, "N on the crew", the counts
   per role, the leads, and for Leads an **Edit crew** button. The popup:
   search, All / Leads / Maintainers / Members with counts, 30 people at a
   time with Show more, one role picker per row, Save n changes. Built for
   hundreds of people; the page never lists everyone.
6. People show on the public page only after they agree (the existing
   consent roster); a role works from the moment it is given.

## 3. Synced from Orunbase (SC3)

1. **The crew is everyone with access to the linked Orunbase project.**
   Access on Orunbase joins the crew; losing it leaves the crew, and
   private threads close to them.
2. Starting role from the Orunbase access: admin → Lead (locked: changed only
   on Orunbase), builder → Maintainer, viewer → Member. Leads may then move
   people between Maintainer and Member. openproduct never gives anyone
   Orunbase access.
3. **Deploys**: the last successful stage and production deploy fill Where
   it runs and pre-fill the stage form (stage link, production link, live
   since, version) with a green "Synced from Orunbase · deploy [run]". A
   crew edit wins (amber "Changed by you"), and **Use synced** goes back to
   the synced value. Where it runs then says "Deployed by Orun" or "Link set
   by <person>".
4. **The Orunbase card** sits at the top of the product page's right rail,
   for the crew only: in sync and when, crew count, last stage deploy,
   production deploy, Manage on Orunbase.
5. **No Sync now button** (departure from the board, my call): the platform
   pushes on every change and once a day, so there is nothing to pull, and a
   pull would need openproduct to call the platform with a credential, which
   the seam forbids (`19-openproduct-seam.md` property 1).

### 3.1 The seam edge S13 (both repos build to this)

Same transport as S6: a signed webhook from membership-worker to
`{LISTING_SEAM_URL}/seam/v1/project-events`, the canonical
`X-Webhook-{Signature,Timestamp,ID}` scheme with `LISTING_SEAM_SECRET`, the
`{seam, eventId, occurredAt, type, data}` envelope. Exact keys, pinned by
fixtures on both sides (`seam-fixtures/project.roster.json`,
`seam-fixtures/project.deploy.json`).

```jsonc
// type: "project.roster" — a full snapshot, never a delta
{ "orgId": "<uuid>", "projectId": "<uuid>",
  "members": [ { "subjectId": "usr_…", "displayName": "…" | null,
                 "access": "admin" | "builder" | "viewer" } ],
  "issuedAt": "<RFC3339>" }

// type: "project.deploy" — one environment's last successful deploy
{ "orgId": "<uuid>", "projectId": "<uuid>",
  "environment": "stage" | "production",
  "url": "https://…" | null, "version": "…" | null,
  "runRef": "<run public id>", "deployedAt": "<RFC3339>" }
```

- **Which projects**: those with a listed door (the S5 door minted with the
  link grant). Nothing is sent for any other project.
- **Members**: user subjects with effective access to that project, each at
  their highest grant, from direct roles, team roles and account cascade:
  `admin` = org owner/admin, account owner/admin or `project_admin`;
  `builder` = org builder or `project_builder`; `viewer` = org viewer or
  `project_viewer` (an approved listed door). A billing-only role is not
  access.
- **When**: roster on every change that can alter that set (member added,
  removed or re-roled; a team role granted or revoked; team membership
  changed; a join request approved), on link-grant mint, and in a daily
  sweep; deploy when a run finishes successfully in an environment named
  `stage`/`staging` (→ stage) or `prod`/`production` (→ production).
- **Receiver**: the gateway verifies, core applies. Roster: idempotent by
  `eventId`, a roster older than the last applied one is ignored, adds the
  missing, re-locks admins as Lead, removes the absent. Deploy: upsert per
  environment, newer `deployedAt` wins.
- **Failure**: fail-soft and at-least-once, like S6: a missed delivery leaves
  openproduct stale but honest until the next change or the daily sweep.

## Rejected on the way (owner, 2026-11-15)

- A per-person permission matrix (six switches per person): "too much".
- Listing every crew member on the page: "there could be 100s".
- Sync status inside the crew: it belongs on the main page, one sync for
  crew and deploys.
- A separate Change stage button and a stage history.
