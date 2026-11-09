-- 1500_openproduct_digest_subscriptions (openproduct-commons LC5)
--
-- THE DIGEST BY EMAIL, AND THE ONE THING THIS SCHEMA STILL DOES NOT KNOW.
--
-- Context: openproduct
--
-- I3, RE-ASSERTED FOR THE SECOND TIME. CB4 established the shape: openproduct
-- holds an opaque subject id and a preference, the PLATFORM holds the address
-- and does the sending, and a schema that cannot hold an address cannot leak
-- one. This milestone is the same posture applied to a weekly send rather
-- than a per-event one, and it adds no column that changes it.
--
-- ─── WHY THIS TABLE EXISTS AT ALL, WHEN CB4 ALREADY HAS ONE ──────────────
--
-- `notification_prefs` uses ABSENCE = NOTIFY. That is correct there and would
-- be indefensible here, and the difference is the whole of this milestone's
-- consent model.
--
--   a discussion notification   is about something YOU DID. You posted in the
--                               thread; the message tells you what happened
--                               next in a conversation you joined. Opting out
--                               is the exceptional act, so the exception is
--                               what gets a row.
--
--   the weekly digest           is a BROADCAST. Nobody asked for it by acting.
--                               Sending it to everybody who ever signed in,
--                               and making them opt out, is how a directory
--                               becomes a mailing list somebody has to escape.
--
-- So this table is OPT-IN and its absence means SILENCE. Two tables with
-- opposite defaults is not an inconsistency to be tidied away later: the
-- defaults encode two different consents, and collapsing them into one switch
-- would have to pick one of the two to get wrong.
--
-- ─── UNSUBSCRIBING IS A ROW THAT SURVIVES ────────────────────────────────
--
-- `unsubscribed_at` rather than a DELETE, for one reason: somebody who
-- unsubscribes and later subscribes again should not look, to us, like
-- somebody who has never been asked. It also makes "how many people left
-- after the change we made in week 34" answerable, which is a question an
-- estate should be able to ask itself about its own sending.
--
-- The row still holds nothing but an opaque id and two timestamps. There is
-- no name, no address, no "reason for leaving" free-text box — the last of
-- which is the one that always gets added and always becomes a place people
-- type things about themselves that we then have to defend.
--
-- Additive and idempotent: no existing table is touched except the outbox's
-- `kind` CHECK, which is WIDENED (the same shape 1460 used for
-- activity_events).

CREATE TABLE IF NOT EXISTS openproduct.digest_subscriptions (
  -- Opaque, and the only thing about the person that exists here.
  subject_id      TEXT        PRIMARY KEY,

  subscribed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set when they leave. Never deleted: somebody who unsubscribes and returns
  -- is not somebody who has never been asked.
  unsubscribed_at TIMESTAMPTZ,

  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The send's own read: who is currently subscribed. A partial index, because
-- the unsubscribed rows are kept for history and are never sent to.
CREATE INDEX IF NOT EXISTS openproduct_digest_subscriptions_live_idx
  ON openproduct.digest_subscriptions (subject_id)
  WHERE unsubscribed_at IS NULL;

-- ─── The outbox learns one more kind ─────────────────────────────────────
--
-- WIDENED RATHER THAN REPLACED WITH OPEN TEXT. The CHECK is what stops a
-- caller inventing a kind nobody wrote copy for, and a weekly digest is a
-- fourth known kind rather than the beginning of an open vocabulary.
--
-- `thread_id` is already nullable and stays null for a digest: a digest is
-- not about a conversation. Nothing else about the outbox changes — the
-- unique index on (subject_id, event_ref) is what makes "one digest per
-- person per week" true, with `event_ref` being the week id, and that
-- property arrives for free from CB4 rather than being re-implemented here.

ALTER TABLE openproduct.notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_kind_check;

ALTER TABLE openproduct.notification_outbox
  ADD CONSTRAINT notification_outbox_kind_check
    CHECK (kind IN ('reply', 'answered', 'decision', 'digest'));

-- "Has this week already been queued?" — one indexed read, asked on every
-- cron tick before the send considers walking the subscriber list.
--
-- CB4's index is (subject_id, event_ref), which cannot answer a question
-- about `event_ref` alone: for a digest the ref is the SAME string for
-- everybody in a week, so the guard would degrade into a scan exactly as the
-- subscriber list grew. One extra index is cheaper than a weekly full scan,
-- and much cheaper than the alternative of re-walking every subscriber on
-- every tick because the guard was too expensive to ask.
CREATE INDEX IF NOT EXISTS openproduct_notification_outbox_event_idx
  ON openproduct.notification_outbox (event_ref);

COMMENT ON TABLE openproduct.digest_subscriptions IS
  'LC5 — who asked for the weekly digest. OPT-IN, and its absence means SILENCE: unlike '
  'notification_prefs (absence = notify), a digest is a BROADCAST nobody asked for by acting, and '
  'sending it to everybody who ever signed in would make a directory into a mailing list people '
  'have to escape. The two opposite defaults encode two different consents and collapsing them '
  'would have to get one of them wrong. I3 holds: an opaque subject id and two timestamps, no '
  'address of any kind, and deliberately no free-text "reason for leaving" — the field that always '
  'gets added and always becomes a place people type things about themselves we then must defend.';
