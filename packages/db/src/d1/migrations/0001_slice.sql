-- openproduct on D1 — the slice schema (openproduct-standalone OPN, D1 slice proof).
--
-- EXACTLY the tables the six slice methods touch (rebuildCatalogue,
-- listCataloguePage, replaceSearchIndex, searchCandidates,
-- getSearchIndexState, markSearchIndexDirty), each at its LATEST shape: the
-- Postgres ladder's every ALTER folded in. Where a column came from:
--
--   profiles           1160 + 1260 components + 1300 link_grant + 1320 category/hosting/stack_canonical
--                      + 1370 indexable + 1440 moderation + 1780 repo_name/description/topics
--                      + 1810 repo_language/pushed_at/open_issues + 1830 install_line
--                      + 1840 clean_votes + 1900 pricing (1870 is a data repair, no shape change)
--   role_openings      1160
--   metrics            1340
--   product_media      1820 + 2255 (logo kind)
--   search_index       1350
--   search_index_state 1350 + 1860 last_error/last_error_at
--   catalog_cards      1925
--   catalog_state      1925
--
-- TRANSLATION RULES (the table with every site is in PROOF.md):
--   * no schema: `openproduct.x` is `x` (one database per product on D1).
--   * UUID → TEXT. JSONB → TEXT holding JSON, CHECKed with json_valid/json_type.
--   * BOOLEAN → INTEGER 0/1, CHECKed.  BIGINT/INTEGER → INTEGER (64-bit).
--   * TIMESTAMPTZ → TEXT in ONE format, `YYYY-MM-DDTHH:MM:SS.sssZ` (UTC, ms),
--     CHECKed on every column as `strftime('%Y-%m-%dT%H:%M:%fZ', c) IS c` — the
--     value must round-trip through SQLite's own formatter unchanged, so a
--     value in any other format (or an impossible date: 02-30 normalises to
--     03-02) cannot be stored. In that one format lexical order IS time order,
--     which is what makes `>=`, ORDER BY and the indexes below mean what they
--     meant. (A GLOB of the format would be 120 bytes; D1 refuses LIKE/GLOB
--     patterns over 50 — "LIKE or GLOB pattern too complex", found here.)
--   * D1 LIMITS THE SCHEMA RESPECTS: ≤ 50-byte GLOB patterns (the install
--     line's three are 10, 36 and 30 bytes), ≤ 32 arguments per SQL function
--     (`char(…)` below takes exactly 32), ≤ 100 columns per table (39).
--     `DEFAULT now()` → `DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`.
--   * TEXT[] (search_index.terms) → JSON TEXT for the value, PLUS a
--     `search_index_terms(term, kind, entity_id)` table keyed on term, which
--     replaces the GIN index: `terms && $1` becomes a key lookup per term.
--   * CHECKs kept, regexes (`~`) rewritten as GLOB/instr (D1 has no REGEXP),
--     `btrim` → `trim`. The plpgsql gallery trigger → a SQLite trigger.
--   * `COLLATE "C"` → SQLite's default BINARY (memcmp over UTF-8 = "C").
--   * `DESC NULLS LAST` in an index → plain `DESC`: SQLite cannot spell NULLS
--     LAST in CREATE INDEX ("unsupported use of NULLS LAST"), and does not
--     need to — NULL is the smallest value, so DESC already puts it last.
--
-- Applied by `wrangler d1 migrations apply` in a deployment, and by
-- `src/d1/schema.ts` (the same file, split statement by statement) in tests.

-- ─── profiles ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id                TEXT    PRIMARY KEY,
  org_id            TEXT    NOT NULL,
  project_id        TEXT    NOT NULL,
  slug              TEXT    NOT NULL,
  visibility        TEXT    NOT NULL DEFAULT 'private',
  tagline           TEXT,
  pitch_body        TEXT,
  pitch_digest      TEXT,
  repo_url          TEXT,
  live_url          TEXT,
  stack             TEXT,
  repo_visibility   TEXT,
  repo_licence      TEXT,
  repo_checked_at   TEXT,
  reviewed_at       TEXT,
  reviewed_by       TEXT,
  published_at      TEXT,
  created_by        TEXT    NOT NULL,
  updated_by        TEXT,
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  components        TEXT,
  link_grant        TEXT,
  category          TEXT,
  hosting           TEXT,
  stack_canonical   TEXT,
  indexable         INTEGER NOT NULL DEFAULT 1,
  moderation_state  TEXT    NOT NULL DEFAULT 'visible',
  moderated_at      TEXT,
  moderation_act_id TEXT,
  repo_name         TEXT,
  repo_description  TEXT,
  repo_topics       TEXT,
  repo_language     TEXT,
  repo_pushed_at    TEXT,
  repo_open_issues  INTEGER,
  install_line      TEXT,
  clean_votes       INTEGER NOT NULL DEFAULT 0,
  pricing           TEXT,
  CONSTRAINT profiles_visibility_check CHECK (visibility IN ('private', 'public')),
  CONSTRAINT profiles_repo_visibility_check
    CHECK (repo_visibility IS NULL OR repo_visibility IN ('private', 'public')),
  CONSTRAINT profiles_indexable_requires_review
    CHECK (visibility = 'private' OR indexable = 0 OR reviewed_at IS NOT NULL),
  CONSTRAINT profiles_moderation_state_check
    CHECK (moderation_state IN ('visible', 'delisted', 'removed')),
  CONSTRAINT profiles_moderated_at_consistent
    CHECK (
      (moderation_state = 'visible' AND moderated_at IS NULL)
      OR (moderation_state <> 'visible' AND moderated_at IS NOT NULL)
    ),
  CONSTRAINT profiles_repo_open_issues_check
    CHECK (repo_open_issues IS NULL OR repo_open_issues >= 0),
  -- 1830's install line, regex-free: one command, no shell metacharacters, no
  -- substitution, no control characters, none of the invisible ones.
  CONSTRAINT profiles_install_line_check
    CHECK (
      install_line IS NULL
      OR (
        length(trim(install_line)) > 0
        AND length(install_line) <= 160
        AND install_line NOT GLOB '*[|;&`<>]*'
        AND instr(install_line, '$(') = 0
        AND install_line NOT GLOB ('*[' || char(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
                                              17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 127) || ']*')
        AND install_line NOT GLOB ('*[' || char(160) || char(8203) || '-' || char(8207)
                                   || char(8234) || '-' || char(8238)
                                   || char(8294) || '-' || char(8297) || char(65279) || ']*')
      )
    ),
  CONSTRAINT profiles_indexable_bool CHECK (indexable IN (0, 1)),
  CONSTRAINT profiles_clean_votes_bool CHECK (clean_votes IN (0, 1)),
  CONSTRAINT profiles_json CHECK (
    (stack IS NULL OR json_valid(stack))
    AND (stack_canonical IS NULL OR json_valid(stack_canonical))
    AND (components IS NULL OR json_valid(components))
    AND (link_grant IS NULL OR json_valid(link_grant))
    AND (repo_topics IS NULL OR json_valid(repo_topics))
  ),
  CONSTRAINT profiles_instants CHECK (
    strftime('%Y-%m-%dT%H:%M:%fZ', repo_checked_at) IS repo_checked_at
    AND strftime('%Y-%m-%dT%H:%M:%fZ', reviewed_at) IS reviewed_at
    AND strftime('%Y-%m-%dT%H:%M:%fZ', published_at) IS published_at
    AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at) IS created_at
    AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) IS updated_at
    AND strftime('%Y-%m-%dT%H:%M:%fZ', moderated_at) IS moderated_at
    AND strftime('%Y-%m-%dT%H:%M:%fZ', repo_pushed_at) IS repo_pushed_at
  )
);

-- lower() in SQLite folds ASCII only; Postgres folds every cased letter. Two
-- slugs differing only in a non-ASCII letter's case collide on Postgres and
-- not here (see PROOF.md — the slug grammar is the guard, not this index).
CREATE UNIQUE INDEX IF NOT EXISTS openproduct_profiles_slug_idx ON profiles (lower(slug));
CREATE UNIQUE INDEX IF NOT EXISTS openproduct_profiles_project_idx ON profiles (project_id);
CREATE INDEX IF NOT EXISTS openproduct_profiles_public_idx
  ON profiles (published_at DESC) WHERE visibility = 'public';
CREATE INDEX IF NOT EXISTS openproduct_profiles_org_idx ON profiles (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS openproduct_profiles_category_idx
  ON profiles (category, published_at DESC) WHERE visibility = 'public';
-- Postgres: (published_at DESC NULLS LAST, slug ASC). DESC is NULLS LAST here.
CREATE INDEX IF NOT EXISTS openproduct_profiles_visible_public_idx
  ON profiles (published_at DESC, slug ASC)
  WHERE visibility = 'public' AND moderation_state = 'visible';

-- ─── role_openings ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_openings (
  id            TEXT    PRIMARY KEY,
  profile_id    TEXT    NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  title         TEXT    NOT NULL,
  description   TEXT,
  commitment    TEXT,
  status        TEXT    NOT NULL DEFAULT 'open',
  join_link_ref TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT role_openings_status_check CHECK (status IN ('open', 'filled', 'closed')),
  CONSTRAINT role_openings_instants CHECK (
    strftime('%Y-%m-%dT%H:%M:%fZ', created_at) IS created_at
    AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) IS updated_at
  )
);
CREATE INDEX IF NOT EXISTS openproduct_role_openings_profile_idx
  ON role_openings (profile_id, sort_order, created_at);

-- ─── metrics ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS metrics (
  id           TEXT    PRIMARY KEY,
  profile_id   TEXT    NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  metric       TEXT    NOT NULL,
  window_key   TEXT    NOT NULL,
  -- BIGINT on Postgres; SQLite INTEGER is 64-bit. JS reads it as a number,
  -- exact to 2^53, which every count and epoch-second here is.
  value        INTEGER NOT NULL,
  source       TEXT    NOT NULL,
  observed_at  TEXT    NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT metrics_source_check
    CHECK (source IN ('linked_repo', 'declared_repo', 'manifest', 'operator')),
  CONSTRAINT metrics_value_integer CHECK (typeof(value) = 'integer'),
  CONSTRAINT metrics_instants CHECK (
    strftime('%Y-%m-%dT%H:%M:%fZ', observed_at) IS observed_at
    AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at) IS created_at
  )
);
CREATE INDEX IF NOT EXISTS openproduct_metrics_latest_idx
  ON metrics (profile_id, metric, window_key, observed_at DESC);

-- ─── product_media ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_media (
  id           TEXT    PRIMARY KEY,
  profile_id   TEXT    NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  kind         TEXT    NOT NULL,
  storage_ref  TEXT    NOT NULL,
  alt_text     TEXT    NOT NULL,
  width        INTEGER NOT NULL,
  height       INTEGER NOT NULL,
  position     INTEGER NOT NULL DEFAULT 0,
  observed_at  TEXT,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT product_media_kind_check
    CHECK (kind IN ('logo', 'hero', 'gallery', 'screenshot')),
  CONSTRAINT product_media_provenance_check
    CHECK (
      (kind IN ('logo', 'hero', 'gallery') AND observed_at IS NULL)
      OR (kind = 'screenshot' AND observed_at IS NOT NULL)
    ),
  CONSTRAINT product_media_alt_check CHECK (length(trim(alt_text)) > 0),
  CONSTRAINT product_media_dimensions_check CHECK (width > 0 AND height > 0),
  CONSTRAINT product_media_position_check
    CHECK (position >= 0 AND (kind = 'gallery' OR position = 0)),
  CONSTRAINT product_media_instants CHECK (
    strftime('%Y-%m-%dT%H:%M:%fZ', observed_at) IS observed_at
    AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at) IS created_at
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS openproduct_product_media_slot
  ON product_media (profile_id, kind, position);

-- 1820's plpgsql trigger, as two SQLite triggers (one per event — SQLite has
-- no `INSERT OR UPDATE`). The same rule: at most eight gallery images per
-- listing, a row never counted against itself.
CREATE TRIGGER IF NOT EXISTS product_media_gallery_ceiling_insert
  BEFORE INSERT ON product_media
  WHEN NEW.kind = 'gallery'
   AND (SELECT count(*) FROM product_media m
         WHERE m.profile_id = NEW.profile_id AND m.kind = 'gallery' AND m.id <> NEW.id) >= 8
BEGIN
  SELECT RAISE(ABORT, 'product_media: a gallery holds at most 8 images');
END;
CREATE TRIGGER IF NOT EXISTS product_media_gallery_ceiling_update
  BEFORE UPDATE ON product_media
  WHEN NEW.kind = 'gallery'
   AND (SELECT count(*) FROM product_media m
         WHERE m.profile_id = NEW.profile_id AND m.kind = 'gallery' AND m.id <> NEW.id) >= 8
BEGIN
  SELECT RAISE(ABORT, 'product_media: a gallery holds at most 8 images');
END;

-- ─── the search index (1350, 1860) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS search_index (
  kind        TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  title       TEXT NOT NULL,
  summary     TEXT,
  -- The document's terms, in the document's order, as a JSON array. The
  -- VALUE the read returns; the lookup goes through search_index_terms.
  terms       TEXT NOT NULL,
  facets      TEXT NOT NULL DEFAULT '{}',
  built_at    TEXT NOT NULL,
  CONSTRAINT search_index_pk PRIMARY KEY (kind, entity_id),
  -- `cardinality(terms) > 0`: a row with no terms could never match.
  CONSTRAINT search_index_terms_present
    CHECK (json_type(terms) = 'array' AND json_array_length(terms) > 0),
  CONSTRAINT search_index_facets_object CHECK (json_type(facets) = 'object'),
  CONSTRAINT search_index_instants CHECK (
    strftime('%Y-%m-%dT%H:%M:%fZ', built_at) IS built_at
  )
);

-- THE GIN INDEX, as a table. One row per (term, document); the primary key
-- LEADS on term, so `term IN (…)` is a key range per term — the overlap
-- question answered by lookup rather than by reading every document. Written
-- in the same atomic batch as the documents, so the two cannot disagree.
CREATE TABLE IF NOT EXISTS search_index_terms (
  term       TEXT NOT NULL,
  kind       TEXT NOT NULL,
  entity_id  TEXT NOT NULL,
  CONSTRAINT search_index_terms_pk PRIMARY KEY (term, kind, entity_id),
  CONSTRAINT search_index_terms_document
    FOREIGN KEY (kind, entity_id) REFERENCES search_index (kind, entity_id) ON DELETE CASCADE
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS openproduct_search_index_terms_document
  ON search_index_terms (kind, entity_id);

CREATE TABLE IF NOT EXISTS search_index_state (
  singleton     INTEGER NOT NULL DEFAULT 1,
  built_at      TEXT,
  dirty_at      TEXT,
  last_error    TEXT,
  last_error_at TEXT,
  CONSTRAINT search_index_state_pk PRIMARY KEY (singleton),
  CONSTRAINT search_index_state_singleton CHECK (singleton = 1),
  CONSTRAINT search_index_state_instants CHECK (
    strftime('%Y-%m-%dT%H:%M:%fZ', built_at) IS built_at
    AND strftime('%Y-%m-%dT%H:%M:%fZ', dirty_at) IS dirty_at
    AND strftime('%Y-%m-%dT%H:%M:%fZ', last_error_at) IS last_error_at
  )
);
-- Seeded DIRTY, as on Postgres: an index that has never been built must build.
INSERT INTO search_index_state (singleton, built_at, dirty_at)
VALUES (1, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT (singleton) DO NOTHING;

-- ─── the materialised catalogue (1925) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog_cards (
  profile_id            TEXT    NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  slug                  TEXT    NOT NULL,
  ordering_merges       INTEGER,
  ordering_published_at TEXT    NOT NULL,
  record                TEXT    NOT NULL,
  metrics               TEXT    NOT NULL,
  media                 TEXT    NOT NULL,
  computed_at           TEXT    NOT NULL,
  CONSTRAINT catalog_cards_pk PRIMARY KEY (profile_id),
  CONSTRAINT catalog_cards_record_object CHECK (json_type(record) = 'object'),
  CONSTRAINT catalog_cards_metrics_array CHECK (json_type(metrics) = 'array'),
  CONSTRAINT catalog_cards_media_array CHECK (json_type(media) = 'array'),
  CONSTRAINT catalog_cards_instants CHECK (
    strftime('%Y-%m-%dT%H:%M:%fZ', ordering_published_at) IS ordering_published_at
    AND strftime('%Y-%m-%dT%H:%M:%fZ', computed_at) IS computed_at
  )
) WITHOUT ROWID;
-- Postgres: (ordering_merges DESC NULLS LAST, ordering_published_at DESC,
-- slug COLLATE "C" ASC). SQLite's DESC is NULLS LAST and BINARY is "C".
CREATE INDEX IF NOT EXISTS openproduct_catalog_cards_order
  ON catalog_cards (ordering_merges DESC, ordering_published_at DESC, slug ASC);

CREATE TABLE IF NOT EXISTS catalog_state (
  singleton     INTEGER NOT NULL DEFAULT 1,
  computed_at   TEXT,
  card_count    INTEGER NOT NULL DEFAULT 0,
  today_count   INTEGER NOT NULL DEFAULT 0,
  week_count    INTEGER NOT NULL DEFAULT 0,
  month_count   INTEGER NOT NULL DEFAULT 0,
  total_count   INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  last_error_at TEXT,
  CONSTRAINT catalog_state_pk PRIMARY KEY (singleton),
  CONSTRAINT catalog_state_singleton CHECK (singleton = 1),
  CONSTRAINT catalog_state_instants CHECK (
    strftime('%Y-%m-%dT%H:%M:%fZ', computed_at) IS computed_at
    AND strftime('%Y-%m-%dT%H:%M:%fZ', last_error_at) IS last_error_at
  )
);
INSERT INTO catalog_state (singleton, computed_at) VALUES (1, NULL)
ON CONFLICT (singleton) DO NOTHING;
