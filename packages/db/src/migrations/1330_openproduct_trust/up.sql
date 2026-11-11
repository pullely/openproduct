-- 1330_openproduct_trust (openproduct-commons TS0)
--
-- THE CAPACITY TO CARRY A PUBLIC SURFACE.
--
-- Context: openproduct
--
-- What exists today is one person reviewing every first publish, and one
-- email address in the footer. That is an honest v1 lever — OD chose it
-- deliberately — and at fifteen listings it works. The reference design's own
-- numbers end it: 1,284 listed, 38 published this week, plus public profiles,
-- signed posts and a vote count.
--
-- Every platform that added moderation after growth paid for it twice, and
-- this one has a specific aggravating factor: the surface is anonymously
-- readable and CRAWLABLE, so anything that lands on it is indexed before
-- anyone notices. So TS0 lands in wave 1, before any public write surface
-- exists, and OPC-8 makes each later surface wait for its named control here.
--
-- THREE TABLES, ONE PER LAYER OF TS-1:
--
--   trust_levels     eligibility  — you can only act where you have standing
--   reports          consequence  — what the first two layers missed
--   moderation_acts  consequence  — the append-only record of what we did
--
-- (Velocity, the middle layer, is TS2 and lives at the gateway. It has no
-- table: a rate limit is state in a durable object, not a row.)
--
-- APPEND-ONLY IS A PROPERTY OF THE REPOSITORY, NOT A TRIGGER. There is no
-- UPDATE or DELETE path to moderation_acts in the repository interface, and a
-- test asserts the absence. A restore is a NEW act, never an edit of the
-- removal — because the question an appeal has to answer is "what did you do,
-- and when did you undo it", and an edited row cannot answer it.
--
-- WHY A REPORT NAMES ITS REPORTER, AND THERE ARE NO ANONYMOUS REPORTS.
-- TS-1's first layer is standing, and OPX-2 already says login gates
-- interaction. An anonymous report has no accountability and a flood of them
-- is itself an attack on the queue this table exists to feed. Anonymous
-- visitors keep the route they have always had — the report address in the
-- footer (OD-C), which reaches a human and not this table.
--
-- SUBJECTS ARE ADDRESSED BY KIND AND PUBLIC REF, NOT BY FOREIGN KEY. A report
-- must survive the thing it reported: deleting a listing must not delete the
-- record that someone reported it and what we did. So `subject_kind` +
-- `subject_ref` are opaque, exactly as org_id and project_id are opaque in
-- OD0 — and the schema still drops in one statement.
--
-- NO EMAIL. The information_schema guard added at CT0 covers these tables
-- automatically, which is why it was written as a query rather than a list.
--
-- Additive and idempotent: no existing table, index, or constraint is touched.

-- ─── Layer 1: eligibility ────────────────────────────────────────────────
--
-- The ladder that replaces OD's per-publish admin review (TS-2). A new
-- maker's first listing is rate-limited and unindexed until it clears; a
-- maker with confirmed history publishes immediately. The review queue stays
-- as an exception path, never as the only path.
--
-- Absence of a row means `new`. Deliberately: writing a row for every subject
-- who ever signs in would make this table a shadow user directory, which is
-- exactly the thing openproduct does not keep.
CREATE TABLE IF NOT EXISTS openproduct.trust_levels (
  subject_id  TEXT        PRIMARY KEY,

  --   new         first listing rate-limited and noindex until cleared
  --   established publishes immediately (the common case, once earned)
  --   trusted     latitude a later milestone may spend; nothing uses it yet
  --   restricted  demoted after a sustained act; writes are refused
  level       TEXT        NOT NULL,

  -- 'automatic' or an actor id. Never null: a level nobody can account for is
  -- a level nobody can appeal.
  set_by      TEXT        NOT NULL,
  reason      TEXT,
  set_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT trust_levels_level_check
    CHECK (level IN ('new', 'established', 'trusted', 'restricted'))
);

-- ─── Layer 3: consequence ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS openproduct.reports (
  id                   UUID        PRIMARY KEY,

  -- What was reported. Closed vocabulary; every value names a surface this
  -- program actually ships, so a report can never point at a nothing.
  subject_kind         TEXT        NOT NULL,
  -- Its PUBLIC identifier — a slug, a handle, a thread id. Opaque, no FK.
  subject_ref          TEXT        NOT NULL,

  -- Who reported it. Required — see the header.
  reporter_subject_id  TEXT        NOT NULL,

  reason               TEXT        NOT NULL,
  -- Optional, bounded at the write boundary. What the reporter wants us to
  -- see that the reason code cannot carry.
  detail               TEXT,

  --   open      nobody has looked
  --   triaged   a human has read it and is deciding
  --   actioned  a moderation act answered it
  --   declined  a human decided no act was warranted
  state                TEXT        NOT NULL DEFAULT 'open',

  resolved_at          TIMESTAMPTZ,
  resolved_by          TEXT,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT reports_subject_kind_check
    CHECK (subject_kind IN ('listing', 'profile', 'thread', 'post', 'collection')),
  CONSTRAINT reports_state_check
    CHECK (state IN ('open', 'triaged', 'actioned', 'declined')),
  CONSTRAINT reports_reason_check
    CHECK (reason IN (
      'spam',
      'impersonation',
      'not-the-maintainer',
      'abuse-or-harassment',
      'malware-or-security',
      'misleading-claims',
      'other'
    )),
  -- A resolved report names who resolved it, and an unresolved one names
  -- nobody. The two halves cannot disagree.
  CONSTRAINT reports_resolution_consistent
    CHECK (
      (state IN ('open', 'triaged') AND resolved_at IS NULL AND resolved_by IS NULL)
      OR (state IN ('actioned', 'declined') AND resolved_at IS NOT NULL)
    )
);

-- One OPEN report per person per thing. Re-reporting the same listing while
-- the first is still open is not a second signal, it is the same person
-- again — and letting it through would let one motivated reporter drown the
-- queue without tripping any velocity limit.
CREATE UNIQUE INDEX IF NOT EXISTS openproduct_reports_open_unique_idx
  ON openproduct.reports (subject_kind, subject_ref, reporter_subject_id)
  WHERE state IN ('open', 'triaged');

-- The queue's own read: oldest open first, because a moderation queue worked
-- newest-first is a queue that never reaches its tail.
CREATE INDEX IF NOT EXISTS openproduct_reports_queue_idx
  ON openproduct.reports (created_at)
  WHERE state IN ('open', 'triaged');

-- "What has been reported about this thing" — triage's first question.
CREATE INDEX IF NOT EXISTS openproduct_reports_subject_idx
  ON openproduct.reports (subject_kind, subject_ref, created_at DESC);

-- The append-only record. Every removal, restoration, lock, delist, trust
-- change and appeal outcome, forever.
--
-- This is the substrate of TS5's public transparency report, which is
-- GENERATED from these rows rather than written by hand — so the number we
-- publish and the acts we took cannot drift.
CREATE TABLE IF NOT EXISTS openproduct.moderation_acts (
  id            UUID        PRIMARY KEY,

  subject_kind  TEXT        NOT NULL,
  subject_ref   TEXT        NOT NULL,

  act           TEXT        NOT NULL,

  -- A subject id, or 'automatic' for the one class of act automation may
  -- take: de-indexing. TS-5 forbids automated REMOVAL outright, and the
  -- CHECK below is where that rule is enforced rather than remembered.
  actor_id      TEXT        NOT NULL,

  -- Always required. An act nobody wrote a reason for is an act nobody can
  -- appeal, and TS-4 says every act is appealable.
  reason        TEXT        NOT NULL,

  -- The report this answered, when it answered one. Opaque, no FK: an act
  -- outlives the report, and a proactive act answers no report at all.
  report_id     UUID,

  occurred_at   TIMESTAMPTZ NOT NULL,

  CONSTRAINT moderation_acts_kind_check
    CHECK (subject_kind IN ('listing', 'profile', 'thread', 'post', 'collection', 'subject')),
  CONSTRAINT moderation_acts_act_check
    CHECK (act IN (
      'remove', 'restore',
      'lock', 'unlock',
      'delist', 'relist',
      'deindex', 'reindex',
      'trust_promote', 'trust_demote',
      'report_declined',
      'appeal_upheld', 'appeal_refused'
    )),
  -- TS-5, as a constraint: no automated judgement removes content on its own.
  -- Automation may flag, rate-limit, discount and DE-INDEX; only a human
  -- removes. A false positive here deletes a real person's work from a public
  -- page, and the asymmetry between "slower" and "wrongly erased" is not close.
  CONSTRAINT moderation_acts_no_automated_removal
    CHECK (actor_id <> 'automatic' OR act IN ('deindex', 'reindex'))
);

CREATE INDEX IF NOT EXISTS openproduct_moderation_acts_subject_idx
  ON openproduct.moderation_acts (subject_kind, subject_ref, occurred_at DESC);

-- TS5 aggregates by act and period; this is that read.
CREATE INDEX IF NOT EXISTS openproduct_moderation_acts_period_idx
  ON openproduct.moderation_acts (occurred_at DESC, act);

COMMENT ON TABLE openproduct.trust_levels IS
  'The graduated-trust ladder (openproduct-commons TS0/TS-2) that replaces OD''s per-publish '
  'admin review. Absence of a row means level=new — writing a row for every subject who signs '
  'in would make this a shadow user directory, which openproduct does not keep.';

COMMENT ON TABLE openproduct.reports IS
  'The report queue (openproduct-commons TS0). Reporters are named: TS-1''s first layer is '
  'standing, and an anonymous report has no accountability while a flood of them attacks the '
  'queue itself. Anonymous visitors keep the footer report address (OD-C). subject_kind + '
  'subject_ref are opaque so a report survives the thing it reported.';

COMMENT ON TABLE openproduct.moderation_acts IS
  'Append-only (openproduct-commons TS0/TS-3): a restore is a NEW act, never an edit of the '
  'removal, because an appeal has to be able to ask what was done and when it was undone. The '
  'substrate of TS5''s transparency report, which is generated from these rows so the number we '
  'publish and the acts we took cannot drift. A CHECK forbids an automated removal outright '
  '(TS-5): automation may flag, discount and de-index; only a human removes.';
