// axe in CI, both ramps, as a gate (openproduct-worldclass-v2 QE2).
//
// FR5 wrote the pass; what QE2 holds is that it GATES — it runs in `all`,
// which the verify profile executes — that it walks every public address
// rather than the ones somebody remembered, and that it can fail: a lane
// that reports "clean" from a script that never ran is the failure this
// suite exists to make impossible.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const PERF = resolve(__dirname, "../../web-perf/src");
const read = (file: string) => readFileSync(file, "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** Static public pages: a `revalidate` and no `[param]` in the path. */
function staticPublicPaths(dir = APP_DIR, prefix = "", out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      const segment = /^\(.*\)$/.test(entry) ? prefix : `${prefix}/${entry}`;
      staticPublicPaths(full, segment, out);
    } else if (entry === "page.tsx" && !prefix.includes("[") && /export const revalidate = \d+;/.test(read(full))) {
      out.push(prefix || "/");
    }
  }
  return out;
}

describe("the axe pass is a gate", () => {
  it("runs in `all`, over both ramps and both widths, on WCAG A and AA", () => {
    expect(code(resolve(PERF, "run.mjs"))).toContain('if (lane === "all" || lane === "axe")');
    const axe = code(resolve(PERF, "axe.mjs"));
    expect(axe).toContain('{ id: "light", colorScheme: "light" }');
    expect(axe).toContain('{ id: "dark", colorScheme: "dark" }');
    expect(axe).toContain("width: 1280");
    expect(axe).toContain("width: 375");
    expect(axe).toContain('["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]');
  });

  it("proves it can fail before it says anything is clean", () => {
    const axe = code(resolve(PERF, "axe.mjs"));
    expect(axe).toContain('const SEEDED_RULE = "image-alt";');
    expect(axe).toContain("the gate can fail: a seeded violation is reported");
    // The seed comes before the walk and stops the lane when unseen.
    expect(axe.indexOf("seededViolationIsSeen(page, base, ROUTES[0], TAGS)")).toBeLessThan(
      axe.indexOf("for (const width of WIDTHS)"),
    );
    expect(axe).toContain("if (!seen) return 1;");
  });

  it("walks every static public page the app has", () => {
    // The fixture's route list is what the three browser lanes visit. A
    // public page missing from it has never been read for contrast, targets
    // or names — HB2's year, PP3's pricing and FO1's forum were exactly that.
    const fixture = read(resolve(PERF, "fixture.mjs"));
    const listed = new Set(
      [...fixture.matchAll(/\{ path: (?:"([^"]+)"|`([^`]+)`)/g)].map((m) => (m[1] ?? m[2] ?? "").replace(/\?.*$/, "")),
    );
    const missing = staticPublicPaths().filter((path) => !listed.has(path) && !EXEMPT.has(path));
    expect(missing).toEqual([]);
  });
});

/** Static public pages the lanes reach another way, each with its reason. */
const EXEMPT = new Set<string>([
  // `/launches` is a redirect to the home (MOVED in the fixture), not a page.
  "/launches",
]);
