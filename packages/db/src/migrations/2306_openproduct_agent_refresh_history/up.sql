-- 2306 (openproduct-mcp MC1, after its security review)
--
-- EVERY REFRESH TOKEN A ROTATION REPLACED, NOT ONLY THE LAST.
--
-- Context: openproduct
--
-- 2305 kept one `previous_refresh_hash`, so a thief who refreshed twice
-- before the real client did left that client holding a token that matched
-- neither the live hash nor the previous one: "unknown", nothing revoked,
-- and the thief kept a thirty-day credential. Every replaced hash is kept
-- here instead, and ANY of them coming back revokes the credential.
--
-- And a code now remembers the credential it produced, so a replayed code
-- revokes that credential (RFC 6749 §4.1.2).
--
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS openproduct.agent_refresh_history (
  refresh_hash   TEXT        PRIMARY KEY,
  credential_id  TEXT        NOT NULL REFERENCES openproduct.agent_credentials (id) ON DELETE CASCADE,
  replaced_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS openproduct_agent_refresh_history_credential_idx
  ON openproduct.agent_refresh_history (credential_id);

ALTER TABLE openproduct.oauth_codes
  ADD COLUMN IF NOT EXISTS credential_id TEXT;

CREATE INDEX IF NOT EXISTS openproduct_oauth_clients_registered_idx
  ON openproduct.oauth_clients (registered_at);
