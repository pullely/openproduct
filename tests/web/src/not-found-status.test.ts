// A 404 AND A SKELETON ARE MUTUALLY EXCLUSIVE (R11).
//
// ─── THE DEFECT, AND WHY NOTHING CAUGHT IT ───────────────────────────────
//
// Every `notFound()` in this product served `200 OK` with the not-found page
// in the body. Five surfaces: a product slug, a handle, the handle's tabs, a
// discussion, a digest week. Crawlers were told a missing listing was fine
// and indexed it; the wrong answer was cacheable at the edge for 60 seconds
// plus 240 of stale-while-revalidate; and TS3's *"unknown, unpublished and
// unreachable all land here"* quietly became "…and all three read as OK".
//
// THE SOURCE WAS ALWAYS RIGHT. Every one of those routes calls `notFound()`,
// under a comment saying exactly why. So no test that read the source could
// have found this, and none did — it is SB0's lesson in a second place, and
// the perf lane's `ABSENT` list is the assertion that would have.
//
// ─── THE CAUSE: A SUSPENSE BOUNDARY ABOVE THE DECISION ───────────────────
//
// A `loading.tsx` makes Next stream the route. Streaming commits the status
// line before the body is known — so by the time the data read comes back and
// `notFound()` runs, the 200 has already gone out and only the body can still
// change. The app had a ROOT `loading.tsx`, so this was true of every route in
// the product.
//
// Diagnosed by bisection against the built server, because it is invisible in
// source: with the root `loading.tsx` removed, a bare page whose whole body is
// `notFound()` went from `200` to `404` — and `/[slug]` and `/people/[handle]`
// stayed at `200`, because each had one of their own.
//
// ─── SO THE RULE IS THE TRADE, STATED ────────────────────────────────────
//
// A route that can answer "this does not exist" cannot also promise a
// skeleton. Not a bug to route around — the two facts are wanted at the same
// moment and only one of them can be in the response line.
//
// Which wins is decided per route, and this file is that decision written
// down: the pages addressed BY A NAME SOMEBODY COULD GET WRONG lose their
// skeleton, and the pages nobody can miss — `/me`, `/studio`, the people
// directory — keep theirs.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(HERE, "../../../web/src/app");

/** Every page module in the app, as a path relative to `app/`. */
function pages(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) pages(full, out);
    else if (entry === "page.tsx") out.push(relative(APP_DIR, full).split(sep).join("/"));
  }
  return out;
}

const PAGES = pages(APP_DIR);

/**
 * The Suspense boundaries above a page, nearest first.
 *
 * A `loading.tsx` wraps its own segment AND everything under it, which is the
 * part that surprised: `/people/loading.tsx` was silently deciding the status
 * of `/people/[handle]`, two segments down.
 *
 * ROUTE GROUPS ARE THE TOOL THAT MAKES THIS TRACTABLE. `app/people/(index)/`
 * serves `/people` — the parentheses are invisible in the URL — so its
 * skeleton covers the directory and nothing else. That is how `/people` keeps
 * its skeleton while `/people/[handle]` is free to 404.
 */
function boundariesAbove(page: string): string[] {
  const found: string[] = [];
  const parts = page.split("/").slice(0, -1);
  for (let i = parts.length; i >= 0; i--) {
    const rel = [...parts.slice(0, i), "loading.tsx"].join("/");
    if (existsSync(resolve(APP_DIR, rel))) found.push(rel);
  }
  return found;
}

const read = (rel: string) => readFileSync(resolve(APP_DIR, rel), "utf-8");

/** Pages that decide a thing does not exist. */
const REFUSERS = PAGES.filter((p) => /\bnotFound\(\)/.test(read(p)));

describe("R11 — a page that can 404 has no skeleton above it", () => {
  it("finds the pages that refuse, so an empty list cannot read as a pass", () => {
    expect(REFUSERS.length).toBeGreaterThanOrEqual(5);
    for (const expected of [
      "[slug]/page.tsx",
      "people/[handle]/page.tsx",
      "threads/[id]/page.tsx",
      "digest/[week]/page.tsx",
    ]) {
      expect(REFUSERS).toContain(expected);
    }
  });

  it("has NO loading boundary above any of them", () => {
    // THE WHOLE RULE, IN ONE ASSERTION. A `loading.tsx` reintroduced anywhere
    // above one of these routes turns its 404 back into a 200, silently, and
    // the only other thing that would notice is the perf lane's `ABSENT`
    // list — which needs a build to run.
    const offenders = REFUSERS.flatMap((page) =>
      boundariesAbove(page).map((b) => `${page} ← ${b}`),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps skeletons where nothing can 404", () => {
    // The other half of the trade, so this does not read as "skeletons were
    // deleted". These three are addressed by a fixed path or by the visitor's
    // own session — there is no name to get wrong, so there is nothing to
    // refuse, so the skeleton costs nothing.
    for (const rel of ["me/loading.tsx", "studio/loading.tsx", "people/(index)/loading.tsx"]) {
      expect(`${rel}: ${existsSync(resolve(APP_DIR, rel))}`).toBe(`${rel}: true`);
    }
  });

  it("keeps the people directory's skeleton OFF the pages beneath it", () => {
    // The route group is doing real work here, and it is the one part of this
    // arrangement a reader is likely to undo by accident: moving
    // `people/(index)/page.tsx` back up to `people/page.tsx` would put the
    // skeleton back over `/people/[handle]` and cost that route its 404,
    // without changing a single URL.
    expect(existsSync(resolve(APP_DIR, "people/(index)/page.tsx"))).toBe(true);
    expect(existsSync(resolve(APP_DIR, "people/page.tsx"))).toBe(false);
    expect(existsSync(resolve(APP_DIR, "people/loading.tsx"))).toBe(false);
  });

  it("has no root loading.tsx, because it covered everything", () => {
    // It was also drawing the wrong page: its own header says "`/` IS the
    // directory — the facet rail and the product rows", and OL2 moved the
    // directory to `/products` and made `/` the feed. It had been a skeleton
    // for a layout that route no longer has since two milestones back.
    expect(existsSync(resolve(APP_DIR, "loading.tsx"))).toBe(false);
  });

  it("still renders the product's own words when it refuses", () => {
    // A 404 that rendered a blank page, or the console's, satisfies the status
    // and fails the reader. The perf lane asserts this against a real
    // response; here it is the source of the page that response comes from.
    const notFound = read("not-found.tsx");
    // In the product's own word since openproduct-calm CL5: a build.
    expect(notFound).toContain("No build lives at this address");
    // The one useful next step is Open builds — `/` — since the directory
    // that used to sit at `/products` is that same list.
    expect(notFound).toContain('href="/"');
  });
});
