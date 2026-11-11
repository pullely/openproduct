-- 1670_openproduct_follows (openproduct-launch FL0)
--
-- FOLLOWING A TOPIC AND FOLLOWING A PERSON, IN ONE TABLE.
--
-- Context: openproduct
--
-- ─── WHY ONE TABLE AND NOT TWO ───────────────────────────────────────────
--
-- EN0 argued the opposite way about saves and endorsements, and was right to:
-- they are two ACTS with different meanings, one private and one public, and
-- merging them would have retroactively published a private gesture.
--
-- A topic follow and a person follow are ONE act with two targets. Both mean
-- "put this in my notifications"; both are private in exactly the same way;
-- both are counted in exactly the same way; both are withdrawn by the same
-- control. Two tables here would be two write paths, two overlay reads, two
-- velocity rules and two count queries for one idea — and the day they drift
-- is the day a person can unfollow a topic but not a maker.
--
-- ─── UNFOLLOWING DELETES, AND ENDORSING DOES NOT. THAT IS DELIBERATE ─────
--
-- `endorsements` is append-only with `withdrawn_at`, because EN3's integrity
-- sweep must be able to RESTATE a public total without erasing what it
-- restated. A follow has no restatement: nothing discounts it, no public
-- number is ever recomputed from its history, and no appeal ever asks what it
-- used to be.
--
-- What a tombstone WOULD be here is a durable private record that this person
-- once followed that person — kept by us, asked for by nobody, and exactly
-- the kind of row that leaks through a join somebody writes in a hurry. CG3's
-- `declineRosterEdge` deletes for the same reason and says so: "I was never
-- part of this" should leave no record that they were asked.
--
-- So: unfollow DELETES. Re-following is a new row, and nothing anywhere needs
-- to know it is the second one.
--
-- ─── NO FOLLOWER LISTS, EVER, AND THE SCHEMA DOES NOT HELP YOU BUILD ONE ──
--
-- A follow is visible to the follower, and to the followed only as a COUNT.
-- There is no read anywhere that answers "who follows this person", and the
-- index below is deliberately the pair a COUNT needs rather than a covering
-- index over subjects — a table optimised for listing followers is a table
-- somebody eventually lists followers from.
--
-- That is not squeamishness. A public follower list turns a private
-- subscription into a social graph anyone can crawl, and the people most
-- harmed by that are the ones with the least say in it. openproduct does not
-- need one to work.
--
-- ─── NO COUNTER COLUMN ──────────────────────────────────────────────────
--
-- EN0's rule, unchanged: the count is computed from the rows. A follower
-- count is one indexed `count(*)` against one target, unlike the board's walk
-- of a day of endorsements, so it can be honest on the request path. A
-- counter column drifts the first time a write path forgets it, and here it
-- would drift silently because nothing recomputes it.
--
-- DORMANT ON ARRIVAL is NOT true of this one: FL0 routes it in the same
-- change. The table and the act ship together because a follow with no
-- surface is a table nobody can check.
--
-- Additive and idempotent: no existing table, index, or constraint is touched.

CREATE TABLE IF NOT EXISTS openproduct.follows (
  -- Opaque, never a foreign key to anything outside this schema. A person is
  -- resolved at request time and never persisted here beyond their id (I3).
  subject_id  TEXT        NOT NULL,

  -- WHAT is being followed. Two values today; the CHECK is a closed
  -- vocabulary rather than open text because a third kind is a product
  -- decision that should cost a migration and a conversation, not a typo in a
  -- handler.
  kind        TEXT        NOT NULL,

  -- WHICH one. A canonical CT1 category value for `topic`, an opaque subject
  -- id for `person`. Deliberately NOT a foreign key: the topic vocabulary
  -- lives in the contract rather than in a table, and a person is an id this
  -- schema does not own. Core validates both before writing — the same
  -- division `product_people.subject_id` already makes.
  target      TEXT        NOT NULL,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ONE ROW PER (SUBJECT, KIND, TARGET). Following twice is following once,
  -- and the primary key says so rather than a handler remembering to check.
  CONSTRAINT follows_pk PRIMARY KEY (subject_id, kind, target),
  CONSTRAINT follows_kind_check CHECK (kind IN ('topic', 'person')),
  CONSTRAINT follows_target_not_blank CHECK (length(btrim(target)) > 0),
  -- NOBODY FOLLOWS THEMSELVES. Not a paranoid case: the Follow button renders
  -- on a maker page, and a maker opening their own page finds it there. A
  -- self-follow inflates a number on your own page with your own click, which
  -- is the smallest possible version of the thing the integrity model exists
  -- to prevent — and it is cheaper to refuse in the schema than to remember
  -- in two handlers.
  CONSTRAINT follows_no_self CHECK (kind <> 'person' OR target <> subject_id)
);

-- THE COUNT QUERY, and the only shape this table is indexed for: how many
-- follow one target. Leading with `(kind, target)` rather than with the
-- subject is what makes a follower COUNT cheap and a follower LIST no cheaper
-- than a scan — the schema declining to help build the thing the comment
-- above refuses.
CREATE INDEX IF NOT EXISTS openproduct_follows_target
  ON openproduct.follows (kind, target);

-- "What am I following" — the XP2 overlay's question, bounded by the ids on
-- the page the visitor is looking at.
CREATE INDEX IF NOT EXISTS openproduct_follows_subject
  ON openproduct.follows (subject_id, kind);
