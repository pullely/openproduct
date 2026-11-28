-- 2310 (openproduct-mcp MC3)
--
-- AGENTS RETRY, SO A CREATING CALL CAN SAY IT IS THE SAME CALL.
--
-- Context: openproduct
--
-- An agent that lost an answer sends the request again. A tool that creates
-- something accepts an `idempotencyKey`; the first answer is kept here for
-- a day under (credential, key), and the same key from the same credential
-- gets that answer back instead of a second listing, post or image. The
-- method and path are kept beside it, so a key reused for a different call
-- is refused rather than answered with the wrong thing.
--
-- No subject column: a credential row is the person's, and these rows go
-- with it (ON DELETE CASCADE).
--
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS openproduct.agent_idempotency (
  credential_id  TEXT        NOT NULL REFERENCES openproduct.agent_credentials (id) ON DELETE CASCADE,
  key            TEXT        NOT NULL,
  method         TEXT        NOT NULL,
  path           TEXT        NOT NULL,
  status         INTEGER     NOT NULL,
  body           JSONB       NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (credential_id, key),
  CONSTRAINT agent_idempotency_key_check CHECK (char_length(key) BETWEEN 1 AND 100)
);

CREATE INDEX IF NOT EXISTS openproduct_agent_idempotency_created_idx
  ON openproduct.agent_idempotency (created_at);
