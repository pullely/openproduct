-- 1780 — what the repository says about itself (openproduct-worldclass IN2).
--
-- THREE MORE OBSERVED COLUMNS, in the `repo_*` family beside the two that
-- were already here. The meaning is exactly `repo_visibility`'s and
-- `repo_licence`'s: a fact the gateway read from GitHub on the authenticated
-- path and wrote down, never something a maintainer typed. OPC-2's whole
-- distinction lives in that separation, and it is why these are their own
-- columns rather than prefilled INTO `slug`, `tagline` and `stack`:
--
--   Prefilling the authored columns would destroy the difference the moment
--   it was written. There would be no way to say "this description came from
--   the repository" a second after the import, no way to show a maintainer
--   what the repo says versus what they wrote, and no way back if they
--   preferred the original. The observation is kept; the authored value wins
--   when there is one; the form says which is in play.
--
-- `repo_topics` IS JSONB, NOT TEXT[], for the same reason `stack` is: the
-- workers' postgres client runs `fetch_types:false`, so JSONB is the array
-- encoding every read path here already parses.
--
-- All three are NULLABLE and additive. A listing that has never been checked
-- has NULL in all three, which is distinct from an empty description — the
-- difference between "not observed" and "observed to be empty" (OPC-C).

ALTER TABLE openproduct.profiles
  ADD COLUMN IF NOT EXISTS repo_name        TEXT,
  ADD COLUMN IF NOT EXISTS repo_description TEXT,
  ADD COLUMN IF NOT EXISTS repo_topics      JSONB;
