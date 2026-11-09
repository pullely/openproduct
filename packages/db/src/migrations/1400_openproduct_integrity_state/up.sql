-- 1400_openproduct_integrity_state (openproduct-commons EN3)
--
-- ONE ROW, SO THE INTEGRITY SWEEP HAS A FLOOR.
--
-- Context: openproduct
--
-- EN3 ships a model that reads a week of endorsements. Something has to run
-- it, and the something is the gateway's scheduled sweep — which fires on
-- whatever cadence each environment's cron is set to, and which this
-- repository cannot see, because the cron is per-environment configuration
-- rather than committed code.
--
-- THAT IS THE PROBLEM THIS TABLE SOLVES. A sweep that walked a week of
-- endorsements on every tick would, on a one-minute cron, read that week
-- sixty times an hour to discover nothing changed. Putting the floor in the
-- WORKER instead would put it in worker memory, and there is no single
-- worker: an isolate with its own timer sweeps once per isolate, which is
-- exactly the sixty sweeps the floor exists to prevent. DS0 made this
-- argument first, for the same reason, and this is the same shape
-- (`search_index_state`) deliberately.
--
-- WHY NOT REUSE `search_index_state`: the two floors are about different
-- work on different cadences, and one row holding both means changing one
-- cadence risks the other. Two singletons cost one table.
--
-- WHY THERE IS NO `dirty_at` HERE, unlike DS0's. The search index is dirtied
-- by a WRITE — a listing changed, so the index is wrong now. Integrity is not
-- like that: an endorsement arriving does not make the last assessment wrong,
-- it makes it slightly less complete, and the model is about patterns across
-- a window rather than about any one row. So the floor is purely temporal,
-- and `swept_at` is the whole of the state.
--
-- Additive and idempotent: no existing table, index, or constraint is touched.

CREATE TABLE IF NOT EXISTS openproduct.integrity_sweep_state (
  singleton BOOLEAN     NOT NULL DEFAULT TRUE,
  -- When the last sweep COMPLETED. Null means one has never run, which is
  -- due — a fresh estate should assess as soon as it is asked to.
  swept_at  TIMESTAMPTZ,

  CONSTRAINT integrity_sweep_state_pk PRIMARY KEY (singleton),
  CONSTRAINT integrity_sweep_state_singleton CHECK (singleton)
);

INSERT INTO openproduct.integrity_sweep_state (singleton, swept_at)
VALUES (TRUE, NULL)
ON CONFLICT (singleton) DO NOTHING;

COMMENT ON TABLE openproduct.integrity_sweep_state IS
  'EN3 — the integrity sweep''s floor. In the database rather than in worker memory because there is no single worker: an isolate with its own timer sweeps once per isolate.';
