-- 2280 (openproduct-redesign OPR-4)
--
-- THREADS, PUBLIC AND PRIVATE.
--
-- Context: openproduct
--
-- Design §7. Talk on a product is its existing forum (`threads`, `posts`)
-- with three additions:
--
--   visibility   `public` or `private`. Every thread written before today is
--                public, which is what it always was, so the column is NOT
--                NULL with that default and needs no backfill.
--   kind         `question`, `issue` or `suggestion`, for a thread started
--                from a product's Talk. NULL for every older thread, for a
--                listing's comment thread (`launch`) and for a product post's
--                comments (`post`): nobody chose a kind for those, and
--                defaulting one would be a fact nobody stated.
--   resolved_at  when the crew marked an issue resolved; NULL otherwise.
--                Only an issue can carry it.
--
-- ─── THE PRIVACY RULE, AS FAR AS A SCHEMA CAN HOLD IT ─────────────────────
--
-- A private thread and its posts are readable by its author and by the
-- product's crew at the time of the read, and by nobody else. WHO may read is
-- decided per request in the repository (`listing_maintainers` is the crew;
-- nothing here stores a grant). What the schema holds is the part that must
-- not depend on anybody remembering:
--
--   * A PRIVATE THREAD CANNOT BE MADE PUBLIC. The trigger below refuses the
--     update. The author wrote it for the crew; publishing it is not
--     anybody's to decide afterwards, so there is no route for it and the
--     database refuses a statement that tries.
--   * A PRIVATE THREAD CANNOT BE MOVED TO ANOTHER PRODUCT. Its readers are
--     its author and the crew of `profile_id`; changing that column would
--     hand the thread to a different crew, which is publishing it to them.
--     The same trigger refuses it. (It fires on every update of `threads`,
--     not on a column list, so no way of writing the statement goes round
--     it.)
--   * A POST CANNOT BE MOVED TO ANOTHER THREAD. A post is read by whoever
--     may read its thread, so moving one out of a private thread publishes
--     it, and moving one into a private thread is words its author never
--     wrote there. No statement in the product moves a post, so the second
--     trigger refuses the change for every post, private or not.
--   * The system's own threads are never private: a listing's comment thread
--     and a product post's comments are public pages.
--
-- ─── INDEXES ──────────────────────────────────────────────────────────────
--
-- Two partial indexes, both over private rows only, for the two questions
-- the signed-in read asks: a product's private threads (its crew), and one
-- author's private threads on a product. Public reads keep the indexes they
-- have; `visibility = 'public'` is a residual filter there.
--
-- ─── THE INBOX LEARNS THREE KINDS, AND ONE IT WAS ALREADY SENT ────────────
--
-- A private thread reaches the crew's Activity when it starts and when its
-- author replies, and reaches its author when the crew replies. Those are
-- three kinds of `notifications` row, pointing at a `thread`: the row holds a
-- kind, a handle and the thread's address and NO title and no text, so a row
-- that outlives somebody's place on the crew tells them nothing the thread
-- held.
--
-- The kind check is dropped and added back wider under its own name, as the
-- tag check was (1680, 2270). `launch.listing` is added with them: the
-- contract has listed it since PP1 and the check never did, so those rows
-- were refused by the schema and swallowed by the fan-out.
--
-- No backfill. Cascades from `profiles` as before (the columns are on
-- `threads`).
--
-- Additive, idempotent.

ALTER TABLE openproduct.threads
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';

ALTER TABLE openproduct.threads
  ADD COLUMN IF NOT EXISTS kind TEXT;

ALTER TABLE openproduct.threads
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

ALTER TABLE openproduct.threads
  DROP CONSTRAINT IF EXISTS threads_visibility_check;

ALTER TABLE openproduct.threads
  ADD CONSTRAINT threads_visibility_check
  CHECK (visibility IN ('public', 'private'));

ALTER TABLE openproduct.threads
  DROP CONSTRAINT IF EXISTS threads_kind_check;

ALTER TABLE openproduct.threads
  ADD CONSTRAINT threads_kind_check
  CHECK (kind IS NULL OR kind IN ('question', 'issue', 'suggestion'));

ALTER TABLE openproduct.threads
  DROP CONSTRAINT IF EXISTS threads_resolved_issue_check;

ALTER TABLE openproduct.threads
  ADD CONSTRAINT threads_resolved_issue_check
  CHECK (resolved_at IS NULL OR kind = 'issue');

ALTER TABLE openproduct.threads
  DROP CONSTRAINT IF EXISTS threads_private_not_system_check;

ALTER TABLE openproduct.threads
  ADD CONSTRAINT threads_private_not_system_check
  CHECK (visibility = 'public' OR tag NOT IN ('launch', 'post'));

CREATE OR REPLACE FUNCTION openproduct.threads_private_stays_private()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.visibility = 'private' AND NEW.visibility IS DISTINCT FROM 'private' THEN
    RAISE EXCEPTION 'a private thread cannot be made public'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.visibility = 'private' AND NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
    RAISE EXCEPTION 'a private thread cannot be moved to another product'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS threads_private_stays_private ON openproduct.threads;

CREATE TRIGGER threads_private_stays_private
  BEFORE UPDATE ON openproduct.threads
  FOR EACH ROW
  EXECUTE FUNCTION openproduct.threads_private_stays_private();

CREATE OR REPLACE FUNCTION openproduct.posts_thread_is_fixed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.thread_id IS DISTINCT FROM OLD.thread_id THEN
    RAISE EXCEPTION 'a post cannot be moved to another thread'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_thread_is_fixed ON openproduct.posts;

CREATE TRIGGER posts_thread_is_fixed
  BEFORE UPDATE ON openproduct.posts
  FOR EACH ROW
  EXECUTE FUNCTION openproduct.posts_thread_is_fixed();

CREATE INDEX IF NOT EXISTS openproduct_threads_private_profile_idx
  ON openproduct.threads (profile_id, last_post_at DESC NULLS LAST, created_at DESC)
  WHERE visibility = 'private';

CREATE INDEX IF NOT EXISTS openproduct_threads_private_author_idx
  ON openproduct.threads (author_subject_id, profile_id)
  WHERE visibility = 'private';

ALTER TABLE openproduct.notifications
  DROP CONSTRAINT IF EXISTS notifications_kind_check;

ALTER TABLE openproduct.notifications
  ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN (
    'rank.first', 'post.reply', 'launch.topic', 'post.upvoted',
    -- PP1 — a listing you follow launched.
    'launch.listing',
    -- OPR-4 — a private thread started (to the crew), its author replied (to
    -- the crew), the crew replied (to its author).
    'thread.private', 'thread.private.reply', 'thread.private.answered'
  ));

ALTER TABLE openproduct.notifications
  DROP CONSTRAINT IF EXISTS notifications_target_kind_check;

ALTER TABLE openproduct.notifications
  ADD CONSTRAINT notifications_target_kind_check
  CHECK (target_kind IN ('listing', 'post', 'topic', 'thread'));

COMMENT ON COLUMN openproduct.threads.visibility IS
  'public or private. A private thread is readable by its author and the product''s crew at read time, and cannot be made public or moved to another product.';
COMMENT ON COLUMN openproduct.threads.kind IS
  'question, issue or suggestion for a thread started from Talk; NULL for older threads and the system''s own.';
COMMENT ON COLUMN openproduct.threads.resolved_at IS
  'When the crew marked an issue resolved; NULL otherwise.';
