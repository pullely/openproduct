// A person's products say where they stand (openproduct-redesign OPR-3;
// boards `Person`, `PhonePerson`): `shipping, 3 of 4` / `idea` under a row.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PERSON_STAGE_READ_LIMIT,
  readStageLines,
  stageLineOf,
} from "@openproduct-web/app/people/[handle]/product-stages";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const code = (file: string) =>
  readFileSync(resolve(APP_DIR, file), "utf-8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("the stage line under a person's product", () => {
  it("is the board's line, from the product's own document, and nothing when there is no stage", () => {
    expect(stageLineOf({ stage: "shipping", milestoneCounts: { shipped: 3, total: 4 } })).toBe("shipping, 3 of 4");
    expect(stageLineOf({ stage: "shipping", milestoneCounts: { shipped: 0, total: 0 } })).toBe("shipping");
    expect(stageLineOf({ stage: "idea", milestoneCounts: { shipped: 0, total: 2 } })).toBe("idea");
    expect(stageLineOf(null)).toBeNull();
    expect(stageLineOf({ stage: undefined, milestoneCounts: undefined } as never)).toBeNull();
  });

  it("reads each product once, bounded, and a product that could not be read has no line", async () => {
    const seen: string[] = [];
    const lines = await readStageLines(["a", "b", "a", "c"], async (slug) => {
      seen.push(slug);
      if (slug === "b") return null;
      if (slug === "c") throw new Error("down");
      return { stage: "shipping", milestoneCounts: { shipped: 1, total: 2 } };
    });
    expect(seen).toEqual(["a", "b", "c"]);
    expect(lines).toEqual({ a: "shipping, 1 of 2" });
    const many = Array.from({ length: PERSON_STAGE_READ_LIMIT + 5 }, (_, index) => `p${index}`);
    let reads = 0;
    await readStageLines(many, async () => {
      reads += 1;
      return null;
    });
    expect(reads).toBe(PERSON_STAGE_READ_LIMIT);
  });

  it("the page reads them with the public read — the same bytes for every visitor — and the row draws the line", () => {
    const page = code("people/[handle]/page.tsx");
    // Read beside the person's posts, both public and cached like the page.
    expect(page).toMatch(/const \[stages, authored\] = await Promise\.all\(\[\s*readStageLines\(\[/);
    expect(page).toMatch(/^export const revalidate = 60;$/m);
    expect(page).not.toMatch(/readSession|cookies\(|headers\(/);
    expect(code("people/[handle]/product-stages.ts")).toContain("= fetchPublicProfile,");
    const rows = code("people/[handle]/product-rows.tsx");
    expect(rows).toContain("{stages[listing.slug] ? (");
    expect(rows).toContain("data-product-stage-line");
  });
});
