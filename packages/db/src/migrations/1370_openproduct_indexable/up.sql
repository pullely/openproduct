-- 1370_openproduct_indexable (openproduct-commons TS1)
--
-- WHETHER A PUBLISHED LISTING MAY BE AMPLIFIED, AS A STORED FACT.
--
-- Context: openproduct
--
-- TS1 replaces OD's per-publish admin review with a ladder (TS-2). Reviewing
-- every publish is a fine lever at fifteen listings and an outage at the
-- design's 1,284, so the human cost moves to where the risk actually is: a
-- maker's FIRST listing is cautious, and every subsequent one is immediate.
--
-- "Cautious" here means UNINDEXED, not blocked. The maker builds their page,
-- shares the link, and is read by anyone they send it to; search engines
-- simply do not amplify it until a human has looked or the maker has earned
-- their way up the ladder. Blocking would punish the honest first-timer, who
-- is the overwhelming majority, to inconvenience the spammer, who will make
-- another account anyway.
--
-- WHY THIS IS A COLUMN AND NOT A JOIN. The obvious alternative is to resolve
-- indexability at read time from the creator's current trust level. Two
-- reasons not to:
--
--   1. The public read resolves NO ACTOR and touches no per-subject table
--      (OPC-1). Joining trust_levels onto the catalog document would put a
--      private, person-scoped table on the one path that must never have one.
--
--   2. It would be RETROACTIVE. A maker demoted next year would silently
--      de-index a listing that was cleared last year, and a maker promoted
--      would silently amplify pages nobody ever looked at. Indexability is a
--      decision made at publish time about a specific listing; storing it is
--      what makes it a decision rather than a side effect.
--
-- DEFAULT TRUE, deliberately. Every listing that exists when this runs was
-- published under OD's rules, which required a human review — so they are all
-- already cleared, and defaulting them to FALSE would de-index the entire
-- live catalog to express a rule about newcomers.
--
-- Additive and idempotent: no existing row's visibility changes.

ALTER TABLE openproduct.profiles
  ADD COLUMN IF NOT EXISTS indexable BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN openproduct.profiles.indexable IS
  'TS1 — may crawlers amplify this listing. Decided at publish from the maker''s trust level, and raised when a human reviews. Never recomputed at read time: that would make it retroactive.';

-- ─── TS1: the review gate becomes a LADDER ───────────────────────────────
--
-- `1160` wrote the rule as `visibility = 'private' OR reviewed_at IS NOT NULL`
-- — every published listing had been looked at by a person. That was the
-- right rule for a catalog of fifteen and is an outage at the design's 1,284.
--
-- THE CONSTRAINT IS REPLACED, NOT DROPPED, and what replaces it is the rule
-- that is actually true now: a published listing must have been looked at by
-- a person OR must not be amplified. `indexable` carries the second half, and
-- the two together say the same thing 1160 was reaching for — nothing goes
-- out with our amplification behind it that nobody has read.
--
-- So the schema still refuses the dangerous state. A row that is public AND
-- indexable AND unreviewed cannot exist, whatever a handler believes: that
-- combination is precisely "we told search engines to promote a page nobody
-- looked at", which is the outcome the original CHECK existed to prevent and
-- the only one it actually needed to.
--
-- Dropping the constraint outright would have been easier and would have left
-- the guarantee living only in application code, which is where guarantees go
-- to be forgotten.

ALTER TABLE openproduct.profiles
  DROP CONSTRAINT IF EXISTS profiles_public_requires_review;

ALTER TABLE openproduct.profiles
  DROP CONSTRAINT IF EXISTS profiles_indexable_requires_review;

ALTER TABLE openproduct.profiles
  ADD CONSTRAINT profiles_indexable_requires_review
    CHECK (visibility = 'private' OR indexable = FALSE OR reviewed_at IS NOT NULL);
