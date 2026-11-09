// Exactly one brand in every title (openproduct-worldclass RE2).
//
// `layout.tsx` declares `template: "%s · openproduct"`, and it works — until
// one of its two edges bites, and on 7 Sep both had.
//
//   THE TEMPLATE DOES NOT REACH THE SEGMENT THAT DECLARES IT, and the root
//   page is that segment. `/` served the bare word `Launches`: the front page
//   of the product, in every tab and every bookmark, naming neither the
//   product nor what it is.
//
//   A TITLE THAT CARRIES ITS OWN BRAND GETS A SECOND ONE. `/signin` set
//   `"Sign in · openproduct"`, the template appended `· openproduct`, and the
//   page served it twice — at the one moment a visitor is deciding whether
//   this site is careful with their password.
//
// Both were live for months and neither is the sort of thing anybody notices
// while reading a diff, because each looks right in the file it is in. They
// are only wrong in combination with a template declared somewhere else,
// which is what makes this a test rather than a code review note.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");

function everyRoute(dir = APP_DIR): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...everyRoute(full));
    else if (entry === "page.tsx") out.push(relative(APP_DIR, full));
  }
  return out.sort();
}

const ROUTES = everyRoute();

/**
 * The file with its comments removed.
 *
 * This test walks SOURCE, so prose about a declaration reads identically to
 * the declaration — and it caught itself on that immediately: the comment
 * added beside the root page's fix quotes `template: "%s · openproduct"` to
 * explain why the brand is written there, and the uniqueness check below read
 * the quote as a second template.
 *
 * Line comments are only stripped where one STARTS the line, so a `https://`
 * inside a string is left alone.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

const read = (file: string) => withoutComments(readFileSync(resolve(APP_DIR, file), "utf-8"));
const urlOf = (file: string) => "/" + file.replace(/\/?page\.tsx$/, "");

/** Every `title:` string literal a route declares, excluding `openGraph`'s. */
function titleLiterals(source: string): string[] {
  // `openGraph.title` is a DIFFERENT field with a different rule: no template
  // applies to it, so it carries the brand on purpose. Cut those blocks out
  // before looking, rather than trying to tell them apart by position.
  const withoutOg = source.replace(/openGraph:\s*\{[^}]*\}/gs, "");
  return [...withoutOg.matchAll(/(?<!openGraph[^}]{0,400})\btitle:\s*"([^"]*)"/g)].map((m) => m[1]!);
}

describe("titles carry exactly one brand (RE2)", () => {
  it("no route writes the brand into a title the template will brand again", () => {
    // The `/signin` defect, made impossible. The template is declared once in
    // `layout.tsx`; a page that also writes `openproduct` into its own title
    // is asking for it twice, and the page reads perfectly fine on its own.
    const offenders: string[] = [];
    for (const route of ROUTES) {
      if (route === "page.tsx") continue; // the root segment — see below
      for (const title of titleLiterals(read(route))) {
        if (title.toLowerCase().includes("openproduct")) {
          offenders.push(`${urlOf(route)} → ${JSON.stringify(title)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the root page brands itself, because the template cannot reach it", () => {
    // The exact inverse rule, for the exact one route it applies to. Next's
    // template applies to CHILD segments, and `app/page.tsx` shares its
    // segment with `app/layout.tsx`, so it is the one file that must say the
    // brand out loud.
    const titles = titleLiterals(read("page.tsx"));
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.every((t) => t.toLowerCase().includes("openproduct"))).toBe(true);
  });

  it("the template is declared exactly once, and in the root layout", () => {
    // Both rules above are stated relative to ONE template. A second one in a
    // nested layout would make each of them wrong somewhere without making
    // either of them fail.
    const layout = withoutComments(readFileSync(resolve(APP_DIR, "layout.tsx"), "utf-8"));
    expect(layout).toContain('template: "%s · openproduct"');

    const elsewhere = ROUTES.filter((r) => read(r).includes("template:"));
    expect(elsewhere).toEqual([]);
  });
});
