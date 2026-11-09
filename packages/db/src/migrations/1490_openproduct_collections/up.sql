-- 1490_openproduct_collections (openproduct-commons LC4)
--
-- THE ONE PLACE EDITORIAL JUDGEMENT IS ALLOWED, AND WHY IT IS ALLOWED HERE.
--
-- Context: openproduct
--
-- Every ordering this estate ships is a published rule with no thumb on it:
-- DS2's three sorts, DS4's similar panel, LC1's digest, LC3's board. OPC-4
-- forbids an order a reader cannot reproduce from a sentence, and that
-- forbidding is what makes the directory trustworthy.
--
-- A collection is the deliberate exception, and LC-4 says exactly what buys
-- the exception: ATTRIBUTION. "These eight, in this order, because I say so"
-- is a fine thing for a person to publish and an intolerable thing for a
-- platform to publish. The difference is a name, so the name is NOT NULL and
-- the public read will not render a collection whose name has stopped
-- resolving.
--
-- ─── WHAT "SIGNED" HAD TO MEAN ───────────────────────────────────────────
--
-- Not "has a subject id in a column" — that is signed the way an unsigned
-- editorial is signed by the CMS user who pasted it. It means the curator is
-- a person a reader can go and look at: a public contributor profile, at a
-- handle that resolves, held by somebody who has actually shipped something
-- here. That is CG4's biconditional (`handleJoinFor`), and this table leans on
-- it rather than inventing a second idea of who is nameable.
--
-- THE CONSEQUENCE, STATED PLAINLY: somebody who has published nothing on this
-- estate cannot publish a collection on it. That is a real bar and it is the
-- intended one — the people who get to say what is good here are the people
-- who have built something here. It also means a curator who takes their
-- profile private takes their collections with it, which is the correct
-- coupling: the judgement was only ever publishable because it was
-- attributable, so when attribution ends, so does publication.
--
-- ─── ORDER IS THE CURATION ───────────────────────────────────────────────
--
-- `position` is the curator's, and NOTHING re-ranks it. This is the one
-- surface on the estate with no sort control, deliberately: offering "sort by
-- most active" over somebody's curation destroys the thing it is. A
-- collection sorted by the reader is just the directory with fewer rows.
--
-- ─── AN ITEM THAT STOPPED BEING PUBLIC IS HIDDEN, NOT BROKEN ─────────────
--
-- The public read joins items through `listed()`, so a listing that was
-- delisted, removed or unpublished simply is not in the collection today. The
-- ROW SURVIVES — the curator chose it, and if the listing comes back so does
-- the item. What must never happen is the whole collection 404ing because one
-- of eight items went away, which is the failure the milestone names.
--
-- The count a reader sees is therefore computed from what is SHOWN, never
-- from `collection_items`. A page saying "8 products" above three cards is a
-- page lying about a number it could have counted correctly.
--
-- Additive and idempotent: no existing table, index, or constraint is touched.

CREATE TABLE IF NOT EXISTS openproduct.collections (
  id            UUID        PRIMARY KEY,

  -- Its public address, in the same namespace rules as a listing's. 1360
  -- already reserved `collections` as a route, so `/collections/<slug>` cannot
  -- collide with a listing at `/<slug>`.
  slug          TEXT        NOT NULL,

  title         TEXT        NOT NULL,
  -- Why these, in the curator's own words. Optional, because a good title
  -- sometimes says it, and a required field invites filler.
  blurb         TEXT,

  -- THE SIGNATURE. Never null, never 'automatic', never an org: a collection
  -- is a person's judgement or it is not publishable. Opaque subject id, no
  -- FK — the same posture every other cross-boundary reference here takes.
  curator_subject_id TEXT   NOT NULL,

  --   draft      being assembled; nothing public renders it
  --   published  live at its address and in the index
  --   retired    the curator took it down. The row survives so a link that
  --              was shared does not become somebody else's page later.
  state         TEXT        NOT NULL DEFAULT 'draft',

  published_at  TIMESTAMPTZ,
  retired_at    TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT collections_state_check
    CHECK (state IN ('draft', 'published', 'retired')),
  CONSTRAINT collections_curator_present
    CHECK (length(trim(curator_subject_id)) > 0),
  CONSTRAINT collections_title_bounded
    CHECK (length(trim(title)) BETWEEN 1 AND 120),
  CONSTRAINT collections_blurb_bounded
    CHECK (blurb IS NULL OR length(blurb) <= 600),
  CONSTRAINT collections_slug_shape
    CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$'),
  -- A draft has no publish time and everything else has one. Retired is on
  -- the "has one" side deliberately: a collection can only be retired from
  -- published, so a retired row with no publish time is a row that claims a
  -- history it never had.
  CONSTRAINT collections_published_coherent
    CHECK ((state = 'draft') = (published_at IS NULL)),
  CONSTRAINT collections_retired_coherent
    CHECK ((state = 'retired') = (retired_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS openproduct_collections_slug_unique
  ON openproduct.collections (lower(slug));

-- The index's read: what is live, most recently published first.
CREATE INDEX IF NOT EXISTS openproduct_collections_published
  ON openproduct.collections (published_at DESC)
  WHERE state = 'published';

-- "What has this person curated" — the studio's question, and CG1's profile
-- will want it too.
CREATE INDEX IF NOT EXISTS openproduct_collections_by_curator
  ON openproduct.collections (curator_subject_id, created_at DESC);

-- ─── The items, in the curator's order ───────────────────────────────────
--
-- FK to the collection (cascade: a deleted collection takes its items) and to
-- the listing (cascade: the same teardown-unit rule `launches` and
-- `role_openings` follow). Cascading on the listing is right here because an
-- item whose listing was DELETED — not delisted, deleted — is not a hidden
-- item, it is a reference to nothing.
CREATE TABLE IF NOT EXISTS openproduct.collection_items (
  collection_id UUID        NOT NULL
                  REFERENCES openproduct.collections (id) ON DELETE CASCADE,
  profile_id    UUID        NOT NULL
                  REFERENCES openproduct.profiles (id) ON DELETE CASCADE,

  -- The curator's order, and the only order this surface has. Nothing
  -- re-ranks it: a collection sorted by the reader is the directory with
  -- fewer rows.
  position      INTEGER     NOT NULL,

  -- Why THIS one, in the curator's words. The thing a collection has that a
  -- filtered list does not.
  note          TEXT,

  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT collection_items_pk PRIMARY KEY (collection_id, profile_id),
  CONSTRAINT collection_items_position_sane CHECK (position >= 0),
  CONSTRAINT collection_items_note_bounded
    CHECK (note IS NULL OR length(note) <= 400)
);

-- ONE LISTING ONCE PER COLLECTION is the PRIMARY KEY above, not a separate
-- index: a collection naming the same product twice is a mistake in every
-- case, and the curator meant to move it rather than add it again.

-- The page's read, in order.
CREATE INDEX IF NOT EXISTS openproduct_collection_items_ordered
  ON openproduct.collection_items (collection_id, position ASC);

-- "Which collections hold this listing" — the listing page will ask, and it
-- is the read that makes a collection worth being in.
CREATE INDEX IF NOT EXISTS openproduct_collection_items_by_profile
  ON openproduct.collection_items (profile_id);

COMMENT ON TABLE openproduct.collections IS
  'LC4 — the one place editorial judgement is allowed, and attribution is what buys the exception (LC-4). "These eight, in this order, because I say so" is fine for a person to publish and intolerable for a platform to publish; the difference is a name, so curator_subject_id is NOT NULL and the public read will not render a collection whose curator no longer resolves to a public profile (CG4''s biconditional). A curator who takes their profile private takes their collections with it, which is the correct coupling.';

COMMENT ON COLUMN openproduct.collection_items.position IS
  'The curator''s order, and the only order this surface has. Nothing re-ranks it: offering "sort by most active" over somebody''s curation destroys the thing it is.';

COMMENT ON TABLE openproduct.collection_items IS
  'LC4 — an item whose listing stopped being public is HIDDEN by the read''s listed() join, never 404ing the collection around it. The row survives, so if the listing comes back so does the item.';
