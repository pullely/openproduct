// One forum per product (openproduct-worldclass-v2 FO2).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { listingForumMeaning, listingForumPath } from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PAGE = "[slug]/forum/page.tsx";

describe("the same document PP0 reads, at an address of its own", () => {
  it("reads the listing's own two documents, concurrently, and nothing else", () => {
    const page = code(PAGE);
    expect(page).toContain("await Promise.all([fetchListing(slug), fetchDiscussion(slug)])");
    expect(new Set(page.match(/fetch[A-Z]\w+\(/g))).toEqual(new Set(["fetchListing(", "fetchDiscussion("]));
    expect(page).not.toMatch(/searchParams|cookies\(|readSession/);
  });

  it("is public and cached, and a listing the page 404s on is a forum that 404s", () => {
    const page = read(PAGE);
    expect(page).toMatch(/export const revalidate = \d+/);
    expect(page).toContain("generateStaticParams");
    expect(page).toContain("if (!profile) notFound();");
  });

  it("renders the launch thread with the listing page's OWN component, and every thread as the index's tile", () => {
    const page = code(PAGE);
    expect(page).toContain("<Comments slug={profile.slug} launch={discussion?.launch ?? null} />");
    expect(page).toContain("{threads.map((thread) =>");
    // CP3 — the /threads tile, without the build's name: every thread here
    // is about this one.
    expect(page).toContain("<ThreadTile key={thread.id} thread={thread} now={now} />");
    expect(page).toContain("href={threadComposerHref(profile.slug)}");
    expect(page).not.toMatch(/\.sort\(/);
  });

  it("is linked from the listing's discussion header and from the studio, and is in the sitemap", () => {
    expect(code("[slug]/page.tsx")).toContain("href={listingForumPath(profile.slug)}");
    expect(code("studio/[org]/[profile]/page.tsx")).toContain("href={listingForumPath(profile.slug)}");
    expect(code("sitemap.xml/route.ts")).toContain("{ path: `${project.slug}/forum`, lastmod: null }");
    expect(listingForumPath("acme-thing")).toBe("/acme-thing/forum");
    expect(listingForumMeaning("acme-thing")).toMatch(/also on \/threads/);
  });
});
