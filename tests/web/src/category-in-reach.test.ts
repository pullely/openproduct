// LR9 — the category is in reach. A listing without one is held below the
// products list's floor, so the studio names the field by its own word and
// puts the gap one click from the step that fills it.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FLOOR_FIELDS, STRIP_STEPS } from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const code = (file: string) =>
  readFileSync(resolve(APP_DIR, file), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

describe("the category is in reach from the studio", () => {
  it("is a field the products list requires", () => {
    expect(FLOOR_FIELDS).toContain("category");
  });

  it("names the step after the category, in the strip and on its page", () => {
    const step = STRIP_STEPS.find((s) => s.id === "topics");
    expect(step?.label).toBe("Category and stack");
    expect(step?.holds).toContain("products list");
    expect(code("studio/[org]/[profile]/topics/page.tsx")).toContain('title="Category and stack"');
  });

  it("links a missing category from the listing card to the step that sets it", () => {
    const editor = code("studio/[org]/[profile]/editor.tsx");
    expect(editor).not.toContain("No topic yet");
    expect(editor).toMatch(/href=\{hrefs\.topics\}[\s\S]{0,200}Add a category/);
  });

  it("says beside the picker why the category matters", () => {
    expect(code("studio/[org]/[profile]/topics/page.tsx")).toContain("Needed to appear on the products list.");
  });
});
