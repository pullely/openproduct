-- 1360_openproduct_handles (openproduct-commons CG0)
--
-- THE HANDLE NAMESPACE, AND WHY A RELEASED HANDLE IS NEVER RE-ISSUED.
--
-- Context: openproduct
--
-- `openproduct.live/kettleworks` is a product. `openproduct.live/@ada` is a
-- person. The `@` is part of the URL rather than decoration (OPC-B): two flat
-- namespaces at the root would need a shared uniqueness table, and every new
-- reserved word would become a breaking change for whoever already held it.
-- With the sigil, the two namespaces cannot collide at all, and the router
-- can tell them apart without consulting a database.
--
-- A RELEASED HANDLE IS A TOMBSTONE, NOT A FREE SLOT (CG-1). This is the
-- decision in this file that costs something and is worth the cost.
--
-- A handle is an identity somebody handed out. It is in commit messages, in
-- chat logs, on a conference badge, in somebody's address book. Re-issuing
-- `@ada` to a different person six months after the first Ada left does not
-- give the new holder a name — it gives them the ACCUMULATED TRUST of a
-- stranger, and gives everyone who knew the first Ada a page that looks like
-- her and is not. Every platform that has allowed this has produced the same
-- incident, and the remedy is always the same and always retrospective.
--
-- So the row survives release, `released_at` is set, and the unique index
-- covers released rows too. The cost is that the namespace only ever shrinks.
-- That is the correct trade for a namespace whose entries are people.
--
-- ONE SUBJECT, ONE ACTIVE HANDLE. A partial unique index rather than a plain
-- one, because the constraint is about the LIVE rows: a person may release a
-- handle and claim another, and both rows then exist forever.
--
-- THE RESERVED LIST IS SEEDED AS DATA, not enforced in a CHECK. A CHECK would
-- make every new top-level route a migration, and would make the list
-- invisible to the API that has to explain a refusal. Reserved entries are
-- rows with a null subject, which also means a reserved handle cannot be
-- claimed by the same code path that refuses a taken one -- there is one
-- refusal, not two.
--
-- NOTHING RENDERS FROM THIS TABLE YET. CG1 brings the public profile; CG0
-- ships the namespace and its rules so that the first person to claim a
-- handle cannot be given one that later has to be taken back.
--
-- Additive and idempotent: no existing table, index, or constraint is touched.

CREATE TABLE IF NOT EXISTS openproduct.handles (
  handle       TEXT        NOT NULL,
  -- NULL means RESERVED: nobody holds it and nobody may. A reserved row and a
  -- released row are different things and the API says which.
  subject_id   TEXT,
  -- Why it is reserved, for the refusal message. Null for a claimed handle.
  reserved_for TEXT,
  claimed_at   TIMESTAMPTZ,
  released_at  TIMESTAMPTZ,

  CONSTRAINT handles_pk PRIMARY KEY (handle),
  -- The grammar is in the CHECK as well as in the contract: this column is a
  -- URL segment, and one that only the application validates is one a direct
  -- INSERT can break for every reader.
  -- 2–32 characters of [a-z0-9-], never leading or trailing a dash. Note
  -- there is NO optional group: an earlier spelling wrote the tail as
  -- `([a-z0-9-]{0,30}[a-z0-9])?`, which also admits a ONE-character handle
  -- and so silently failed to enforce the minimum the reserved list assumes.
  CONSTRAINT handles_grammar CHECK (handle ~ '^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$'),
  -- A reserved row has no holder and no claim time; a claimed row has both.
  CONSTRAINT handles_claim_coherent CHECK (
    (subject_id IS NULL AND claimed_at IS NULL) OR
    (subject_id IS NOT NULL AND claimed_at IS NOT NULL)
  ),
  -- Nothing is released that was never claimed.
  CONSTRAINT handles_release_after_claim CHECK (
    released_at IS NULL OR (claimed_at IS NOT NULL AND released_at >= claimed_at)
  ),
  -- A reserved row is never released — it was never anyone's.
  CONSTRAINT handles_reserved_not_released CHECK (
    reserved_for IS NULL OR (subject_id IS NULL AND released_at IS NULL)
  )
);

-- ONE ACTIVE HANDLE PER SUBJECT. Partial, because released rows are permanent
-- and a person who releases one and claims another must be able to.
CREATE UNIQUE INDEX IF NOT EXISTS openproduct_handles_one_active_per_subject
  ON openproduct.handles (subject_id)
  WHERE subject_id IS NOT NULL AND released_at IS NULL;

-- The reverse lookup CG1's profile read makes.
CREATE INDEX IF NOT EXISTS openproduct_handles_subject
  ON openproduct.handles (subject_id)
  WHERE subject_id IS NOT NULL;

-- The reserved list (OPC-B), seeded. Every existing top-level route plus the
-- ones the design draws and LC/DS will add — reserving a word costs nothing
-- today and is impossible once somebody holds it.
--
-- `sitemap.xml` is deliberately ABSENT: it fails the grammar (a dot), so it
-- can never be claimed and needs no row. A reserved list that contains
-- unclaimable entries teaches its reader that the list is decorative.
INSERT INTO openproduct.handles (handle, reserved_for)
VALUES
  ('me', 'route'),
  ('create', 'route'),
  ('studio', 'route'),
  ('auth', 'route'),
  ('docs', 'route'),
  ('people', 'route'),
  ('launches', 'route'),
  ('collections', 'route'),
  ('saved', 'route'),
  ('api', 'route'),
  ('digest', 'route'),
  ('sitemap', 'route'),
  ('search', 'route'),
  ('join', 'route'),
  ('settings', 'route'),
  ('admin', 'impersonation'),
  ('support', 'impersonation'),
  ('help', 'impersonation'),
  ('security', 'impersonation'),
  ('openproduct', 'impersonation'),
  ('orunbase', 'impersonation'),
  ('official', 'impersonation'),
  ('staff', 'impersonation'),
  ('team', 'impersonation'),
  ('root', 'impersonation'),
  ('system', 'impersonation')
ON CONFLICT (handle) DO NOTHING;
