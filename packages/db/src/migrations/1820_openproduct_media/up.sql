-- 1820_openproduct_media (openproduct-worldclass MD0)
--
-- THE MEDIA MODEL. Three kinds, one table, provenance per row.
--
-- Context: openproduct
--
-- There is not one image on this website, and the audit read that as a
-- missing column. It is worse than a column: there is no media field
-- anywhere in the model, nothing in `packages/contracts` to put one in, and
-- nowhere a file could be recorded. This migration is the model half of the
-- fix. It stores no bytes and serves nothing — MD1 owns the object store,
-- and MD1 is gated on WC-C (who hosts uploaded media). What lands here is
-- the shape those bytes will be described by, and the rules that shape has
-- to obey, put where a future write path cannot forget them.
--
-- ─── WC-3: THE KIND IS THE PROVENANCE, AND THE SCHEMA ENFORCES IT ────────
--
-- Every public fact on a listing until now has been text, and OPC-2's three
-- classes were carried by a label beside a value. An image carries no label.
-- It is also the most persuasive artefact this product will ever render: a
-- reader who would interrogate "38 commits this week" will not interrogate a
-- screenshot, which makes a stale one presented as current OPC-7's failure in
-- its most convincing form.
--
-- So the three kinds are split by trust class rather than by shape:
--
--   hero, gallery  — AUTHORED. A maker uploaded it. It is theirs, it does not
--                    go stale, and it has no `observed_at`.
--   screenshot     — OBSERVED. The sweep captured it (MD4). It carries the
--                    moment it was taken, always, and is withdrawn past its
--                    window rather than frozen.
--
-- `product_media_provenance_check` is that sentence as a constraint: an
-- authored row with an `observed_at` and an observed row without one are both
-- refused by the database. The contract expresses the same rule as a type
-- union, so the two halves of the estate refuse it independently — which is
-- the point, because the day they share one enforcement is the day a
-- screenshot appears in the hero slot after a refactor.
--
-- ─── ALT TEXT IS NOT NULLABLE, AND NOT BLANK ─────────────────────────────
--
-- `alt_text TEXT NOT NULL` plus a non-empty CHECK. An authored image carries
-- the maker's own words; a screenshot carries generated text that says it is
-- an automated capture. NULLABLE ALT WAS THE OBVIOUS SHAPE AND IS REFUSED:
-- a nullable column makes "no alt text" a state the model has, and a state
-- the model has is a state that ships. The first listing with a decorative
-- hero and no alt would make the whole plane inaccessible to a screen reader
-- and pass every test we have.
--
-- ─── DIMENSIONS ARE REQUIRED, AND THAT IS A PERFORMANCE DECISION ─────────
--
-- openproduct is ten times lighter than the benchmark and its CLS is 0.0000.
-- MD is how that gets spent. An `<img>` with no width and height is the
-- classic way to lose it, so the model has nowhere to put an image whose
-- dimensions are unknown: they are NOT NULL and positive. A renderer cannot
-- omit what it cannot fail to have.
--
-- ─── THE GALLERY CEILING IS A TRIGGER, FOR post_votes' REASON ────────────
--
-- Eight is the ceiling and it cannot be a CHECK — a row constraint cannot
-- count its siblings. DQ1's `post_votes` faced the same shape and its comment
-- is the argument here too: "a future write path that forgets is still a
-- write path". A gallery is public, MD1 will accept uploads from strangers,
-- and a ceiling enforced only in a handler is a ceiling until somebody adds a
-- second handler. This is the second trigger in this schema and, like the
-- first, it says why it is one.
--
-- ─── ONE HERO, ONE SCREENSHOT, AND NO TWO ROWS IN THE SAME PLACE ─────────
--
-- `position` is 0 for the singleton kinds by CHECK, and the unique index over
-- (profile_id, kind, position) then does three jobs at once: at most one hero,
-- at most one screenshot, and no two gallery images claiming the same slot.
-- The alternative was two partial indexes and a third for ordering; one index
-- that cannot be satisfied by a wrong row is easier to read and cheaper to
-- keep.
--
-- ─── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────
--
-- No bytes, no MIME type, no derivative table, no upload state. `storage_ref`
-- is an OPAQUE string and nothing in this database interprets it: MD1 decides
-- what a reference means once WC-C is answered, and a column shaped around a
-- store nobody has chosen would be a guess wearing a schema. No `caption`
-- either — alt text is the accessible name and a caption beside it invites
-- the two to disagree.
--
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS openproduct.product_media (
  id           UUID        PRIMARY KEY,
  profile_id   UUID        NOT NULL
                 REFERENCES openproduct.profiles (id) ON DELETE CASCADE,
  kind         TEXT        NOT NULL,
  -- Opaque to this database. MD1 decides what it resolves to.
  storage_ref  TEXT        NOT NULL,
  alt_text     TEXT        NOT NULL,
  width        INTEGER     NOT NULL,
  height       INTEGER     NOT NULL,
  -- Ordering within a kind. 0 for the singleton kinds, by CHECK below.
  position     INTEGER     NOT NULL DEFAULT 0,
  -- Set for a screenshot, never for authored media. WC-3, as a constraint.
  observed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT product_media_kind_check
    CHECK (kind IN ('hero', 'gallery', 'screenshot')),

  -- The whole of WC-3 in one line: an authored image never carries a moment,
  -- and an observed one cannot exist without it.
  CONSTRAINT product_media_provenance_check
    CHECK (
      (kind IN ('hero', 'gallery') AND observed_at IS NULL)
      OR (kind = 'screenshot' AND observed_at IS NOT NULL)
    ),

  CONSTRAINT product_media_alt_check
    CHECK (length(btrim(alt_text)) > 0),

  CONSTRAINT product_media_dimensions_check
    CHECK (width > 0 AND height > 0),

  -- Non-negative, and pinned to 0 for the kinds there can only be one of —
  -- which is what lets the unique index below enforce the singletons.
  CONSTRAINT product_media_position_check
    CHECK (position >= 0 AND (kind = 'gallery' OR position = 0))
);

-- One hero, one screenshot, and no two gallery images in the same slot.
CREATE UNIQUE INDEX IF NOT EXISTS openproduct_product_media_slot
  ON openproduct.product_media (profile_id, kind, position);

-- No second index for the read. "What media does this listing have", in
-- document order, is answered by the unique index above — it already leads on
-- (profile_id, kind, position), which is the read and the order.

-- EIGHT GALLERY IMAGES. A trigger rather than a CHECK because a row
-- constraint cannot count its siblings, and a trigger rather than only a
-- handler guard for DQ1's reason: a future write path that forgets is still a
-- write path, and MD1 will accept these from strangers.
CREATE OR REPLACE FUNCTION openproduct.product_media_gallery_ceiling()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.kind = 'gallery' AND (
    SELECT count(*) FROM openproduct.product_media m
     WHERE m.profile_id = NEW.profile_id
       AND m.kind = 'gallery'
       AND m.id <> NEW.id
  ) >= 8 THEN
    RAISE EXCEPTION 'product_media: a gallery holds at most 8 images';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_media_gallery_ceiling ON openproduct.product_media;
CREATE TRIGGER product_media_gallery_ceiling
  BEFORE INSERT OR UPDATE ON openproduct.product_media
  FOR EACH ROW EXECUTE FUNCTION openproduct.product_media_gallery_ceiling();

COMMENT ON TABLE openproduct.product_media IS
  'MD0 (openproduct-worldclass) — the media model. Three kinds split by TRUST '
  'CLASS rather than by shape: hero and gallery are AUTHORED (a maker''s own, '
  'no observed_at, never stale), screenshot is OBSERVED (the sweep captured '
  'it, carries its moment always, withdrawn past its window rather than '
  'frozen). product_media_provenance_check is WC-3 as a constraint, and the '
  'contract carries the same rule as a type union so both halves refuse it '
  'independently. alt_text is NOT NULL and non-blank because a nullable alt '
  'makes "no alt text" a state the model has, and a state the model has is a '
  'state that ships. Dimensions are required because MD is how a 0.0000 CLS '
  'gets spent, and a renderer cannot omit what it cannot fail to have. The '
  'gallery ceiling of 8 is a trigger for DQ1''s reason. storage_ref is OPAQUE: '
  'MD1 decides what a reference means once WC-C is answered.';
