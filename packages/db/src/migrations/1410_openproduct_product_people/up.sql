-- 1410_openproduct_product_people (openproduct-commons CG3)
--
-- CONSENT, AS A ROW.
--
-- Context: openproduct
--
-- OD0 gave a listing `published_maintainers`: a list its maintainers write,
-- naming who is on the product. It is the PUBLICATION list, and it has one
-- property this epic cannot live with — the people on it never agreed to be.
-- A maintainer types a name and a stranger appears on a public page.
--
-- OPC-5 says nobody appears publicly without their own act. This table is
-- that rule given somewhere to live: an edge between a listing and a person
-- is created by the maintainer and becomes PUBLIC only when the person
-- themselves confirms it.
--
-- THREE STATES, AND THE MIDDLE ONE IS THE POINT:
--
--   pending    the maintainer named them; the public cannot see it. Visible
--              to exactly two parties — the listing's maintainers, who need
--              to know their invitation is out, and the named person, who
--              needs to be able to answer it.
--   confirmed  the person said yes. Only now does it reach a public surface.
--   retired    somebody ended it — either side, at any time. NOT deleted:
--              CG4's "contributes to" is a count over history, and a person
--              who spent two years on a product did that whether or not they
--              are on it today.
--
-- DECLINING IS NOT A STATE. A declined invitation leaves NO ROW: the point of
-- declining is "I was never part of this", and a `declined` row is a durable
-- record that somebody was asked and refused, which is a fact about them we
-- have no business keeping. Retiring is different — it ends something real
-- that happened.
--
-- `origin` IS THE HONEST HALF OF GRANDFATHERING (OPC-G).
--
-- The epic says existing `published_maintainers` rows become `confirmed`
-- edges, because the alternative is every listing's roster emptying on
-- deploy. That is the right call and it has a cost worth naming: those people
-- did not confirm anything. `confirmed` would then mean two different things
-- — "they agreed" and "they were already listed" — and a column that means
-- two things is a column nobody can audit.
--
-- So the provenance is recorded. A grandfathered edge renders exactly like a
-- confirmed one (the roster cannot usefully caveat every row), but the
-- estate can say how many of its "confirmed" edges nobody actually confirmed,
-- TS5's transparency report can publish that number, and the seam
-- notification that tells each person they are listed can be sent to exactly
-- the right set.
--
-- `published_maintainers` IS NOT DROPPED AND NOT MERGED. It stays as what it
-- always was: the maintainer's publication list. The two are RECONCILED —
-- the public roster is the intersection of "the maintainer published them"
-- and "they consented" — because merging would either discard the
-- maintainer's ordering and labels or silently publish unconsented rows, and
-- neither is a trade this epic makes.
--
-- Additive and idempotent: no existing table, index, or constraint is touched.

CREATE TABLE IF NOT EXISTS openproduct.product_people (
  -- FK WITHIN the schema (the role_openings precedent): a deleted listing
  -- takes its edges, and the cascade stays inside the teardown unit.
  profile_id   UUID        NOT NULL
                 REFERENCES openproduct.profiles (id) ON DELETE CASCADE,
  -- Opaque, never a foreign key to anything outside this schema, never an
  -- email (I3).
  subject_id   TEXT        NOT NULL,

  --   pending | confirmed | retired. See the header; `declined` is
  --   deliberately absent because a declined invitation leaves no row.
  state        TEXT        NOT NULL DEFAULT 'pending',

  --   confirmed_by_subject  the person said yes
  --   grandfathered         they were on published_maintainers when CG3
  --                         shipped and were never asked
  origin       TEXT        NOT NULL DEFAULT 'confirmed_by_subject',

  -- The maintainer's word for what this person does. AUTHORED, in their
  -- voice, and bounded: an unbounded text column on a public page is a denial
  -- of service with extra steps.
  role_label   TEXT,

  -- Who named them, and when. `invited_by` is a subject id, never a name.
  invited_by   TEXT        NOT NULL,
  invited_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  retired_at   TIMESTAMPTZ,
  retired_by   TEXT,

  CONSTRAINT product_people_pk PRIMARY KEY (profile_id, subject_id),
  CONSTRAINT product_people_state_check
    CHECK (state IN ('pending', 'confirmed', 'retired')),
  CONSTRAINT product_people_origin_check
    CHECK (origin IN ('confirmed_by_subject', 'grandfathered')),
  CONSTRAINT product_people_role_label_bounded
    CHECK (role_label IS NULL OR length(role_label) <= 80),
  -- A confirmed edge knows WHEN it was confirmed, because CG4 counts over
  -- time and TS5 may have to say when somebody became visible.
  CONSTRAINT product_people_confirmed_coherent
    CHECK ((state = 'confirmed') = (confirmed_at IS NOT NULL) OR state = 'retired'),
  CONSTRAINT product_people_retired_coherent
    CHECK ((state = 'retired') = (retired_at IS NOT NULL)),
  CONSTRAINT product_people_retired_by_coherent
    CHECK ((retired_at IS NULL) = (retired_by IS NULL))
);

-- The public roster read: confirmed edges for one listing.
CREATE INDEX IF NOT EXISTS openproduct_product_people_public
  ON openproduct.product_people (profile_id)
  WHERE state = 'confirmed';

-- "What am I on, and what have I been asked to join" — the /me surface's
-- question, and the one a person answers a pending invitation from.
CREATE INDEX IF NOT EXISTS openproduct_product_people_subject
  ON openproduct.product_people (subject_id, state);

-- ─── OPC-G: the grandfather ───────────────────────────────────────────────
--
-- Every existing published maintainer becomes a CONFIRMED edge, marked
-- `grandfathered` so the estate never loses track of which consents were
-- actually given. Idempotent: re-running changes nothing, and a listing whose
-- maintainer has since been added properly keeps the real edge.
--
-- `invited_by` is the LISTING'S OWNER where there is one, and the string
-- 'grandfathered' where there is not. Never a guess: an audit trail that
-- attributes an invitation to somebody who did not make it is worse than one
-- that says it does not know.
INSERT INTO openproduct.product_people
  (profile_id, subject_id, state, origin, role_label, invited_by, invited_at, confirmed_at)
SELECT
  pm.profile_id,
  pm.subject_id,
  'confirmed',
  'grandfathered',
  pm.role_label,
  COALESCE(
    (SELECT lm.subject_id
       FROM openproduct.listing_maintainers lm
      WHERE lm.profile_id = pm.profile_id AND lm.role = 'owner'
      ORDER BY lm.subject_id
      LIMIT 1),
    'grandfathered'
  ),
  pm.created_at,
  pm.created_at
FROM openproduct.published_maintainers pm
ON CONFLICT (profile_id, subject_id) DO NOTHING;

COMMENT ON TABLE openproduct.product_people IS
  'CG3 — the two-sided edge between a listing and a person. A maintainer creates it pending; it reaches a public surface only when the person confirms (OPC-5). openproduct.published_maintainers is NOT replaced: it remains the maintainer-authored publication list and the two are reconciled, not merged.';
COMMENT ON COLUMN openproduct.product_people.origin IS
  'CG3/OPC-G — grandfathered rows were confirmed by nobody. Recorded so `confirmed` never quietly means two different things, and so the estate can say how many consents it assumed.';
