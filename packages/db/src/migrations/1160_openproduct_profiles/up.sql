-- 1160_openproduct_profiles (saas-openproduct OD0)
--
-- The public plane's entire data footprint: one schema, three tables, no
-- inbound foreign key. Everything the platform knows sits behind a bearer
-- token (apps/api-edge/src/resolve-actor.ts:45); this schema holds the one
-- surface that is deliberately readable without one — a listed project
-- carrying a pitch, its explicitly-published maintainers, and the roles it
-- wants.
--
-- Context: openproduct
--
-- WHY ITS OWN SCHEMA. Two jobs at once (design.md §2): it is the bounded
-- context line, and it is the teardown unit. teardown.md row 10 is one
-- statement — DROP SCHEMA openproduct CASCADE, the exact shape
-- 1150_work_teardown_v2 used for `work` — and that is only true while no
-- other schema points a foreign key at this one.
--
-- WHY NO CROSS-SCHEMA FOREIGN KEYS. org_id, project_id and join_link_ref are
-- opaque: this schema never reads membership.* or projects.*, it asks their
-- workers over service bindings (the JR3 precedent). The cost is that a
-- deleted project can strand a profile, which OD2 handles with an
-- org.project.deleted reaction and the read path tolerating an unresolvable
-- project_id. The benefit is that the schema drops in one statement.
--
-- DORMANT ON ARRIVAL. Nothing routes to these tables until OD1 ships the
-- worker; OD0 is the model and its contracts, deliberately unreachable.
--
-- Additive: no existing table, index, or constraint is touched.

CREATE SCHEMA IF NOT EXISTS openproduct;

-- One row per listed project.
--
-- `visibility` defaults to 'private' and only an explicit, audited act moves
-- it (design.md §7 control 4): a profile that is merely authored is not a
-- profile that is published. The first publish additionally requires an admin
-- review — reviewed_at below — which is the curation gate AND the v1
-- moderation lever (README §Curation, OD-C).
CREATE TABLE IF NOT EXISTS openproduct.profiles (
  id                UUID        PRIMARY KEY,

  -- Opaque, no FK — see the header. Both are UUIDs elsewhere in the platform
  -- and are stored as UUIDs here so a mistyped id fails at the boundary, but
  -- nothing in this schema resolves them; the workers do.
  org_id            UUID        NOT NULL,
  project_id        UUID        NOT NULL,

  -- The public URL segment. Globally unique (OD-A): openproduct.live/<slug>
  -- is the shareable artifact, and a workspace segment in the URL would leak
  -- tenancy structure and read as an internal tool.
  slug              TEXT        NOT NULL,

  -- 'private' until an explicit publish. CHECK-constrained so no code path,
  -- present or future, can invent a third state that the public read's
  -- visibility filter would not recognise.
  visibility        TEXT        NOT NULL DEFAULT 'private',

  tagline           TEXT,

  -- The pitch body and its content address (packages/db/src/content/doc.ts).
  -- The digest pins exactly which revision was published: the OD6 publish
  -- dialog shows it, and the public read can use it as a cache key. Body is
  -- canonicalized (CRLF -> LF) before hashing, so what is hashed is what is
  -- read back.
  pitch_body        TEXT,
  pitch_digest      TEXT,

  -- Maintainer-authored, validated as absolute https at the write boundary.
  repo_url          TEXT,
  live_url          TEXT,

  -- Free-form tags. JSONB, not TEXT[]: the workers' postgres client runs
  -- fetch_types:false, so JSONB is the array encoding every read path parses
  -- (the same reason join_links.email_domains is JSONB).
  stack             JSONB,

  -- What the GitHub App observed about the linked repo at publish time, and
  -- the sweep keeps current (design.md §2.5). NOT true by construction: the
  -- platform creates product repos PRIVATE on every path
  -- (integrations-worker/src/handlers/repo-create.ts:23 — "Deliberately
  -- minimal: name + private-only"), and OD does not change that. The fact is
  -- bought at publish time on the AUTHENTICATED path and written here; the
  -- public read only ever reads the column.
  repo_visibility   TEXT,
  repo_licence      TEXT,
  repo_checked_at   TIMESTAMPTZ,

  -- The admin review that permits the FIRST publish. Null until reviewed.
  -- Deliberately not a boolean: who and when are the audit trail.
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       TEXT,

  -- Null until first publish; the audit anchor for "when did this become
  -- public". Survives an unpublish — the question it answers is historical.
  published_at      TIMESTAMPTZ,

  -- TEXT, not UUID: the invited_by / minted_by precedent for actor ids. An
  -- actor may be a user or a service principal, and the UUID-column lint
  -- guard rejects the typed form here.
  created_by        TEXT        NOT NULL,
  updated_by        TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT profiles_visibility_check CHECK (visibility IN ('private', 'public')),
  CONSTRAINT profiles_repo_visibility_check
    CHECK (repo_visibility IS NULL OR repo_visibility IN ('private', 'public')),
  -- A published profile must have been reviewed. The gate is enforced in the
  -- handler AND here, so the two can never disagree — the JR ceiling
  -- discipline (design.md §6.1).
  CONSTRAINT profiles_public_requires_review
    CHECK (visibility = 'private' OR reviewed_at IS NOT NULL)
);

-- Globally unique slug (OD-A). Case-insensitive: openproduct.live/Acme and
-- /acme must not be two projects.
CREATE UNIQUE INDEX IF NOT EXISTS openproduct_profiles_slug_idx
  ON openproduct.profiles (lower(slug));

-- One profile per project. A project listing itself twice is a bug, not a
-- feature, and this is the constraint that says so without a cross-schema FK.
CREATE UNIQUE INDEX IF NOT EXISTS openproduct_profiles_project_idx
  ON openproduct.profiles (project_id);

-- The directory read is the hot path and it only ever wants public rows.
CREATE INDEX IF NOT EXISTS openproduct_profiles_public_idx
  ON openproduct.profiles (published_at DESC)
  WHERE visibility = 'public';

-- The maintainer console lists a workspace's own profiles, published or not.
CREATE INDEX IF NOT EXISTS openproduct_profiles_org_idx
  ON openproduct.profiles (org_id, created_at DESC);

-- A role the project is looking for. FK WITHIN the schema (cascade delete):
-- deleting a profile takes its openings with it, and the cascade stays inside
-- the teardown unit.
CREATE TABLE IF NOT EXISTS openproduct.role_openings (
  id            UUID        PRIMARY KEY,
  profile_id    UUID        NOT NULL
                  REFERENCES openproduct.profiles (id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  description   TEXT,
  commitment    TEXT,
  status        TEXT        NOT NULL DEFAULT 'open',

  -- The JR link's opaque PUBLIC id as text, no FK (the header's rule). Minted
  -- in OD4 when the opening is published; null until then.
  join_link_ref TEXT,

  sort_order    INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT role_openings_status_check CHECK (status IN ('open', 'filled', 'closed'))
);

CREATE INDEX IF NOT EXISTS openproduct_role_openings_profile_idx
  ON openproduct.role_openings (profile_id, sort_order, created_at);

-- An EXPLICIT publication list, not a projection of the member roster.
--
-- This table exists to prevent one specific accident: if the public page
-- derived its maintainers from membership.members, flipping one project to
-- public would publish the whole workspace's roster, including people who
-- never agreed to appear. Publication is per-person and deliberate.
--
-- subject_id only — never an email, never a copied display name. Names are
-- resolved at read time through PP's directory read (which carries no
-- address); a copied name would go stale and a copied email would be a leak.
CREATE TABLE IF NOT EXISTS openproduct.published_maintainers (
  profile_id  UUID        NOT NULL
                REFERENCES openproduct.profiles (id) ON DELETE CASCADE,
  subject_id  TEXT        NOT NULL,
  role_label  TEXT,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (profile_id, subject_id)
);

CREATE INDEX IF NOT EXISTS openproduct_published_maintainers_profile_idx
  ON openproduct.published_maintainers (profile_id, sort_order);

COMMENT ON SCHEMA openproduct IS
  'The public plane (saas-openproduct OD0). Listed projects readable with no session, '
  'assembled by apps/openproduct-worker over an allowlist projection. No inbound foreign '
  'key by design: teardown.md row 10 is DROP SCHEMA openproduct CASCADE.';

COMMENT ON TABLE openproduct.profiles IS
  'One listed project (saas-openproduct OD0). visibility defaults private; the first '
  'publish requires an admin review (reviewed_at) and a repo observed public at publish '
  'time. org_id/project_id are opaque — no cross-schema FK.';

COMMENT ON TABLE openproduct.role_openings IS
  'A role a listed project is looking for (saas-openproduct OD0). join_link_ref holds the '
  'JR link public id as text (no FK); OD4 mints it with a project_viewer ceiling.';

COMMENT ON TABLE openproduct.published_maintainers IS
  'The people a maintainer explicitly chose to show on a public page (saas-openproduct '
  'OD0) — never derived from membership.members. subject_id only: names resolve at read '
  'time, emails never.';
