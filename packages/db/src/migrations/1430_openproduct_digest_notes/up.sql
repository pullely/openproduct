-- 1430_openproduct_digest_notes (openproduct-commons LC1)
--
-- ONE SIGNED SENTENCE PER WEEK.
--
-- Context: openproduct
--
-- The digest is otherwise entirely computed: what launched, and what people
-- endorsed while it was launching. Both are facts and neither is a judgement.
-- The note is the one place on the page where somebody says what they thought
-- mattered, which makes it the one place editorial judgement lives — and
-- LC-4's rule is that editorial judgement is allowed exactly where it is
-- ATTRIBUTABLE.
--
-- So `author_subject_id` is NOT NULL and there is no anonymous path to a row
-- here. An unsigned weekly note is the thumb on the scale that this product's
-- default ordering refuses to be, wearing a friendlier voice: it reads as the
-- platform's opinion, which is precisely the authority OPC-6 says the estate
-- does not hold. A named person's opinion is a different object, and a reader
-- can weigh it because they can see whose it is.
--
-- THE WEEK IS THE KEY, as an ISO week id (`2026-w34`). Not a date range: a
-- range invites two rows describing overlapping windows, and the digest's
-- whole value is that one week is one document at one address. The CHECK
-- pins the spelling so the table cannot hold `2026-w4` and `2026-w04` as two
-- weeks — the same normalisation the route enforces, held one layer lower.
--
-- NO `updated_at` REWRITE OF `written_at`. The note says when it was written
-- and that stays true; an edit changes the body and leaves the date, because
-- the date is part of what a reader is weighing when they read somebody's
-- opinion of a week.
--
-- Additive and idempotent: no existing table, index, or constraint is touched.

CREATE TABLE IF NOT EXISTS openproduct.digest_notes (
  -- `2026-w34`. Lowercase `w`, two-digit week, ISO 8601 weeks.
  week_id      TEXT        PRIMARY KEY,

  -- What they wrote. Bounded: this is a SHORT note beside a computed page,
  -- and an unbounded column on a public document is a denial of service with
  -- extra steps. Long enough for a paragraph, short enough to stay a note.
  body         TEXT        NOT NULL,

  -- WHOSE OPINION IT IS. Not nullable, and there is no code path that writes
  -- a row without it — see the header. An opaque subject id, never a name and
  -- never an email (I3); the page resolves it to a CG handle at read time and
  -- renders plain text when they have no public profile (XP-5).
  author_subject_id TEXT   NOT NULL,

  written_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT digest_notes_week_id_shape
    CHECK (week_id ~ '^[0-9]{4}-w(0[1-9]|[1-4][0-9]|5[0-3])$'),
  CONSTRAINT digest_notes_body_bounded
    CHECK (length(btrim(body)) BETWEEN 1 AND 1200)
);
