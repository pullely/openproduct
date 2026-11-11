-- 1850_openproduct_snapshots (openproduct-worldclass PV4)
--
-- WHAT A LISTING LOOKED LIKE, SO "WHAT CHANGED" CAN BE ANSWERED AT ALL.
--
-- Context: openproduct
--
-- Every other number on a listing is a fact about NOW. A diff is a claim about
-- the past, and this schema holds almost none: `metrics` is append-only and
-- can be read backwards, but `profiles` is overwritten in place. There is no
-- way to say what a tagline used to be. So this starts writing it down — and
-- says nothing at all about the stretch before it existed.
--
-- ─── THE FIRST SNAPSHOT PRODUCES NO DIFF ─────────────────────────────────
--
-- The rule the contract is most careful about, and the reason this table is
-- allowed to be empty for a long time without anything looking broken. A diff
-- computed against nothing would render every field as "changed": a page
-- announcing that a product rewrote its whole listing on the day we happened
-- to start looking. `diffSnapshots` returns `null` — not an empty list — when
-- there is no earlier row, and the page renders no section.
--
-- ─── WHY JSONB AND NOT A COLUMN PER FIELD ────────────────────────────────
--
-- A snapshot is a RECORD OF A SHAPE AT A MOMENT, and the shape moves. PV2 added
-- an install line, PV3 a mark, MD0 a media model; a column-per-field snapshot
-- table would need a migration every time the thing it snapshots grows, and
-- the migration would have to decide what the column held for every row taken
-- before it existed. `fields` holds what the diffable set held THAT WEEK, and
-- a field absent from an old row is absent because it did not exist — which
-- `diffSnapshots` reads as "no change" rather than as a change to null.
--
-- WHAT GOES IN IT IS THE PUBLIC PROJECTION AND NOTHING ELSE. The contract's
-- `DIFFABLE_FIELDS` is a closed list of nine, all of them already public on
-- the listing page. A snapshot is not an audit trail and must not become one:
-- it holds no actor, no draft, no private field and no moderation state, so a
-- listing's history here says exactly what its page said, at each moment it
-- said it.
--
-- ─── ONE ROW PER LISTING PER DAY, AT MOST ────────────────────────────────
--
-- The unique index is on `(profile_id, taken_on)` — a DATE rather than a
-- timestamp — so the ten-minute sweep cannot write 144 rows a day per listing.
-- The contract compares across a week; a day is the finest granularity worth
-- storing and it makes the sweep idempotent for free.
--
-- CASCADE, because a listing's history is part of the listing. `teardown.md`
-- row 10 is one DROP SCHEMA and this row goes with the rest.
--
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS openproduct.profile_snapshots (
  profile_id UUID        NOT NULL
               REFERENCES openproduct.profiles (id) ON DELETE CASCADE,
  -- The DAY the snapshot describes. A date rather than a timestamp: the sweep
  -- runs every ten minutes and this table is compared across weeks.
  taken_on   DATE        NOT NULL,
  -- The moment within that day, kept because an OBSERVED change carries the
  -- moment of the read that found it (OPC-7) and the date alone is not one.
  taken_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The diffable subset of the PUBLIC projection, and nothing else. See the
  -- header: no actor, no draft, no private field, no moderation state.
  fields     JSONB       NOT NULL,

  CONSTRAINT profile_snapshots_pk PRIMARY KEY (profile_id, taken_on),
  -- A snapshot is an object. An array or a scalar here would be a shape
  -- `diffSnapshots` cannot read, discovered on a page rather than on write.
  CONSTRAINT profile_snapshots_fields_object
    CHECK (jsonb_typeof(fields) = 'object')
);

-- "What did this listing look like a week ago" — the only question this table
-- is asked, and it is asked with a profile and a date bound.
CREATE INDEX IF NOT EXISTS openproduct_profile_snapshots_recent
  ON openproduct.profile_snapshots (profile_id, taken_on DESC);

-- "What changed anywhere this week" — the digest's lead. Bounded by the date
-- rather than by the listing, which is the other direction entirely.
CREATE INDEX IF NOT EXISTS openproduct_profile_snapshots_day
  ON openproduct.profile_snapshots (taken_on DESC);

COMMENT ON TABLE openproduct.profile_snapshots IS
  'PV4 (openproduct-worldclass) — what a listing looked like on a day, so '
  '"what changed since last week" can be answered at all. THE FIRST SNAPSHOT '
  'PRODUCES NO DIFF: diffSnapshots returns null rather than an empty list when '
  'there is no earlier row, because a diff against nothing would render every '
  'field as changed and announce that a product rewrote its listing on the day '
  'we started looking. JSONB rather than a column per field because the shape '
  'moves — a field absent from an old row is absent because it did not exist '
  'yet, which reads as no change rather than a change to null. HOLDS THE '
  'PUBLIC PROJECTION AND NOTHING ELSE: no actor, no draft, no private field, '
  'no moderation state — a snapshot is not an audit trail and must not become '
  'one. One row per listing per day by primary key, so the ten-minute sweep is '
  'idempotent and cannot write 144 rows a day.';
