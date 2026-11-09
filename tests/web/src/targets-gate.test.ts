// Targets at phone width, as a gate (openproduct-worldclass-v2 QE3).
//
// FR2 measured by hand and told the standalone links; QE3 wrote the
// measurement down as a lane. What is pinned here is the part a cheap suite
// can hold: the lane runs in `all`, the floor is the finger's 44px at the
// phone's width, FR2's two exemptions are the rules rather than a memory,
// and every entry in the registry of what may stay small carries a reason.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PERF = resolve(__dirname, "../../web-perf/src");
const read = (file: string) => readFileSync(resolve(PERF, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("the targets lane is a gate", () => {
  const lane = code("targets.mjs");

  it("runs in `all`, at the phone's width, on the finger's floor", () => {
    expect(code("run.mjs")).toContain('if (lane === "all" || lane === "targets")');
    expect(lane).toContain("export const TAP_MIN = 44;");
    expect(lane).toContain("const VIEWPORT = { width: 375, height: 812 };");
    expect(lane).toContain("isMobile: true, hasTouch: true");
  });

  it("holds FR2's two exemptions as rules: a word in a sentence, a row that is the target", () => {
    expect(lane).toContain("const inline = (el) =>");
    expect(lane).toContain('const inRow = (el) => el.closest("[data-keyrow]") !== null;');
    expect(lane).toContain("!inline(el) && !inRow(el)");
  });

  it("names a reason beside everything it lets stay small", () => {
    // The registry is the work queue. An entry without a reason is a number
    // being moved, which is the thing this lane exists to stop.
    const registry = lane.slice(lane.indexOf("const EXEMPT = new Map(["), lane.indexOf("]);", lane.indexOf("const EXEMPT")));
    const entries = [...registry.matchAll(/\["([^"]+)", "([^"]*)"\]/g)];
    expect(entries.length).toBeGreaterThan(0);
    for (const [, name, reason] of entries) expect([name, (reason ?? "").length > 12]).toEqual([name, true]);
  });

  it("walks the forum and the search results as rows", () => {
    // QE3 — every list this epic added is a keyboard row, so j/k walk it and
    // the row, not its title, is the finger's target.
    const app = resolve(__dirname, "../../../web/src/app");
    // OB6's Builds tab — the maker page's default — too (openproduct#1882).
    // CP3 — the two forum lists draw `ThreadTile`, which carries the row.
    for (const file of ["threads/thread-tile.tsx", "search/page.tsx", "people/[handle]/page.tsx"]) {
      expect([file, readFileSync(resolve(app, file), "utf-8").includes("data-keyrow")]).toEqual([file, true]);
    }
    for (const file of ["threads/forum-view.tsx", "[slug]/forum/page.tsx"]) {
      expect([file, readFileSync(resolve(app, file), "utf-8").includes("<ThreadTile ")]).toEqual([file, true]);
    }
  });
});
