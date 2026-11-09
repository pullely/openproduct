// The forum index on the web (openproduct-worldclass-v2 FO1).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FORUM_ORDERS, forumPath } from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const ROUTES = [
  "threads/page.tsx",
  "threads/replied/page.tsx",
  "threads/tag/[tag]/page.tsx",
  "threads/tag/[tag]/replied/page.tsx",
];

describe("four addresses, one body, no query string", () => {
  it("every route is cacheable and reads no searchParams, session or clock of its own", () => {
    for (const file of ROUTES) {
      const src = read(file);
      expect([file, /export const revalidate = \d+/.test(src)]).toEqual([file, true]);
      expect([file, src.includes("generateStaticParams")]).toEqual([file, true]);
      expect([file, /searchParams|cookies\(|readSession/.test(src)]).toEqual([file, false]);
      expect([file, src.includes("<ForumView order=")]).toEqual([file, true]);
    }
    expect(FORUM_ORDERS.length).toBe(2);
    expect(forumPath("replied", "design")).toBe("/threads/tag/design/replied");
  });

  it("the view reads one document and never orders it", () => {
    const view = code("threads/forum-view.tsx");
    expect(view).toContain("fetchForum(order, tag)");
    expect(view).not.toMatch(/\.sort\(/);
    expect(view).toContain("formulaHref(doc.formula)");
  });

  it("categories and orders are links from the contract; the composer is one link away; no hot", () => {
    const view = code("threads/forum-view.tsx");
    expect(view).toContain("forumCategories().map(");
    expect(view).toContain("FORUM_ORDERS.map(");
    expect(view).toContain("href={threadComposerHref()}");
    expect(view).not.toMatch(/hot|trending/i);
    // openproduct-calm-pages CP3 — each thread is a tile; its count is the
    // thread's own visible replies, under a label said once (CL-R4).
    expect(view).toContain("<ThreadTile key={thread.id} thread={thread} slug={thread.slug} now={Date.now()} />");
    const tile = code("threads/thread-tile.tsx");
    expect(tile).toContain("{THREAD_TILE_LABEL.replies}");
    expect(tile).toContain("{thread.postCount}");
    expect(tile).toContain("href={`/threads/${thread.id}`}");
  });

  it("an unknown tag segment is a 404, and the page has a card", () => {
    const view = code("threads/forum-view.tsx");
    expect(view).toContain("if (!tag) notFound();");
    expect(view).toContain('listCardMeta(origin, "threads")');
    expect(view).toContain("collectionPageJsonLd(");
  });
});
