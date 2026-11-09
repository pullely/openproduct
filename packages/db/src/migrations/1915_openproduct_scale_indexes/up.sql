-- 1915_openproduct_scale_indexes (openproduct-scale OS4)
--
-- TWO INDEXES THE PLAN TEST FOUND MISSING ON DAY ONE.
--
-- Context: openproduct
--
-- OS4 runs every public read against a corpus of five thousand listings and
-- explains every statement it issues; a sequential scan over a table that
-- grows with the corpus is either indexed or enumerated with a reason. On
-- the first run two scans had no reason:
--
--   threads, by last reply — `listRecentlyRepliedThreads` (the front page's
--   sidebar) orders EVERY thread by `last_post_at` and takes five. The
--   indexes that existed were per listing (`profile_id, last_post_at`), which
--   is the listing page's read; a global order had nothing to walk but the
--   table. Five rows out of thousands is the shape an index exists for. (The
--   forum's "replied" order sorts by a computed post count first, which no
--   index can serve; that read stays a sort, and is enumerated as one.)
--
--   endorsements, by when — `listMostEndorsedInWindow` (the digest) reads a
--   week of endorsements by `created_at`. The existing indexes are by
--   listing and by subject; a week's slice walked the year.
--
-- Both partial, on the predicate the read actually carries, so the index is
-- the size of the rows it can ever answer for. Additive, idempotent.

-- The order is the sidebar read's, exactly — `last_post_at DESC, created_at
-- DESC`, nulls where DESC puts them — because an index sorted NULLS LAST
-- cannot serve an ORDER BY that says otherwise, and the first cut of this
-- index said otherwise and served nothing. The read excludes nulls anyway.
CREATE INDEX IF NOT EXISTS openproduct_threads_by_reply
  ON openproduct.threads (last_post_at DESC, created_at DESC)
  WHERE state <> 'removed';

CREATE INDEX IF NOT EXISTS openproduct_endorsements_by_created
  ON openproduct.endorsements (created_at)
  WHERE withdrawn_at IS NULL AND state = 'confirmed';
