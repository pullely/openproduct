-- 1810 — the rest of what a public repository read can see (PV0).
--
-- Three more columns in the `repo_*` family, meaning exactly what the five
-- already there mean: observed by the gateway on the authenticated path and
-- written down, never typed by anybody.
--
-- WHAT IS NOT HERE IS `repo_tests`, and its absence is a decision this estate
-- recorded before PV0 existed. `provenance.ts` describes the `declared_repo`
-- source as "commits and last-touched only — we cannot see CI, so there is no
-- tests figure and the field is absent rather than empty". PV0 ships four
-- signals rather than the plan's five because the fifth would have to be
-- guessed, and a guess in an observed frame is the one thing that frame
-- cannot survive.
--
-- `repo_open_issues` IS GITHUB'S OWN COUNT, which includes open pull
-- requests. Stored as answered rather than adjusted: an adjustment would be a
-- number this product computed, and computing it would mean a second read per
-- listing to find out how many of them are pull requests. The formula says
-- what the number contains, which is what OPC-4 asks of it.

ALTER TABLE openproduct.profiles
  ADD COLUMN IF NOT EXISTS repo_language    TEXT,
  ADD COLUMN IF NOT EXISTS repo_pushed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS repo_open_issues INTEGER;

-- A count is a count. A negative one is a bug upstream, and storing it would
-- put it on a page.
ALTER TABLE openproduct.profiles
  DROP CONSTRAINT IF EXISTS profiles_repo_open_issues_check;
ALTER TABLE openproduct.profiles
  ADD CONSTRAINT profiles_repo_open_issues_check
    CHECK (repo_open_issues IS NULL OR repo_open_issues >= 0);
