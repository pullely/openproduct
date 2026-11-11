-- 1340_openproduct_signals (openproduct-commons SN0)
--
-- WHERE THE NUMBERS COME FROM, AND HOW OLD THEY ARE ALLOWED TO GET.
--
-- Context: openproduct
--
-- The reference design renders `38 commits this week`, `241 ✓`, `last touched
-- 2h ago` and `186 reviews`. The running system observes exactly two facts
-- about a product — its repository's visibility and its licence — and only at
-- publish time. Everything else on those screens is currently fiction.
--
-- THREE OBSERVATION TIERS (OPC-C's standing answer, SN-1). A listing sits in
-- exactly one, and the tier decides which metrics can EXIST — never what they
-- default to:
--
--   linked_repo    the platform's GitHub App, over the seam. Everything,
--                  tests included.
--   declared_repo  a public URL the maintainer named, read without an App.
--                  Commits and last-touched only: we cannot see CI, so there
--                  is no tests figure and the field is ABSENT, not empty.
--   manifest       the component manifest captured at publish. Names, kinds
--                  and languages; no activity of any sort.
--
-- A TIER-3 LISTING SHOWS A DASH WHERE A TIER-1 SHOWS A NUMBER. It does not
-- show a zero. `0 commits this week` says the project is dead; an unmeasured
-- project has said nothing. That distinction is why `activity` has a
-- `not-observed` facet bucket and why nothing here defaults to 0.
--
-- METRICS ARE WINDOWED ROWS, WRITTEN BY INGESTION AND READ BY EVERYTHING
-- (SN-2). Never a live query on the read path: a number computed at request
-- time cannot be edge-cached, and OPC-1 requires the public document to
-- render with no actor and stay cacheable. Append-only, so an integrity sweep
-- (EN3) can RESTATE a total without erasing what it restated.
--
-- FRESHNESS IS PER-METRIC AND WITHDRAWAL IS REAL (SN-3, OPC-7). Past its
-- window a value renders `stale`; past twice it is WITHDRAWN and does not
-- render at all. The failure this prevents is the one every stale dashboard
-- has: a number that was true in March, rendered in August, with nothing on
-- screen to say so. The windows themselves live in the contract, not here —
-- they are product decisions that change without a migration.
--
-- DORMANT ON ARRIVAL. Nothing polls and nothing renders until SN1/SN2.
--
-- Additive and idempotent: no existing table, index, or constraint is touched.

-- One row per listing per source. What we are watching, whether it still
-- answers, and what we do about it when it stops.
CREATE TABLE IF NOT EXISTS openproduct.signal_sources (
  profile_id     UUID        NOT NULL
                   REFERENCES openproduct.profiles (id) ON DELETE CASCADE,

  -- Which tier. CHECK-pinned so no ingester can invent a fourth and quietly
  -- start writing metrics nothing knows how to caveat.
  source         TEXT        NOT NULL,

  -- What to read: an owner/repo for the App tiers, null for `manifest`.
  -- Opaque here; the ingester interprets it.
  locator        TEXT,

  -- The last time this source answered AT ALL — distinct from any metric's
  -- own observed_at, because a source that answers with "nothing changed" is
  -- healthy and a source that has stopped answering is not.
  last_success_at TIMESTAMPTZ,
  -- Consecutive failures. Drives backoff, and the withdrawal below.
  failure_count  INTEGER     NOT NULL DEFAULT 0,
  last_error     TEXT,

  -- Set when the source has failed past its tolerance. A withdrawn source
  -- stops being polled AND stops its metrics rendering — the two go together,
  -- because a metric whose source we have given up on is exactly the number
  -- OPC-7 exists to stop us printing.
  withdrawn_at   TIMESTAMPTZ,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (profile_id, source),

  CONSTRAINT signal_sources_source_check
    CHECK (source IN ('linked_repo', 'declared_repo', 'manifest', 'operator'))
);

-- The scheduler's own read: what is due, oldest first, skipping the withdrawn.
CREATE INDEX IF NOT EXISTS openproduct_signal_sources_due_idx
  ON openproduct.signal_sources (last_success_at NULLS FIRST)
  WHERE withdrawn_at IS NULL;

-- The windowed metric store. Append-only.
--
-- NO UPDATE PATH EXISTS in the repository: a correction is a NEW row with a
-- later observed_at, and readers take the latest per (profile, metric,
-- window). That is what lets EN3's integrity sweep restate an endorsement
-- total without erasing the total it restated, and what makes "what did this
-- say on the 4th" answerable.
CREATE TABLE IF NOT EXISTS openproduct.metrics (
  id           UUID        PRIMARY KEY,

  profile_id   UUID        NOT NULL
                 REFERENCES openproduct.profiles (id) ON DELETE CASCADE,

  -- `commits`, `merges`, `tests_passing`, `last_touched`, `endorsements`, …
  -- Deliberately TEXT and not CHECK-pinned: the vocabulary lives in the
  -- contract beside the freshness window and the formula prose, and pinning
  -- it here as well would mean a migration every time a sub-epic adds a
  -- number. The contract is the one place, and CI reads it.
  metric       TEXT        NOT NULL,

  -- `7d`, `30d`, `all`. Same reasoning.
  window_key   TEXT        NOT NULL,

  -- Integers only, deliberately. Every number the design renders is a count
  -- or a timestamp; a float here would be the first step toward a score, and
  -- OPC-4 forbids one. A timestamp metric stores epoch seconds.
  value        BIGINT      NOT NULL,

  -- Which tier produced it — so the page can caveat a declared-repo number
  -- differently from a linked-repo one, and so a tier change is visible in
  -- the history rather than silently changing what a number means.
  source       TEXT        NOT NULL,

  -- OPC-7: the moment this was true. NOT a default — the ingester sets it
  -- from the observation, so a row can never look fresher than the read that
  -- produced it.
  observed_at  TIMESTAMPTZ NOT NULL,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT metrics_source_check
    CHECK (source IN ('linked_repo', 'declared_repo', 'manifest', 'operator'))
);

-- "The latest value of every metric for this listing" is the read the public
-- document makes, once per listing per cache fill.
CREATE INDEX IF NOT EXISTS openproduct_metrics_latest_idx
  ON openproduct.metrics (profile_id, metric, window_key, observed_at DESC);

-- The public activity stream — the design's seven-verb timeline.
--
-- CLOSED VOCABULARY, and the CHECK is the point: this text renders on a
-- public page, and an open vocabulary would let an ingester write
-- attacker-influenced strings onto it. Seven verbs also happen to be what
-- fits the 74px mono column the design draws.
--
-- BUILT ONLY FROM PUBLIC SOURCES (OPC-J): observations of the public
-- repository, openproduct's own public acts, and JR decisions made through
-- the public door. Never from openproduct.audit_log, which is org-scoped and
-- private, and never from a platform schema.
CREATE TABLE IF NOT EXISTS openproduct.activity_events (
  id           UUID        PRIMARY KEY,

  profile_id   UUID        NOT NULL
                 REFERENCES openproduct.profiles (id) ON DELETE CASCADE,

  kind         TEXT        NOT NULL,

  -- One line, bounded at the write boundary. What happened, in the voice of
  -- the thing that observed it.
  summary      TEXT        NOT NULL,

  -- The subject who did it, when one is known. A NAME is rendered only when
  -- CG3 says that person confirmed their place on this listing (OPC-5); until
  -- then the act renders without an actor. Opaque, no FK, no email.
  actor_subject_id TEXT,

  source       TEXT        NOT NULL,
  occurred_at  TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT activity_events_kind_check
    CHECK (kind IN ('merged', 'thread', 'joined', 'snapshot', 'opening', 'answered', 'declined')),
  CONSTRAINT activity_events_source_check
    CHECK (source IN ('linked_repo', 'declared_repo', 'manifest', 'operator'))
);

-- The product page's Activity tab, and the profile's Recent activity.
CREATE INDEX IF NOT EXISTS openproduct_activity_profile_idx
  ON openproduct.activity_events (profile_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS openproduct_activity_actor_idx
  ON openproduct.activity_events (actor_subject_id, occurred_at DESC)
  WHERE actor_subject_id IS NOT NULL;

COMMENT ON TABLE openproduct.signal_sources IS
  'What openproduct watches for each listing and whether it still answers (openproduct-commons '
  'SN0). Three tiers (OPC-C): linked_repo sees everything, declared_repo sees activity but not '
  'tests, manifest sees no activity at all. A withdrawn source stops being polled AND stops its '
  'metrics rendering — a number whose source we have given up on is exactly what OPC-7 exists to '
  'stop us printing.';

COMMENT ON TABLE openproduct.metrics IS
  'Windowed, append-only metric rows (openproduct-commons SN-2). Never a live query on the read '
  'path: a number computed at request time cannot be edge-cached, and OPC-1 requires the public '
  'document to render with no actor. A correction is a NEW row with a later observed_at, which is '
  'what lets an integrity sweep restate a total without erasing what it restated.';

COMMENT ON TABLE openproduct.activity_events IS
  'The public seven-verb timeline (openproduct-commons SN0). Closed vocabulary because this text '
  'renders on a public page and an open one would let an ingester write attacker-influenced '
  'strings onto it. Built only from public sources (OPC-J) — never from openproduct.audit_log, '
  'which is org-scoped and private. A name renders only for a CG3-confirmed person (OPC-5).';
