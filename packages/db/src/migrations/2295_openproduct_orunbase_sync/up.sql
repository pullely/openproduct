-- 2295 (openproduct-stages-crew SC-4)
--
-- SYNCED FROM ORUNBASE.
--
-- Context: openproduct
--
-- Design §3. The platform pushes two kinds of event over the seam edge S14
-- (`POST /seam/v1/project-events`, signed like S6) for every project with a
-- listed door: `project.roster` (everyone with access to the project, a full
-- snapshot) and `project.deploy` (one environment's last successful deploy).
-- Core applies both to every listing whose stored link grant names that
-- project. This migration holds what applying them needs to remember.
--
-- ─── product_deploys ──────────────────────────────────────────────────────
--
-- One row per listing per environment (`stage`, `production`): the last
-- successful deploy the platform reported. Newer `deployed_at` wins, so a
-- delivery that arrives late never rolls the row back; `first_deployed_at`
-- keeps the earliest deploy ever seen, which is what "live since" falls back
-- to (design §3.3). `url` is null today — no run knows its environment's
-- address yet — and the crew's own link wins over it whenever there is one.
-- No subject id, no name: a deploy is a fact about the product.
--
-- ─── product_syncs ────────────────────────────────────────────────────────
--
-- One row per listing: the last roster applied (its `issuedAt` and event id,
-- so an older or repeated roster is ignored) and when anything last synced
-- (the Orunbase card's "In sync · <time>"). Bookkeeping only.
--
-- ─── listing_maintainers.synced_name ──────────────────────────────────────
--
-- The name Orunbase gave for a synced person, so the crew's own list can
-- name somebody who has written nothing here. CREW-ONLY: no public read
-- selects it — the public page names people through the consent roster
-- (`published_maintainers` joined to a confirmed `product_people` edge), and
-- nobody shows there without agreeing. It lives on the membership row, which
-- the subject registry classifies as theirs, so it leaves with them.
--
-- Additive, idempotent. Both tables cascade from `profiles`, so a workspace
-- purge and a deleted listing take them.

CREATE TABLE IF NOT EXISTS openproduct.product_deploys (
  profile_id         UUID        NOT NULL
                       REFERENCES openproduct.profiles (id) ON DELETE CASCADE,
  environment        TEXT        NOT NULL,
  url                TEXT,
  version            TEXT,
  -- The run's public id on the platform. Opaque here.
  run_ref            TEXT        NOT NULL,
  deployed_at        TIMESTAMPTZ NOT NULL,
  first_deployed_at  TIMESTAMPTZ NOT NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, environment),
  CONSTRAINT product_deploys_environment_check CHECK (environment IN ('stage', 'production')),
  CONSTRAINT product_deploys_url_check CHECK (url IS NULL OR (url ~ '^https://' AND char_length(url) <= 200)),
  CONSTRAINT product_deploys_version_check CHECK (version IS NULL OR char_length(version) BETWEEN 1 AND 40),
  CONSTRAINT product_deploys_run_ref_check CHECK (char_length(run_ref) BETWEEN 1 AND 128),
  CONSTRAINT product_deploys_first_check CHECK (first_deployed_at <= deployed_at)
);

CREATE TABLE IF NOT EXISTS openproduct.product_syncs (
  profile_id        UUID        PRIMARY KEY
                      REFERENCES openproduct.profiles (id) ON DELETE CASCADE,
  roster_issued_at  TIMESTAMPTZ,
  roster_event_id   TEXT,
  synced_at         TIMESTAMPTZ NOT NULL,
  CONSTRAINT product_syncs_roster_event_check CHECK (roster_event_id IS NULL OR char_length(roster_event_id) BETWEEN 1 AND 128),
  CONSTRAINT product_syncs_roster_pair_check CHECK ((roster_issued_at IS NULL) = (roster_event_id IS NULL))
);

ALTER TABLE openproduct.listing_maintainers
  ADD COLUMN IF NOT EXISTS synced_name TEXT;

ALTER TABLE openproduct.listing_maintainers
  DROP CONSTRAINT IF EXISTS listing_maintainers_synced_name_check;

ALTER TABLE openproduct.listing_maintainers
  ADD CONSTRAINT listing_maintainers_synced_name_check
  CHECK (synced_name IS NULL OR char_length(synced_name) BETWEEN 1 AND 120);

COMMENT ON TABLE openproduct.product_deploys IS
  'SC-4 (openproduct-stages-crew) — the last successful stage and production deploy the platform reported over seam S14, per listing. Newer deployed_at wins; first_deployed_at is the earliest seen. The crew''s own values win over these on the page (design §3.3).';

COMMENT ON TABLE openproduct.product_syncs IS
  'SC-4 (openproduct-stages-crew) — per listing: the last project.roster applied (issuedAt and event id, so an older or repeated one is ignored) and when anything last synced from Orunbase.';

COMMENT ON COLUMN openproduct.listing_maintainers.synced_name IS
  'SC-4 (openproduct-stages-crew) — the display name Orunbase gave for a synced crew member. Crew-only: no public read selects it; the public page names people through the consent roster.';
