-- 2270 (openproduct-redesign OPR-3)
--
-- PRODUCT POSTS AND THEIR REACTIONS.
--
-- Context: openproduct
--
-- Design §6.2. What a product has done — shipped a feature, cut a version,
-- recorded a demo, started as an idea, opened a seat — is a post of a fixed
-- shape, and the feed is those posts.
--
-- ─── NOT `posts`, NOT `post_votes` ───────────────────────────────────────
--
-- `openproduct.posts` and `openproduct.post_votes` are replies in a thread
-- and upvotes on them (CB1, DQ1). These are a different object with a
-- different author — a product, through its crew — so they are
-- `product_posts` and `product_post_reactions` here and in every layer above.
--
-- ─── WHAT A ROW IS ───────────────────────────────────────────────────────
--
--   kind       one of five; the template. The blocks a kind may carry, their
--              order and their limits are code (contracts `product-posts.ts`)
--              and are validated in core before every write, so the column
--              holds `[{block, value}, …]` and no CHECK restates the table.
--   state      `draft` → `published` → `removed`. A draft is never in a
--              public read: every public statement says `state = 'published'`
--              and re-asserts the listing's own visibility.
--   author     NULL when the system wrote the post (the idea post a listing's
--              first publish makes). Otherwise the crew member who created it.
--   links      what the post is about, each optional and each SET NULL when
--              its target goes: a milestone, a seat, a launch.
--   thread_id  the thread that holds the post's comments, written by the
--              system at publish — the way a listing's comment thread is
--              (1680), and for the same reason: TS3's removal path, TS2's
--              velocity limits, CB4's notifications and the render subset all
--              already apply to a thread.
--
-- ─── THE EIGHTH TAG ──────────────────────────────────────────────────────
--
-- A post's comment thread carries tag `post`. Like `launch` it is written by
-- the system and chosen by nobody (it is absent from the contract's
-- `THREAD_TAGS`); unlike `launch` a listing may hold many, one per published
-- post, so there is no one-per-listing index. The check is dropped and added
-- back wider under its own name, as 1680 did.
--
-- ─── REACTIONS ───────────────────────────────────────────────────────────
--
-- One per person per post — the primary key is the pair. Changing a reaction
-- rewrites the row; taking it back sets `withdrawn_at` and keeps the row,
-- `post_votes`' convention: it moves a public number, and a public number is
-- a log rather than a presence test. No counter column (EN0's rule): the
-- counts are one indexed aggregate per post.
--
-- A post's author cannot react to their own post. The rule is in the insert
-- itself (the repository's statement selects the post and refuses the
-- author), not in a trigger.
--
-- Both tables cascade from `profiles`, so a workspace purge takes them.
--
-- Additive, idempotent.

ALTER TABLE openproduct.threads
  DROP CONSTRAINT IF EXISTS threads_tag_check;

ALTER TABLE openproduct.threads
  ADD CONSTRAINT threads_tag_check
  CHECK (tag IN (
    'design', 'proposal', 'question', 'governance', 'contributing',
    'accessibility',
    -- DQ0b — written by the system, never chosen by a person.
    'launch',
    -- OPR-3 — a product post's comments. Written by the system at publish.
    'post'
  ));

CREATE TABLE IF NOT EXISTS openproduct.product_posts (
  id                 UUID        PRIMARY KEY,

  profile_id         UUID        NOT NULL
                       REFERENCES openproduct.profiles (id) ON DELETE CASCADE,

  kind               TEXT        NOT NULL,

  -- NULL when the system wrote it.
  author_subject_id  TEXT,

  -- An ordered list of {block, value}. Validated in core against the kind's
  -- catalogue before every write.
  blocks             JSONB       NOT NULL DEFAULT '[]'::jsonb,

  state              TEXT        NOT NULL DEFAULT 'draft',
  published_at       TIMESTAMPTZ,

  -- What the post is about. Opaque to a reader; each goes NULL with its target.
  milestone_id       UUID
                       REFERENCES openproduct.product_milestones (id) ON DELETE SET NULL,
  role_opening_id    UUID
                       REFERENCES openproduct.role_openings (id) ON DELETE SET NULL,
  launch_id          UUID
                       REFERENCES openproduct.launches (id) ON DELETE SET NULL,

  -- The thread holding the post's comments; NULL until it is published.
  thread_id          UUID
                       REFERENCES openproduct.threads (id) ON DELETE SET NULL,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT product_posts_kind_check
    CHECK (kind IN ('feature', 'version', 'demo', 'idea', 'seat')),
  CONSTRAINT product_posts_state_check
    CHECK (state IN ('draft', 'published', 'removed')),
  -- A published post names the moment it was published, and a draft has
  -- none. A removed post keeps whichever it had.
  CONSTRAINT product_posts_published_consistent
    CHECK (
      (state = 'draft' AND published_at IS NULL)
      OR (state = 'published' AND published_at IS NOT NULL)
      OR state = 'removed'
    )
);

-- The feed: every published post, newest first. Partial, so a draft is not in
-- the index the public read walks.
CREATE INDEX IF NOT EXISTS openproduct_product_posts_feed_idx
  ON openproduct.product_posts (published_at DESC, id DESC)
  WHERE state = 'published';

-- One product's published posts, newest first.
CREATE INDEX IF NOT EXISTS openproduct_product_posts_profile_published_idx
  ON openproduct.product_posts (profile_id, published_at DESC, id DESC)
  WHERE state = 'published';

-- The crew's own list: drafts and published, most recently touched first.
CREATE INDEX IF NOT EXISTS openproduct_product_posts_profile_idx
  ON openproduct.product_posts (profile_id, updated_at DESC)
  WHERE state <> 'removed';

-- "Is there already a post about this milestone / this seat" — asked before
-- the system offers one.
CREATE INDEX IF NOT EXISTS openproduct_product_posts_milestone_idx
  ON openproduct.product_posts (milestone_id)
  WHERE milestone_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS openproduct_product_posts_role_opening_idx
  ON openproduct.product_posts (role_opening_id)
  WHERE role_opening_id IS NOT NULL;

COMMENT ON TABLE openproduct.product_posts IS
  'OPR-3 (openproduct-redesign) — a product''s template post: kind, blocks ([{block, value}], validated in core against the contract''s catalogue), state (draft, published, removed), the thread holding its comments, and optional links to a milestone, a role opening or a launch. NOT openproduct.posts, which are replies in a thread. A draft is in no public read. Cascades from profiles.';

CREATE TABLE IF NOT EXISTS openproduct.product_post_reactions (
  post_id      UUID        NOT NULL
                 REFERENCES openproduct.product_posts (id) ON DELETE CASCADE,
  subject_id   TEXT        NOT NULL,
  reaction     TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set when the reaction is taken back, cleared when one is given again.
  withdrawn_at TIMESTAMPTZ,

  CONSTRAINT product_post_reactions_pk PRIMARY KEY (post_id, subject_id),
  CONSTRAINT product_post_reactions_reaction_check
    CHECK (reaction IN ('useful', 'would_use', 'impressive', 'curious'))
);

-- The counts beside a post.
CREATE INDEX IF NOT EXISTS openproduct_product_post_reactions_post_idx
  ON openproduct.product_post_reactions (post_id, reaction)
  WHERE withdrawn_at IS NULL;

-- "Which of these have I reacted to" — the overlay's question, bounded by the
-- post ids the page drew.
CREATE INDEX IF NOT EXISTS openproduct_product_post_reactions_subject_idx
  ON openproduct.product_post_reactions (subject_id)
  WHERE withdrawn_at IS NULL;

COMMENT ON TABLE openproduct.product_post_reactions IS
  'OPR-3 (openproduct-redesign) — one reaction per person per product post (useful, would_use, impressive, curious). Changing it rewrites the row; taking it back sets withdrawn_at and keeps the row, as post_votes does. A post''s author cannot react to their own post — refused in the repository''s insert. No counter column.';
