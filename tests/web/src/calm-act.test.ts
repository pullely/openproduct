// The act is ink; one kind of tab (openproduct-calm-pages CP1).
//
// What is pinned: the one thing a page asks for is the foreground pill, as
// the bar's *Sign in* draws it, never filled with the endorse accent (CP-R1,
// XP-1, CL-R8); every button token is a pill; a name never hovers into the
// accent; and the sign-in card's two modes are the underline tab strip every
// list's sorts use (CP-R2), with the wordmark said once — by the bar — on the
// page.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const code = (file: string) =>
  readFileSync(resolve(APP_DIR, file), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const tsx = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return tsx(full);
    return name.endsWith(".tsx") ? [relative(APP_DIR, full)] : [];
  });

describe("the act is ink (CP-R1)", () => {
  const design = code("ui/design.ts");

  it("the act is the bar's pill in `--primary`, and the accent button is gone", () => {
    expect(design).not.toContain("BTN_ACCENT");
    expect(design).toMatch(/export const BTN_PRIMARY =\s*"[^"]*rounded-full bg-primary[^"]*text-primary-foreground/);
    for (const file of tsx(APP_DIR)) {
      expect([file, code(file).includes("BTN_ACCENT")]).toEqual([file, false]);
    }
  });

  it("every button token is a pill", () => {
    for (const name of ["BTN_PRIMARY", "BTN_OUTLINE", "BTN_QUIET", "BTN_SMALL", "BTN_COMPACT"]) {
      const token = design.match(new RegExp(`export const ${name} =\\s*"([^"]*)"`))?.[1] ?? "";
      expect([name, token.includes("rounded-full")]).toEqual([name, true]);
    }
  });

  it("nothing is filled with the accent but the upvote", () => {
    // The vote box is the upvote. White on a scrim (`text-on-accent` over
    // `bg-scrim`) is not the accent.
    for (const file of tsx(APP_DIR).filter((f) => f !== "ui/vote-box.tsx")) {
      expect([file, /bg-endorse-ink/.test(code(file))]).toEqual([file, false]);
      const offScrim = code(file).replace(/bg-scrim\/\d+[^"`]*text-on-accent/g, "");
      expect([file, offScrim.includes("text-on-accent")]).toEqual([file, false]);
    }
  });

  it("a name never hovers into the accent (CL-R8)", () => {
    for (const file of tsx(APP_DIR)) {
      expect([file, code(file).includes("hover:text-endorse-ink")]).toEqual([file, false]);
    }
  });

  it("a followed state and the maintainer badge are neutral", () => {
    expect(code("ui/follow-button.tsx")).not.toMatch(/endorse/);
    expect(code("ui/maintainer-badge.tsx")).not.toMatch(/endorse/);
  });
});

describe("one kind of tab (CP-R2)", () => {
  const card = code("shell/auth-modal.tsx");

  it("the sign-in card's modes are the underline strip, not a pill in a tray", () => {
    expect(card).toContain('className="-mt-1 flex gap-4 border-b border-line"');
    expect(card).toContain("${tab === value ? TAB_ON : TAB_OFF}");
    expect(card).not.toContain("grid grid-cols-2 gap-1 rounded-[8px] bg-secondary p-1");
  });

  it("the sign-in page opens on its title; the wordmark is said by the bar", () => {
    expect(card).toMatch(/\{inDialog \? \(\s*<div className="mb-6 flex items-center gap-\[9px\]">\s*<Logomark/);
  });
});
