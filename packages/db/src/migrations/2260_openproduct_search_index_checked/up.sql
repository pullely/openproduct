-- 2260_openproduct_search_index_checked (openproduct-standalone OPN-11)
--
-- A CLEAN INDEX IS A CHECKED INDEX, AND THE CHECK IS A RUN.
--
-- Context: openproduct
--
-- The search index phase is the one sweep phase that does nothing when there
-- is nothing to do. Core rebuilds only when the index is dirty (a listing
-- write since the last build) or has never been built; otherwise the sweep's
-- call answers `rebuilt: false, reason: clean` and writes nothing. That is the
-- floor working, and it is not changed here.
--
-- What it broke is the liveness read. `/health` took the index's `built_at`
-- as the phase's last run, and `built_at` only moves when something changes.
-- On a quiet catalogue it does not move at all: the standalone deploy went
-- live on 11 Nov with an empty catalogue, the index was built once at 23:00Z
-- and checked clean on every tick since, and `/health` reported the phase
-- stale (and the gateway degraded) from 23:30Z onward, on stage and prod.
--
-- `built_at` stays what it is — the moment the index's content was computed,
-- and the floor a rebuild is measured from. `checked_at` is the other half:
-- the last moment the sweep asked and core found the index clean, so current
-- without a rebuild. The phase's last run is the later of the two.
--
-- Additive, idempotent.

ALTER TABLE openproduct.search_index_state
  ADD COLUMN IF NOT EXISTS checked_at TIMESTAMPTZ;

COMMENT ON COLUMN openproduct.search_index_state.checked_at IS
  'OPN-11 — when the sweep last found the index clean (current without a rebuild). The phase''s last run is GREATEST(built_at, checked_at); built_at alone stays the floor.';
