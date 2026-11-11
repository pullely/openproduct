-- 1440_openproduct_moderation_state: what the estate did to a listing, kept
-- apart from what its maintainer wants (openproduct-commons TS3).
--
-- Context: openproduct
-- Epic: openproduct-commons — TS3, the acting half of TS0's queue.
--
-- 1330 gave this schema `reports` (what people told us) and `moderation_acts`
-- (what we did). It gave the LEDGER but not the STATE: you could record that
-- a listing was removed and still serve it, because nothing on the listing
-- said so. This column is that missing half, and where it lives is the whole
-- design.
--
-- WHY NOT `visibility`. 1160 gave profiles a `visibility` of public|private,
-- and the cheap way to remove a listing is to set it private. Two things are
-- wrong with that, and both are fatal:
--
--   1. `visibility` IS THE MAINTAINER'S OWN SWITCH. They set it, from their
--      own studio, whenever they like. A removal written into it is a removal
--      the person it was applied to can undo — which is not a removal, it is
--      a suggestion. Moderation and authorship cannot share a column for the
--      same reason a lock and a door handle cannot share a mechanism.
--
--   2. A private listing 404s, and TS-3 exists to forbid exactly that.
--      Removed content renders as REMOVED; it does not vanish. On a linkable,
--      crawlable, permanent surface, silent deletion is indistinguishable
--      from a bug, and reads as censorship to the person it happened to. A
--      tombstone makes moderation legible and makes appeals possible.
--
-- So: two independent facts about one listing — "the maintainer means this to
-- be public" and "the estate has acted on it" — and the public read renders
-- their intersection. A delisted listing whose maintainer privates it and
-- publishes it again is still delisted, because nothing they can reach ever
-- touched this column.
--
-- THREE STATES, and the middle one is the point. `delisted` takes a listing
-- off the directory, search, the digest and the feeds while its own page
-- keeps rendering it in full; `removed` takes the content off the page too.
-- Delisting is not a weaker removal, it is a different claim — "this should
-- not be amplified here" rather than "this should not exist here" — and
-- collapsing them would force every act to be the maximal one, which is how
-- a moderation surface becomes feared.
--
-- Additive, idempotent. Every existing row lands `visible`, which is what
-- they all are: nothing has been acted on, because until this migration
-- nothing could be.

ALTER TABLE openproduct.profiles
  ADD COLUMN IF NOT EXISTS moderation_state TEXT NOT NULL DEFAULT 'visible';

-- When the act that produced the current state occurred. This is the date the
-- tombstone shows, and it is the ONLY thing besides the state that a
-- tombstone may carry: a reason is a judgement about a person, published at
-- their own address, before they have had any chance to answer it. TS5
-- publishes reasons in aggregate, which is where that asymmetry is bearable.
ALTER TABLE openproduct.profiles
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;

-- The ledger row that produced the current state, so a tombstone can always
-- be traced back to an appealable act. Opaque, no FK: moderation_acts is
-- append-only and outlives everything, and a foreign key here would let a
-- retention policy on one table quietly rewrite the other.
ALTER TABLE openproduct.profiles
  ADD COLUMN IF NOT EXISTS moderation_act_id UUID;

ALTER TABLE openproduct.profiles
  DROP CONSTRAINT IF EXISTS profiles_moderation_state_check;

ALTER TABLE openproduct.profiles
  ADD CONSTRAINT profiles_moderation_state_check
    CHECK (moderation_state IN ('visible', 'delisted', 'removed'));

-- The two halves cannot disagree. A state that is not `visible` happened at a
-- moment; `visible` is the absence of any act, so it carries no moment. A row
-- claiming to be removed with no date would render a tombstone with a blank
-- where the one appealable fact belongs.
ALTER TABLE openproduct.profiles
  DROP CONSTRAINT IF EXISTS profiles_moderated_at_consistent;

ALTER TABLE openproduct.profiles
  ADD CONSTRAINT profiles_moderated_at_consistent
    CHECK (
      (moderation_state = 'visible' AND moderated_at IS NULL)
      OR (moderation_state <> 'visible' AND moderated_at IS NOT NULL)
    );

-- Every public LIST read filters on this — the directory, search, the digest,
-- the sitemap, the feeds. A partial index on the visible rows keeps that
-- filter free, and is deliberately the same shape as 1320's public index: the
-- two are always used together, because "public" and "not acted on" is what
-- the word "listed" means from here on.
CREATE INDEX IF NOT EXISTS openproduct_profiles_visible_public_idx
  ON openproduct.profiles (published_at DESC NULLS LAST, slug ASC)
  WHERE visibility = 'public' AND moderation_state = 'visible';

COMMENT ON COLUMN openproduct.profiles.moderation_state IS
  'What the ESTATE did to this listing (openproduct-commons TS3/TS-3), deliberately NOT a value '
  'of visibility: visibility is the maintainer''s own switch, so a removal written there is one '
  'the subject can undo, and a private listing 404s where TS-3 requires a tombstone. delisted = '
  'off the directory, search, digest and feeds, page still renders in full; removed = the content '
  'comes off the page too. The address always resolves.';

COMMENT ON COLUMN openproduct.profiles.moderated_at IS
  'When the act producing the current state occurred — the date the tombstone shows, and the only '
  'thing besides the state it may carry. Never the reason and never the actor: those are '
  'judgements about a person, and TS5 publishes them in aggregate instead.';

COMMENT ON COLUMN openproduct.profiles.moderation_act_id IS
  'The append-only moderation_acts row that produced the current state, so every tombstone traces '
  'back to an appealable act. Opaque, no FK by design.';
