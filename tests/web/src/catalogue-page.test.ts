// The catalogue, continued (openproduct-scale OS1).
//
// The page after the front page's *Open builds* — one document at one
// address, reached by a plain link — and the directory read that pages it.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CATALOGUE_NEXT_LABEL, cataloguePagePath } from "@openproduct/contracts";

import { DIRECTORY_WALK_LIMIT, fetchAllDirectoryProjects, fetchDirectoryPage } from "@openproduct-web/app/public-api";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

interface Call {
  url: string;
}

function answering(pages: Record<string, unknown>): { calls: Call[]; fetchImpl: typeof fetch } {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL) => {
    const href = String(url);
    calls.push({ url: href });
    const cursor = new URL(href).searchParams.get("cursor") ?? "";
    const body = pages[cursor];
    if (body === undefined) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify({ data: body }), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const card = (slug: string) => ({ slug, tagline: null, metrics: [], publishedAt: "2026-09-01T00:00:00.000Z" });

describe("the directory read, paged", () => {
  it("puts the cursor in the URL and nowhere else, and reads next and total off the document", async () => {
    const { calls, fetchImpl } = answering({
      "": { projects: [card("a")], next: "p2", total: 3 },
      p2: { projects: [card("b"), card("c")], next: null, total: 3 },
    });
    const first = await fetchDirectoryPage(null, fetchImpl);
    expect(first).toEqual({ projects: [card("a")], next: "p2", total: 3, computedAt: null });
    expect(calls[0]!.url.endsWith("/v1/public/openproduct/projects")).toBe(true);
    const second = await fetchDirectoryPage("p2", fetchImpl);
    expect(second).toEqual({ projects: [card("b"), card("c")], next: null, total: 3, computedAt: null });
    expect(calls[1]!.url).toContain("/v1/public/openproduct/projects?cursor=p2");
  });

  it("reads a gateway from before OS1 as a page with nothing after it and no count", async () => {
    const { fetchImpl } = answering({ "": { projects: [card("a")] } });
    expect(await fetchDirectoryPage(null, fetchImpl)).toEqual({ projects: [card("a")], next: null, total: null, computedAt: null });
  });

  it("walks every page for the sitemap, and stops at the bound", async () => {
    const pages: Record<string, unknown> = { "": { projects: [card("p0")], next: "c1", total: 60 } };
    for (let n = 1; n < 60; n += 1) pages[`c${n}`] = { projects: [card(`p${n}`)], next: `c${n + 1}`, total: 60 };
    const { calls, fetchImpl } = answering(pages);
    const all = await fetchAllDirectoryProjects(fetchImpl);
    expect(all?.length).toBe(DIRECTORY_WALK_LIMIT);
    expect(calls).toHaveLength(DIRECTORY_WALK_LIMIT);
    const short = answering({ "": { projects: [card("only")], next: null, total: 1 } });
    expect((await fetchAllDirectoryProjects(short.fetchImpl))?.map((c) => c.slug)).toEqual(["only"]);
  });
});

describe("the page after the first", () => {
  const page = () => code("products/[cursor]/page.tsx");

  it("is a prerendered, revalidated document at a path — the shape /launches/{day} has", () => {
    const source = page();
    expect(source).toContain("export const revalidate = 60;");
    expect(source).toContain("export async function generateStaticParams()");
    expect(source).toContain("fetchDirectoryPage(cursor)");
    expect(source).toContain("<BuildTile key={card.slug} card={card} />");
    expect(source).toContain("frontPageEligible");
    expect(source).toContain("alternates: { canonical: cataloguePagePath(cursor) }");
    // A cursor the directory refuses is a 404, never a soft 200 with a panel.
    expect(source).toContain("if (page === null) notFound();");
    expect(source).not.toContain("FailurePanel");
  });

  it("links forward with a plain link, and back to the front page", () => {
    const source = page();
    expect(source).toContain("href={cataloguePagePath(page.next)}");
    expect(source).toContain("{CATALOGUE_NEXT_LABEL} →");
    expect(source).toContain('href="/"');
    expect(source).not.toMatch(/onClick|fetch\(|"use client"/);
  });

  it("the front page's catalogue links to it with the same label, only when there is a next", () => {
    // OB4 — the list is `feed/builds.tsx`, and only Most active pages: the
    // cursor is a position in that order (OS-1). Since openproduct-calm CL2
    // the link is drawn by `more-builds.tsx`, which renders it on the server
    // exactly as before and reads the pages behind it after paint (CL-R7).
    const feed = code("feed/builds.tsx");
    expect(feed).toContain('{order === "most-active" && next !== null ? <MoreBuilds next={next} returnTo={returnTo} /> : null}');
    const more = code("feed/more-builds.tsx");
    expect(more).toContain("href={cataloguePagePath(cursor)}");
    expect(more).toContain("{CATALOGUE_NEXT_LABEL} →");
    expect(more).toContain("useState<string | null>(next)");
    expect(cataloguePagePath("abc")).toBe("/products/abc");
    expect(CATALOGUE_NEXT_LABEL.length).toBeGreaterThan(0);
  });

  it("the sitemap walks the whole catalogue rather than its first page", () => {
    const source = code("sitemap.xml/route.ts");
    expect(source).toContain("fetchAllDirectoryProjects()");
    expect(source).not.toContain("fetchPublicDirectory()");
  });
});
