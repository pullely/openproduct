-- 1905_openproduct_screenshot_captures (openproduct-worldclass MD4)
--
-- THE CAPTURE LEDGER. One row per listing the sweep has tried to photograph.
--
-- Context: openproduct
--
-- MD0's `product_media` holds a screenshot once there IS one — bytes in the
-- store, a row with its `observed_at`. It has nowhere to hold an attempt that
-- produced no picture, and an ingestion queue with no memory of failure is
-- the queue `sweep.ts` warns about: a schedule that "starves its own tail".
-- Three dead addresses would take three of every run's five captures for
-- ever, and the corpus behind them would never be photographed.
--
-- ─── WHY NOT `signal_sources` ────────────────────────────────────────────
--
-- The repository tiers keep exactly this state — `failure_count`,
-- `last_error`, `withdrawn_at` — in `signal_sources`, and MD0 named
-- `declared_url` beside them in the provenance vocabulary. It is not one of
-- them, and MD0 said so in the same breath: "`declared_url` is not one of
-- those tiers and does not compete with them". `signal_sources` rows are
-- addressed by (listing, tier) and every write to them is a metric; a capture
-- carries no metric, and the observation door refuses the source by name.
-- Widening that table's CHECK would put a picture's bookkeeping in the
-- numbers' ledger for the sake of three columns. This is its own table, with
-- the same three columns, and a sentence saying why they look alike.
--
-- ─── THE ADDRESS IS PART OF THE STATE ────────────────────────────────────
--
-- `target` is the address the attempt was made against. A withdrawn row is
-- withdrawn for THAT address: when a maker changes `live_url` the reason we
-- gave up may not hold, so the due query treats a row whose target differs
-- from the listing's current address as never tried — which is how a maker
-- un-withdraws a capture without an operator, by fixing the thing that was
-- wrong. The same mechanism `signal_sources` uses ("re-declaring a source is
-- how an operator un-withdraws one"), reached from the maker's side.
--
-- ─── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────
--
-- No bytes, no reference, no dimensions: the picture is a `product_media`
-- row, replaced in place on each success, and this table never duplicates
-- it. No response body and no message: `last_error` holds one word from the
-- contract's closed list, because an operator greps for a word and a page
-- somebody else served is something to leak.
--
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS openproduct.screenshot_captures (
  profile_id    UUID        PRIMARY KEY
                  REFERENCES openproduct.profiles (id) ON DELETE CASCADE,
  -- The declared address this row is about. A different current address
  -- means the row does not apply.
  target        TEXT        NOT NULL,
  -- The last time the sweep tried, whatever came of it. Oldest-first is the
  -- queue's order, so this is what it orders by.
  attempted_at  TIMESTAMPTZ NOT NULL,
  -- The last time a picture came back. Null means never.
  captured_at   TIMESTAMPTZ,
  -- Consecutive failures against `target`. Reset by a success.
  failure_count INTEGER     NOT NULL DEFAULT 0,
  -- One word from the contract's list. Never a body, never an address.
  last_error    TEXT,
  -- Set at the tolerance. The sweep stops asking; the picture on the page,
  -- if any, ages out through its own window rather than being frozen.
  withdrawn_at  TIMESTAMPTZ,

  CONSTRAINT screenshot_captures_target_check
    CHECK (length(btrim(target)) > 0),
  CONSTRAINT screenshot_captures_failure_count_check
    CHECK (failure_count >= 0)
);

COMMENT ON TABLE openproduct.screenshot_captures IS
  'MD4 (openproduct-worldclass) — the capture ledger: one row per listing the '
  'sweep has tried to photograph, so the queue remembers failure and a dead '
  'address cannot starve the corpus. Its own table rather than a widened '
  'signal_sources because a capture carries no metric and MD0 said '
  'declared_url is not a tier. target is part of the state: a changed '
  'address is a new attempt, which is how a maker un-withdraws a capture by '
  'fixing what was wrong. last_error is one word from the contract''s list.';
