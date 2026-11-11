-- 1460_openproduct_seam_activity: activity the SEAM told us about
-- (openproduct-commons CB3).
--
-- Context: openproduct
-- Epic: openproduct-commons — CB3, the decision trail.
--
-- 1340 gave activity_events four sources, all of them ingestion: three ways
-- of reading a repository, plus `operator` for a human entering something by
-- hand. An accepted offer is neither. It arrives over the JR seam — the
-- estate's own boundary, from the system that owns the join lifecycle
-- (CB-5) — and calling that `operator` would say a person typed it.
--
-- THE SOURCE COLUMN IS PROVENANCE, and provenance is the one thing this epic
-- refuses to fudge (OPC-7). A reader who asks "where did this come from"
-- gets an answer that is true, or the column is decoration. So the seam gets
-- its own name rather than borrowing one that means something else.
--
-- DELIBERATELY NOT ADDED TO signal_sources. That table is what gets POLLED,
-- and a seam is not pollable — it pushes. The two tables share a column name
-- and not a meaning, and the contract keeps them as separate types for the
-- same reason.
--
-- Additive, idempotent. No existing row changes.

ALTER TABLE openproduct.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_source_check;

ALTER TABLE openproduct.activity_events
  ADD CONSTRAINT activity_events_source_check
    CHECK (source IN ('linked_repo', 'declared_repo', 'manifest', 'operator', 'seam'));

COMMENT ON COLUMN openproduct.activity_events.source IS
  'Where this fact came from (OPC-7). Three ingestion sources, plus operator for something a '
  'human entered, plus seam (openproduct-commons CB3) for what the JR boundary told us — an '
  'accepted offer is not something we read off a repository and not something a person typed. '
  'NOT the same vocabulary as signal_sources, which is what gets polled; a seam pushes.';
