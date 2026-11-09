-- 1420_openproduct_launches (openproduct-commons LC0)
--
-- THE DAY A PRODUCT IS INTRODUCED, AS A ROW.
--
-- Context: openproduct
--
-- OD0 gave a listing a `published_at`, and until now that has done two jobs:
-- it makes the page exist and it is the only date anything orders by. LC-1
-- separates them, and the reason is the one thing a maker gets exactly one
-- of — the day their product is introduced to people.
--
-- Under a conflated model that day is whenever the page first worked, which
-- is the worst available day: the pitch is half-written, the screenshot is a
-- placeholder, the README still says TODO. This table lets somebody publish
-- quietly, fix the tagline twice, and choose the morning.
--
-- ─── FOUR STATES ─────────────────────────────────────────────────────────
--
--   scheduled  a moment is set and NOTHING PUBLIC RENDERS IT. This is the
--              embargo — there is no second mechanism, because "scheduled but
--              visible" is not a thing anybody asked for.
--   live       the moment arrived, the listing was published, and it is on
--              the record. Terminal: a launch that people have seen cannot be
--              moved or cancelled.
--   cancelled  the maintainer called it off before it fired. Terminal.
--   missed     the moment passed and the listing was NOT published.
--
-- `missed` is the one worth defending. A launch cannot fire while its listing
-- is unpublished — announcing a page that 404s is worse than announcing
-- nothing — so a maintainer who unpublishes on Thursday night has a Friday
-- launch that cannot happen. Leaving it `scheduled` would fire it at some
-- arbitrary later moment whenever they happened to republish, and a surprise
-- announcement is worse than a missed one. So it misses, says so, and offers
-- a reschedule.
--
-- ─── THE ONCE-PER-VERSION RULE ───────────────────────────────────────────
--
-- LC-1 allows one launch per listing per major version, to stop the board
-- becoming a re-post treadmill. A major version is TWO things here, because
-- neither half works alone:
--
--   the label    `version_label`, typed by the maintainer, unique among the
--                launches that consumed one. Only they know whether this is
--                really 2.0. This half catches the honest mistake.
--   the cooldown enforced in `core` against `launched_at`, published at
--                `/docs`. This half catches the deliberate treadmill, and is
--                the half a label cannot argue past.
--
-- The uniqueness is a PARTIAL INDEX rather than a table constraint, because
-- only `scheduled` and `live` consume a version. A cancelled or missed launch
-- announced nothing, so it releases its label — the alternative is a maker
-- who unpublished for an hour losing their 2.0 launch forever.
--
-- ─── `launched_at` IS THE MOMENT THEY CHOSE ──────────────────────────────
--
-- Not the moment the sweep happened to run. LC-2 tie-breaks the board by
-- earliest launch time, and a board ordered by cron jitter would be a board
-- ordered by nothing. So when a launch fires, `launched_at := scheduled_for`.
-- `fired_at` records when we actually noticed, which is an operational fact
-- and is never ordered by.
--
-- Additive and idempotent: no existing table, index, or constraint is touched.

CREATE TABLE IF NOT EXISTS openproduct.launches (
  id            UUID        PRIMARY KEY,

  -- FK WITHIN the schema (the role_openings precedent): a deleted listing
  -- takes its launches, and the cascade stays inside the teardown unit.
  profile_id    UUID        NOT NULL
                  REFERENCES openproduct.profiles (id) ON DELETE CASCADE,

  --   scheduled | live | cancelled | missed. See the header.
  state         TEXT        NOT NULL DEFAULT 'scheduled',

  -- The maintainer's word for what this launch is. Bounded here as well as in
  -- the contract: an unbounded text column that reaches a public board is a
  -- denial of service with extra steps.
  version_label TEXT        NOT NULL,

  -- The moment they chose. Always set — a launch with no moment is a draft,
  -- and this table does not hold drafts.
  scheduled_for TIMESTAMPTZ NOT NULL,

  -- When it went live, which IS `scheduled_for` (see the header), and null
  -- until it does.
  launched_at   TIMESTAMPTZ,

  -- When the sweep actually noticed. Operational only: never ordered by,
  -- never rendered, and kept so an operator can tell a late sweep from a late
  -- launch without reading logs.
  fired_at      TIMESTAMPTZ,

  -- LC3 fills this: when the board rank was last computed for this launch.
  -- Carried now rather than in a second migration because LC-1's own tuple in
  -- the epic names it, and one documented nullable column is less churn than
  -- another twin-synced migration for one timestamptz. NOTHING WRITES IT YET.
  board_rank_at TIMESTAMPTZ,

  cancelled_at  TIMESTAMPTZ,
  missed_at     TIMESTAMPTZ,

  -- Who scheduled it, and who called it off. Subject ids, never names (I3).
  scheduled_by  TEXT        NOT NULL,
  cancelled_by  TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT launches_state_check
    CHECK (state IN ('scheduled', 'live', 'cancelled', 'missed')),
  CONSTRAINT launches_version_label_bounded
    CHECK (length(version_label) BETWEEN 1 AND 40),
  -- Each terminal state carries its own timestamp, and only its own. A row
  -- claiming to be live with no `launched_at` would be a launch on the board
  -- that cannot say when it happened.
  CONSTRAINT launches_live_coherent
    CHECK ((state = 'live') = (launched_at IS NOT NULL)),
  CONSTRAINT launches_cancelled_coherent
    CHECK ((state = 'cancelled') = (cancelled_at IS NOT NULL)),
  CONSTRAINT launches_missed_coherent
    CHECK ((state = 'missed') = (missed_at IS NOT NULL)),
  CONSTRAINT launches_cancelled_by_coherent
    CHECK ((cancelled_at IS NULL) = (cancelled_by IS NULL))
);

-- ONE VERSION, ONE LAUNCH — among the states that consumed one.
--
-- Normalised the same way the contract's `sameVersion` normalises: lowered,
-- whitespace collapsed, a leading `v` before a digit dropped. Otherwise `2.0`
-- and `V2.0 ` are two versions to Postgres and one to every reader, and the
-- rule becomes a spelling test.
CREATE UNIQUE INDEX IF NOT EXISTS openproduct_launches_one_per_version
  ON openproduct.launches (
    profile_id,
    regexp_replace(lower(regexp_replace(btrim(version_label), '\s+', ' ', 'g')), '^v(?=[0-9])', '')
  )
  WHERE state IN ('scheduled', 'live');

-- AT MOST ONE SCHEDULED LAUNCH PER LISTING. A second one is never what
-- somebody meant: they meant to move the first, and two rows racing for one
-- moment is a state the studio would have to explain.
CREATE UNIQUE INDEX IF NOT EXISTS openproduct_launches_one_scheduled
  ON openproduct.launches (profile_id)
  WHERE state = 'scheduled';

-- The sweep's question: what is due?
CREATE INDEX IF NOT EXISTS openproduct_launches_due
  ON openproduct.launches (scheduled_for)
  WHERE state = 'scheduled';

-- The board's question: what launched, most recent first. LC3 reads this by
-- day; the digest (LC1) reads it by week.
CREATE INDEX IF NOT EXISTS openproduct_launches_board
  ON openproduct.launches (launched_at DESC)
  WHERE state = 'live';

-- The studio's question: what has this listing done?
CREATE INDEX IF NOT EXISTS openproduct_launches_by_profile
  ON openproduct.launches (profile_id, scheduled_for DESC);
