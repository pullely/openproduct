-- 1680_openproduct_launch_thread (openproduct-launch DQ0b)
--
-- ONE DISCUSSION PER LISTING, CREATED BY THE FIRST PERSON WHO SAYS SOMETHING.
--
-- Context: openproduct
--
-- ─── WHY A SEVENTH TAG AND NOT A SEVENTH TABLE ───────────────────────────
--
-- CB0 built threads and posts, and the design draws a comment box directly on
-- a product page: no title, no tag, no "start a discussion" — you type and you
-- have said something. That is not a different OBJECT from a thread; it is a
-- thread nobody was asked to name. Every rule already written about a thread
-- applies to it unchanged: TS3 removes it through the same ledger, TS2's
-- velocity limits gate the same write, CB4 notifies the same participants, and
-- the render subset is the same subset. A parallel `comments` table would have
-- been all of those rules again, diverging from the day one of them changed.
--
-- ─── WHY `launch` IS NOT IN THE CHOOSABLE SIX ────────────────────────────
--
-- CB-3's six tags are what a person PICKS when they start a discussion, and
-- `launch` is picked by nobody: it is written by the system the first time
-- somebody comments on a product page. It is admitted here, and deliberately
-- absent from `THREAD_TAGS` in the contract, so the composer's select cannot
-- offer it and a hand-made second one cannot exist.
--
-- ─── AT MOST ONE, ENFORCED BY THE DATABASE ───────────────────────────────
--
-- The partial unique index below is the whole guarantee. Two people commenting
-- on a quiet listing within the same second is the ordinary case, not the
-- exotic one, and a handler that read-then-wrote would make two threads for
-- them — after which the page shows one and the other is unreachable, holding
-- somebody's words. With the index, the loser of that race gets a conflict it
-- can turn into "use the one that exists", which is what the caller wants
-- anyway.
--
-- REMOVED THREADS ARE OUTSIDE THE INDEX, and that is the one judgement call
-- here. If a launch thread is removed under TS3, this lets the next commenter
-- open a new one rather than posting into a tombstone or being silently
-- refused. Removal ends a conversation; it does not close the product to
-- conversation for ever, and a moderator who wants that has `locked` — which
-- STAYS inside the index, because a locked thread is the answer to "can I
-- comment here" and replacing it would be a way around the lock.
--
-- Additive and idempotent. The check is REPLACED rather than dropped-and-added
-- so a row already in the table cannot fall between the two statements.

ALTER TABLE openproduct.threads
  DROP CONSTRAINT IF EXISTS threads_tag_check;

ALTER TABLE openproduct.threads
  ADD CONSTRAINT threads_tag_check
  CHECK (tag IN (
    'design', 'proposal', 'question', 'governance', 'contributing',
    'accessibility',
    -- DQ0b — written by the system, never chosen by a person.
    'launch'
  ));

-- At most one LIVE launch thread per listing. `state <> 'removed'` rather than
-- `state = 'open'`: an answered or locked launch thread is still the one this
-- listing has, and a second one beside it would split the conversation.
CREATE UNIQUE INDEX IF NOT EXISTS openproduct_threads_one_launch
  ON openproduct.threads (profile_id)
  WHERE tag = 'launch' AND state <> 'removed';

COMMENT ON INDEX openproduct.openproduct_threads_one_launch IS
  'DQ0b (openproduct-launch) — a listing has at most one launch thread. The '
  'index is the guarantee rather than a handler check, because two people '
  'commenting within the same second is the ordinary case and a read-then-'
  'write would give them a thread each. Removed threads are outside it so a '
  'listing whose discussion was removed can have another; locked ones are '
  'inside it, because replacing a locked thread would be a way around the lock.';
