// A page and a route handler never share an address.
//
// THE FAILURE THIS GUARDS IS THE DEPLOY'S, NOT A LANE'S. FO0 shipped
// `threads/new/route.ts` beside `threads/new/page.tsx`; every suite here
// passed, because they read source, and `next build` refused the pair —
// "You cannot have two parallel pages that resolve to the same path" — so
// the production deploy failed and the site kept serving the build before it.
// Four merged milestones answered 404 until somebody ran a build by hand.
//
// So this reads the app tree the way Next does, and fails on the pair.
import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

describe("the app tree", () => {
  it("has no directory holding both a page and a route handler", () => {
    const files = walk(APP_DIR);
    const dirsWithPage = new Set(
      files.filter((f) => /\/page\.tsx?$/.test(f)).map((f) => dirname(f)),
    );
    const collisions = files
      .filter((f) => /\/route\.tsx?$/.test(f))
      .map((f) => dirname(f))
      .filter((d) => dirsWithPage.has(d))
      .map((d) => relative(APP_DIR, d));
    expect(collisions).toEqual([]);
  });
});
