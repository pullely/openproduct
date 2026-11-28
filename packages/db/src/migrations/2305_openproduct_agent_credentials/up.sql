-- 2305 (openproduct-mcp MC1)
--
-- CONNECTING AN AGENT.
--
-- Context: openproduct
--
-- An agent acts for a person over MCP. It never holds the person's session:
-- it holds its own credential, which the person can see on Connected agents
-- and revoke without signing out, and which carries the scopes they granted
-- and, if they chose, the listings it may touch.
--
-- ─── oauth_clients ───────────────────────────────────────────────────────
--
-- A client that registered itself (RFC 7591). PUBLIC CLIENTS ONLY: there is
-- no secret column because there are no client secrets — PKCE is what proves
-- the code's redeemer is the client that asked for it. The name is the
-- client's own claim and the consent screen says so.
--
-- ─── oauth_codes ─────────────────────────────────────────────────────────
--
-- A one-time authorization code, from the person's Allow to the client's
-- token request: ten minutes, consumed once, stored by hash.
--
-- ─── agent_credentials ───────────────────────────────────────────────────
--
-- One row per grant: an OAuth connection or a personal token. The access
-- token and, for OAuth, the refresh token are stored BY HASH (SHA-256, the
-- sessions' reasoning: 32 bytes this app generated have no low-entropy guess
-- for argon2id to defend). A refresh ROTATES both hashes in place; the one
-- it replaced is kept in `previous_refresh_hash`, and a client that presents
-- it again revokes the row, because a refresh token used twice was copied.
--
-- `last_used_at` is written at most once a minute (the contract's
-- AGENT_LAST_USED_GRANULARITY_SECONDS), so Connected agents can say when an
-- agent last acted without every agent call becoming a write.
--
-- No address, no IP, no user agent. Revocation is a timestamp, not a delete,
-- like a session's.
--
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS openproduct.oauth_clients (
  client_id      TEXT        PRIMARY KEY,
  client_name    TEXT        NOT NULL,
  redirect_uris  JSONB       NOT NULL,
  registered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT oauth_clients_name_check CHECK (char_length(client_name) BETWEEN 1 AND 100),
  CONSTRAINT oauth_clients_redirects_check CHECK (jsonb_typeof(redirect_uris) = 'array' AND jsonb_array_length(redirect_uris) BETWEEN 1 AND 5)
);

CREATE TABLE IF NOT EXISTS openproduct.oauth_codes (
  code_hash       TEXT        PRIMARY KEY,
  client_id       TEXT        NOT NULL REFERENCES openproduct.oauth_clients (client_id) ON DELETE CASCADE,
  subject_id      TEXT        NOT NULL,
  redirect_uri    TEXT        NOT NULL,
  code_challenge  TEXT        NOT NULL,
  scopes          JSONB       NOT NULL,
  listing_ids     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  consumed_at     TIMESTAMPTZ,
  CONSTRAINT oauth_codes_window_check CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS openproduct_oauth_codes_subject_idx
  ON openproduct.oauth_codes (subject_id);

CREATE TABLE IF NOT EXISTS openproduct.agent_credentials (
  id                     TEXT        PRIMARY KEY,
  subject_id             TEXT        NOT NULL,
  kind                   TEXT        NOT NULL,
  client_id              TEXT        REFERENCES openproduct.oauth_clients (client_id) ON DELETE SET NULL,
  client_name            TEXT        NOT NULL,
  token_hash             TEXT        NOT NULL UNIQUE,
  token_expires_at       TIMESTAMPTZ,
  refresh_hash           TEXT        UNIQUE,
  previous_refresh_hash  TEXT,
  scopes                 JSONB       NOT NULL,
  listing_ids            JSONB,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at           TIMESTAMPTZ,
  expires_at             TIMESTAMPTZ,
  revoked_at             TIMESTAMPTZ,
  CONSTRAINT agent_credentials_kind_check CHECK (kind IN ('oauth', 'personal')),
  CONSTRAINT agent_credentials_name_check CHECK (char_length(client_name) BETWEEN 1 AND 100),
  CONSTRAINT agent_credentials_scopes_check CHECK (jsonb_typeof(scopes) = 'array' AND jsonb_array_length(scopes) >= 1),
  CONSTRAINT agent_credentials_listings_check CHECK (listing_ids IS NULL OR jsonb_typeof(listing_ids) = 'array'),
  -- An OAuth grant always refreshes and always ends; a personal token never refreshes.
  CONSTRAINT agent_credentials_shape_check CHECK (
    (kind = 'oauth' AND refresh_hash IS NOT NULL AND expires_at IS NOT NULL AND token_expires_at IS NOT NULL)
    OR (kind = 'personal' AND refresh_hash IS NULL AND previous_refresh_hash IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS openproduct_agent_credentials_subject_idx
  ON openproduct.agent_credentials (subject_id, created_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS openproduct_agent_credentials_previous_refresh_idx
  ON openproduct.agent_credentials (previous_refresh_hash)
  WHERE previous_refresh_hash IS NOT NULL;

COMMENT ON TABLE openproduct.agent_credentials IS
  'MC1 (openproduct-mcp) — an agent''s own credential: an OAuth connection or a '
  'personal token, by hash only, with the scopes and listings the person granted. '
  'Never the person''s session; revoked by timestamp.';
