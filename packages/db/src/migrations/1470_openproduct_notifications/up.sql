-- 1470_openproduct_notifications: telling people something happened, without
-- ever learning how to reach them (openproduct-commons CB4).
--
-- Context: openproduct
-- Epic: openproduct-commons — CB4.
--
-- I3, WHICH IS THE WHOLE SHAPE OF THIS: no address is stored here. Not an
-- email, not a phone number, not a push token, not a hashed one. openproduct
-- holds an opaque subject id and a preference; the PLATFORM holds the address
-- and does the sending. A schema that cannot hold an address cannot leak one,
-- and cannot grow a "just this once" export either.
--
-- WHO IS NOTIFIED IS DERIVED, NOT STORED. There is no subscriptions table,
-- deliberately: participation IS the subscription — you posted in the thread,
-- or you started it. A subscription row would be a second source of truth
-- about who cares, and the first time it disagreed with the posts it would be
-- silently wrong in whichever direction is worse.
--
-- WHAT IS STORED IS THE OPPOSITE — the people who have said STOP. A mute
-- cannot be derived from anything, so it is a row; and a mute is the one
-- notification fact somebody has actually asked us to remember.

-- ─── preferences ─────────────────────────────────────────────────────────

-- ABSENCE OF A ROW MEANS "NOTIFY", the same posture 1330 took for
-- trust_levels: writing a row for every subject who signs in would make this
-- a shadow user directory, which openproduct does not keep. Only somebody who
-- has changed the default appears here at all.
CREATE TABLE IF NOT EXISTS openproduct.notification_prefs (
  subject_id  TEXT        PRIMARY KEY,
  -- One switch, not a matrix. A per-kind preference grid is a settings page
  -- nobody finishes reading and a rule nobody can predict; the kinds this
  -- estate sends are all "something happened in a conversation you are in",
  -- and somebody who does not want one does not want the others.
  muted       BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── per-thread mute ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS openproduct.thread_mutes (
  subject_id  TEXT        NOT NULL,
  thread_id   UUID        NOT NULL
                REFERENCES openproduct.threads (id) ON DELETE CASCADE,
  muted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (subject_id, thread_id)
);

-- ─── the outbox ──────────────────────────────────────────────────────────

-- WHY AN OUTBOX AND NOT A DIRECT CALL. Notifying is a side effect of a write
-- that has already happened: the post is in the thread whether or not the
-- seam answers. Calling out inline would either fail the post because a
-- notifier was down — losing something a person wrote to save a message they
-- would have got anyway — or swallow the error and lose the message silently.
-- A row lets the write commit and the delivery be retried.
CREATE TABLE IF NOT EXISTS openproduct.notification_outbox (
  id            UUID        PRIMARY KEY,

  -- Opaque, and it is the ONLY thing about the person that exists here. The
  -- platform resolves it to an address at delivery time and openproduct never
  -- sees the result.
  subject_id    TEXT        NOT NULL,

  --   reply      somebody posted in a thread you are in
  --   answered   a maintainer marked an answer in your thread
  --   decision   your offer to contribute was decided
  kind          TEXT        NOT NULL,

  thread_id     UUID        REFERENCES openproduct.threads (id) ON DELETE CASCADE,

  -- What caused it. Part of the uniqueness below, which is what makes
  -- "notified once per event" a property of the schema rather than of every
  -- caller remembering to check.
  event_ref     TEXT        NOT NULL,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at  TIMESTAMPTZ,
  -- Bounded, so a permanently failing row stops being retried forever rather
  -- than becoming a queue that only grows.
  attempts      SMALLINT    NOT NULL DEFAULT 0,

  CONSTRAINT notification_outbox_kind_check
    CHECK (kind IN ('reply', 'answered', 'decision'))
);

-- ONCE PER EVENT PER PERSON, as a constraint rather than a convention. A
-- retry, a double-delivered seam event, or two workers racing all collide
-- here instead of sending somebody the same message twice.
CREATE UNIQUE INDEX IF NOT EXISTS openproduct_notification_outbox_once_idx
  ON openproduct.notification_outbox (subject_id, event_ref);

-- The sweep's own read: undelivered, oldest first, still worth trying.
CREATE INDEX IF NOT EXISTS openproduct_notification_outbox_pending_idx
  ON openproduct.notification_outbox (created_at)
  WHERE delivered_at IS NULL;

COMMENT ON TABLE openproduct.notification_prefs IS
  'One switch per person who has changed the default (openproduct-commons CB4). Absence means '
  'NOTIFY — the trust_levels posture: a row per signed-in subject would make this a shadow user '
  'directory. Not a per-kind matrix: the kinds are all "something happened in a conversation you '
  'are in", and somebody who does not want one does not want the others.';

COMMENT ON TABLE openproduct.notification_outbox IS
  'Queued notifications (openproduct-commons CB4). I3: subject_id is the ONLY thing about the '
  'person here — no address of any kind, hashed or otherwise. The platform resolves the id and '
  'sends; openproduct never learns how anybody is reached. An OUTBOX rather than an inline call '
  'because notifying is a side effect of a write that already happened: a post must not fail '
  'because a notifier is down, and must not lose the message silently either. The unique index '
  'makes "once per event per person" a property of the schema rather than of every caller.';

COMMENT ON TABLE openproduct.thread_mutes IS
  'Who has said stop, for one thread (openproduct-commons CB4). Stored because a mute cannot be '
  'derived from anything — unlike participation, which IS the subscription and is derived from '
  'the posts rather than duplicated into a table that could disagree with them.';
