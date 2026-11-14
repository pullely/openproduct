-- 2265 (openproduct-redesign OPR-3)
--
-- A PRODUCT'S STAGE, ITS MILESTONES, AND WHERE TO TRY IT.
--
-- Context: openproduct
--
-- Design §6.1. Three facts that lived in a listing's free text become
-- stored things a page can count and a list can filter by:
--
--   profiles.stage       `idea` or `shipping`. An idea until the product's
--                        first milestone is marked shipped; shipping while at
--                        least one is. The repository's milestone writes keep
--                        it in step (one UPDATE after each), so no read has
--                        to derive it and no trigger hides the rule.
--   profiles.try_url     the address of the running product, shown as "Try
--                        it". `live_url` held this for some listings and is
--                        the backfill; the two columns then move apart, as a
--                        listing's declared address and the place to try it
--                        are not always the same.
--   product_milestones   the crew's own list: a short code ("AS3"), a title,
--                        a summary, a position, and the moment it shipped
--                        (NULL until it has). The product page's progress bar
--                        and "3 of 4" are a count of these rows.
--
-- The bounds on a milestone are the Feature shipped post's block limits
-- (contracts `product-posts.ts`), so a post prefilled from a milestone always
-- fits its template.
--
-- No subject column: a milestone is the product's, and who wrote it is in the
-- audit log. Cascades from `profiles`, so a workspace purge takes it.
--
-- Additive, idempotent.

ALTER TABLE openproduct.profiles
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'idea'
    CONSTRAINT profiles_stage_check CHECK (stage IN ('idea', 'shipping'));

ALTER TABLE openproduct.profiles
  ADD COLUMN IF NOT EXISTS try_url TEXT;

-- The backfill. Only rows that have never held a try_url, so a second run
-- changes nothing a crew has since written.
UPDATE openproduct.profiles
   SET try_url = live_url
 WHERE try_url IS NULL
   AND live_url IS NOT NULL;

COMMENT ON COLUMN openproduct.profiles.stage IS
  'OPR-3 (openproduct-redesign) — idea or shipping. Shipping while at least one product_milestones row is shipped; maintained by the repository''s milestone writes, never set by hand.';

COMMENT ON COLUMN openproduct.profiles.try_url IS
  'OPR-3 (openproduct-redesign) — the address of the running product, shown as "Try it". Backfilled from live_url; authored by the crew, never checked.';

CREATE TABLE IF NOT EXISTS openproduct.product_milestones (
  id          UUID        PRIMARY KEY,

  profile_id  UUID        NOT NULL
                REFERENCES openproduct.profiles (id) ON DELETE CASCADE,

  -- The crew's own short label, free text: "AS3", "v2", "M1".
  code        TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  summary     TEXT,

  -- The crew's order. Rewritten wholesale by a reorder.
  position    INTEGER     NOT NULL DEFAULT 0,

  -- NULL until the crew marks it shipped; cleared if they take the mark back.
  shipped_at  TIMESTAMPTZ,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT product_milestones_code_length_check
    CHECK (char_length(code) BETWEEN 1 AND 20),
  CONSTRAINT product_milestones_title_length_check
    CHECK (char_length(title) BETWEEN 1 AND 60),
  CONSTRAINT product_milestones_summary_length_check
    CHECK (summary IS NULL OR char_length(summary) BETWEEN 1 AND 200)
);

-- A product's milestones in its crew's order: the product page's read and
-- the crew's own list.
CREATE INDEX IF NOT EXISTS openproduct_product_milestones_profile_idx
  ON openproduct.product_milestones (profile_id, position, created_at);

COMMENT ON TABLE openproduct.product_milestones IS
  'OPR-3 (openproduct-redesign) — a product''s milestones: code, title, summary, position, shipped_at (NULL until shipped). profiles.stage follows them. Cascades from profiles.';
