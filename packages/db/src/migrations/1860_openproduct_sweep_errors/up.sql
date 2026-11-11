-- 1860_openproduct_sweep_errors (openproduct-worldclass-v2 LI0)
--
-- A PHASE THAT FAILS RECORDS WHY BESIDE WHEN.
--
-- Context: openproduct
--
-- Three sweep phases keep a singleton state row so their floor lives in the
-- database rather than in worker memory (DS0's search_index_state, EN3's
-- integrity_sweep_state, TS4's defence_sweep_state). Each row says WHEN the
-- phase last did its work. None says whether the phase has been FAILING since.
--
-- On production the search index phase has reported `never_run` on every
-- health read since the cron first fired (RS0, 7 Sep 2026). RS5 narrowed the
-- failure to one SQL branch and wrote one structured log line per failure —
-- "a line, not a column, and that is a deliberate trade" — because the column
-- was a migration and the defect was live. Two days and some three hundred
-- lines later the defect is still live and the only readers of those lines
-- are people with a Cloudflare dashboard open, which excludes the repository,
-- its CI, its /health read and the epic trying to diagnose it.
--
-- So this is the column. WC2-1: a liveness read that can say `never_run` but
-- not `failed: <reason>` names the symptom and hides the cause.
--
-- ─── TWO COLUMNS ON THREE EXISTING ROWS ──────────────────────────────────
--
-- `last_error` is the bounded reason the gateway already logs — phase code,
-- message, HTTP status — and nothing tenant-shaped: a sweep failure is about
-- our machinery, and the only thing a wider column would add is something to
-- leak. `last_error_at` is when it was recorded. A successful run clears both,
-- so a row with an error and a later `swept_at` cannot exist: the error is
-- either current or gone.
--
-- ─── TWO ROWS THAT DID NOT EXIST ─────────────────────────────────────────
--
-- The board cut (LC3) and the digest cut (LC5) kept no singleton because
-- their OUTPUT is derived per day and per week, and RS1 left them out of
-- /health for that reason. That is true of the output and not of the phase:
-- the phase ran or did not, failed or did not, and WC2-1 needs a row to write
-- to. Same shape as the other three so the reader is one query per table and
-- one function over all five.
--
-- Additive, idempotent.

ALTER TABLE openproduct.search_index_state
  ADD COLUMN IF NOT EXISTS last_error    TEXT,
  ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;

ALTER TABLE openproduct.integrity_sweep_state
  ADD COLUMN IF NOT EXISTS last_error    TEXT,
  ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;

ALTER TABLE openproduct.defence_sweep_state
  ADD COLUMN IF NOT EXISTS last_error    TEXT,
  ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS openproduct.board_sweep_state (
  singleton     BOOLEAN     NOT NULL DEFAULT TRUE,
  swept_at      TIMESTAMPTZ,
  last_error    TEXT,
  last_error_at TIMESTAMPTZ,

  CONSTRAINT board_sweep_state_pk PRIMARY KEY (singleton),
  CONSTRAINT board_sweep_state_singleton CHECK (singleton)
);

INSERT INTO openproduct.board_sweep_state (singleton, swept_at)
VALUES (TRUE, NULL)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS openproduct.digest_sweep_state (
  singleton     BOOLEAN     NOT NULL DEFAULT TRUE,
  swept_at      TIMESTAMPTZ,
  last_error    TEXT,
  last_error_at TIMESTAMPTZ,

  CONSTRAINT digest_sweep_state_pk PRIMARY KEY (singleton),
  CONSTRAINT digest_sweep_state_singleton CHECK (singleton)
);

INSERT INTO openproduct.digest_sweep_state (singleton, swept_at)
VALUES (TRUE, NULL)
ON CONFLICT (singleton) DO NOTHING;

COMMENT ON COLUMN openproduct.search_index_state.last_error IS
  'LI0 — why the last rebuild failed, bounded to phase, code, message and status; NULL once a rebuild succeeds. Never a slug, a subject or a repository.';
COMMENT ON COLUMN openproduct.integrity_sweep_state.last_error IS
  'LI0 — why the last integrity sweep failed; NULL once one succeeds.';
COMMENT ON COLUMN openproduct.defence_sweep_state.last_error IS
  'LI0 — why the last defence sweep failed; NULL once one succeeds.';
COMMENT ON TABLE openproduct.board_sweep_state IS
  'LI0 — whether the board cut (LC3) ran and whether it failed. The board itself is derived per day; this row is about the phase, not its output.';
COMMENT ON TABLE openproduct.digest_sweep_state IS
  'LI0 — whether the digest cut (LC5) ran and whether it failed. The digest itself is derived per week; this row is about the phase, not its output.';
