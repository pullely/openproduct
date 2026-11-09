-- 1250_openproduct_home (openproduct-home OH0)
--
-- The contributor's side of the public plane: who they say they are, what
-- they applied to, what they saved. Three tables in the EXISTING openproduct
-- schema, so saas-openproduct/teardown.md row 10 — DROP SCHEMA openproduct
-- CASCADE — covers them with no amendment, and the bounded-context line does
-- not move.
--
-- Context: openproduct
--
-- WHY subject_id IS THE KEY. A contributor is whoever the identity scope's
-- one read says they are (openproduct-identity OI1: GET /v1/identity/me →
-- subjectId). This schema never resolves a subject — no join to identity.*,
-- no cached email, no copied platform display name. The contributor AUTHORS
-- the name and bio shown here, the published_maintainers precedent.
--
-- NO EMAIL, EVER. Same boundary rule OD2a enforces for published_maintainers:
-- this schema feeds pages on a public host, and an address that is never
-- stored cannot leak. The migration test pins the absence.
--
-- APPLICATIONS ARE A PROJECTION, NOT A SECOND SOURCE OF TRUTH. JR owns the
-- request lifecycle — the pending queue, the approve transaction, the seat
-- gate, the notifications. A row here records THAT the contributor applied so
-- their own page can show it; status is a cached snapshot keyed by the JR
-- request's public id, and if the two disagree, JR is right.
--
-- DORMANT ON ARRIVAL. Nothing routes to these tables until OH1/OH2; OH0 is
-- the model and its contracts, deliberately unreachable.
--
-- Additive: no existing table, index, or constraint is touched.

-- The contributor's authored presence. One row per subject; existence is
-- opt-in (created the first time they touch their profile, not on sign-in).
CREATE TABLE IF NOT EXISTS openproduct.contributors (
  subject_id   TEXT        PRIMARY KEY,

  -- Authored HERE, for this surface — never copied from identity.users, so
  -- it cannot go stale against a platform rename and carries no platform
  -- authority. Null renders as the OI display name fetched at read time.
  display_name TEXT,
  bio          TEXT,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The contributor's view of a JR request.
CREATE TABLE IF NOT EXISTS openproduct.applications (
  id              UUID        PRIMARY KEY,
  subject_id      TEXT        NOT NULL,

  -- FK WITHIN the schema (the role_openings precedent): a deleted listing
  -- takes the applications shown on it, and the cascade stays inside the
  -- teardown unit.
  profile_id      UUID        NOT NULL
                    REFERENCES openproduct.profiles (id) ON DELETE CASCADE,

  -- Deliberately NOT a foreign key: openings churn (filled, closed, deleted)
  -- and the contributor's history should survive that churn. Opaque UUID.
  role_opening_id UUID        NOT NULL,

  -- The JR request's opaque PUBLIC id as text, no FK (the join_link_ref
  -- rule). Null until the JR ask lands; the status sync keys on it.
  jr_request_ref  TEXT,

  -- A cached snapshot of JR's status, in JR's own vocabulary (mirrors
  -- membership.join_requests' CHECK) so the projection can never invent a
  -- state the source of truth does not have.
  status          TEXT        NOT NULL DEFAULT 'pending',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT applications_status_check
    CHECK (status IN ('pending', 'approved', 'denied', 'withdrawn', 'expired'))
);

-- One application per (contributor, opening): re-applying re-uses the row
-- (upsert) rather than accumulating duplicates the page would then dedupe.
CREATE UNIQUE INDEX IF NOT EXISTS openproduct_applications_subject_role_idx
  ON openproduct.applications (subject_id, role_opening_id);

-- "My applications" is the hot read.
CREATE INDEX IF NOT EXISTS openproduct_applications_subject_idx
  ON openproduct.applications (subject_id, created_at DESC);

-- The status sync arrives keyed by the JR request ref.
CREATE INDEX IF NOT EXISTS openproduct_applications_request_idx
  ON openproduct.applications (jr_request_ref)
  WHERE jr_request_ref IS NOT NULL;

-- A bookmark, nothing more. No count is shown on the public page (a save is
-- a private act), so no denormalized counter exists to drift.
CREATE TABLE IF NOT EXISTS openproduct.saved_products (
  subject_id  TEXT        NOT NULL,
  profile_id  UUID        NOT NULL
                REFERENCES openproduct.profiles (id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (subject_id, profile_id)
);

COMMENT ON TABLE openproduct.contributors IS
  'The contributor''s authored presence (openproduct-home OH0). subject_id keyed — the '
  'identity scope''s one read is the whole identity surface. Authored name and bio only; '
  'no email, ever (the OD2a boundary rule), nothing copied from identity.users.';

COMMENT ON TABLE openproduct.applications IS
  'The contributor''s view of a JR request (openproduct-home OH0). A PROJECTION: JR owns '
  'the lifecycle; status is a cached snapshot keyed by jr_request_ref, and when they '
  'disagree JR is right. role_opening_id has no FK so history survives opening churn.';

COMMENT ON TABLE openproduct.saved_products IS
  'A contributor''s bookmarks (openproduct-home OH0). Private to the subject; the public '
  'page shows no save count, so nothing here is denormalized anywhere.';
