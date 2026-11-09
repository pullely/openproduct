-- 1510_openproduct_appeals: the answer to an act (openproduct-commons TS5).
--
-- Context: openproduct
-- Epic: openproduct-commons — TS5, the last half of the trust cluster.
--
-- 1330 wrote `moderation_acts` append-only, with a `reason` that is NOT NULL,
-- and said why in its own header: "an act nobody wrote a reason for is an act
-- nobody can appeal". That sentence was written before anything on this
-- estate could act, and everything since has been built to keep it true — the
-- ledger-first ordering in every handler, the tombstone that renders instead
-- of a 404, the CHECK that refuses an automated removal. This table is the
-- part that sentence was pointing at.
--
-- ─── WHY AN APPEAL IS A ROW AND NOT AN EMAIL ──────────────────────────────
--
-- The cheap version of TS-4 is a mail address in a footer. It is worse than
-- nothing here, for one reason: it produces no number. TS-4 says every act is
-- appealable AND COUNTED IN PUBLIC, and a mailbox cannot be counted — which
-- means the published transparency report would show removals with no
-- denominator, and an estate that publishes its removals and not its
-- reversals is publishing a boast. So an appeal is a row, in the same
-- database as the act it answers, and TS5's report reads both.
--
-- ─── THE APPEAL POINTS AT THE ACT, NOT AT THE CONTENT ─────────────────────
--
-- `act_id` rather than a slug, and the difference is load-bearing. A listing
-- delisted in March and removed in June has been acted on TWICE, and an
-- appeal against "the listing" cannot say which one it disputes — so an
-- upheld one cannot say what to reverse. Naming the act makes the reversal
-- mechanical: 1330 paired the vocabulary (remove/restore, delist/relist,
-- deindex/reindex) precisely so that every act has an undo with a name, and
-- this is the milestone that finally spends that pairing.
--
-- Opaque, no FK, for the reason every other reference in this schema is
-- opaque: `moderation_acts` is append-only and outlives everything, and a
-- foreign key here would let a retention policy on one table quietly rewrite
-- the other. `subject_kind` and `subject_ref` are COPIED rather than joined
-- for the same reason — an appeal must remain readable after the thing it
-- concerns is gone, which is exactly the case where it matters most.
--
-- ─── WHAT IS NOT APPEALABLE, AND WHY THAT IS NOT A LOOPHOLE ───────────────
--
-- Three classes, and none of them is a person being denied an answer:
--
--   the reversals    `restore`, `relist`, `reindex`. Nobody was harmed; the
--                    act was in the appellant's favour.
--   the outcomes     `appeal_upheld`, `appeal_refused`. Appealing an appeal
--                    is infinite regress with a queue attached.
--   `report_declined` The person affected is the REPORTER, and they already
--                    have a route: 1330's unique index is partial on the open
--                    states, so a declined report can simply be filed again
--                    with more detail. Building a second channel for the same
--                    request would double the queue and give the reporter a
--                    standing conversation about somebody else's content,
--                    which is precisely what TS3 kept them out of.
--
-- The CHECK below does not encode that list. The contract does, and the
-- handler refuses at the door; putting the vocabulary here as well would give
-- it two homes and one day two answers. What the database enforces is what
-- only the database can: that a decided appeal names its decider and its
-- moment, and an open one names neither.
--
-- ─── ONE OPEN APPEAL PER ACT, AND ONE ATTEMPT PER PERSON ──────────────────
--
-- A partial unique index on the open state stops the same act being appealed
-- twice while the first is still waiting — the same shape 1330 used for open
-- reports, and for the same reason: re-filing is not a second signal, it is
-- the same person again.
--
-- A REFUSED APPEAL CANNOT BE RE-FILED, and that is a deliberate asymmetry
-- with reports. A report re-filed is new information about content; an appeal
-- re-filed is the same argument to the same reader, and permitting it turns
-- the queue into a place one determined person can occupy indefinitely. The
-- handler enforces it by looking for ANY prior appeal by that subject against
-- that act, and the index above only covers the open ones — so the rule lives
-- in one place with a sentence beside it, rather than being half-enforced by
-- an index whose shape nobody can read back.
--
-- Additive and idempotent: no existing table, index, or constraint is touched.

CREATE TABLE IF NOT EXISTS openproduct.appeals (
  id                    UUID        PRIMARY KEY,

  -- The moderation_acts row being disputed. Opaque, no FK — see the header.
  act_id                UUID        NOT NULL,

  -- Copied from the act, so an appeal stays readable after the thing it
  -- concerns has gone. Same closed vocabulary 1330 uses.
  subject_kind          TEXT        NOT NULL,
  subject_ref           TEXT        NOT NULL,

  -- Who is appealing. Required, and checked against standing at the door:
  -- TS-4 says "appealable by the person it affected", so a maintainer of the
  -- listing, not anybody signed in. Standing lives in listing_maintainers and
  -- is not duplicated here.
  appellant_subject_id  TEXT        NOT NULL,

  -- What they say. NOT NULL and bounded at the write boundary, exactly like
  -- the reason on the act it answers. An appeal with no argument is a button,
  -- and a button is not a hearing — it also gives the person deciding nothing
  -- to be persuaded by, which makes refusal the path of least resistance.
  says                  TEXT        NOT NULL,

  --   open     nobody has decided
  --   upheld   the act was wrong; it has been reversed
  --   refused  the act stands
  state                 TEXT        NOT NULL DEFAULT 'open',

  -- The `appeal_upheld` / `appeal_refused` ledger row recording the decision.
  -- Every outcome writes one: TS-4 counts every act, and a decision that
  -- resolved an appeal without appearing in the ledger would make the
  -- published totals understate what we actually decided.
  outcome_act_id        UUID,

  -- The `restore` / `relist` / `reindex` row, when upheld. SEPARATE from the
  -- outcome, because they are two different facts and a reader of the ledger
  -- needs both: that we agreed, and that the content actually came back.
  --
  -- Nullable even when upheld, and that is not sloppiness. An act can be
  -- reversed by somebody else between the appeal being filed and being
  -- decided — a triager restoring the listing on their own — and in that case
  -- the judgement still stands while there is nothing left to undo. A NOT
  -- NULL here would force the handler to invent a reversal act that reversed
  -- nothing, which is a false row in an append-only ledger.
  reversal_act_id       UUID,

  filed_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at            TIMESTAMPTZ,
  decided_by            TEXT,

  CONSTRAINT appeals_state_check
    CHECK (state IN ('open', 'upheld', 'refused')),

  CONSTRAINT appeals_subject_kind_check
    CHECK (subject_kind IN ('listing', 'profile', 'thread', 'post', 'collection', 'subject')),

  -- A decided appeal names WHO decided it, WHEN, and the ledger row that
  -- records the decision; an open one names none of the three. This is the
  -- one rule only the database can hold, because it is the one a handler
  -- crashing half-way through would otherwise break silently.
  CONSTRAINT appeals_decision_consistent
    CHECK (
      (state = 'open'
        AND decided_at IS NULL AND decided_by IS NULL AND outcome_act_id IS NULL)
      OR (state IN ('upheld', 'refused')
        AND decided_at IS NOT NULL AND decided_by IS NOT NULL AND outcome_act_id IS NOT NULL)
    ),

  -- A refusal reverses nothing. Only an upheld appeal may carry a reversal,
  -- and an open one certainly may not.
  CONSTRAINT appeals_reversal_only_when_upheld
    CHECK (state = 'upheld' OR reversal_act_id IS NULL)
);

-- One OPEN appeal per act. Re-filing while the first is still waiting is the
-- same person again, not a second signal — the same reasoning, and the same
-- index shape, as 1330's open-report guard.
CREATE UNIQUE INDEX IF NOT EXISTS openproduct_appeals_open_unique_idx
  ON openproduct.appeals (act_id)
  WHERE state = 'open';

-- The queue's own read: oldest open first, because a queue worked
-- newest-first never reaches its tail, and the appeals it never reaches are
-- the ones from people who have already been waiting longest.
CREATE INDEX IF NOT EXISTS openproduct_appeals_queue_idx
  ON openproduct.appeals (filed_at)
  WHERE state = 'open';

-- "Have I appealed this, and where did it get to" — the appellant's own read,
-- and the one that enforces the no-re-filing rule.
CREATE INDEX IF NOT EXISTS openproduct_appeals_appellant_idx
  ON openproduct.appeals (appellant_subject_id, act_id);

-- TS5's transparency report aggregates by period and outcome; this is that
-- read, and it is deliberately the same shape as 1330's acts-by-period index.
CREATE INDEX IF NOT EXISTS openproduct_appeals_period_idx
  ON openproduct.appeals (filed_at DESC, state);

COMMENT ON TABLE openproduct.appeals IS
  'The answer to a moderation act (openproduct-commons TS5/TS-4). A ROW rather than a mail '
  'address, because TS-4 says every act is appealable AND COUNTED IN PUBLIC and a mailbox '
  'produces no number — an estate that publishes its removals and not its reversals is '
  'publishing a boast. Points at the ACT, not the content: a listing delisted in March and '
  'removed in June has been acted on twice, and an appeal against "the listing" cannot say '
  'which one it disputes, so an upheld one cannot say what to reverse. Opaque act_id, and '
  'subject_kind/subject_ref copied rather than joined, so an appeal stays readable after the '
  'thing it concerns is gone — the case where it matters most.';

COMMENT ON COLUMN openproduct.appeals.reversal_act_id IS
  'The restore/relist/reindex row, when upheld — SEPARATE from outcome_act_id because they are '
  'two different facts a reader of the ledger needs both of: that we agreed, and that the '
  'content actually came back. Nullable even when upheld, because somebody else may have '
  'reversed the act while the appeal was waiting, and a NOT NULL here would force a false row '
  'into an append-only ledger.';

COMMENT ON COLUMN openproduct.appeals.says IS
  'What the appellant argues. NOT NULL and bounded at the write boundary, like the reason on '
  'the act it answers: an appeal with no argument is a button rather than a hearing, and it '
  'gives the person deciding nothing to be persuaded by, which makes refusal the path of least '
  'resistance.';
