-- 2300 (openproduct-left-rail LR-8)
--
-- ANY LINK ON A PRODUCT.
--
-- Context: openproduct
--
-- A product's header card shows where it runs (the stage and production
-- addresses, 2285), its repository and its workspace. The owner's rule on
-- 2026-11-23 is that the crew can add links of their own there too — docs, a
-- demo, a changelog, a community — from Edit details, with no stage attached
-- to them.
--
-- ─── profiles.links ───────────────────────────────────────────────────────
--
-- A JSON array of at most six `{ "label": text, "url": text }` objects, in
-- the crew's own order. Core validates before it writes: the label is 1 to
-- 40 characters, the address an absolute http(s) URL of at most 200. The
-- column holds what was validated and nothing derives from it.
--
-- AUTHORED, like the tagline and the Try it address: no subject id, no
-- observation. It is the product's, and it leaves with the profile row.
--
-- Additive, idempotent. Every existing listing has no links.

ALTER TABLE openproduct.profiles
  ADD COLUMN IF NOT EXISTS links JSONB NOT NULL DEFAULT '[]'::jsonb;
