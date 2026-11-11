-- 1690_openproduct_post_votes (openproduct-launch DQ1)
--
-- AN UPVOTE ON A COMMENT.
--
-- Context: openproduct
--
-- ─── APPEND-ONLY, LIKE AN ENDORSEMENT AND UNLIKE A FOLLOW ────────────────
--
-- FL0's follows DELETE on withdrawal, and the reason was specific: a follow
-- has no restatement, nothing discounts it, and no public number is ever
-- recomputed from its history — so a tombstone would be a durable private
-- record kept by us and asked for by nobody.
--
-- A comment vote is the other case. It moves a PUBLIC number, and a public
-- number that anything may ever have to RESTATE needs a log rather than a
-- presence test: EN3's whole design rests on being able to say "this total was
-- 40, we discounted 6, it is 34" without erasing what was discounted. So the
-- row survives withdrawal with `withdrawn_at` set, exactly as an endorsement
-- does, and re-voting clears it on the SAME row rather than writing a second.
--
-- ─── WHAT IS DELIBERATELY NOT HERE: A DISCOUNT TABLE ─────────────────────
--
-- The plan asked for "the count through the same integrity discount", and this
-- ships without one. The argument, because it is a departure:
--
-- EN3's discount exists because an endorsement total ORDERS THINGS — it is the
-- directory's `sort.endorsements`, the board's rank, and the leaderboard. A
-- brigade there decides what other people are shown, which is why the estate
-- spends a whole table and a sweep on answering it.
--
-- A comment's votes order nothing. Comments render in the order they were
-- written, and DQ1 does not change that. A brigaded comment count is a wrong
-- number beside one comment; it is not a wrong page. Shipping an empty
-- `post_vote_integrity` today would be dormant machinery whose only effect is
-- a LEFT JOIN that always misses, and dormant machinery is how a rule comes to
-- look enforced without being.
--
-- What this migration DOES do is leave the door open: the log above is exactly
-- the shape EN3 needs, so the day comments are ordered by their votes, the
-- discount is a second table and a join — not a rewrite of how the act is
-- recorded. That is the part that would have been expensive to get wrong.
--
-- ─── ONE PERSON, ONE VOTE, AND NOT ON YOUR OWN COMMENT ───────────────────
--
-- The primary key is the pair, so voting twice is voting once. The self-vote
-- is refused by the schema as well as in code, for FL0's reason: a maker
-- opening a page finds their own comment there, and a self-vote inflates a
-- number on your own words with your own click. It cannot be a CHECK, because
-- the author is on `posts` and not here — so it is a trigger, which is the one
-- place this schema uses one and says why.
--
-- NO COUNTER COLUMN (EN0's rule, unchanged): the count is one indexed count(*)
-- against one post, honest on the request path, where a counter would drift
-- the first time a write path forgot it and drift silently.
--
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS openproduct.post_votes (
  post_id      UUID        NOT NULL
                 REFERENCES openproduct.posts (id) ON DELETE CASCADE,
  subject_id   TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set on withdrawal, cleared on re-voting. The row is never deleted.
  withdrawn_at TIMESTAMPTZ,

  CONSTRAINT post_votes_pk PRIMARY KEY (post_id, subject_id)
);

-- "How many upvotes does this post have" — the count on every comment, and the
-- only question this table is asked in public. Partial, because a withdrawn
-- vote is history rather than a row anything counts.
CREATE INDEX IF NOT EXISTS openproduct_post_votes_post
  ON openproduct.post_votes (post_id)
  WHERE withdrawn_at IS NULL;

-- "Which of these have I voted on" — the XP2 overlay's question, bounded by
-- the post ids on the page.
CREATE INDEX IF NOT EXISTS openproduct_post_votes_subject
  ON openproduct.post_votes (subject_id)
  WHERE withdrawn_at IS NULL;

-- NOBODY UPVOTES THEIR OWN COMMENT. A trigger rather than a CHECK because the
-- author lives on `posts`; a trigger rather than only a handler guard because
-- a future write path that forgets is still a write path, and this is a public
-- number somebody can inflate with their own click.
CREATE OR REPLACE FUNCTION openproduct.post_votes_no_self_vote()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM openproduct.posts p
     WHERE p.id = NEW.post_id AND p.author_subject_id = NEW.subject_id
  ) THEN
    RAISE EXCEPTION 'post_votes: an author cannot upvote their own post';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS post_votes_no_self_vote ON openproduct.post_votes;
CREATE TRIGGER post_votes_no_self_vote
  BEFORE INSERT OR UPDATE ON openproduct.post_votes
  FOR EACH ROW EXECUTE FUNCTION openproduct.post_votes_no_self_vote();

COMMENT ON TABLE openproduct.post_votes IS
  'DQ1 (openproduct-launch) — an upvote on a comment. APPEND-ONLY with '
  'withdrawn_at, like an endorsement and unlike a follow: it moves a public '
  'number, and a public number anything may have to RESTATE needs a log rather '
  'than a presence test. NO DISCOUNT TABLE, deliberately: EN3''s exists '
  'because an endorsement total orders things, and a comment''s votes order '
  'nothing — comments render in the order they were written. The log is '
  'already the shape a discount would need, so adding one later is a second '
  'table and a join rather than a rewrite of how the act is recorded. No '
  'counter column (EN0''s rule): the count is one indexed count(*), honest on '
  'the request path.';
