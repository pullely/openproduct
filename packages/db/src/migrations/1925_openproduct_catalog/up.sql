-- 1925_openproduct_catalog (openproduct-scale OS5)
--
-- THE CATALOGUE, MATERIALISED.
--
-- Context: openproduct
--
-- Until this migration every uncached read of the front page and of
-- `GET /v1/products` joined `profiles` to the latest `metrics` per listing,
-- to `product_media` and to the open `role_openings`, sorted the whole listed
-- set by a metric no index can order, and cut a page off the top. OS0's
-- baseline put a number on it against the corpus the product is for: the
-- page-wide metrics read hashes a year of observations against the page
-- (78 ms), and the ordering sort is over five thousand rows on every read.
-- The sweep already computes every one of those inputs — the search rebuild
-- reads the same rows to write `search_index`.
--
-- `catalog_cards` is one row per LISTED profile carrying what the card needs
-- and nothing the card does not: the card's own columns (`record`, as the
-- repository's card read returns them), the latest observation per metric and
-- window (`metrics`), the listing's media in document order (`media`), and
-- the two ordering keys the published order sorts by (OS1: the latest
-- `merges` inside the freshness window, then publication, then slug). The
-- front page and the API read it with ONE indexed query.
--
-- WHAT THIS IS NOT: A CACHE. It has a moment — `computed_at`, on the row and
-- on the singleton — the page renders the moment (OPC-7), and it is rebuilt
-- by a sweep phase with a floor and a health row, not invalidated by events.
-- A row is rewritten only when its content changed, so a quiet tick writes
-- nothing and the table does not churn.
--
-- `catalog_state` is the phase's singleton, in `search_index_state`'s shape
-- with LI0's two error columns from birth, so the sweep ledger reads it like
-- the other six. It also stamps the four published-window counts the strip
-- and the page's `total` read, so the census (`countPublishedWindows`, a scan
-- of every listed row by construction) comes off the request path too.
--
-- `ordering_published_at` is NOT NULL and coalesced to the epoch at write,
-- so the index below serves the published order exactly as the live read
-- states it (`COALESCE(published_at, 'epoch') DESC`) and a null publication
-- orders last without a second expression.
--
-- NO UNIQUE ON THE SLUG. Nothing reads this table by slug — the published
-- order is the only way in — and a rename that hands an old slug to a new
-- listing in the same tick would otherwise trip mid-upsert.
--
-- CASCADE with the profile, because a card is a projection of its listing
-- and `teardown.md` is one DROP SCHEMA.
--
-- Additive, idempotent. The singleton is seeded NULL — "never computed" —
-- which every reader treats as "serve the live join until the first tick".

CREATE TABLE IF NOT EXISTS openproduct.catalog_cards (
  profile_id            UUID        NOT NULL
                          REFERENCES openproduct.profiles (id) ON DELETE CASCADE,
  slug                  TEXT        NOT NULL,
  -- The latest `merges` observation inside the freshness window at the
  -- moment of the rebuild; NULL is "not observed", and orders last.
  ordering_merges       BIGINT,
  ordering_published_at TIMESTAMPTZ NOT NULL,
  -- The card's columns, as the card read returns them (a row, as JSON).
  record                JSONB       NOT NULL,
  -- The latest observation per (metric, window), as the metrics read returns
  -- them. An array; empty when nothing has been observed.
  metrics               JSONB       NOT NULL,
  -- The listing's media rows in document order. An array; empty when none.
  media                 JSONB       NOT NULL,
  -- When THIS ROW was last written — a row is rewritten only when it changed.
  computed_at           TIMESTAMPTZ NOT NULL,

  CONSTRAINT catalog_cards_pk PRIMARY KEY (profile_id),
  CONSTRAINT catalog_cards_record_object CHECK (jsonb_typeof(record) = 'object'),
  CONSTRAINT catalog_cards_metrics_array CHECK (jsonb_typeof(metrics) = 'array'),
  CONSTRAINT catalog_cards_media_array CHECK (jsonb_typeof(media) = 'array')
);

-- The published order (OS1), as one index: merges desc with "not observed"
-- last, then publication desc, then the slug by code unit. A page is a range
-- on this index and nothing else.
CREATE INDEX IF NOT EXISTS openproduct_catalog_cards_order
  ON openproduct.catalog_cards (ordering_merges DESC NULLS LAST, ordering_published_at DESC, slug COLLATE "C" ASC);

CREATE TABLE IF NOT EXISTS openproduct.catalog_state (
  singleton     BOOLEAN     NOT NULL DEFAULT TRUE,
  -- When the catalogue was last computed. NULL is "never", which every reader
  -- treats as "use the live join" and `/health` reports as never run.
  computed_at   TIMESTAMPTZ,
  -- The census at that moment: the four trailing windows the strip shows
  -- and the page's `total`.
  card_count    INTEGER     NOT NULL DEFAULT 0,
  today_count   INTEGER     NOT NULL DEFAULT 0,
  week_count    INTEGER     NOT NULL DEFAULT 0,
  month_count   INTEGER     NOT NULL DEFAULT 0,
  total_count   INTEGER     NOT NULL DEFAULT 0,
  -- LI0's columns, present from birth: why the last rebuild failed, bounded
  -- to phase, code, message and status; NULL once one succeeds.
  last_error    TEXT,
  last_error_at TIMESTAMPTZ,

  CONSTRAINT catalog_state_pk PRIMARY KEY (singleton),
  CONSTRAINT catalog_state_singleton CHECK (singleton)
);

INSERT INTO openproduct.catalog_state (singleton, computed_at)
VALUES (TRUE, NULL)
ON CONFLICT (singleton) DO NOTHING;

COMMENT ON TABLE openproduct.catalog_cards IS
  'OS5 (openproduct-scale) — the catalogue, materialised: one row per listed '
  'profile with the card''s columns, its latest observations and its media, '
  'in the published order by index. Written by the sweep''s catalogue phase; '
  'a row is rewritten only when it changed. Not a cache: it has a moment, the '
  'page renders the moment, and the phase has a floor and a health row.';

COMMENT ON TABLE openproduct.catalog_state IS
  'OS5 (openproduct-scale) — the catalogue phase''s singleton: when it last '
  'computed, the census at that moment, and LI0''s error columns. NULL '
  'computed_at is never-run, and every reader serves the live join until then.';
