// LR10 (LR-11) — a listing's settings are in reach from its product page:
// "Finish your listing" says when it is hidden from the products list and
// sets the category in place; Edit details holds the three facets; Settings
// is a button beside Edit details.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CATEGORY_HINT, FACET_FIELDS, finishPlanOf } from "@openproduct-web/app/[slug]/maker/model";
import { readProfilePatch } from "@openproduct-web/app/posts/crew-forms";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const code = (file: string) =>
  readFileSync(resolve(APP_DIR, file), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const FULL = { tagline: "A shared kitchen", category: "productivity", hosting: "managed-service", pricing: "free", stackCount: 3 };

describe("Finish your listing", () => {
  it("is not drawn when nothing is missing", () => {
    expect(finishPlanOf(FULL)).toBeNull();
  });

  it("says the listing is hidden when the category is missing", () => {
    expect(finishPlanOf({ ...FULL, category: null })).toEqual({
      hidden: true,
      missingPitch: false,
      missingCategory: true,
      also: [],
    });
  });

  it("says the listing is hidden when the pitch is missing", () => {
    expect(finishPlanOf({ ...FULL, tagline: "  " })?.hidden).toBe(true);
  });

  it("lists the other gaps without calling the listing hidden", () => {
    expect(finishPlanOf({ ...FULL, pricing: null, hosting: null, stackCount: 0 })).toEqual({
      hidden: false,
      missingPitch: false,
      missingCategory: false,
      also: ["pricing", "hosting", "stack"],
    });
  });

  it("is crew-only, on Manage, and fetched only for the crew", () => {
    const lazy = code("[slug]/maker/lazy.tsx");
    expect(lazy).toContain('import("./finish-listing")');
    expect(lazy).toMatch(/if \(!managing \|\| !writes\) return null;\s*return \(\s*<React\.Suspense fallback=\{null\}>\s*<FinishListingBody/);
    const card = code("[slug]/maker/finish-listing.tsx");
    expect(card).toContain("if (!managing || editing || crew === null || closed) return null;");
    expect(card).toContain('crewWrite<unknown>(slug, "profile", { category })');
  });

  it("is on both looks of the product page", () => {
    const page = code("[slug]/product-page.tsx");
    expect(page.match(/<FinishListing slug=\{slug\}/g)).toHaveLength(2);
  });
});

describe("Edit details holds the facets", () => {
  it("draws Category, Pricing and Hosting, category first, with the hint", () => {
    expect(FACET_FIELDS.map(([id]) => id)).toEqual(["category", "pricing", "hosting"]);
    expect(CATEGORY_HINT).toBe("Needed to appear on the products list.");
    const form = code("[slug]/maker/details-form.tsx");
    expect(form).toContain("FACET_FIELDS.map(");
    expect(form).toContain('category: picked.category ?? "",');
  });

  it("sends them to core, an empty choice clearing it", () => {
    expect(readProfilePatch({ tagline: "x", category: "productivity", hosting: "", pricing: "free" })).toEqual({
      tagline: "x",
      category: "productivity",
      hosting: null,
      pricing: "free",
    });
  });
});
