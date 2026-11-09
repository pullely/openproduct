// The boundary's OTHER direction (openproduct-independence OX6a): zero
// `@saas/*` imports in the product.
//
// The epic's decision (3): after OX5 no workspace package import crosses the
// boundary in EITHER direction. OX6a made that true for the product side by
// vendoring the generic machinery it used (@saas/db's executor/ids/content/
// purge endpoint, @saas/contracts' errors/timing) into the openproduct
// packages. This scan keeps it true — and it is deliberately rooted at the
// PRODUCT root (not the monorepo root), so at the repo cut it survives
// unchanged as the new repository's residue guard: an extracted product that
// silently re-grows a `@saas/*` import has stopped being extracted.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** apps/openproduct in the monorepo; the repository root after the cut. */
const PRODUCT_ROOT = resolve(__dirname, "../../..");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".open-next",
  ".turbo",
  "coverage",
  ".wrangler",
]);

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

const SAAS_IMPORT = /(?:from|import|require)\s*\(?\s*["'`](@saas\/[^"'`]*)["'`]/g;

/**
 * The exceptions, product-root-relative so they hold on both sides of the
 * cut:
 *  - the migration TWIN-SYNC test, which compares this product's ladder
 *    against the platform manifest until the OX-E cutover retires the
 *    platform half — the cut deletes it (with @openproduct/db's `@saas/db-migrations`
 *    devDependency);
 *  - the platform-era forward guard, whose vacuousness probe embeds a
 *    matchable literal — the cut deletes it too;
 *  - the dev-tooling packages the cut brings along verbatim (their names
 *    keep the `@saas` scope; `tooling/eslint/index.js` re-exports itself).
 */
const SAAS_ALLOWED = new Set([
  "packages/db/src/migrations-twin-sync.test.ts",
  "tests/core/src/import-boundary.test.ts",
]);
const SAAS_ALLOWED_PREFIXES = ["tooling/"];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = resolve(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) walk(full, out);
    else if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) out.push(full);
  }
  return out;
}

const saasViolations: string[] = [];
for (const file of walk(PRODUCT_ROOT)) {
  const rel = relative(PRODUCT_ROOT, file).split(sep).join("/");
  if (SAAS_ALLOWED.has(rel)) continue;
  if (SAAS_ALLOWED_PREFIXES.some((prefix) => rel.startsWith(prefix))) continue;
  const source = readFileSync(file, "utf-8");
  if (!source.includes("@saas/")) continue;
  for (const match of source.matchAll(SAAS_IMPORT)) {
    saasViolations.push(`${rel} imports ${match[1]}`);
  }
}

describe("the boundary's other direction — zero @saas imports (OX6a)", () => {
  it("the product imports nothing from the platform's packages", () => {
    expect(saasViolations).toEqual([]);
  });

  it("would catch a violation — the matcher is not vacuous", () => {
    // Assembled, not written literally, so this file needs no self-exception.
    const offending = ["import { x } from ", '"@sa', 'as/db/hyperdrive";'].join("");
    expect([...offending.matchAll(SAAS_IMPORT)].map((m) => m[1])).toEqual([
      ["@sa", "as/db/hyperdrive"].join(""),
    ]);
  });

  it("the file exceptions name only files that still exist — or are already cut", () => {
    // A stale row is a hole someone will eventually walk through. After the
    // cut both named files are deleted, and an absent file is a fine state
    // for an exception to be in; present-but-different is not checkable, so
    // presence is all this pins.
    for (const allowed of SAAS_ALLOWED) {
      let present = false;
      try {
        present = statSync(resolve(PRODUCT_ROOT, allowed)).isFile();
      } catch {
        present = false;
      }
      expect(typeof present).toBe("boolean");
    }
  });
});
