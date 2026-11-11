#!/usr/bin/env node
// The purge, recorded (openproduct-worldclass-v2 CF2).
//
// Five test listings sat on openproduct.live's front page for months, and the
// audit (W·03) read them as the product. They leave THROUGH THE MODERATION
// DOOR, not through SQL: each removal is a moderation act with the reason
// `test_data`, appended to the ledger TS3 publishes at `/transparency`, so
// what left and why is a public record rather than an admin's memory — and
// WC2-4 says a purge that is not recorded is a purge that never happened.
//
// IT REFUSES A PRODUCTION THAT HAS GROWN. The plan says "refuses to run
// against a database whose search index reports more than ten listings";
// this script has no database, so it reads what the purge empties: the
// public catalogue at `/v1/products`. More than ten listings there means the
// corpus CF4 seeds has begun to arrive, and a script written to remove five
// test rows must not be run by habit against a directory that has real ones
// in it. The guard is readable by anybody, which is the point.
//
// EVERY SLUG IS NAMED ON THE COMMAND LINE. No wildcard, no "everything
// matching test-": a removal is a claim about a listing, and the person
// running this types each one.
//
//   OPENPRODUCT_OPERATOR_TOKEN=… node tests/core/scripts/purge-test-data.mjs \
//     --origin https://api.openproduct.live my-project test-listing-2 …
//
// The token is an operator's session token — the same credential the studio
// uses for the door, and TS5's rule applies: only a named human on the
// operator list may act, and core refuses a service principal.

export const REASON = "test_data";
export const CATALOGUE_CEILING = 10;
export const ACTS_PATH = "/v1/openproduct/reports/acts";
export const CATALOGUE_PATH = "/v1/products";

function parseArgs(argv) {
  const slugs = [];
  let origin = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--origin") origin = argv[++i] ?? null;
    else if (argv[i].startsWith("--")) throw new Error(`unknown flag ${argv[i]}`);
    else slugs.push(argv[i]);
  }
  return { origin, slugs };
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Run the purge. Returns 0 on success; throws with a sentence on refusal.
 * `fetch` is injected so the test can stand in for production.
 */
export async function run({ argv, env, fetch, log = () => {} }) {
  const { origin, slugs } = parseArgs(argv);
  if (!origin) throw new Error("--origin is required (the API origin, e.g. https://api.openproduct.live)");
  if (slugs.length === 0) throw new Error("name every slug to remove; nothing is removed by pattern");
  const bad = slugs.filter((s) => !SLUG.test(s));
  if (bad.length) throw new Error(`not a slug: ${bad.join(", ")}`);
  const token = env.OPENPRODUCT_OPERATOR_TOKEN;
  if (!token) throw new Error("OPENPRODUCT_OPERATOR_TOKEN is required: the door refuses anybody unnamed");

  // ── The guard: the public catalogue, before anything is written ────────
  const catalogue = await fetch(`${origin}${CATALOGUE_PATH}`);
  if (!catalogue.ok) throw new Error(`could not read the catalogue: HTTP ${catalogue.status}`);
  const body = await catalogue.json();
  const listings = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : null;
  if (listings === null) throw new Error("the catalogue did not answer with a list");
  if (listings.length > CATALOGUE_CEILING) {
    throw new Error(
      `refusing: the catalogue holds ${listings.length} listings, more than ${CATALOGUE_CEILING} — this is not the test corpus`,
    );
  }
  const present = new Set(listings.map((l) => l.slug));
  const absent = slugs.filter((s) => !present.has(s));
  if (absent.length) throw new Error(`not in the catalogue, so not removed: ${absent.join(", ")}`);

  // ── One act per slug, through the door, stopping at the first refusal ──
  let removed = 0;
  for (const slug of slugs) {
    const res = await fetch(`${origin}${ACTS_PATH}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ act: "remove", slug, reason: REASON }),
    });
    if (!res.ok) {
      throw new Error(`the door refused ${slug}: HTTP ${res.status} — ${removed} removed before it, ${slugs.length - removed} not`);
    }
    removed += 1;
    log(`removed ${slug} (reason: ${REASON})`);
  }
  log(`${removed} listing(s) removed; each act is on /transparency`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run({ argv: process.argv.slice(2), env: process.env, fetch: globalThis.fetch, log: console.log })
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`purge-test-data: ${err.message}`);
      process.exit(1);
    });
}
