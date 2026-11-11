-- openproduct-independence OX4 — the authority handover's data half.
--
-- WHO MAY ACT ON A LISTING becomes a fact OPENPRODUCT owns, instead of a
-- question the platform's policy engine answers from org roles. A listing is
-- owned by subject-keyed maintainer records — the same trust model
-- published_maintainers and contributors already use: subject ids as opaque
-- keys, no cross-schema foreign key, NO EMAIL EVER, nothing copied from
-- identity.* or membership.*.
--
-- This table is the AUTHORIZATION list. It is deliberately distinct from
-- published_maintainers (the PUBLICATION list — what a visitor sees), because
-- who may edit and who is shown were never the same fact; conflating them
-- would make removing someone from a public page also revoke their access.
--
-- Lives in the openproduct schema (the teardown/relocation unit): the OX5
-- data-plane split carries it with everything else, and the platform schema
-- drop stays one statement.
--
-- Idempotent, additive; no DROP, no ALTER of existing rows.

CREATE TABLE IF NOT EXISTS openproduct.listing_maintainers (
  profile_id  UUID NOT NULL REFERENCES openproduct.profiles(id) ON DELETE CASCADE,
  -- The platform subject (usr_… / sp_…), an opaque key — the gateway resolves
  -- it per-request from the visitor's own token (seam S2); nothing here can
  -- deanonymize it.
  subject_id  TEXT NOT NULL,
  -- owner: full control including (later) managing this list.
  -- maintainer: edit and publish, never the list itself.
  role        TEXT NOT NULL,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Who added this row (a subject id, or the backfill marker below).
  added_by    TEXT NOT NULL,
  PRIMARY KEY (profile_id, subject_id),
  CONSTRAINT listing_maintainers_role_check CHECK (role IN ('owner', 'maintainer'))
);

-- Look up "everything this subject maintains" without a table scan — the
-- studio's list read and the org-scoped list filter both key on it.
CREATE INDEX IF NOT EXISTS openproduct_listing_maintainers_subject_idx
  ON openproduct.listing_maintainers (subject_id);

-- Backfill: every existing listing's creator becomes its owner. created_by is
-- an actor id (TEXT — it may be a service principal); rows whose creator does
-- not parse as a subject are skipped rather than guessed, and an operator can
-- add owners by hand (the same right-sized-manual posture as OD's review).
INSERT INTO openproduct.listing_maintainers (profile_id, subject_id, role, added_by)
SELECT p.id, p.created_by, 'owner', 'migration:1290'
FROM openproduct.profiles p
WHERE (p.created_by LIKE 'usr_%' OR p.created_by LIKE 'sp_%')
ON CONFLICT (profile_id, subject_id) DO NOTHING;
