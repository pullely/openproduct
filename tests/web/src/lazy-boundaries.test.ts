// A lazy boundary that defers nothing (openproduct-performance OPP11).
//
// ─── THE BUG THIS FILE EXISTS FOR ─────────────────────────────────────────
//
// `next/dynamic` splits a component into its own chunk and loads that chunk
// WHEN THE COMPONENT MOUNTS. So a component that is always in the tree —
// even one whose body is `if (!open) return null` — loads its chunk on every
// page view, and the boundary buys nothing while still costing the loader.
//
// That is not a hypothesis. It is what the first attempt at OPP11 measured:
// `next/dynamic` on `shell/auth-modal.tsx`, which took an `open` prop and
// returned null when it was false, made every archetype route BIGGER and
// pushed two of them over budget. The change was reverted and recorded as
// "the split cost more than the code it moved", which was the right number
// and the wrong reason — the cost was in the call site, not in `next/dynamic`.
//
// With the mount made conditional, the same two splits (the sign-in card and
// the search field's dropdown) took **1,107 bytes off every archetype route**
// with the chunk count unchanged, measured by the budget lane:
//
//     /             127,976 → 126,869      11 chunks → 11
//     /product-00   131,381 → 130,274      12 chunks → 12
//     /people       128,395 → 127,288      12 chunks → 12
//     /people/ada   129,741 → 128,634      12 chunks → 12
//     /submit       132,537 → 131,430      13 chunks → 13
//
// ─── WHY A TEST AND NOT A COMMENT ─────────────────────────────────────────
//
// The failure is INVISIBLE. Mounting a lazy component unconditionally builds,
// typechecks, lints, renders identically and passes every other test in this
// suite; the only instrument that sees it is a budget lane that D5 says does
// not run on every website change. So the shape is asserted here, where it is
// checked on every commit.
//
// It reads the source rather than rendering, which is weaker than a
// behavioural assertion and is stated so it is not mistaken for one: this
// proves the guard is written, not that a browser deferred the fetch. The
// byte counts above are the behavioural half, and they live in the lane.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../../../web/src");

/** A file's CODE — comments stripped, so a guard about what a component does
 *  never reads the prose explaining what it deliberately does not do. */
const code = (file: string) =>
  readFileSync(file, "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith(".tsx") ? [full] : [];
  });
}

/** Every `const X = dynamic(() => import(…))` in the website, with its file. */
function lazyComponents(): { file: string; name: string; source: string }[] {
  const found: { file: string; name: string; source: string }[] = [];
  for (const file of walk(SRC)) {
    const source = readFileSync(file, "utf-8");
    for (const match of source.matchAll(/const\s+(\w+)\s*=\s*dynamic\s*\(/g)) {
      found.push({ file: file.slice(SRC.length + 1), name: match[1]!, source });
    }
  }
  return found;
}

/**
 * Is this `<Name` occurrence guarded by a condition?
 *
 * Looks at what immediately precedes it, ignoring whitespace: a conditional
 * mount in this codebase is `{cond ? (<Name`, `{cond ? <Name` or
 * `{cond && <Name`, and an unconditional one is preceded by markup or by the
 * opening of a fragment. Deliberately narrow — a helper that accepted
 * anything vaguely conditional would accept the bug.
 */
function isGuarded(source: string, at: number): boolean {
  const before = source.slice(0, at).replace(/\s+$/, "");
  return /(\?|&&)\s*\(?$/.test(before);
}

describe("every lazily-loaded component is mounted conditionally", () => {
  it("finds the boundaries at all, so this suite cannot go quietly vacuous", () => {
    // If somebody deletes both splits the byte win goes with them, and a test
    // that only iterates over what it finds would go green on an empty list.
    const names = lazyComponents().map((c) => `${c.file}:${c.name}`);
    expect(names).toContain("app/shell/account-chip.tsx:AuthModal");
    expect(names).toContain("app/shell/palette.tsx:PalettePanel");
  });

  it.each(lazyComponents().map((c) => [`${c.file}:${c.name}`, c] as const))(
    "%s is only rendered inside a condition",
    (_label, component) => {
      const uses = [...component.source.matchAll(new RegExp(`<${component.name}\\b`, "g"))];
      // A lazy component nobody renders is a different bug, and this suite is
      // not the place to be silent about it either.
      expect(uses.length).toBeGreaterThan(0);
      for (const use of uses) {
        expect([component.name, isGuarded(component.source, use.index)]).toEqual([
          component.name,
          true,
        ]);
      }
    },
  );

  it("the sign-in card cannot be handed an `open={false}`, because there is no prop", () => {
    // The condition lives at the call site, and the type system is what keeps
    // it there: an `open` prop is an invitation to mount the thing always and
    // let it decide, which is precisely the shape that deferred nothing.
    const modal = readFileSync(resolve(SRC, "app/shell/auth-modal.tsx"), "utf-8");
    const signature = modal.slice(modal.indexOf("export function AuthModal("));
    expect(signature.slice(0, signature.indexOf("{ ("))).not.toMatch(/\bopen\b/);
  });
});

describe("what is NOT behind a boundary, and must never be", () => {
  it("the search FIELD renders eagerly — only its dropdown is lazy", () => {
    // `palette.tsx` renders the header's visible `role="combobox"` input on
    // every page for every visitor. Putting THAT behind `ssr: false` would
    // delete it from the server render and reintroduce exactly the layout
    // shift OPP9 removed — which is why OPP11 split the component instead of
    // lazy-loading it, and why the split is the interesting half.
    const field = readFileSync(resolve(SRC, "app/shell/palette.tsx"), "utf-8");
    // COMMENTS STRIPPED for the negative half: `palette-panel.tsx` explains at
    // length why the combobox is NOT in it, and a guard that reads the prose
    // explaining an absence fails on the explanation.
    const panel = code(resolve(SRC, "app/shell/palette-panel.tsx"));
    expect(field).toContain('role="combobox"');
    expect(panel).not.toContain('role="combobox"');
    // And the field itself is imported the ordinary way by the bar that holds
    // it, so no later change can quietly make the whole palette lazy.
    const bar = readFileSync(resolve(SRC, "app/shell/top-panel.tsx"), "utf-8");
    expect(bar).toContain('import { CommandPalette } from "./palette"');
    expect(bar).toContain("<CommandPalette />");
  });

  it("the dropdown owns no state, so the split moved bytes and not behaviour", () => {
    // The panel is pure presentation: every piece of state and every effect
    // stayed in `palette.tsx`. That is what keeps the combobox's keyboard
    // model in one place — the alternative put the Arrow/Enter handling on one
    // side of a lazy boundary and the rows it navigates on the other.
    const panel = readFileSync(resolve(SRC, "app/shell/palette-panel.tsx"), "utf-8");
    expect(panel).not.toMatch(/React\.useState|React\.useEffect|React\.useCallback/);
    expect(panel).not.toContain("fetch(");
  });
});
