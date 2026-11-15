-- 2290 (openproduct-stages-crew SC-3)
--
-- CREW ROLES.
--
-- Context: openproduct
--
-- Design §2. Everybody on a product's crew holds exactly one role, and every
-- write checks it (core/src/authorize.ts holds the one decision table):
--
--   lead        everything, and decides who does what
--   maintainer  edits the product, changes its stage, posts, handles seats
--   member      on the crew, reads private threads
--
-- No permission switches per person (owner, 2026-11-15: "keep it simple").
--
-- ─── THE BACKFILL ─────────────────────────────────────────────────────────
--
-- OX4's `owner` becomes `lead`; `maintainer` stays `maintainer`. The old
-- check is dropped BEFORE the backfill and the three-role one added after
-- it, so no moment holds a row the constraint refuses. A second run finds no
-- `owner` row and changes nothing.
--
-- ─── HOW SOMEBODY CAME TO BE ON THE CREW: `source` ────────────────────────
--
--   creator   added on openproduct by the listing's own side: its creator
--             (createProfile), or a row put there by hand
--   seat      an approved request for one of its seats (SC-3, the seam's
--             join_request.decided)
--   orunbase  synced from the linked Orunbase project's access (SC-4)
--
-- Every row that exists before this migration is `creator`. Until now there
-- were exactly two ways onto a crew — creating the listing (1290's backfill
-- and createProfile, both `owner`) and an operator's hand-added row (the
-- `maintainer` rows) — and both are the listing's side: no seat ever added
-- anybody (the seam only cached a status) and nothing synced from Orunbase.
-- So `creator` reads "added on openproduct, not by a seat or the sync",
-- which is true of every one of them. The column's DEFAULT is the same value,
-- so a writer that predates it (a hand-run INSERT) still lands a true row.
--
-- ─── WHO MAY NOT BE CHANGED HERE: `locked` ────────────────────────────────
--
-- SC-4 sets it for the linked project's Orunbase admins: they are Leads,
-- and their role is changed only on Orunbase. Nothing sets it in SC-3; the
-- role-change route already refuses a locked row. Only a Lead can be locked
-- (a check), so a lock can never pin somebody below Lead.
--
-- Additive, idempotent.

ALTER TABLE openproduct.listing_maintainers
  DROP CONSTRAINT IF EXISTS listing_maintainers_role_check;

UPDATE openproduct.listing_maintainers
   SET role = 'lead'
 WHERE role = 'owner';

ALTER TABLE openproduct.listing_maintainers
  ADD CONSTRAINT listing_maintainers_role_check
  CHECK (role IN ('lead', 'maintainer', 'member'));

ALTER TABLE openproduct.listing_maintainers
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'creator';

ALTER TABLE openproduct.listing_maintainers
  DROP CONSTRAINT IF EXISTS listing_maintainers_source_check;

ALTER TABLE openproduct.listing_maintainers
  ADD CONSTRAINT listing_maintainers_source_check
  CHECK (source IN ('creator', 'seat', 'orunbase'));

ALTER TABLE openproduct.listing_maintainers
  ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE openproduct.listing_maintainers
  DROP CONSTRAINT IF EXISTS listing_maintainers_locked_lead_check;

ALTER TABLE openproduct.listing_maintainers
  ADD CONSTRAINT listing_maintainers_locked_lead_check
  CHECK (NOT locked OR role = 'lead');

COMMENT ON COLUMN openproduct.listing_maintainers.role IS
  'SC-3 (openproduct-stages-crew) — lead, maintainer or member; one per person. OX4''s owner was backfilled to lead. What each may do is core/src/authorize.ts''s decision table.';

COMMENT ON COLUMN openproduct.listing_maintainers.source IS
  'SC-3 (openproduct-stages-crew) — how they came onto the crew: creator (the listing''s own side: its creator, or a row added by hand), seat (an approved seat request) or orunbase (synced from the linked project, SC-4). Every row before 2290 is creator.';

COMMENT ON COLUMN openproduct.listing_maintainers.locked IS
  'SC-3 (openproduct-stages-crew) — the role is changed only on Orunbase (an Orunbase admin, set by SC-4''s sync). Only a lead can be locked; the role-change route refuses a locked row.';
