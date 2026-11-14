-- 2275 (openproduct-redesign OPR-3)
--
-- A PERSON'S PUBLISHED PRODUCT POSTS, BY POSITION.
--
-- Context: openproduct
--
-- A person's page lists the posts they pressed Post on, newest first, paged
-- by the feed's own cursor (published_at, id). The feed's index is ordered by
-- moment alone and a product's by profile; neither answers "this author's
-- posts" without walking every published post. This is that index.
--
-- Partial twice: a draft is not in the index the public read walks, and a
-- post the system wrote has no author to be listed under.
--
-- No backfill: an index over rows that already exist.
--
-- Additive, idempotent.

CREATE INDEX IF NOT EXISTS openproduct_product_posts_author_published_idx
  ON openproduct.product_posts (author_subject_id, published_at DESC, id DESC)
  WHERE state = 'published' AND author_subject_id IS NOT NULL;
