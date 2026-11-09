// Sharing a listing, with no third-party script (openproduct-worldclass RE3).
//
// The audit measured **zero** third-party requests on this site and named it
// one of only two dimensions the product already wins. Every share widget on
// the internet is a script from somebody else's origin that reports who looked
// at the page, and adding one would trade a measured advantage for a row of
// logos.
//
// THE DISTINCTION THIS WHOLE MILESTONE RESTS ON: an intent is an `<a href>` a
// reader may follow. Nothing is fetched, nothing is embedded, and no request
// leaves the page unless a person clicks — which is a NAVIGATION, not a
// third-party request. `contracts/src/share.test.ts` holds what the links say;
// this holds that the page never loads anything.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP, file), "utf-8");
const code = (file: string) =>
  read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the zero stays zero", () => {
  it("loads nothing from another origin, anywhere in the app", () => {
    // The property, asserted over the whole tree rather than over the file
    // this milestone touched: no `<script src>`, no `<iframe>`, no `<link>`
    // to somebody else's origin, and no fetch to one.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(resolve(APP, dir))) {
        const rel = dir ? `${dir}/${entry}` : entry;
        if (statSync(resolve(APP, rel)).isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(entry)) {
          const source = code(rel);
          if (/<script[^>]+src=/.test(source)) offenders.push(`${rel}: <script src>`);
          if (/<iframe/.test(source)) offenders.push(`${rel}: <iframe>`);
          if (/<link[^>]+href="https?:/.test(source)) offenders.push(`${rel}: external <link>`);
        }
      }
    };
    walk("");
    expect(offenders).toEqual([]);
  });

  it("puts the third-party origins in `href` and nowhere else", () => {
    // The share control names three destinations. Each must appear as
    // somewhere a reader may GO, never as somewhere this page asks for
    // something.
    const control = code("[slug]/share-control.tsx");
    expect(control).not.toMatch(/fetch\(|XMLHttpRequest|import\(["']https/);
    expect(control).toContain("href={intent.href}");
  });

  it("tells the destination nothing about where the reader came from", () => {
    // `noreferrer` as well as `noopener`: the destination has no business
    // being told which listing somebody was reading when they decided to post
    // about it.
    expect(code("[slug]/share-control.tsx")).toContain('rel="noreferrer noopener"');
  });
});

describe("the browser's own sheet, and the panel behind it", () => {
  it("asks the browser first, from the click itself", () => {
    // Every browser requires a user gesture for `navigator.share`, and a call
    // one tick later is a call that gets refused.
    const control = code("[slug]/share-control.tsx");
    expect(control).toContain("navigator.share");
    expect(control).toContain('typeof navigator.share === "function"');
  });

  it("opens the panel too, rather than branching on the browser", () => {
    // A control that does one thing on one browser and another elsewhere,
    // with no way back, is how a share button ends up reported as broken by
    // the half of people whose browser took the other branch. Dismissing a
    // sheet is not the same as not wanting to share.
    const control = code("[slug]/share-control.tsx");
    expect(control).toMatch(/setOpen\(\(was\) => !was\);[\s\S]{0,200}navigator\.share/);
  });

  it("keeps the address selectable, so the button is a convenience", () => {
    const control = code("[slug]/share-control.tsx");
    expect(control).toContain("select-all");
    expect(control).toContain("navigator.clipboard.writeText");
  });

  it("closes on Escape and on a click away", () => {
    const control = code("[slug]/share-control.tsx");
    expect(control).toContain('event.key === "Escape"');
    expect(control).toContain("box.current.contains");
  });
});

describe("it is on the listing, and only where the address is real", () => {
  it("sits with the other acts on the hero", () => {
    expect(code("[slug]/page.tsx")).toContain("<ShareControl");
  });

  it("shows nothing without a canonical origin", () => {
    // Sharing a preview host is sharing the wrong page, permanently, in
    // somebody else's timeline.
    expect(code("[slug]/page.tsx")).toContain("share ? (");
    expect(code("[slug]/page.tsx")).toContain("shareUrl(apex, profile.slug)");
  });
});
