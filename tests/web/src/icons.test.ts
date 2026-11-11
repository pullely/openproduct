// The line-icon set (openproduct-open-builds OB1, decision D6).
//
// One glyph, one meaning, and never the only label. The web lane has no DOM,
// so these hold the SOURCE: every glyph is hidden from assistive technology,
// draws in `currentColor`, and every section the navs render has exactly one.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SECTIONS } from "@openproduct-web/app/shell/shell";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");

describe("the icon set", () => {
  const icons = read("ui/icons.tsx");

  it("draws every glyph hidden, unfocusable and in the ink of its parent", () => {
    expect(icons).toContain('aria-hidden="true"');
    expect(icons).toContain('focusable="false"');
    expect(icons).toContain('stroke="currentColor"');
    expect(icons).toContain('fill="none"');
    // No glyph paints its own colour (XP-1): the accent means one thing.
    expect(icons).not.toMatch(/(fill|stroke)="#[0-9a-f]{3,6}"/i);
  });

  it("exports one named component per glyph, so a surface ships only what it renders", () => {
    const exported = [...icons.matchAll(/export function (\w+Icon)\(/g)].map((m) => m[1]);
    expect(exported.length).toBeGreaterThanOrEqual(8);
    expect(new Set(exported).size).toBe(exported.length);
    expect(icons).not.toMatch(/export const \w+\s*[:=]\s*(Record|\{)/);
  });

  it("gives every section one glyph, from one switch both navs share", () => {
    const glyph = read("shell/section-glyph.tsx");
    for (const section of SECTIONS) {
      expect(glyph).toContain(`case "${section.icon}":`);
    }
    // THE PHONE'S BAR CARRIES THE GLYPHS, where a section is a glyph over a
    // word. The desktop bar is words with an underline since openproduct-calm
    // CL1 (CL-R1): a glyph beside every word there was the "too much" the
    // calm render took out.
    expect(read("shell/section-bar.tsx")).toContain("<SectionGlyph icon={section.icon}");
    expect(read("shell/top-panel.tsx")).not.toContain("<SectionGlyph");
    expect(read("shell/top-panel.tsx")).toContain("{section.label}");
  });

  it("never leaves a glyph as the only name of a control", () => {
    // The phone's plus is the one glyph-only control, and it is named.
    const panel = read("shell/top-panel.tsx");
    expect(panel).toContain('aria-label="Open a build"');
    expect(panel).toContain("<PlusIcon />");
  });
});
