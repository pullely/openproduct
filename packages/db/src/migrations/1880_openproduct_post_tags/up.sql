-- 1880_openproduct_post_tags (openproduct-worldclass-v2 PP0 — CV0 carried)
--
-- ONE LAUNCH, ONE CONVERSATION (WC-6): TITLED DISCUSSIONS BECOME TAGS ON IT.
--
-- Context: openproduct
--
-- A listing page rendered two conversation objects forty pixels apart —
-- the launch thread ("Discussion · 5 comments") and the titled threads
-- ("DISCUSSIONS · No discussions yet") — and the audit's P0·04 was the
-- first reader noticing that the site did not know its own state. WC-B asked
-- whether anybody had used a titled thread for something that was not a
-- launch before collapsing them; on 10 September 2026 every production
-- listing page read "No discussions yet", which is the query's zero rows
-- rendered. So the collapse is the cheap branch: a comment on the launch
-- thread may carry the tag a titled thread used to be classified by, and the
-- second object stops being created.
--
-- ─── ADDITIVE, AND WHY THE THREAD TABLE IS NOT NARROWED ──────────────────
--
-- `threads_tag_check` still admits the six chosen tags, on purpose. A CHECK
-- applies to every row, and a migration that narrowed it would refuse to run
-- on any database that holds a titled thread — which production does not,
-- and which a development database might. The product stops CREATING them
-- (core answers 410 to the route), the listing page stops RENDERING a second
-- module, and a titled thread that already exists keeps its address under
-- /threads/{id} and a link from the listing rather than a home. Nothing is
-- deleted; the collapse is reversible by putting the module back.
--
-- Idempotent.

ALTER TABLE openproduct.posts
  ADD COLUMN IF NOT EXISTS tag TEXT;

ALTER TABLE openproduct.posts
  DROP CONSTRAINT IF EXISTS posts_tag_check;
ALTER TABLE openproduct.posts
  ADD CONSTRAINT posts_tag_check
  CHECK (tag IS NULL OR tag IN (
    'design', 'proposal', 'question', 'governance', 'contributing', 'accessibility'
  ));

COMMENT ON COLUMN openproduct.posts.tag IS
  'PP0 (openproduct-worldclass-v2) — what a titled discussion used to be classified by, now optional on a comment in the one conversation. The same six values threads_tag_check admits, minus launch: a comment cannot be a launch.';
