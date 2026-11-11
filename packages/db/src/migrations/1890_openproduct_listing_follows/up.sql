-- 1890_openproduct_listing_follows (openproduct-worldclass-v2 PP1)
--
-- A LISTING CAN BE FOLLOWED, AND THE COUNT IS PUBLIC (WC2-7).
--
-- Context: openproduct
--
-- FL0 shipped follows for topics and people; the one social object the
-- product page lacked was its own. The audit's P1·07 named it — no follow,
-- no follower count on a listing — and the benchmark's product page shows
-- the number first. This widens the kind vocabulary by one value. The
-- target is the listing's slug, which is what the overlay keys and the
-- public count are addressed by; a slug can change and a follow would then
-- lapse, which is honest — the follower followed the address they saw.
--
-- The count is the follow's only public face. Nothing lists followers, on
-- a listing exactly as on a topic or a person (FL0's rule, kept): WC2-7's
-- "list at an address" was written against a promise the page already makes
-- — "Nobody can see who they are, including you" — and the promise wins.
--
-- Additive, idempotent.

ALTER TABLE openproduct.follows
  DROP CONSTRAINT IF EXISTS follows_kind_check;
ALTER TABLE openproduct.follows
  ADD CONSTRAINT follows_kind_check
  CHECK (kind IN ('topic', 'person', 'listing'));

COMMENT ON CONSTRAINT follows_kind_check ON openproduct.follows IS
  'FL0 — topic, person. PP1 — listing, targeted by slug. A closed vocabulary: a fourth kind is a product decision and a migration.';
