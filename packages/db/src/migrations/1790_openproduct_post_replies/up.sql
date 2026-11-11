-- 1790 — one level of replies (openproduct-worldclass CV1).
--
-- A post may name the post it answers. `NULL` is a top-level post, which is
-- every post that exists today, so this is additive in the strongest sense:
-- the flat thread the column arrives into is exactly the thread it describes.
--
-- ON DELETE CASCADE MATCHES THE PARENT'S OWN RULE. Posts already cascade from
-- their thread, and a reply outliving the post it answers would be a sentence
-- with no question above it. Note that this is about ROW deletion, which this
-- product does not do to posts: a removed post keeps its row and renders as
-- removed precisely so the replies around it stay readable (TS3). The cascade
-- is the hard-delete path — a thread purge — where the whole subtree goes.
--
-- ONE LEVEL IS NOT ENFORCED HERE, and the reason is that a CHECK cannot see
-- another row. The rule — a reply's parent must itself be top-level — is
-- enforced in the handler that writes, which is also where the two other
-- rules of the same shape live (the parent must be in this thread, and the
-- thread must be open). A trigger could hold it in SQL as well, and was
-- considered; it would be the only trigger in this schema, and a rule that
-- lives in one place is easier to reason about than one that lives in two and
-- must agree.
--
-- THE INDEX IS THE READ. A thread's posts are fetched whole and nested in
-- memory, so nothing queries by parent alone — but a reply's parent is
-- followed on every removal cascade, and an unindexed FK makes that a scan.

ALTER TABLE openproduct.posts
  ADD COLUMN IF NOT EXISTS parent_post_id UUID
    REFERENCES openproduct.posts (id) ON DELETE CASCADE;

-- A post cannot answer itself. This one a CHECK *can* see.
ALTER TABLE openproduct.posts
  DROP CONSTRAINT IF EXISTS posts_parent_not_self_check;
ALTER TABLE openproduct.posts
  ADD CONSTRAINT posts_parent_not_self_check
    CHECK (parent_post_id IS NULL OR parent_post_id <> id);

CREATE INDEX IF NOT EXISTS posts_parent_post_id_idx
  ON openproduct.posts (parent_post_id)
  WHERE parent_post_id IS NOT NULL;
