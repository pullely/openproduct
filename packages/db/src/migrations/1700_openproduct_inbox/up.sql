-- 1700_openproduct_inbox (openproduct-launch NF0)
--
-- AN INBOX ON THE SITE, BESIDE CB4'S OUTBOX AND NOT INSIDE IT.
--
-- Context: openproduct
--
-- ─── WHY A SECOND TABLE AND NOT A COLUMN ON THE OUTBOX ───────────────────
--
-- `notification_outbox` exists to DELIVER: it carries `delivered_at` and
-- `attempts`, its rows are consumed by a sweep, and its whole shape is about
-- a message leaving this system over the seam. This table is a LIST A PERSON
-- READS: its rows are never consumed, they are ordered for a page, and they
-- are counted against a cursor.
--
-- The two also disagree about content. CB4's mail deliberately names nobody —
-- "a name in a subject line is a name in somebody's inbox, searchable and
-- forwardable" — while this list is read on a page that already shows the same
-- names under the same rules. One table would have had to pick one of those
-- policies for both channels.
--
-- ─── NO TEXT IS STORED ───────────────────────────────────────────────────
--
-- A row holds a kind and its referents. The sentence is composed at read time
-- from the contract's phrasebook. Stored prose is prose that cannot be
-- corrected — a wording somebody regrets is then a backfill — and a table full
-- of English is a translation problem the day anybody wants a second language.
--
-- ─── READ STATE IS A CURSOR, NOT A FLAG PER ROW ──────────────────────────
--
-- The only read action this product has is "Mark all as read". A cursor makes
-- the unread count one comparison instead of a column to keep in step, and it
-- means rendering the inbox writes nothing at all — per-row read state would
-- be a write on every render of a page whose whole purpose is to be looked at.
--
-- ─── FOUR KINDS SHIP, AND THE FIFTH IS REFUSED ───────────────────────────
--
-- The design lists five. `follow.maker` — telling somebody who followed them —
-- is not here, and its absence is deliberate rather than deferred.
--
-- FL0 published a promise to people, on the page where they decide whether to
-- make their profile public: "How many people follow you — a count only, never
-- who they are, not even to you." A notification naming the follower breaks
-- that outright. One that hides the name breaks it more quietly: a message at
-- 14:03 saying "somebody followed you" is a TIMING signal, and timing plus any
-- other trace narrows a private act to a person.
--
-- If a follow notification is ever wanted, the shape that keeps the promise is
-- a COUNT crossing a threshold ("ten people now follow you") — a number they
-- can already see, said at a moment nobody's act determines alone. That is a
-- new published rule and belongs to the milestone that wants it, not to this
-- one.
--
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS openproduct.notifications (
  id           UUID        PRIMARY KEY,

  -- Opaque, and the only thing about the person here (I3).
  subject_id   TEXT        NOT NULL,

  --   rank.first    a listing you maintain reached #1 on its launch day
  --   post.reply    somebody replied where you had commented
  --   launch.topic  something launched in a topic you follow
  --   post.upvoted  a comment you wrote was upvoted
  kind         TEXT        NOT NULL,

  -- What caused it. Part of the uniqueness below, which is what makes
  -- "once per event per person" a property of the schema rather than of every
  -- caller remembering to check — a retried sweep, a redelivered seam event
  -- and two workers racing all collide here.
  event_key    TEXT        NOT NULL,

  -- The HANDLE of whoever did it, or null for something the system observed.
  -- A handle rather than a subject id: it is the public address, it is what
  -- the page renders, and an internal identifier in a row a page reads is an
  -- internal identifier one bad projection away from a browser.
  actor        TEXT,

  --   listing | post | topic
  target_kind  TEXT        NOT NULL,
  -- A slug, a post id, or a topic value. Resolved when the page renders, so a
  -- row about something since removed simply stops resolving rather than
  -- carrying a stale copy of it (TS3).
  target_ref   TEXT        NOT NULL,

  -- The one number some kinds need — a rank, an upvote count. NOT a rendered
  -- string: the phrasebook decides how it reads.
  figure       INTEGER,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT notifications_kind_check
    CHECK (kind IN ('rank.first', 'post.reply', 'launch.topic', 'post.upvoted')),
  CONSTRAINT notifications_target_kind_check
    CHECK (target_kind IN ('listing', 'post', 'topic')),
  CONSTRAINT notifications_target_not_blank
    CHECK (length(btrim(target_ref)) > 0)
);

-- ONCE PER EVENT PER PERSON, as a constraint rather than a convention.
CREATE UNIQUE INDEX IF NOT EXISTS openproduct_notifications_once_idx
  ON openproduct.notifications (subject_id, event_key);

-- The inbox's own read: this person's, newest first. Also the unread count's,
-- which is the same scan bounded by the cursor.
CREATE INDEX IF NOT EXISTS openproduct_notifications_inbox_idx
  ON openproduct.notifications (subject_id, created_at DESC);

-- THE CURSOR. One row per person who has ever pressed "Mark all as read";
-- absence means everything is unread, which is the correct answer for somebody
-- who has never opened the page.
CREATE TABLE IF NOT EXISTS openproduct.notification_reads (
  subject_id  TEXT        PRIMARY KEY,
  read_at     TIMESTAMPTZ NOT NULL
);

COMMENT ON TABLE openproduct.notifications IS
  'NF0 (openproduct-launch) — the on-site inbox, beside CB4''s outbox rather '
  'than inside it: that table exists to DELIVER (delivered_at, attempts, '
  'consumed by a sweep) and this one is a list a person reads. They also '
  'disagree about content — CB4''s mail names nobody because a name in a '
  'subject line is searchable and forwardable, while this list renders on a '
  'page that already shows the same names under the same rules. NO TEXT IS '
  'STORED: a row holds a kind and its referents, and the sentence is composed '
  'at read time from the contract''s phrasebook, because stored prose cannot '
  'be corrected without a backfill. FOUR KINDS, NOT THE DESIGN''S FIVE: '
  'follow.maker is refused, because FL0 promised people "a count only, never '
  'who they are, not even to you", and a per-follow message breaks that '
  'outright when it names the follower and quietly when it does not — a '
  'timestamp plus any other trace narrows a private act to a person.';

COMMENT ON TABLE openproduct.notification_reads IS
  'NF0 (openproduct-launch) — read state as a CURSOR rather than a flag per '
  'row. The only read action this product has is "Mark all as read", so a '
  'cursor makes the unread count one comparison instead of a column to keep in '
  'step, and rendering the inbox writes nothing at all. Absence means '
  'everything is unread, which is the right answer for somebody who has never '
  'opened the page.';
