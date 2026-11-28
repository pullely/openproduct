-- 2315 (openproduct-mcp MC4)
--
-- AN IMAGE, UPLOADED BY AN AGENT, WITHOUT BASE64 IN A TOOL CALL.
--
-- Context: openproduct
--
-- A logo, hero or gallery image is up to 5 MB. An agent asks for a ticket
-- (`request_media_upload`) naming the listing, the kind, the alt text and
-- the byte length; it then PUTs exactly that many bytes to a one-time
-- address, and the upload runs through the website's own media checks as
-- the agent's person. The ticket is stored BY HASH, lives ten minutes, and
-- is consumed by the one statement that reads it.
--
-- No subject column: the credential row is the person's, and tickets go
-- with it (ON DELETE CASCADE).
--
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS openproduct.agent_upload_tickets (
  ticket_hash    TEXT        PRIMARY KEY,
  credential_id  TEXT        NOT NULL REFERENCES openproduct.agent_credentials (id) ON DELETE CASCADE,
  org_id         TEXT        NOT NULL,
  profile_id     TEXT        NOT NULL,
  kind           TEXT        NOT NULL,
  alt            TEXT        NOT NULL,
  position       INTEGER     NOT NULL DEFAULT 0,
  byte_length    INTEGER     NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  consumed_at    TIMESTAMPTZ,
  CONSTRAINT agent_upload_tickets_kind_check CHECK (kind IN ('logo', 'hero', 'gallery')),
  CONSTRAINT agent_upload_tickets_length_check CHECK (byte_length BETWEEN 1 AND 5242880),
  CONSTRAINT agent_upload_tickets_window_check CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS openproduct_agent_upload_tickets_expiry_idx
  ON openproduct.agent_upload_tickets (expires_at);
