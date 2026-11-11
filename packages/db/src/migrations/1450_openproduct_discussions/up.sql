-- 1450_openproduct_discussions: the conversation that leads to the join
-- (openproduct-commons CB0). DORMANT — nothing routes to these tables yet.
--
-- Context: openproduct
-- Epic: openproduct-commons — CB0, the substrate CB1 turns on once its gate
--       (TS2 velocity AND TS3 removal, both now on main) is satisfied.
--
-- CB-1: NATIVE, NEVER SOURCED INBOUND. The decision trail is the product —
-- "every accepted contributor arrived through this page, and the thread that
-- led to it stays public" is only true if the thread lives where the join
-- lives. Federating inbound would also strand every product whose code is not
-- on GitHub, making this a GitHub client rather than a commons. An outbound
-- mirror is cheap and may come later; sourcing inward is the expensive
-- direction and this schema deliberately cannot do it (there is no upstream
-- id, no sync cursor, and no external author).
--
-- CB-2: EVERY POST IS SIGNED, and there is no anonymous or pseudonymous path.
-- author_subject_id is NOT NULL on both tables. An anonymous post on an
-- anonymously-readable, crawlable page is an unattributable permanent claim
-- about somebody else's software. Requiring a signature also inherits CG-2's
-- eligibility bound, which is most of the spam defence for free.
--
-- BODIES ARE STORED AUTHORED, rendered on read through the contract's
-- restricted subset. Storing rendered output would freeze today's subset into
-- every old row: the day we discover something must come out, we could take
-- it out of the renderer and every post written before that day would still
-- carry it. Authored text is also what an author asked to edit and what an
-- appeal is about.
--
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS openproduct.threads (
  id                 UUID        PRIMARY KEY,

  profile_id         UUID        NOT NULL
                       REFERENCES openproduct.profiles (id) ON DELETE CASCADE,

  -- CB-3's closed vocabulary. Six tags cover every thread in the design, they
  -- are the words maintainers already use, and a closed set makes threads
  -- filterable and the page scannable. An open tag space becomes a folksonomy
  -- nobody navigates and a second place to write whatever you like.
  tag                TEXT        NOT NULL,

  title              TEXT        NOT NULL,
  author_subject_id  TEXT        NOT NULL,

  --   open      the ordinary state
  --   answered  a post in it was marked as the answer by a maintainer
  --   locked    no further posts; the thread stays readable (TS3's `lock`)
  --   removed   TS3 acted on it; the thread renders as a tombstone
  state              TEXT        NOT NULL DEFAULT 'open',

  -- The post a maintainer marked as the answer. Opaque, no FK: a post can be
  -- removed after being marked, and a cascade here would silently un-answer a
  -- thread rather than leaving a question somebody can see was answered once.
  answer_post_id     UUID,

  -- Carried for the thread list's ordering, written by the post insert. A
  -- thread list ordered by a subquery over posts is a thread list that scans
  -- every post on the estate to draw one page.
  last_post_at       TIMESTAMPTZ,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT threads_tag_check
    CHECK (tag IN ('design', 'proposal', 'question', 'governance', 'contributing', 'accessibility')),
  CONSTRAINT threads_state_check
    CHECK (state IN ('open', 'answered', 'locked', 'removed')),
  CONSTRAINT threads_title_length_check
    CHECK (char_length(title) BETWEEN 1 AND 160),
  -- A thread is `answered` if and only if it names the post that answered it.
  -- The two halves cannot disagree, so no read has to guess which one is true.
  CONSTRAINT threads_answer_consistent
    CHECK ((state = 'answered') = (answer_post_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS openproduct.posts (
  id                 UUID        PRIMARY KEY,

  thread_id          UUID        NOT NULL
                       REFERENCES openproduct.threads (id) ON DELETE CASCADE,

  author_subject_id  TEXT        NOT NULL,

  -- AS TYPED. Never rendered markup — see the header.
  body               TEXT        NOT NULL,

  -- TS3's axis, the same shape as profiles.moderation_state and for the same
  -- reason: a removed post renders as removed rather than vanishing, because
  -- a reply that disappears from a thread makes the replies around it
  -- unreadable and reads as censorship to the person who wrote it.
  moderation_state   TEXT        NOT NULL DEFAULT 'visible',
  moderated_at       TIMESTAMPTZ,

  -- An edit keeps the row and moves this. A thread whose posts can be
  -- rewritten silently is a decision trail nobody can rely on, so the page
  -- says when a post was edited.
  edited_at          TIMESTAMPTZ,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT posts_body_length_check
    CHECK (char_length(body) BETWEEN 1 AND 8000),
  CONSTRAINT posts_moderation_state_check
    CHECK (moderation_state IN ('visible', 'removed')),
  CONSTRAINT posts_moderated_at_consistent
    CHECK (
      (moderation_state = 'visible' AND moderated_at IS NULL)
      OR (moderation_state <> 'visible' AND moderated_at IS NOT NULL)
    )
);

-- The Discussions tab's own read: this listing's threads, most recently
-- active first, excluding the removed.
CREATE INDEX IF NOT EXISTS openproduct_threads_listing_idx
  ON openproduct.threads (profile_id, last_post_at DESC NULLS LAST, created_at DESC)
  WHERE state <> 'removed';

-- CB-3's filter, over the same set.
CREATE INDEX IF NOT EXISTS openproduct_threads_tag_idx
  ON openproduct.threads (profile_id, tag, last_post_at DESC NULLS LAST)
  WHERE state <> 'removed';

-- One thread's posts, oldest first — a conversation is read in the order it
-- happened, unlike a moderation queue.
CREATE INDEX IF NOT EXISTS openproduct_posts_thread_idx
  ON openproduct.posts (thread_id, created_at ASC);

-- "What has this person written", which TS3's triage needs and CG4 does not:
-- a post count is NOT a profile stat, because a number that goes up when you
-- talk is a number that rewards talking.
CREATE INDEX IF NOT EXISTS openproduct_posts_author_idx
  ON openproduct.posts (author_subject_id, created_at DESC);

COMMENT ON TABLE openproduct.threads IS
  'Native discussions on a listing (openproduct-commons CB0/CB-1). Never sourced inbound: this '
  'schema has no upstream id, no sync cursor and no external author, so the decision trail cannot '
  'quietly become a mirror of somebody else''s. Dormant until CB1, whose gate is TS2 velocity AND '
  'TS3 removal.';

COMMENT ON TABLE openproduct.posts IS
  'A signed post (openproduct-commons CB0/CB-2) — author_subject_id is NOT NULL and there is no '
  'anonymous path, because an anonymous post on a crawlable page is an unattributable permanent '
  'claim about somebody else''s software. body is stored AS TYPED and rendered through the '
  'contract''s restricted subset on read, so tightening that subset applies to every post ever '
  'written rather than only to new ones.';

COMMENT ON COLUMN openproduct.posts.body IS
  'Authored text, never rendered markup. The render subset is a closed set of node kinds tested '
  'against an injection corpus (packages/contracts/src/render-subset.ts); storing its output would '
  'freeze today''s subset into every old row.';
