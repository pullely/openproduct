-- 2285 (openproduct-stages-crew SC-2)
--
-- FOUR STAGES, AND WHERE IT RUNS.
--
-- Context: openproduct
--
-- Design §1. A product's stage stops following its milestones and is set by
-- its crew, by hand, one step at a time:
--
--   idea        a problem worth building for
--   building    code and a first milestone
--   stage       people can try it (shown as ON STAGE)
--   production  real people use it (shown as IN PRODUCTION)
--
-- OPR-3's rule — `shipping` while any milestone is shipped — is retired with
-- the repository's `syncStage`. Milestone writes no longer touch this column.
--
-- ─── THE BACKFILL ─────────────────────────────────────────────────────────
--
-- `shipping` becomes `stage` when the product has a try link (people can
-- already try it), else `building` (it shipped a milestone, so there is code,
-- but nowhere to try it). `idea` stays `idea`. The try link IS the stage
-- link: `try_url` keeps its name and its "Try it" button, and is now the
-- address on the STAGE row of Where it runs.
--
-- The old check is dropped BEFORE the backfill and the wider one added
-- after it, so no moment holds a row the constraint refuses. A second run
-- finds no `shipping` row and changes nothing.
--
-- ─── WHAT EACH STEP WROTE ─────────────────────────────────────────────────
--
--   stage_note          what people can try, ≤280 — written by → stage
--   production_url      the production link — written by → production
--   production_since    the day it went live (a DATE, never in the future;
--                       the contract checks "not in the future" against the
--                       request's clock, so the column only bounds the shape)
--   production_version  the version people use, ≤40, optional
--   production_access   who can use it: everyone · waitlist · invite
--   stage_changed_at    when the stage last moved
--   stage_changed_by    who moved it: a subject id, never a name. The page
--                       names them only through the public roster, so a
--                       person who has not agreed to be shown is not
--
-- The step's inputs stay when a product moves back a step: they are the
-- crew's own words, and moving forward again starts from them. Every column
-- is nullable — a row that never took the step holds nothing — and the
-- bounds are checks, so a hand-run UPDATE cannot store what the contract
-- would refuse.
--
-- No stage history (owner, 2026-11-15: "no need for stage history"); the
-- audit log has every change.
--
-- Additive, idempotent.

ALTER TABLE openproduct.profiles
  DROP CONSTRAINT IF EXISTS profiles_stage_check;

UPDATE openproduct.profiles
   SET stage = CASE WHEN try_url IS NOT NULL THEN 'stage' ELSE 'building' END
 WHERE stage = 'shipping';

ALTER TABLE openproduct.profiles
  ADD CONSTRAINT profiles_stage_check
  CHECK (stage IN ('idea', 'building', 'stage', 'production'));

ALTER TABLE openproduct.profiles
  ADD COLUMN IF NOT EXISTS stage_note TEXT;

ALTER TABLE openproduct.profiles
  ADD COLUMN IF NOT EXISTS production_url TEXT;

ALTER TABLE openproduct.profiles
  ADD COLUMN IF NOT EXISTS production_since DATE;

ALTER TABLE openproduct.profiles
  ADD COLUMN IF NOT EXISTS production_version TEXT;

ALTER TABLE openproduct.profiles
  ADD COLUMN IF NOT EXISTS production_access TEXT;

ALTER TABLE openproduct.profiles
  ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ;

ALTER TABLE openproduct.profiles
  ADD COLUMN IF NOT EXISTS stage_changed_by TEXT;

ALTER TABLE openproduct.profiles
  DROP CONSTRAINT IF EXISTS profiles_stage_note_length_check;

ALTER TABLE openproduct.profiles
  ADD CONSTRAINT profiles_stage_note_length_check
  CHECK (stage_note IS NULL OR char_length(stage_note) BETWEEN 1 AND 280);

ALTER TABLE openproduct.profiles
  DROP CONSTRAINT IF EXISTS profiles_production_version_length_check;

ALTER TABLE openproduct.profiles
  ADD CONSTRAINT profiles_production_version_length_check
  CHECK (production_version IS NULL OR char_length(production_version) BETWEEN 1 AND 40);

ALTER TABLE openproduct.profiles
  DROP CONSTRAINT IF EXISTS profiles_production_access_check;

ALTER TABLE openproduct.profiles
  ADD CONSTRAINT profiles_production_access_check
  CHECK (production_access IS NULL OR production_access IN ('everyone', 'waitlist', 'invite'));

COMMENT ON COLUMN openproduct.profiles.stage IS
  'SC-2 (openproduct-stages-crew) — idea, building, stage or production. Set by the crew one step at a time through PUT …/stage; milestones no longer change it (OPR-3''s shipping rule is retired). shipping was backfilled to stage with a try_url, else building.';

COMMENT ON COLUMN openproduct.profiles.try_url IS
  'OPR-3 (openproduct-redesign), SC-2 — the stage link: the address people try the product at, shown as "Try it" and on the STAGE row of Where it runs. Authored by the crew, never checked.';

COMMENT ON COLUMN openproduct.profiles.stage_note IS
  'SC-2 (openproduct-stages-crew) — what people can try on stage, ≤280. Written by the move to stage.';

COMMENT ON COLUMN openproduct.profiles.production_url IS
  'SC-2 (openproduct-stages-crew) — the production link, shown as "Open it" and on the PRODUCTION row of Where it runs. Written by the move to production.';

COMMENT ON COLUMN openproduct.profiles.production_since IS
  'SC-2 (openproduct-stages-crew) — the day the product went live in production; never in the future (checked by the contract).';

COMMENT ON COLUMN openproduct.profiles.production_version IS
  'SC-2 (openproduct-stages-crew) — the version in production, ≤40, optional.';

COMMENT ON COLUMN openproduct.profiles.production_access IS
  'SC-2 (openproduct-stages-crew) — who can use the product in production: everyone, waitlist or invite.';

COMMENT ON COLUMN openproduct.profiles.stage_changed_at IS
  'SC-2 (openproduct-stages-crew) — when the stage last moved. NULL for a row that has not moved since the four stages.';

COMMENT ON COLUMN openproduct.profiles.stage_changed_by IS
  'SC-2 (openproduct-stages-crew) — the subject id of who last moved the stage. Named on the page only through the public roster.';
