-- 1800 — a mention is a KIND, not an address (openproduct-worldclass CV3).
--
-- The fourth entry in this CHECK, widened the same way 1500 widened it for
-- `digest`, and for the same reason: the outbox's kind vocabulary is closed in
-- SQL so a typo in a handler cannot queue a delivery the platform has no copy
-- for. A row with an unknown kind is a notification that would arrive blank.
--
-- WHAT DOES NOT CHANGE IS THE SHAPE, and that is the whole of I3 restated:
-- this table still holds a subject id and a word. No address, hashed or
-- otherwise, no name, and no line of anybody's post — the platform resolves
-- the id and renders the copy `NOTIFICATION_COPY` names. A mention is a new
-- thing to say about a conversation, not a new thing to know about a person.
--
-- `thread_id` is already nullable and is NOT null here: a mention is about a
-- conversation, so the link a reader follows is the thread's. And the unique
-- index on (subject_id, event_ref) is what keeps "once per event" true —
-- `mention:<postId>` is the ref, so a post that names somebody four times
-- collides with itself three times and sends once. That property arrives from
-- CB4 rather than being re-implemented here.

ALTER TABLE openproduct.notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_kind_check;

ALTER TABLE openproduct.notification_outbox
  ADD CONSTRAINT notification_outbox_kind_check
    CHECK (kind IN ('reply', 'answered', 'decision', 'digest', 'mention'));
