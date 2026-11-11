-- 1380_openproduct_public_profiles (openproduct-commons CG1)
--
-- THE PUBLIC HALF OF A CONTRIBUTOR, AND THE TWO GATES IN FRONT OF IT.
--
-- Context: openproduct
--
-- `openproduct.contributors` has held a display name and a bio since OH0, and
-- both were private: the contributor's own home rendered them and nothing
-- else did. CG1 gives a contributor a page at `/@handle`, which makes those
-- same fields the most exposed text this estate publishes about a person.
--
-- TWO GATES, AND BOTH ARE NECESSARY (CG-2).
--
--   1. THEIR OWN ACT. `profile_public` defaults FALSE and no code path sets
--      it except the contributor's own opt-in. Nobody gets a public page by
--      signing in, by being added to a listing, or by being mentioned.
--
--   2. STANDING. A profile renders only for somebody who maintains a listing
--      that is itself public. That is the anti-spam property of the entire
--      people surface: a public profile directory open to anyone who can sign
--      in is a spam directory within a month, and one bounded by "you are on
--      a product somebody published" is self-limiting.
--
-- The second gate is NOT a column. It is a join, computed at read time
-- against `listing_maintainers`, because it is a fact about the world that
-- changes without anybody touching this row: unpublish your last listing and
-- your page stops rendering, republish and it returns. A denormalised
-- `has_standing` flag would be a cache of a join, and the bug it produces is
-- a page that outlives the standing it was granted for.
--
-- NOTHING HERE IS COPIED FROM identity.* (CG-4). Every column below is text
-- the contributor typed on this surface. A copied name goes stale against a
-- platform rename and carries platform authority onto a public page; an
-- authored one carries only its author's voice. A copied email would be a
-- leak outright (I3), and there is no column here that could hold one.
--
-- That is also why the page's footer says so out loud: "Profile authored on
-- openproduct. Nothing here is copied from an Orunbase account." The sentence
-- is only true because of this table's shape, and the shape is what a test
-- can check.
--
-- LINKS ARE TEXT, VALIDATED AT THE WRITE. No CHECK on the URL grammar: a URL
-- regex in a CHECK is a URL regex somebody has to migrate the day it is
-- wrong, and the write boundary already refuses anything that is not an https
-- URL on a host we are willing to render. What the schema DOES enforce is
-- length, because an unbounded text column on a public page is a denial of
-- service with extra steps.
--
-- Additive and idempotent: every column is nullable or defaulted, and no
-- existing contributor becomes visible.

ALTER TABLE openproduct.contributors
  -- Gate 1. FALSE until the contributor opts in, and nothing else sets it.
  ADD COLUMN IF NOT EXISTS profile_public   BOOLEAN     NOT NULL DEFAULT FALSE,
  -- The design's pill. A statement about availability, authored, and false by
  -- default — nobody is advertised as looking for work without saying so.
  ADD COLUMN IF NOT EXISTS open_to_project  BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Two authored links, both optional. Named for what they ARE rather than
  -- `link_1`/`link_2`, because the page renders them differently and a
  -- positional column set is one somebody eventually renders in the wrong
  -- order.
  ADD COLUMN IF NOT EXISTS github_url       TEXT,
  ADD COLUMN IF NOT EXISTS site_url         TEXT,
  -- When they opted in. Distinct from `created_at`, which is when they first
  -- authored anything at all: the page says "on openproduct since …" and the
  -- honest answer is the earlier of the two, but an appeal or a moderation
  -- act needs to know when the PUBLIC surface began.
  ADD COLUMN IF NOT EXISTS published_at     TIMESTAMPTZ;

ALTER TABLE openproduct.contributors
  DROP CONSTRAINT IF EXISTS contributors_bounded_text;

ALTER TABLE openproduct.contributors
  ADD CONSTRAINT contributors_bounded_text CHECK (
    (display_name IS NULL OR length(display_name) <= 120) AND
    (bio          IS NULL OR length(bio)          <= 2000) AND
    (github_url   IS NULL OR length(github_url)   <= 300) AND
    (site_url     IS NULL OR length(site_url)     <= 300)
  );

ALTER TABLE openproduct.contributors
  DROP CONSTRAINT IF EXISTS contributors_published_coherent;

-- A public profile has a moment it became public. Not decoration: a
-- transparency record (TS5) and an appeal both need to say when, and a row
-- that is public with no such moment cannot answer either.
ALTER TABLE openproduct.contributors
  ADD CONSTRAINT contributors_published_coherent
    CHECK (profile_public = FALSE OR published_at IS NOT NULL);

-- The people directory (CG2) reads this. Partial, because the overwhelming
-- majority of rows are private and indexing them would be indexing the
-- absence of a decision.
CREATE INDEX IF NOT EXISTS openproduct_contributors_public
  ON openproduct.contributors (published_at DESC)
  WHERE profile_public;

COMMENT ON COLUMN openproduct.contributors.profile_public IS
  'CG1 — the contributor''s own opt-in. Never set by anything but their act. Standing (being on a public listing) is the SECOND gate and is a read-time join, not a column.';
