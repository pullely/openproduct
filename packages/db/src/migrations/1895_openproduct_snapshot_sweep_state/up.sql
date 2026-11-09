-- 1870_openproduct_snapshot_sweep_state (openproduct-scale OS2)
--
-- THE FLOOR PV4 SHIPPED WITHOUT.
--
-- Context: openproduct
--
-- Every other skippable phase in the sweep decides it is DUE before it reads
-- anything: DS0's rebuild floor, EN3's `integrity_sweep_state`, TS4's
-- `defence_sweep_state`. The snapshot phase (1850) did not. Every ten-minute
-- tick it read the profile, read its openings and upserted one row, per
-- listing — three round trips × N listings × 144 a day, to keep N rows. The
-- primary key on `profile_snapshots` made that CORRECT; nothing made it cheap,
-- and at a thousand listings it is roughly 430,000 database operations a day
-- producing a thousand rows.
--
-- This is the singleton the other two phases already have, and for the same
-- reason their headers give: in the database rather than in worker memory
-- because there is no single worker — an isolate with its own timer would
-- snapshot once per isolate.
--
-- `swept_at` IS A TIMESTAMP, NOT A DATE, even though the floor is daily. The
-- health document (`sweep-health.ts`) assesses every phase by the age of one
-- ISO instant, and a phase that stored a DATE would need its own arithmetic
-- in the one place the four phases are meant to look alike. The handler
-- derives the day from the instant; the document reads the instant.
--
-- NUMBERED 1870, NOT 1860. This migration was written as 1860 and LI0
-- (openproduct-worldclass-v2) landed its own 1860 first, adding `last_error`
-- and `last_error_at` to every sweep-state row so a phase that fails says so
-- in a column. This row is created AFTER that one and carries the same two
-- columns from birth, so the ledger's phase-to-table map reads it like the
-- other five without a special case.
--
-- Additive, idempotent. Seeded NULL, which is "never run", which is DUE.

CREATE TABLE IF NOT EXISTS openproduct.snapshot_sweep_state (
  singleton     BOOLEAN     NOT NULL DEFAULT TRUE,
  -- When the last snapshot sweep COMPLETED. Null means one has never run,
  -- which is due — the first tick of a fresh estate should record today.
  swept_at      TIMESTAMPTZ,
  -- LI0's columns, present from birth: why the last sweep failed, bounded to
  -- phase, code, message and status; NULL once one succeeds.
  last_error    TEXT,
  last_error_at TIMESTAMPTZ,

  CONSTRAINT snapshot_sweep_state_pk PRIMARY KEY (singleton),
  CONSTRAINT snapshot_sweep_state_singleton CHECK (singleton)
);

INSERT INTO openproduct.snapshot_sweep_state (singleton, swept_at)
VALUES (TRUE, NULL)
ON CONFLICT (singleton) DO NOTHING;

COMMENT ON TABLE openproduct.snapshot_sweep_state IS
  'OS2 (openproduct-scale) — the snapshot sweep''s floor, which PV4 shipped '
  'without. One row per listing per day was already guaranteed by the primary '
  'key on profile_snapshots; this is what stops the ten-minute tick from '
  'PAYING for that row 144 times. In the database rather than worker memory '
  'because there is no single worker. A TIMESTAMPTZ rather than a DATE so the '
  'health document assesses it like every other phase.';
