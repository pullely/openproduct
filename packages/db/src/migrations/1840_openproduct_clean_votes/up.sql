-- 1840_openproduct_clean_votes (openproduct-worldclass PV3)
--
-- THE CLEAN-VOTE MARK, AS A BOOLEAN AND NOTHING ELSE.
--
-- Context: openproduct
--
-- EN3's integrity model already runs, already discounts, and already publishes
-- what it set aside IN AGGREGATE at `/transparency`. What a reader of one
-- listing could never see is whether the number in front of them was one of
-- the ones that needed defending. This column is that, and it is deliberately
-- the narrowest thing that answers it.
--
-- ─── WHY A COLUMN AND NOT A COUNT ────────────────────────────────────────
--
-- The obvious shape is `discounted_endorsements INTEGER`, and it is refused.
-- EN3's fifth decision is that NOTHING PER-PERSON IS EVER EXPOSED, and PV3's
-- own done-when is that nothing reveals a per-listing suppression count. A
-- number in a column is a number that eventually reaches a projection: the
-- public shapes here are pinned key sets, so it would fail a test on the way
-- out — but the right defence is not to have the number where a projection
-- could read it at all.
--
-- So the RATIO is computed where the rows are (`countEndorsements`, which is
-- the only place `endorsement_integrity` is joined for this purpose), and what
-- lands here is the answer.
--
-- ─── WHY STORED RATHER THAN COMPUTED AT READ ─────────────────────────────
--
-- Exactly `indexable`'s shape (1370): a decision made where the inputs are,
-- written down, and read for free. The listing page is the hottest read this
-- product has and the one OPP measured at 1,162 ms of database path; adding a
-- second aggregate over `endorsements` to it would spend the milliseconds
-- that epic is trying to recover. `publishEndorsementCounts` already runs on
-- every endorsement and on every sweep, already has both numbers in hand, and
-- writes this in the same breath as the totals.
--
-- UNLIKE `indexable`, IT IS MEANT TO CHANGE. `indexable` is decided once at
-- publish and never revisited, because a maker's later standing must not
-- rewrite what a published page was allowed to be. This one tracks a number
-- that moves, so it is recomputed whenever the total is — and if the sweep
-- stops, it goes stale in the safe direction: a listing that stops qualifying
-- keeps a mark it no longer earns for at most one sweep interval, and a
-- listing that starts qualifying waits the same. Neither is an accusation.
--
-- ─── FALSE IS THE DEFAULT, AND FALSE IS AMBIGUOUS ────────────────────────
--
-- Not nullable, and that is the design rather than a convenience. `false`
-- here covers BOTH "too few upvotes to check" — which is most listings, most
-- of the time — and "checked and did not clear the bar", and nothing in this
-- schema or above it can tell the two apart. That ambiguity is what stops an
-- absent mark being an accusation a machine made in public about somebody's
-- product, with no route to answer it. A third state would destroy it.
--
-- The thresholds live in `clean-vote.ts` (ten counted upvotes, at most 5%
-- discounted) rather than here, for the reason SN0 gives about freshness
-- windows: changing one should be a review, not a database change.
--
-- Additive, idempotent.

ALTER TABLE openproduct.profiles
  ADD COLUMN IF NOT EXISTS clean_votes BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN openproduct.profiles.clean_votes IS
  'PV3 (openproduct-worldclass) — the clean-vote mark: this listing has at '
  'least ten counted upvotes and no more than 5% of everything cast was '
  'discounted by EN3. A BOOLEAN AND NEVER A COUNT — the ratio is computed in '
  'countEndorsements, where endorsement_integrity is joined, so the '
  'suppression count has nowhere to travel (EN3 decision 5; PV3 done-when). '
  'Stored rather than computed at read for indexable''s reason, but unlike '
  'indexable it is meant to change: publishEndorsementCounts rewrites it '
  'whenever it rewrites the totals. FALSE IS AMBIGUOUS ON PURPOSE and covers '
  'both "too few upvotes to check" (most listings) and "checked and did not '
  'clear" — nothing distinguishes them, which is what stops an absent mark '
  'being an accusation. Thresholds live in clean-vote.ts, not here.';
