// Threads (openproduct-calm-pages CP3).
//
// What is pinned: a thread is a tile with its figures named once (CP-R6,
// CL-R4), on /threads and on a build's forum alike; the order is the sticky
// underline strip with the order's sentence as its caption (CP-R2, CL-R6),
// not a pill in a tray; a category stays a filter pill; and the forum, a
// thread and the composer sit in the calm frame.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { THREAD_TILE_LABEL } from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const code = (file: string) =>
  readFileSync(resolve(APP_DIR, file), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("a thread is a tile (CP-R6)", () => {
  const tile = code("threads/thread-tile.tsx");

  it("draws the tile's card, with the title's link stretched over it", () => {
    expect(tile).toContain("rounded-[20px] border border-border bg-card px-8 py-6");
    expect(tile).toContain("after:absolute after:inset-0 after:content-['']");
    expect(tile).toContain("data-keyrow");
    expect(tile).not.toContain("hover:text-endorse-ink");
  });

  it("names its two figures once", () => {
    expect(THREAD_TILE_LABEL).toEqual({ replies: "Replies", lastReply: "Last reply", started: "Started" });
    expect(tile).toContain("{THREAD_TILE_LABEL.replies}");
    expect(tile).toContain("thread.lastPostAt ? THREAD_TILE_LABEL.lastReply : THREAD_TILE_LABEL.started");
    // The old row said "3 replies" beside every thread.
    expect(tile).not.toMatch(/"reply" : "replies"/);
  });

  it("both forum lists stack the same tile 14px apart", () => {
    for (const file of ["threads/forum-view.tsx", "[slug]/forum/page.tsx"]) {
      const source = code(file);
      expect([file, source.includes('<ul className="m-0 mt-') && source.includes("grid list-none gap-[14px] p-0\" data-thread-tiles>")]).toEqual([
        file,
        true,
      ]);
      expect([file, source.includes("<ThreadTile ")]).toEqual([file, true]);
    }
  });
});

describe("the order is the strip, the category a pill (CP-R2)", () => {
  const view = code("threads/forum-view.tsx");

  it("is sticky from `sm` up, on the page's ground, and static on a phone", () => {
    expect(view).toContain("data-threads-strip");
    expect(view).toMatch(/className="sticky top-0 z-20 [^"]*bg-background max-sm:static"/);
    expect(view).toContain("on ? TAB_ON : TAB_OFF");
    expect(view).not.toContain("rounded-[8px] bg-secondary p-[3px]");
  });

  it("carries the order's sentence as its caption, linked to the formula", () => {
    expect(view).toMatch(/href=\{formulaHref\(doc\.formula\)\}\s*data-threads-caption/);
    expect(view).toContain("{forumMeaning(order, tag)}");
    expect(view).not.toContain("How this is ordered");
  });

  it("keeps the categories as filter pills", () => {
    expect(view).toContain('"tap inline-flex h-[36px] items-center rounded-full border px-4 text-[14px] no-underline transition-colors"');
  });
});

describe("the calm frame", () => {
  it("the forum column has 80px above its title", () => {
    expect(code("threads/forum-view.tsx")).toMatch(/export const FORUM_PAGE =\s*"[^"]*pt-\[80px\]/);
    expect(code("threads/new/page.tsx")).toContain("pt-[80px]");
  });

  it("a thread's reply box and note take the tile's radius", () => {
    const thread = code("threads/[id]/page.tsx");
    expect(thread).toContain("mt-10 max-w-[860px] rounded-[20px] border border-border bg-card px-8 py-7");
    expect(thread).not.toMatch(/rounded-\[12px\]/);
  });
});
