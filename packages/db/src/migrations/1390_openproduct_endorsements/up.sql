-- 1390_openproduct_endorsements (openproduct-commons EN0)
--
-- THE ▲, AND WHY IT IS A SECOND TABLE RATHER THAN A COLUMN ON THE FIRST.
--
-- Context: openproduct
--
-- `1250_openproduct_home` said this, in a comment, about `saved_products`:
--
--     "A bookmark, nothing more. No count is shown on the public page (a save
--      is a private act), so no denormalized counter exists to drift."
--
-- The reference design puts `▲ 214` on every card. The cheap way to get there
-- is to count `saved_products` and add a `public` flag. THAT IS THE ONE THING
-- THIS MIGRATION EXISTS TO REFUSE (EN-1, OPC-3).
--
-- Every one of those rows was created under a promise: nobody will ever see
-- this. Counting them now would retroactively publish a private gesture made
-- by people who cannot be asked and did not agree — which is the exact class
-- of accident the estate's boundary rules exist to make impossible. Two
-- tables cost one migration. The alternative costs the estate's word.
--
-- SO: `saved_products` IS NOT TOUCHED. Not widened, not counted, not
-- migrated, not read by anything here. A test pins its column list before and
-- after, because the pressure to "just add a flag" will return every time
-- somebody notices the two tables look similar.
--
-- APPEND-ONLY, WITH `withdrawn_at` (EN-3). Withdrawing does not delete the
-- row. That is not sentimentality about data: EN3's integrity sweep has to be
-- able to RESTATE a public total without erasing what it restated, and a
-- deleted row cannot be restated. It also makes "endorsed, withdrew,
-- endorsed again" one row with a history rather than three facts nobody can
-- reconcile.
--
-- ONE ROW PER (LISTING, SUBJECT), ENFORCED BY THE PRIMARY KEY. An anonymous
-- vote is an unbounded vote (EN-2), and a signed-in one that can be repeated
-- is the same thing with extra steps. Re-endorsing after withdrawing REUSES
-- the row — the key is the pair, and the timestamps carry the story.
--
-- INTEGRITY IS A SEPARATE TABLE, AND THAT SEPARATION IS THE POINT (EN-4).
-- `endorsements` holds the ACT; `endorsement_integrity` holds the machine's
-- OPINION of it. Keeping them apart means a person is never told, and never
-- implicitly accused, that their honest endorsement was judged fake. The
-- discount is disclosed in aggregate in the transparency report (TS5) and
-- never per person — "N endorsements discounted this week" keeps us honest
-- without accusing anyone in public.
--
-- NO COUNTER COLUMN ANYWHERE. The public total is a `metrics` row recomputed
-- from these rows (EN-3, SN0's store). A counter column cannot be restated
-- without erasing history, and it drifts the first time a write path forgets
-- it. A recomputed metric over an append-only log can be restated, and the
-- history stays auditable.
--
-- DORMANT ON ARRIVAL. Nothing is routed and nothing renders until EN1 brings
-- the act and EN2 the numbers.
--
-- Additive and idempotent: no existing table, index, or constraint is touched.

CREATE TABLE IF NOT EXISTS openproduct.endorsements (
  -- FK WITHIN the schema (the role_openings precedent): a deleted listing
  -- takes its endorsements, and the cascade stays inside the teardown unit.
  profile_id   UUID        NOT NULL
                 REFERENCES openproduct.profiles (id) ON DELETE CASCADE,
  -- Opaque, never a foreign key to anything outside this schema. A person is
  -- resolved at request time and never persisted here beyond their id (I3).
  subject_id   TEXT        NOT NULL,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set on withdrawal, cleared on re-endorsement. Never deleted.
  withdrawn_at TIMESTAMPTZ,

  --   confirmed  counts toward the public total
  --   pending    the act happened and is recorded, but does not count yet —
  --              TS1's trust floor. A subject below it may endorse; their
  --              endorsement simply waits. Recording it rather than refusing
  --              it means a newcomer's honest gesture is not thrown away, and
  --              it is there to count the moment they clear the floor.
  state        TEXT        NOT NULL DEFAULT 'confirmed',

  CONSTRAINT endorsements_pk PRIMARY KEY (profile_id, subject_id),
  CONSTRAINT endorsements_state_check CHECK (state IN ('confirmed', 'pending')),
  CONSTRAINT endorsements_withdrawn_after_created
    CHECK (withdrawn_at IS NULL OR withdrawn_at >= created_at)
);

-- The count query: live endorsements for one listing. Partial, because a
-- withdrawn row is history rather than a total, and indexing history to
-- compute a present number is paying for the wrong thing.
CREATE INDEX IF NOT EXISTS openproduct_endorsements_live
  ON openproduct.endorsements (profile_id)
  WHERE withdrawn_at IS NULL AND state = 'confirmed';

-- "What have I endorsed" — the XP2 overlay's question, bounded by the ids on
-- the page.
CREATE INDEX IF NOT EXISTS openproduct_endorsements_subject
  ON openproduct.endorsements (subject_id)
  WHERE withdrawn_at IS NULL;

-- ─── The machine's opinion, kept apart from the act (EN-4) ───────────────
--
-- A row here says "this endorsement is discounted from the public total, and
-- here is the reason we recorded". It says nothing to the person who made it,
-- and nothing about them appears in public: the transparency report (TS5)
-- publishes counts by reason, never subjects.
--
-- The reason vocabulary is OPEN text rather than a CHECK, deliberately. EN3
-- and TS4 will learn new patterns, and turning each into a migration would
-- either slow the response to a live ring or push the reasons into a column
-- nobody can read. What IS pinned is that the reason is required: a discount
-- nobody can account for is a discount nobody can appeal.
CREATE TABLE IF NOT EXISTS openproduct.endorsement_integrity (
  profile_id   UUID        NOT NULL,
  subject_id   TEXT        NOT NULL,

  reason       TEXT        NOT NULL,
  -- 'automatic' or an actor id. Never null, for the same reason a trust level
  -- is never set by nobody.
  decided_by   TEXT        NOT NULL,
  decided_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set when a later sweep, or a human, undoes the discount. Append-only in
  -- spirit: a reversal is a new state on the row, and the reason it was first
  -- applied survives.
  reversed_at  TIMESTAMPTZ,
  reversed_by  TEXT,

  CONSTRAINT endorsement_integrity_pk PRIMARY KEY (profile_id, subject_id),
  -- Cascades with the endorsement it is an opinion about: an opinion whose
  -- subject is gone is not a record, it is a leak waiting for a join.
  CONSTRAINT endorsement_integrity_endorsement_fk
    FOREIGN KEY (profile_id, subject_id)
    REFERENCES openproduct.endorsements (profile_id, subject_id) ON DELETE CASCADE,
  CONSTRAINT endorsement_integrity_reason_present CHECK (length(trim(reason)) > 0),
  CONSTRAINT endorsement_integrity_reversal_coherent
    CHECK ((reversed_at IS NULL) = (reversed_by IS NULL))
);

-- The discount, applied when the total is recomputed.
CREATE INDEX IF NOT EXISTS openproduct_endorsement_integrity_live
  ON openproduct.endorsement_integrity (profile_id)
  WHERE reversed_at IS NULL;

COMMENT ON TABLE openproduct.endorsements IS
  'EN0 — the public act. Distinct from openproduct.saved_products, which is a PRIVATE bookmark and is never counted, widened or migrated (EN-1, OPC-3).';
COMMENT ON TABLE openproduct.endorsement_integrity IS
  'EN0 — the machine''s opinion of an endorsement, kept apart from the act so a person is never told, and never implicitly accused, that their honest endorsement was judged fake (EN-4).';
