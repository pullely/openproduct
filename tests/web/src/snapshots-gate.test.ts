// Snapshots, diffed in CI, as a gate (openproduct-worldclass-v2 QE4).
//
// What a cheap suite can hold about the lane: it is in `all`; it records
// geometry and colour rather than pixels (the reasoning is the lane's
// header); it covers the eight routes at both viewports in both ramps; a
// missing baseline fails rather than being recorded silently; and every
// baseline the lane compares against is committed beside it.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PERF = resolve(__dirname, "../../web-perf");
const read = (file: string) => readFileSync(resolve(PERF, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

// "upvoted" was "leaderboard" until OB7 (#1875) folded the leaderboard into it.
const ROUTE_KEYS = ["home", "listing", "upvoted", "topic", "maker", "day", "forum", "listing-forum"];

describe("the snapshot lane is a gate", () => {
  const lane = code("src/snapshots.mjs");

  it("runs in `all`, and records where a screenshot would guess", () => {
    expect(code("src/run.mjs")).toContain('if (lane === "all" || lane === "snapshots")');
    expect(lane).toContain("getBoundingClientRect()");
    expect(lane).toContain("backgroundColor");
    expect(lane).not.toContain("screenshot(");
  });

  it("covers the eight routes, both viewports, both ramps", () => {
    for (const key of ROUTE_KEYS) expect(lane).toContain(`key: "${key}"`);
    expect(lane).toContain("width: 1280");
    expect(lane).toContain("width: 375");
    expect(lane).toContain('colorScheme: "light"');
    expect(lane).toContain('colorScheme: "dark"');
  });

  it("fails on a missing baseline instead of recording one silently", () => {
    expect(lane).toContain("if (!existsSync(file)) {");
    expect(lane).toContain('process.env.XP4_UPDATE_SNAPSHOTS === "1"');
  });

  it("has a committed baseline for every route, viewport and ramp", () => {
    const dir = resolve(PERF, "snapshots");
    expect(existsSync(dir)).toBe(true);
    const files = new Set(readdirSync(dir));
    for (const key of ROUTE_KEYS) {
      for (const width of ["desktop", "phone"]) {
        for (const ramp of ["light", "dark"]) {
          const file = `${key}.${width}.${ramp}.json`;
          expect([file, files.has(file)]).toEqual([file, true]);
          const snap = JSON.parse(readFileSync(resolve(dir, file), "utf-8"));
          // The shell is always there; the section bar is a phone thing.
          expect([file, snap.header !== null]).toEqual([file, true]);
          expect([file, snap.sectionBar !== null]).toEqual([file, width === "phone"]);
          expect([file, typeof snap.colours.body]).toEqual([file, "string"]);
        }
      }
    }
  });

  it("records nothing that follows the calendar or the page's length", () => {
    // The footer's top follows the page's length and a row's text rots; a
    // snapshot that recorded either would fail on a quiet week.
    expect(lane).toContain('footer: box(footer, SIZE)');
    expect(lane).toContain('firstRow: box(row, SIZE)');
    expect(lane).not.toMatch(/scrollHeight|textContent/);
  });
});
