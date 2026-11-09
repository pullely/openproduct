-- 1730_openproduct_sessions (openproduct-launch AC2b)
--
-- THE SESSION FOR THE DOOR THE PLATFORM DOES NOT KNOW ABOUT.
--
-- Context: openproduct
--
-- ─── WHY THERE HAS TO BE ONE AT ALL ──────────────────────────────────────
--
-- Every signed-in visitor openproduct has ever had arrived through the
-- platform's OAuth flow, and the cookie carries an `identity`-scoped access
-- token. The gateway does not verify it; it ASKS — `GET /v1/identity/me`,
-- every request, cached in-isolate for at most sixty seconds. That is the
-- whole of openproduct's authentication machinery, and R2's safety argument
-- rests on it: a forged cookie buys nothing, because the thing inside is
-- re-resolved against somebody else's authority.
--
-- A password sign-in has no such token to carry. The platform mints one only
-- at the end of a magic-link round trip, and a password sign-in that mailed a
-- link every time is not a password sign-in. So openproduct has to mint
-- something itself — and the moment it does, R2's argument stops holding for
-- free and has to be re-earned.
--
-- ─── IT IS RE-EARNED BY KEEPING THE SHAPE, NOT BY SIGNING A CLAIM ────────
--
-- The obvious move is a signed blob: subject id and expiry, HMACed, verified
-- at the edge. No table, no read. It is the wrong one HERE, for two reasons
-- that are about this estate rather than about JWTs.
--
--   THE TWO DOORS WOULD STOP BEING THE SAME SHAPE. One cookie would be a
--   pointer that gets resolved and the other a claim that gets verified, and
--   every later question — how do I sign somebody out, what happens when a
--   subject is removed, is this token still good — would have two answers.
--   The first time somebody forgets which door they are holding is the first
--   security bug.
--
--   REVOCATION WOULD BE A PROMISE RATHER THAN A MECHANISM. TS3 can remove a
--   person. The platform path honours that on the next request, because it
--   asks. A signed blob honours it whenever it happens to expire.
--
-- So: an unguessable token in the cookie, the row here, and the gateway
-- resolves it against core exactly as it resolves a platform token against
-- the platform. Same shape, same staleness bound, same answer to "sign this
-- person out". The cookie is a pointer at both doors, and never a claim.
--
-- (The cookie is ALSO signed, which R2 asked for — but for a different and
-- smaller reason, and it is worth not conflating them: the cookie carries a
-- display name that the web worker paints into the chrome before anything is
-- resolved. Unforgeable authority does not make a forged NAME harmless.)
--
-- ─── THE HASH IS STORED, NEVER THE TOKEN ─────────────────────────────────
--
-- Same rule as `credential_tokens`, and for the same reason: a token readable
-- from this table is a token anybody with a read on this database can use.
-- The primary key IS the hash, so a lookup is a lookup by the only thing
-- stored.
--
-- SHA-256 rather than argon2id, deliberately. A session token is 32 bytes
-- this app generated, not a secret a person chose — there is no low-entropy
-- guess for argon2id's cost to defend against, and paying it on the read path
-- of every authenticated request would be a real cost for no gain.
--
-- ─── WHAT IS NOT HERE ────────────────────────────────────────────────────
--
-- NO `last_seen_at`. It would turn every authenticated read into a write, on
-- the hottest path this app has, to power nothing anybody asked for.
--
-- NO USER AGENT, NO IP. A session list showing "Chrome on macOS, Berlin" is a
-- surface this product does not have and a durable record of where somebody
-- reads from. When AC3 or a later milestone wants "sign out everywhere", it
-- needs the subject id and nothing else, and that is already here.
--
-- NO ADDRESS, obviously and by the same I3 query as everything else.
--
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS openproduct.auth_sessions (
  -- SHA-256 of the token the cookie carries. See above.
  token_hash   TEXT        PRIMARY KEY,

  -- The platform's opaque id. The session says WHO, and nothing else about
  -- them: a session row is not a profile and must not grow into one.
  subject_id   TEXT        NOT NULL,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Set by the caller from the contract's TTL rather than defaulted here, so
  -- the number lives in one place a reader can find (`AUTH_SESSION_TTL_MS`)
  -- instead of two that can disagree.
  expires_at   TIMESTAMPTZ NOT NULL,

  -- Sign-out, and TS3's removal. NOT a delete: a row that is gone cannot tell
  -- a later question "this session ended at 14:02" from "this session never
  -- existed", and the first is an answer incident response asks for.
  revoked_at   TIMESTAMPTZ,

  CONSTRAINT auth_sessions_window_check
    CHECK (expires_at > created_at)
);

-- THE ONE READ ON THE HOT PATH is by primary key, so it needs no index of its
-- own. This one is for the other two: the expiry sweep, and revoking every
-- session a subject holds. Partial, because a session already revoked is
-- never swept and never revoked again.
CREATE INDEX IF NOT EXISTS openproduct_auth_sessions_live_idx
  ON openproduct.auth_sessions (subject_id, expires_at)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE openproduct.auth_sessions IS
  'AC2b (openproduct-launch) — the session for the door the platform does not '
  'know about. Every signed-in visitor until now arrived through the platform''s '
  'OAuth flow and carries an identity-scoped token the gateway RE-RESOLVES on '
  'every request; R2''s safety argument is that a forged cookie buys nothing '
  'because the thing inside is checked against somebody else''s authority. A '
  'password sign-in has no such token — the platform mints one only after a '
  'magic-link round trip — so openproduct mints its own, and this table is what '
  'keeps R2''s argument true rather than merely restated. A SIGNED BLOB WAS THE '
  'OBVIOUS ALTERNATIVE AND IS REFUSED: it would make one cookie a pointer that '
  'gets resolved and the other a claim that gets verified, so every later '
  'question (sign this person out, this subject was removed, is this still '
  'good) would have two answers and the first person to forget which door they '
  'hold writes the first security bug — and revocation would become a promise '
  'rather than a mechanism, since TS3 can remove somebody and a signed blob '
  'honours that whenever it happens to expire. THE HASH IS STORED, NEVER THE '
  'TOKEN, and SHA-256 rather than argon2id because a 32-byte token this app '
  'generated has no low-entropy guess for argon2id''s cost to defend against '
  'and the read is on every authenticated request. NOT HERE, deliberately: '
  'last_seen_at (it would make every authenticated read a write, on the hottest '
  'path, for nothing anybody asked for), user agent and IP (a durable record of '
  'where somebody reads from, powering a session list this product does not '
  'have), and an address. Revocation is a timestamp rather than a delete, '
  'because "this session ended at 14:02" and "this session never existed" are '
  'different answers and incident response asks for the first.';
