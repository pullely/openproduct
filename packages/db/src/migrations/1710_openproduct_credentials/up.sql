-- 1710_openproduct_credentials (openproduct-launch AC0)
--
-- A PASSWORD STORE THAT HOLDS NO ADDRESS AT ANY POINT.
--
-- Context: openproduct
--
-- ─── THE PLAN ASKED FOR AN `email` COLUMN. THIS DOES NOT HAVE ONE ────────
--
-- The implementation plan's AC0 line reads `openproduct.credentials (subject,
-- email, argon2id verifier, verified_at)`, and R1's binding text says the
-- table "has no address column AFTER `verified_at` is set". Both are leftovers
-- from before R1 was settled, and they contradict two things that are not
-- leftovers.
--
-- I3, as written in openproduct-commons' design: "No email column exists
-- anywhere in the `openproduct` schema." That is not a claim somebody checks
-- per table — it is a query in repository-pg.test.ts that asks
-- `information_schema` for any column matching `%email%` and refuses what it
-- finds, written that way specifically so it covers every table added from
-- here on WITHOUT anyone remembering to extend it.
--
-- R1's own DECISION, which is stronger than its binding sentence: "(a) The
-- platform keeps the address against the subject id and openproduct asks it to
-- send, HOLDING NOTHING."
--
-- So AC0 is the first milestone that would have wanted an exception to I3, and
-- refusing to take one is the whole of its design. A guard with one carve-out
-- is a guard that has learned to have carve-outs, and the next table's author
-- will find the precedent before they find the argument.
--
-- ─── HOW A PASSWORD IS BOUND TO AN ADDRESS WITHOUT HOLDING ONE ───────────
--
-- The gap is real: at sign-up there is no subject id yet — the subject is
-- minted at verification — so something has to carry the address across the
-- gap between "somebody typed it" and "somebody proved they read the mail".
--
-- THE TOKEN CARRIES IT, AND THE PLATFORM HOLDS IT. openproduct mints a token,
-- stores only its HASH here beside the verifier, and hands the platform the
-- address and the token together, exactly as CB4 hands it a subject id and a
-- kind. The platform holds the address against the token and sends. When
-- somebody comes back with the token, openproduct asks the platform to resolve
-- it and receives a SUBJECT ID — never the address — and writes the credential
-- against that.
--
-- What that buys, beyond I3 surviving intact:
--
--   ENUMERATION BECOMES STRUCTURAL. AC1 must "answer identically for a known
--   and an unknown address". Here openproduct CANNOT tell the difference: it
--   never learns which addresses exist. A rule nobody can break by forgetting.
--
--   THERE IS NO WINDOW. "Held only until verification" still means held. A row
--   that never holds an address cannot leak one in the window, cannot appear
--   in a backup taken during it, and cannot be read out of a log line written
--   inside it.
--
-- WHAT IT COSTS, said plainly: the platform is in the loop on every sign-in,
-- not only on verification and reset — openproduct has no address to match a
-- typed one against, so AC2 resolves address to subject at the platform and
-- then compares the verifier here. That is a round trip on the sign-in path.
-- R1 already accepted exactly this cost for the reset path on exactly this
-- reasoning; AC0 extends it rather than inventing it.
--
-- ─── ONE TOKEN TABLE, TWO PURPOSES, AND WHY NOT TWO TABLES ───────────────
--
-- Sign-up verification and password reset carry different payloads: a sign-up
-- token has a verifier waiting behind it and no subject yet; a reset token has
-- a subject and no verifier. That is an argument for two tables, and it loses
-- to a stronger one.
--
-- Their LIFECYCLE is identical — issue, send, consume EXACTLY ONCE, expire —
-- and the consume is the security-critical operation in both. One table is one
-- `consumeCredentialToken` doing one atomic `UPDATE … WHERE consumed_at IS
-- NULL … RETURNING`. Two tables is two copies of that, and the second copy is
-- where the race gets forgotten. The payload difference is held by a CHECK
-- instead, where a reviewer can see both shapes at once.
--
-- ─── DORMANT: NOTHING READS OR WRITES THESE YET ──────────────────────────
--
-- AC0 ships the schema and the contract only. No route, no repository write,
-- no UI. AC1 opens sign-up and verification, AC2 sign-in, AC3 reset.
--
-- Additive, idempotent.

-- ─── credentials ─────────────────────────────────────────────────────────

-- One row per person who has a password HERE. Somebody who only ever signs in
-- with Orunbase never appears in this table at all — which is why it is not,
-- and must never become, this app's user directory. openproduct still keeps no
-- user table; it keeps a table of people who chose a password.
CREATE TABLE IF NOT EXISTS openproduct.credentials (
  -- The platform's opaque id, and the ONLY thing about the person here. Not an
  -- address, not a hash of one, not a normalised form of one: a derivative of
  -- an address openproduct has no use for is still a derivative of an address
  -- (R1 rejected exactly that as option (b), for buying nothing).
  subject_id   TEXT        PRIMARY KEY,

  -- argon2id, encoded with its own parameters, so a future cost increase can
  -- be detected per row and rehashed on next sign-in rather than requiring
  -- everybody to reset. Never logged, never echoed, never in an error body.
  verifier     TEXT        NOT NULL,

  -- WHEN THE ADDRESS WAS PROVEN, not whether an address is present — there is
  -- no address here to be present. A row exists only once a token was
  -- consumed, so in practice this is never null; it is stored rather than
  -- implied because "when" is a question incident response asks and a row's
  -- existence cannot answer.
  verified_at  TIMESTAMPTZ NOT NULL,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A verifier is a long encoded string; an empty or short one means a write
  -- path constructed it wrongly, and a password store is the last place to
  -- find that out from behaviour.
  CONSTRAINT credentials_verifier_shape_check
    CHECK (length(verifier) >= 16)
);

-- ─── one-time tokens, for both flows ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS openproduct.credential_tokens (
  -- THE HASH, NEVER THE TOKEN. A token readable from this table is a token
  -- anybody with a read on this database can use — which is the difference
  -- between "somebody stole the database" and "somebody stole every account".
  -- The primary key IS the hash, so a lookup is a lookup by the only thing
  -- stored.
  token_hash   TEXT        PRIMARY KEY,

  --   verify  a sign-up: a verifier waits behind it, no subject exists yet
  --   reset   a forgotten password: the subject exists, no verifier yet
  purpose      TEXT        NOT NULL,

  -- Present for `reset`, absent for `verify`. The CHECK below is what makes
  -- that a rule rather than a convention.
  subject_id   TEXT,

  -- Present for `verify`, absent for `reset`. The password somebody typed at
  -- sign-up, already hashed, waiting for them to prove they read the mail. It
  -- lives HERE rather than on `credentials` so that an unverified sign-up
  -- cannot create a row on the table that means "this person has an account".
  verifier     TEXT,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- SHORT, and set by the caller rather than defaulted here, because the two
  -- purposes deserve different windows and a default would quietly give them
  -- the same one.
  expires_at   TIMESTAMPTZ NOT NULL,
  -- EXACTLY ONCE. Consuming is an atomic update guarded on this being null, so
  -- two clicks on the same link race in the database rather than in a handler.
  consumed_at  TIMESTAMPTZ,

  CONSTRAINT credential_tokens_purpose_check
    CHECK (purpose IN ('verify', 'reset')),

  -- THE TWO SHAPES, side by side, where a reviewer sees both at once. This is
  -- the CHECK that earns the single table.
  CONSTRAINT credential_tokens_shape_check
    CHECK (
      (purpose = 'verify' AND subject_id IS NULL AND verifier IS NOT NULL)
      OR (purpose = 'reset' AND subject_id IS NOT NULL AND verifier IS NULL)
    ),

  CONSTRAINT credential_tokens_window_check
    CHECK (expires_at > created_at)
);

-- The expiry sweep's own read: live tokens, oldest first. Partial, because a
-- consumed token is never swept and never looked up again.
CREATE INDEX IF NOT EXISTS openproduct_credential_tokens_live_idx
  ON openproduct.credential_tokens (expires_at)
  WHERE consumed_at IS NULL;

-- AC3's read: the reset tokens outstanding for one person, so issuing a new
-- one can invalidate the old. Partial for the same reason.
CREATE INDEX IF NOT EXISTS openproduct_credential_tokens_subject_idx
  ON openproduct.credential_tokens (subject_id)
  WHERE subject_id IS NOT NULL AND consumed_at IS NULL;

COMMENT ON TABLE openproduct.credentials IS
  'AC0 (openproduct-launch) — the password store, holding NO ADDRESS at any '
  'point. The plan asked for an email column and R1''s binding text allowed one '
  'until verification; both lose to I3 as written ("no email column exists '
  'anywhere in the openproduct schema", enforced by an information_schema query '
  'that covers every future table without anyone extending it) and to R1''s own '
  'decision (a): the platform keeps the address and openproduct holds nothing. '
  'The address is carried by the TOKEN instead — openproduct hands the platform '
  'an address and a token, the platform holds the pair and sends, and when '
  'somebody returns with the token openproduct receives a SUBJECT ID back and '
  'never the address. Two things fall out: enumeration becomes structural '
  '(openproduct cannot tell a known address from an unknown one, so it cannot '
  'answer differently), and there is no window in which a row holds an address '
  'to leak, appear in a backup, or reach a log. The cost, stated plainly: the '
  'platform is in the loop on every sign-in, because openproduct has no address '
  'to match a typed one against. NOT A USER DIRECTORY: somebody who only signs '
  'in with Orunbase never appears here.';

COMMENT ON TABLE openproduct.credential_tokens IS
  'AC0 (openproduct-launch) — one-time tokens for sign-up verification and '
  'password reset. THE HASH IS STORED, NEVER THE TOKEN: a readable token is the '
  'difference between losing a database and losing every account. ONE TABLE FOR '
  'TWO PURPOSES because their lifecycle is identical — issue, send, consume '
  'exactly once, expire — and the consume is the security-critical operation in '
  'both; one table is one atomic UPDATE guarded on consumed_at, where two would '
  'be two copies of it and the second is where the race gets forgotten. The '
  'differing payloads (verify carries a waiting verifier and no subject; reset '
  'carries a subject and no verifier) are held by a CHECK that shows both '
  'shapes at once. A sign-up verifier waits HERE rather than on credentials, so '
  'an unverified sign-up cannot create a row meaning "this person has an '
  'account".';
