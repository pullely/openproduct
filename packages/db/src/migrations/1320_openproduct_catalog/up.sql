-- 1320_openproduct_catalog (openproduct-commons CT0)
--
-- THE RECORD THE COMMONS FILTERS, RANKS AND RETURNS.
--
-- Context: openproduct
--
-- Today a listing carries a slug, a tagline, a free-form `stack` JSONB the
-- maintainer typed, and nothing a second listing can be compared against.
-- The reference design's facet rail asks seven questions of every product —
-- Category, Stack, Licence, Openings, Activity, Team size, Hosting — and a
-- count beside each. A count over free text is a lie: `TypeScript`,
-- `typescript` and `TS` are three facets and one language.
--
-- CLOSED VOCABULARIES WITH ONE OPEN, CANONICALISED TAIL (CT-1).
-- `category`, `licence`, `hosting` and `team_size` are closed enumerations —
-- a listing picks from a list. `stack` stays open, because our list of
-- languages will always be behind somebody's, but every entry is resolved
-- against a canonical value at write time; what does not resolve is KEPT as
-- authored text and never becomes a facet. A maintainer is never blocked by
-- our vocabulary, and the counts never lie.
--
-- `openings`, `activity` and `team_size` are DERIVED facets: nothing is
-- stored for them here. They are computed from role_openings, from SN's
-- metrics, and from the maintainer roster respectively, into the same
-- `facet_counts` rows the stored facets use. This table therefore holds only
-- the facets a human ASSIGNS.
--
-- WHY facet_values IS A TABLE AND NOT AN ENUM. Three reasons, in order of
-- how much they cost to get wrong: a Postgres enum cannot be extended inside
-- a transaction that also uses it; the vocabularies carry a label, a sort
-- order and a description that the docs page renders (OPC-9), which an enum
-- has nowhere to put; and retiring a value must be possible without
-- rewriting every row that used it (`retired_at`, not DELETE).
--
-- FACET COUNTS ARE PRECOMPUTED (CT-4). `417 looking for contributors` renders
-- on a page that resolves no actor and is edge-cached for 60s (OPC-1). It
-- cannot be a COUNT(*) at request time, so it is a row, recomputed on write
-- and on a 60s ceiling — the same freshness the page itself promises.
--
-- NO EMAIL, NO CROSS-SCHEMA FOREIGN KEY, and everything inside the
-- `openproduct` schema: the OD2a boundary rule and OD0's teardown/relocation
-- unit, both unchanged. `DROP SCHEMA openproduct CASCADE` stays one statement.
--
-- DORMANT ON ARRIVAL. Nothing routes to these tables until CT1; CT0 is the
-- model and its contracts, deliberately unreachable.
--
-- Additive and idempotent: no existing table, index, or constraint is touched.

-- The seven groups the design's rail asks about. One row per group, so the
-- rail's order, its label and its "is this assigned or derived?" nature are
-- data rather than a constant in a component.
CREATE TABLE IF NOT EXISTS openproduct.facets (
  -- Stable machine name; the URL uses it (`?category=dev-tools`), so it is
  -- part of the public contract and never renamed in place.
  id            TEXT        PRIMARY KEY,
  label         TEXT        NOT NULL,

  -- 'assigned' — a maintainer picks it, and it is stored on the listing.
  -- 'derived'  — computed from other facts; no column on profiles exists.
  kind          TEXT        NOT NULL,

  -- 'single' or 'multi': how many values one listing may carry. Enforced in
  -- the repository rather than by a constraint, because `stack` is multi and
  -- lives in JSONB — the rule has one home, and this column is what the rail
  -- and the API read to describe themselves.
  cardinality   TEXT        NOT NULL,

  -- Rail order. The design's is Category · Stack · Licence · Openings ·
  -- Activity · Team size · Hosting.
  sort_order    INTEGER     NOT NULL DEFAULT 0,

  -- Rendered on the docs page beside the facet, so a reader can find out what
  -- "Activity" is counting without reading our code (OPC-2/OPC-9).
  description   TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT facets_kind_check CHECK (kind IN ('assigned', 'derived')),
  CONSTRAINT facets_cardinality_check CHECK (cardinality IN ('single', 'multi'))
);

-- The vocabulary inside a group.
CREATE TABLE IF NOT EXISTS openproduct.facet_values (
  facet_id    TEXT        NOT NULL REFERENCES openproduct.facets (id) ON DELETE CASCADE,

  -- The canonical machine value (`typescript`, `apache-2-0`, `dev-tools`).
  value       TEXT        NOT NULL,

  -- What a human reads (`TypeScript`, `Apache-2.0`, `Dev tools`). Distinct
  -- from `value` because the machine name must survive a relabelling.
  label       TEXT        NOT NULL,

  -- Lower-cased spellings that resolve TO this value. JSONB, not TEXT[]: the
  -- workers' postgres client runs fetch_types:false, so JSONB is the array
  -- encoding every read path already parses (the `stack` precedent).
  aliases     JSONB       NOT NULL DEFAULT '[]'::jsonb,

  sort_order  INTEGER     NOT NULL DEFAULT 0,

  -- Retired, never deleted: rows that used this value stay valid and stay
  -- readable, and the value simply stops being offered.
  retired_at  TIMESTAMPTZ,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (facet_id, value)
);

-- Resolving a typed alias to its canonical value is the hot write-path read.
CREATE INDEX IF NOT EXISTS openproduct_facet_values_live_idx
  ON openproduct.facet_values (facet_id, sort_order)
  WHERE retired_at IS NULL;

-- The precomputed counts the rail renders (CT-4). One row per
-- (facet, value); `derived` facets write here exactly like assigned ones, so
-- the rail has one read regardless of where a number came from.
CREATE TABLE IF NOT EXISTS openproduct.facet_counts (
  facet_id     TEXT        NOT NULL,
  value        TEXT        NOT NULL,

  -- Public listings carrying this value, as of computed_at.
  count        INTEGER     NOT NULL DEFAULT 0,

  -- OPC-7: a count is an observation with a time, and the surface may render
  -- it only as fresh as this. Deliberately not a `updated_at` default —
  -- the recompute sets it explicitly, so a row can never look fresher than
  -- the pass that wrote it.
  computed_at  TIMESTAMPTZ NOT NULL,

  PRIMARY KEY (facet_id, value)
);

-- The three facets a maintainer ASSIGNS and that are single-valued live as
-- columns on the listing: they are read on every card and every page, and a
-- join per card is a join per row of the hot path.
--
-- Nullable throughout, deliberately. An unassigned facet is NOT an empty
-- string and NOT a default bucket: the listing has not answered, the rail
-- shows it under nothing, and the page renders no chip. Same rule SN applies
-- to an unobserved metric — absence is not zero.
ALTER TABLE openproduct.profiles
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS hosting  TEXT,
  -- The canonicalised half of `stack` (CT-1). The authored `stack` column is
  -- untouched and stays the maintainer's own words; this is the resolved
  -- subset, and it is the ONLY one facets and counts read.
  ADD COLUMN IF NOT EXISTS stack_canonical JSONB;

-- The directory's facet filter, on the hot path's own predicate.
CREATE INDEX IF NOT EXISTS openproduct_profiles_category_idx
  ON openproduct.profiles (category, published_at DESC)
  WHERE visibility = 'public';

COMMENT ON TABLE openproduct.facets IS
  'The seven facet groups the reference design''s rail asks about (openproduct-commons CT0). '
  'kind=assigned means a maintainer picks it and a column holds it; kind=derived means it is '
  'computed into facet_counts from role_openings, SN metrics or the roster.';

COMMENT ON TABLE openproduct.facet_values IS
  'The vocabulary inside a facet group (openproduct-commons CT0). Closed for category, licence, '
  'hosting and team_size; open-but-canonicalised for stack, where an unresolved entry stays '
  'authored text on profiles.stack and never becomes a facet (CT-1). Values are retired, never '
  'deleted — a listing that used one stays valid.';

COMMENT ON TABLE openproduct.facet_counts IS
  'Precomputed facet counts (openproduct-commons CT-4). The rail renders on a page that resolves '
  'no actor and is edge-cached 60s, so a count cannot be a COUNT(*) at request time. computed_at '
  'is set explicitly by the recompute, so a row never looks fresher than the pass that wrote it.';

COMMENT ON COLUMN openproduct.profiles.stack_canonical IS
  'The resolved subset of profiles.stack (openproduct-commons CT-1) — the only one facets and '
  'counts read. profiles.stack stays the maintainer''s own words, including entries our '
  'vocabulary did not recognise.';
