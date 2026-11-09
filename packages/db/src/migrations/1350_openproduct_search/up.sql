-- 1350_openproduct_search (openproduct-commons DS0)
--
-- THE INDEX, AND WHY IT DOES NOT USE POSTGRES FULL-TEXT SEARCH.
--
-- Context: openproduct
--
-- A directory is a list; a commons is something you can search. This is the
-- store behind the `⌘K` the design puts in the top panel of every route.
--
-- THE INDEX IS BUILT FROM THE CATALOG DOCUMENT, NEVER FROM THE PROFILES TABLE
-- (DS-1). Not a preference — it is the whole safety argument. Anything this
-- table can return is, by construction, something the public read would have
-- returned anyway, so the index cannot leak a draft listing, an unconfirmed
-- role, or a removed post. The builder's INPUT TYPE is the public projection,
-- so a private column is not something a future edit has to remember to
-- exclude: it is not in scope to be included. A second query that selected
-- `FROM openproduct.profiles WHERE visibility = 'public'` would be a second
-- place to get that predicate right, and the second place is always the one
-- that is wrong.
--
-- THE REPLACE IS WHOLESALE, and that is how deletion works. An unpublished
-- listing does not need anyone to remember to remove its row: it is simply
-- absent from the next document, and the rebuild deletes what the document no
-- longer contains. Every "we forgot to de-index it" bug is a bug in an
-- incremental index; this one cannot have them.
--
-- `terms text[]` + GIN, NOT `tsvector` + `ts_rank` — AND THIS IS OPC-4, NOT A
-- PERFORMANCE CHOICE. `ts_rank` is a weighted black box: term frequency,
-- document length normalisation and position weights combined by constants
-- nobody here chose. OPC-4 says no ordering ships without a sentence a person
-- can read, and there is no honest one-sentence account of `ts_rank`. So
-- Postgres narrows the CANDIDATES (`terms && $1`, which is a set test and has
-- no opinion about order) and the ORDER is decided by a published formula in
-- the contract, which `/docs` renders. The database finds; the contract ranks.
--
-- The same choice costs us stemming, which we buy back in the tokeniser —
-- shared between build and query, so the two can never disagree about what a
-- word is. A tokeniser used on only one side is how a search box stops
-- matching documents it built itself.
--
-- KIND IS OPEN TEXT, not a CHECK. CG1 adds `person` and LC3 may add
-- `collection`; pinning the vocabulary here would make each of those a
-- migration for no gain — nothing about correctness depends on the set being
-- closed, because the builder decides what it emits.
--
-- Additive and idempotent: no existing table, index, or constraint is touched.

-- One row per indexed entity. Every column is a COPY of something the public
-- read returns — there is nothing here that could be rendered which was not
-- already renderable.
CREATE TABLE IF NOT EXISTS openproduct.search_index (
  kind        TEXT        NOT NULL,
  entity_id   TEXT        NOT NULL,
  -- What a result shows. Held rather than joined back to profiles: a join
  -- would reintroduce the private table on the read path, and the read path
  -- is the one thing DS-1 is protecting.
  title       TEXT        NOT NULL,
  summary     TEXT,
  -- The matchable tokens, from the shared tokeniser.
  terms       TEXT[]      NOT NULL,
  -- The facet values this entity holds, so a stack result can become a facet
  -- selection without a second read.
  facets      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  built_at    TIMESTAMPTZ NOT NULL,

  CONSTRAINT search_index_pk PRIMARY KEY (kind, entity_id),
  -- An entity with no terms can never match, so it is a row that costs
  -- storage and returns nothing. The builder is expected to drop it.
  CONSTRAINT search_index_terms_present CHECK (cardinality(terms) > 0)
);

-- The candidate narrowing. `terms && $1` is an overlap test, which GIN answers
-- directly; the ordering happens afterwards, in code we can publish.
CREATE INDEX IF NOT EXISTS openproduct_search_index_terms
  ON openproduct.search_index USING GIN (terms);

-- ONE ROW, EVER. The rebuild floor lives here rather than in worker memory
-- because there is no single worker: an isolate that rebuilt on its own timer
-- would rebuild once per isolate, which on a busy minute is the sixty
-- rebuilds the floor exists to prevent.
--
-- `dirty_at` is set by every write that could change the document (publish,
-- unpublish, facet edit, metric refresh) and cleared by the rebuild. A NULL
-- `dirty_at` with a non-NULL `built_at` means "current"; a NULL `built_at`
-- means the index has never been built and the first request must build it.
CREATE TABLE IF NOT EXISTS openproduct.search_index_state (
  singleton  BOOLEAN     NOT NULL DEFAULT TRUE,
  built_at   TIMESTAMPTZ,
  dirty_at   TIMESTAMPTZ,

  CONSTRAINT search_index_state_pk PRIMARY KEY (singleton),
  CONSTRAINT search_index_state_singleton CHECK (singleton)
);

INSERT INTO openproduct.search_index_state (singleton, built_at, dirty_at)
VALUES (TRUE, NULL, now())
ON CONFLICT (singleton) DO NOTHING;
