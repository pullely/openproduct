-- 1870_openproduct_jsonb_repair (openproduct-worldclass-v2 LI1)
--
-- EVERY JSONB PARAMETER THIS PRODUCT EVER WROTE THROUGH ITS PRODUCTION DRIVER
-- ARRIVED DOUBLE-ENCODED, AND THIS PUTS THE ROWS BACK.
--
-- Context: openproduct
--
-- The repository binds JSON as a string — `JSON.stringify(value)` against a
-- `$n::jsonb` placeholder. pglite, the test harness, passes that string
-- through as text and Postgres parses it once. postgres.js — the production
-- client, `fetch_types: false`, `prepare: true` — DESCRIBES the statement
-- first, learns the placeholder is `jsonb` (3802), and serialises the
-- parameter with its jsonb serialiser, which is `JSON.stringify`. The string
-- is stringified a second time, and Postgres stores a JSON *string scalar*
-- whose text is the JSON that was meant: `"[\"typescript\"]"` where
-- `["typescript"]` was written.
--
-- On a write into a column it is silent — the row exists, the readers that
-- tolerate "object or string" hand back an empty list, and the facet counts
-- over `stack_canonical` see no arrays to count. On `jsonb_to_recordset` it is
-- loud — `cannot call jsonb_to_recordset on a non-array` — which is the search
-- index rebuild, the statement that has failed on every production tick since
-- RS0 and whose failure LI1's driver-faithful harness reproduced on its first
-- run. The repository now writes `$n::text::jsonb` everywhere, so the driver
-- describes the parameter as text and stringifies nothing; a static guard
-- keeps it that way.
--
-- ─── WHAT THIS REPAIRS, AND HOW IT KNOWS ─────────────────────────────────
--
-- Six columns take a JSON parameter: profiles.stack, profiles.stack_canonical,
-- profiles.link_grant, profiles.components, audit_log.payload and
-- profile_snapshots.fields. A damaged row is one whose value is a JSON string
-- scalar that itself parses as JSON. `try_jsonb` parses the inner text and
-- answers NULL when it is not JSON, so a string that is legitimately a string
-- (there are none by design, but the repair does not rely on that) is left
-- exactly as it was. Idempotent: a repaired row is no longer a string scalar
-- and the predicate no longer selects it.
--
-- Additive in effect (no row is dropped, no column changes type), idempotent.

CREATE OR REPLACE FUNCTION openproduct.try_jsonb(input TEXT) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN input::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

UPDATE openproduct.profiles
   SET stack = openproduct.try_jsonb(stack #>> '{}')
 WHERE jsonb_typeof(stack) = 'string'
   AND openproduct.try_jsonb(stack #>> '{}') IS NOT NULL;

UPDATE openproduct.profiles
   SET stack_canonical = openproduct.try_jsonb(stack_canonical #>> '{}')
 WHERE jsonb_typeof(stack_canonical) = 'string'
   AND openproduct.try_jsonb(stack_canonical #>> '{}') IS NOT NULL;

UPDATE openproduct.profiles
   SET link_grant = openproduct.try_jsonb(link_grant #>> '{}')
 WHERE jsonb_typeof(link_grant) = 'string'
   AND openproduct.try_jsonb(link_grant #>> '{}') IS NOT NULL;

UPDATE openproduct.profiles
   SET components = openproduct.try_jsonb(components #>> '{}')
 WHERE jsonb_typeof(components) = 'string'
   AND openproduct.try_jsonb(components #>> '{}') IS NOT NULL;

UPDATE openproduct.audit_log
   SET payload = openproduct.try_jsonb(payload #>> '{}')
 WHERE jsonb_typeof(payload) = 'string'
   AND openproduct.try_jsonb(payload #>> '{}') IS NOT NULL;

UPDATE openproduct.profile_snapshots
   SET fields = openproduct.try_jsonb(fields #>> '{}')
 WHERE jsonb_typeof(fields) = 'string'
   AND openproduct.try_jsonb(fields #>> '{}') IS NOT NULL;

DROP FUNCTION openproduct.try_jsonb(TEXT);
