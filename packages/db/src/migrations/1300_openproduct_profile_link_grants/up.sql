-- openproduct-independence OX5 — the stored half of the LINK GRANT (S4/S5).
--
-- The platform's attestation that this listing may bind to its workspace +
-- project, verified once at link time and kept as a fact: the door token the
-- apply flow prints (non-secret by design), who granted it, when, and the
-- workspace's public-eligibility at that moment. This REPLACES the two
-- per-request platform reads (authorization-context, visibility) and the
-- binding-only door mint — the last service-binding uses openproduct had.
--
-- Nullable, deliberately: listings created before the seam carry no grant,
-- and PUBLISHING one refuses with a `workspace_link_required` blocker whose
-- remedy is running the link flow — never a silent pass, never a guess.
--
-- Additive, idempotent; no DROP, no rewrite of existing rows.

ALTER TABLE openproduct.profiles
  -- { doorRef, grantedBy, grantedAt, workspaceVisibility } — a closed shape
  -- the repository owns; JSONB because fetch_types=false (the executor's
  -- standing constraint) and because the shape is read whole, never queried
  -- by key.
  ADD COLUMN IF NOT EXISTS link_grant JSONB;
