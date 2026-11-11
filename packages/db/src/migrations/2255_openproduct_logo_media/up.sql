-- openproduct-studio OSD2 — the logo is its own kind of media.
--
-- Before this the media model had no face for a product: `hero`, `gallery`
-- and `screenshot`, and the row tile drew a crop of the hero. `logo` is an
-- AUTHORED kind — the maker's own upload, never observed — so it joins the
-- authored side of both CHECKs 1820 declared. Position is pinned to 0 by the
-- existing position CHECK (only `gallery` may move), so the existing unique
-- index (profile_id, kind, position) already enforces one logo per listing.
--
-- Drop-then-add under the SAME names, so a re-run lands on the same two
-- constraints and every reader that names them keeps working. Additive in
-- effect: every row the old CHECKs admitted, the new ones admit.

ALTER TABLE openproduct.product_media
  DROP CONSTRAINT IF EXISTS product_media_kind_check;
ALTER TABLE openproduct.product_media
  ADD CONSTRAINT product_media_kind_check
    CHECK (kind IN ('logo', 'hero', 'gallery', 'screenshot'));

ALTER TABLE openproduct.product_media
  DROP CONSTRAINT IF EXISTS product_media_provenance_check;
ALTER TABLE openproduct.product_media
  ADD CONSTRAINT product_media_provenance_check
    CHECK (
      (kind IN ('logo', 'hero', 'gallery') AND observed_at IS NULL)
      OR (kind = 'screenshot' AND observed_at IS NOT NULL)
    );
