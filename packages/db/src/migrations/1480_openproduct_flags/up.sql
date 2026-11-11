-- 1480_openproduct_flags (openproduct-commons TS4)
--
-- WHAT A MACHINE NOTICED, ADDRESSED TO A PERSON.
--
-- Context: openproduct
--
-- TS0 built the queue a report lands in. TS4 adds the detectors, and the
-- first question is whether their output belongs in that same table. It does
-- not, and the reason is not tidiness.
--
-- A REPORT AND A FLAG ARE DIFFERENT CLAIMS.
--
--   A report is a PERSON saying "look at this". 1330's header explains why it
--   names its reporter: standing is TS-1's first layer, and an anonymous
--   report has no accountability while a flood of them attacks the queue
--   itself. Every property of that table follows from a person being behind
--   the row.
--
--   A flag is a DETECTOR saying "this matched a pattern". It has no standing
--   and claims none. It must be idempotent, because the sweep runs on a cron
--   and must not file the same observation every hour. It must be countable
--   in aggregate, because TS4's whole defensibility rests on a measurable
--   false-positive rate, and mixing machine output into report statistics
--   would make both numbers meaningless.
--
-- Writing detector output into `reports` with a reporter of 'automatic' would
-- have been fewer lines and would have quietly destroyed both numbers: "we
-- received 4,000 reports this quarter" would have meant "a cron ran".
--
-- ─── THE TABLE CANNOT EXPRESS A REMOVAL ──────────────────────────────────
--
-- TS-5 says only a person removes, and 1330 already enforces it with a CHECK
-- on `moderation_acts`. TS4 is the milestone most likely to erode that rule,
-- because it is the one holding the detectors, so the rule is made structural
-- twice over: the contract's `FlagConsequence` type has no member that
-- deletes, and `flags_consequence_check` below refuses the value at the
-- database. A flag that wanted to remove something could not be stored.
--
-- ─── ONE FLAG PER PATTERN PER THING, FOREVER ─────────────────────────────
--
-- A partial unique index over (subject_kind, subject_ref, kind) WHERE
-- state = 'open'. The sweep re-raises every run; this collapses the re-raise
-- into the row already sitting in the queue. When a triager resolves it, a
-- LATER recurrence can raise a fresh flag — which is right: a listing flagged,
-- dismissed, rewritten and flagged again is a new observation, and hiding it
-- would make dismissal permanent immunity.
--
-- ─── `dismissed` IS A FIRST-CLASS OUTCOME AND IS COUNTED ─────────────────
--
-- A triager saying "this was wrong" is the only measurement of the
-- false-positive rate that comes from production rather than from a fixture.
-- A queue whose only outcomes are "acted" and "still open" cannot report on
-- itself, and a detector that cannot be shown to be wrong is a detector
-- nobody can argue with.
--
-- NO SCORE COLUMN. The evidence is prose, quoting what was found. A number
-- beside an accusation invites acting on the number, and a triager who reads
-- "0.94" learns nothing they could check.
--
-- NO SUBJECT IDS IN THE EVIDENCE, by construction of the writers: a cohort
-- flag says "four accounts", never which four. EN-4 says there is no
-- per-person integrity record anywhere, and a moderation queue is somewhere.
--
-- Additive and idempotent: no existing table, index, or constraint is touched.

CREATE TABLE IF NOT EXISTS openproduct.flags (
  id            UUID        PRIMARY KEY,

  -- Which detector. Closed vocabulary, mirroring the contract's FLAG_KINDS:
  --   filler   a pitch long enough to judge with no specific detail in it
  --   cohort   accounts that arrived together, acted once, and went quiet
  --   ring     EN3's co-occurrence finding, surfaced to a human
  --   brigade  most of a launch's endorsements from accounts younger than it
  kind          TEXT        NOT NULL,

  -- What it is about. Opaque kind + public ref, exactly as `reports` does, so
  -- a flag survives the thing it flagged.
  subject_kind  TEXT        NOT NULL,
  subject_ref   TEXT        NOT NULL,

  --   open      nobody has looked
  --   actioned  a human acted; the act itself is in moderation_acts
  --   dismissed a human decided the detector was wrong. COUNTED — see header.
  state         TEXT        NOT NULL DEFAULT 'open',

  -- What the detector will say to a triager, in prose, quoting the text or
  -- reporting the shape. Never a score, never a subject id.
  evidence      TEXT        NOT NULL,

  -- What was done automatically at the moment of raising, if anything. One of
  -- 'deindex', 'discount' or 'queue-only'. Recorded on the flag so a triager
  -- reading the queue can see what has ALREADY happened to the thing they are
  -- looking at, without which "restore it" is an instruction nobody can
  -- follow.
  consequence   TEXT        NOT NULL,

  raised_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ,
  resolved_by   TEXT,

  CONSTRAINT flags_kind_check
    CHECK (kind IN ('filler', 'cohort', 'ring', 'brigade')),
  CONSTRAINT flags_subject_kind_check
    CHECK (subject_kind IN ('listing', 'profile', 'thread', 'post', 'collection', 'launch')),
  CONSTRAINT flags_state_check
    CHECK (state IN ('open', 'actioned', 'dismissed')),
  -- TS-5, at the database, for the second time. The contract's type already
  -- has no member that deletes; this is the same guarantee where a handler
  -- bypassing the contract still meets it.
  CONSTRAINT flags_consequence_check
    CHECK (consequence IN ('deindex', 'discount', 'queue-only')),
  CONSTRAINT flags_evidence_present
    CHECK (length(trim(evidence)) > 0),
  -- A resolved flag names who resolved it and when; an open one names
  -- nobody. The same coherence rule `reports` carries.
  CONSTRAINT flags_resolution_coherent
    CHECK (
      (state = 'open' AND resolved_at IS NULL AND resolved_by IS NULL)
      OR (state IN ('actioned', 'dismissed') AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
    )
);

-- The re-raise collapses into the open row. See the header: a resolved flag
-- does NOT block a later one, because dismissal is not permanent immunity.
CREATE UNIQUE INDEX IF NOT EXISTS openproduct_flags_open_unique_idx
  ON openproduct.flags (subject_kind, subject_ref, kind)
  WHERE state = 'open';

-- The queue's read: oldest open first, for the same reason `reports` is
-- worked oldest-first — a queue worked newest-first never reaches its tail.
CREATE INDEX IF NOT EXISTS openproduct_flags_queue_idx
  ON openproduct.flags (raised_at)
  WHERE state = 'open';

-- "What has been noticed about this thing" — the question a triager asks
-- with a report already open in front of them.
CREATE INDEX IF NOT EXISTS openproduct_flags_subject_idx
  ON openproduct.flags (subject_kind, subject_ref, raised_at DESC);

-- TS5's transparency report counts flags by kind and outcome over a period,
-- which is where the production false-positive rate comes from.
CREATE INDEX IF NOT EXISTS openproduct_flags_period_idx
  ON openproduct.flags (raised_at DESC, kind, state);

-- ─── The sweep's floor ───────────────────────────────────────────────────
--
-- The same shape as EN3's `integrity_sweep_state` and DS0's index state, for
-- the same reason each of them gave: the cron cadence is per-environment
-- configuration this repository cannot see, and a floor held in worker memory
-- is a floor per isolate.
--
-- A SEPARATE ROW FROM EN3's rather than a second column on it. The two sweeps
-- read different things over different windows and will not stay on one
-- cadence, and one row holding both means changing one cadence risks the
-- other. EN3's own header made this argument against sharing DS0's row.
CREATE TABLE IF NOT EXISTS openproduct.defence_sweep_state (
  singleton BOOLEAN     NOT NULL DEFAULT TRUE,
  swept_at  TIMESTAMPTZ,

  CONSTRAINT defence_sweep_state_pk PRIMARY KEY (singleton),
  CONSTRAINT defence_sweep_state_singleton CHECK (singleton)
);

INSERT INTO openproduct.defence_sweep_state (singleton, swept_at)
VALUES (TRUE, NULL)
ON CONFLICT (singleton) DO NOTHING;

COMMENT ON TABLE openproduct.flags IS
  'TS4 — what a detector noticed, addressed to a person. Deliberately NOT openproduct.reports: a report is a person saying "look at this" and carries standing, a flag is a machine saying "this matched a pattern" and carries none. Mixing them would make both counts meaningless, and TS4''s defensibility rests on a measurable false-positive rate. A CHECK refuses any consequence that deletes, which is TS-5 enforced at the database for the second time (the contract''s type is the first).';

COMMENT ON COLUMN openproduct.flags.evidence IS
  'Prose a triager can check in one look, quoting the text or reporting the shape. Never a score — a number beside an accusation invites acting on the number — and never a subject id (EN-4).';

COMMENT ON TABLE openproduct.defence_sweep_state IS
  'TS4 — the defence sweep''s floor. Separate from EN3''s integrity_sweep_state because the two read different things over different windows and will not stay on one cadence.';
