-- 1260_openproduct_components (openproduct-home OH4)
--
-- The first deliberate widening of OD's projection: a components snapshot on
-- the listing. NOT a binding — state-worker stays on the forbidden list, and
-- the list is COPIED here at publish time from what the maintainer selected,
-- the same shape as the pitch body: a snapshot, authored by the act of
-- publishing.
--
-- Context: openproduct
--
-- Consequences, stated rather than discovered (OH design §5):
--   - It goes stale. The page renders the publish timestamp beside it, so a
--     snapshot is never mistaken for a live view.
--   - It is curated. The maintainer chooses what appears in the OD6
--     disclosure dialog, and the default is NOTHING — null here.
--   - Re-publishing rewrites it wholesale; unpublish leaves it (historical,
--     like published_at — and invisible, because the public read filters
--     visibility).
--
-- JSONB, not a table: the snapshot is an authored value with no identity of
-- its own — nothing joins to it, nothing updates one entry, and the
-- fetch_types:false client parses JSONB the same way it parses `stack`.
--
-- Additive: no existing table, index, or constraint is touched.

ALTER TABLE openproduct.profiles
  ADD COLUMN IF NOT EXISTS components JSONB;

COMMENT ON COLUMN openproduct.profiles.components IS
  'Curated components snapshot (openproduct-home OH4): [{name, kind}] copied at publish '
  'from what the maintainer selected; null = nothing chosen (the default). A snapshot, '
  'never a live view — the page shows the publish timestamp beside it.';
