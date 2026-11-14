// The line-icon set (openproduct-open-builds OB1, decision D6).
//
// One glyph, one meaning, and never the only label. The web lane has no DOM,
// so these hold the SOURCE: every glyph is hidden from assistive technology,
// draws in `currentColor`, and every destination the chrome draws a glyph
// for has exactly one.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PHONE_TABS, SECTIONS } from "@openproduct-web/app/shell/shell";

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

  it("gives every destination one glyph, from one switch", () => {
    const glyph = read("shell/section-glyph.tsx");
    // The three sections and Activity — every tab the phone's bar draws.
    for (const tab of PHONE_TABS) {
      expect(glyph).toContain(`case "${tab.icon}":`);
    }
    for (const section of SECTIONS) {
      expect(glyph).toContain(`case "${section.icon}":`);
    }
    // THE PHONE'S BAR CARRIES THE GLYPHS, where a tab is a glyph over a
    // word. The header's pills are words (boards `Products`, `Feed`): a
    // glyph beside every word there is the "too much" the calm render took
    // out, and the redesign kept out.
    expect(read("shell/section-bar.tsx")).toContain("<SectionGlyph icon={tab.icon}");
    expect(read("shell/top-panel.tsx")).not.toContain("<SectionGlyph");
    expect(read("shell/top-panel.tsx")).toContain("{section.label}");
  });

  it("never leaves a glyph as the only name of a control", () => {
    // The chrome's glyph-only controls, each named: the bell, the sign-in
    // disc, the phone's search link (which also prints the word), and the
    // chevron that opens a person's products in the search card.
    expect(read("shell/notification-bell.tsx")).toMatch(/aria-label=\{unread > 0 \? `Activity — \$\{unread\} unread` : "Activity"\}/);
    expect(read("shell/account-chip.tsx")).toMatch(/aria-label="Sign in"[\s\S]{0,700}?<ProfileIcon/);
    expect(read("shell/top-panel.tsx")).toMatch(/aria-label="Search"[\s\S]{0,500}?<SearchGlyph \/>\s*Search/);
    expect(read("shell/palette-panel.tsx")).toMatch(/aria-label=\{`\$\{opened \? "Hide" : "Show"\} products of \$\{row\.title\}`\}[\s\S]{0,400}?<ChevronIcon/);
    // And every tab of the phone's bar prints its word under its glyph.
    expect(read("shell/section-bar.tsx")).toMatch(/<\/span>\s*\{tab\.label\}/);
  });
});
