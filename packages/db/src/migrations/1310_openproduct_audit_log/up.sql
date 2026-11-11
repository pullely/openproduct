-- openproduct-independence OX5c — the LOCAL audit log.
--
-- The maintainer door's audit trail moves into the context that owns the
-- acts: every write core used to append to the platform's `events` schema
-- (through the EVENTS repository it will no longer import) lands here
-- instead. This is the last platform-schema WRITE openproduct made, and its
-- removal is what lets the whole `openproduct` schema change databases at
-- the 5c cutover without leaving half its story behind.
--
-- Deliberately FK-free: an audit row must survive the profile it describes
-- (an unpublish-then-delete would otherwise erase its own record). Scoped by
-- org_id instead, which is what the workspace purge deletes by — the row
-- dies with the WORKSPACE, exactly like the platform audit rows it replaces
-- (purge-registry class `purge`).

CREATE TABLE IF NOT EXISTS openproduct.audit_log (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL,
  -- The profile the act touched, when one was; TEXT-free of FKs on purpose.
  profile_id UUID,
  -- The actor's public subject id verbatim (user OR service principal) — the
  -- join_links.minted_by / profiles.created_by precedent.
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  -- The same type vocabulary the platform catalog carried
  -- (openproduct.profile.created, …); openproduct owns it now.
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  payload JSONB,
  request_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS openproduct_audit_org_idx
  ON openproduct.audit_log (org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS openproduct_audit_profile_idx
  ON openproduct.audit_log (profile_id, occurred_at DESC);
