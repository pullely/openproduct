// THE RENDERING HINT, AND THE ONE WAY IT CAN GO WRONG.
//
// The mechanism is small: a cookie carrying `1`, a script in `<head>` that
// turns it into a class before the first paint, and two CSS rules that decide
// which branch of the account control is displayed. Nothing in it can
// authorise anything — the gateway never sees the cookie, core never sees it,
// and `/auth/session` still resolves the real session against the real issuer.
//
// SO THE FAILURE MODE IS NOT SECURITY, IT IS DRIFT. The hint is only useful
// while it agrees with the session cookie, and it agrees only because every
// place that writes one writes the other. There are five such places today.
// A sixth added without its hint would not break a test, would not error, and
// would quietly reintroduce the flicker for whoever went through it — or
// worse, leave an account chip painted for somebody who signed out.
//
// This file is that guard, and it is the same shape as
// `cookie-is-not-authority.test.ts`: enumerate the writers, and fail when the
// set changes.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SESSION_COOKIE,
  SESSION_HINT_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  SIGNED_IN_CLASS,
  cookieAttributes,
  hintAttributes,
} from "@openproduct-web/app/auth/auth";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(HERE, "../../../web/src");
const read = (file: string) => readFileSync(join(WEB_SRC, file), "utf-8");

/** Every source file under the app, so "who writes this cookie" is a question
 *  about the app rather than about a list somebody kept up to date. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = walk(WEB_SRC).map((f) => relative(WEB_SRC, f).split(sep).join("/"));

/**
 * The five places a session begins, ends, or is confirmed.
 *
 * `auth/auth.ts` is the vocabulary and writes nothing; every other entry is a
 * route handler that hands the browser a `Set-Cookie`.
 */
const WRITERS = [
  "app/auth/callback/route.ts",
  "app/auth/password/route.ts",
  "app/auth/session/route.ts",
  "app/auth/signout/route.ts",
];

describe("the hint is written wherever the session is", () => {
  it("scans a real tree, so a wrong path cannot read as a pass", () => {
    expect(FILES.length).toBeGreaterThan(50);
    for (const writer of WRITERS) expect(FILES).toContain(writer);
  });

  it("has exactly these writers of the session cookie, and no others", () => {
    // `cookies.set(SESSION_COOKIE` is the write; a file that merely READS the
    // cookie (every `/me` route does) is not one.
    const found = FILES.filter((file) =>
      /cookies\.set\(\s*SESSION_COOKIE/.test(read(file)),
    ).sort();
    expect(found).toEqual([...WRITERS].sort());
  });

  it("writes the hint in every one of them", () => {
    for (const writer of WRITERS) {
      const src = read(writer);
      expect([writer, /cookies\.set\(\s*SESSION_HINT_COOKIE/.test(src)]).toEqual([writer, true]);
    }
  });

  it("clears the hint wherever it clears the session", () => {
    // The dangerous direction. A session cleared without its hint leaves an
    // account chip painted for somebody who is signed out — visible until
    // `/auth/session` answers, which is exactly the flicker in reverse.
    //
    // ASSERTED ON THE EXPIRY, NOT ON THE VALUE, because the two routes spell
    // the same act differently and both are correct: `signout` writes `""`
    // outright, `session` writes a ternary that is `""` on the signed-out
    // branch. `hintAttributes(0)` is the deletion in both, and it is the part
    // that has to be there.
    for (const writer of ["app/auth/signout/route.ts", "app/auth/session/route.ts"]) {
      const src = read(writer);
      expect([writer, /hintAttributes\(\s*0\s*\)/.test(src)]).toEqual([writer, true]);
    }
  });

  it("gives /auth/session ONE response constructor, so no exit can forget", () => {
    // Five ways to be signed in and three to be signed out reach the end of
    // that route. A hint written at some of them would be right often enough
    // to be trusted and wrong often enough to flicker, so every exit goes
    // through `answer()` and nothing else builds a response.
    const src = read("app/auth/session/route.ts");
    const constructed = src.match(/NextResponse\.json\(/g) ?? [];
    expect(constructed).toHaveLength(1);
    expect(src).toMatch(/function answer\(/);
  });
});

describe("the hint cannot outlive, or outrank, the session", () => {
  it("expires with it", () => {
    expect(hintAttributes(SESSION_MAX_AGE_SECONDS).maxAge).toBe(
      cookieAttributes(SESSION_MAX_AGE_SECONDS).maxAge,
    );
  });

  it("matches the session cookie on every attribute but the one that is the point", () => {
    const session = cookieAttributes(SESSION_MAX_AGE_SECONDS);
    const hint = hintAttributes(SESSION_MAX_AGE_SECONDS);
    expect(hint.secure).toBe(session.secure);
    expect(hint.sameSite).toBe(session.sameSite);
    expect(hint.path).toBe(session.path);
    // THE ONE DIFFERENCE, and it is why the mechanism works at all: a script
    // in `<head>` has to read it before the first paint.
    expect(session.httpOnly).toBe(true);
    expect(hint.httpOnly).toBe(false);
  });

  it("is a different cookie from the session, not a second copy of it", () => {
    expect(SESSION_HINT_COOKIE).not.toBe(SESSION_COOKIE);
  });

  it("carries no identity — one character, and the same one at both doors", () => {
    // What makes a readable cookie acceptable here. If either door ever wrote
    // a name, a subject id or a token into it, this fails: the value written
    // is the literal "1" and nothing interpolated.
    for (const writer of ["app/auth/callback/route.ts", "app/auth/password/route.ts"]) {
      const src = read(writer);
      const written = [...src.matchAll(/cookies\.set\(\s*SESSION_HINT_COOKIE,\s*([^,]+),/g)].map(
        (m) => m[1]!.trim(),
      );
      expect([writer, written]).toEqual([writer, ['"1"']]);
    }
  });
});

describe("the class is what displays a branch, and the markup never varies", () => {
  it("boots the class from the cookie before the first paint", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain("SESSION_BOOT");
    // In `<head>`, before anything paints. It used to sit beside a theme boot
    // script; that one left when the site went to a single ramp, and it is
    // BACK — FR0 shipped the second ramp and FR1 the control that chooses it,
    // so there are two scripts here again and both have the same job: set an
    // attribute from something only this browser knows, before the first
    // pixel, without changing a byte of the document.
    expect(layout).toMatch(/<script dangerouslySetInnerHTML=\{\{ __html: SESSION_BOOT/);
    expect(layout).toMatch(/<script dangerouslySetInnerHTML=\{\{ __html: THEME_BOOT/);
    // THE SYMBOLS, NOT THE LITERALS — and the distinction is the point rather
    // than a test detail. The boot script interpolates both constants from
    // `auth/auth.ts`, so neither string appears in this file, and a scan for
    // the literal would fail on the CORRECT implementation while passing on a
    // hand-copied one that could drift.
    expect(layout).toContain("${SIGNED_IN_CLASS}");
    expect(layout).toContain("${SESSION_HINT_COOKIE}");
    expect(layout).toMatch(/import \{[^}]*SESSION_HINT_COOKIE[^}]*\} from "\.\/auth\/auth"/s);
  });

  it("anchors the cookie match on both sides, so a lookalike name cannot set it", () => {
    // `document.cookie.indexOf("op_signed_in=1")` would also match a cookie
    // called `their_op_signed_in`.
    const layout = read("app/layout.tsx");
    expect(layout).toContain("(?:^|; )");
    expect(layout).toContain("(?:;|$)");
  });

  it("renders BOTH branches, which is what keeps I6 true", () => {
    // The whole safety argument. If the component ever returns one branch or
    // the other, the HTML varies per visitor and the page stops being the one
    // cached document I6 and OPC-1 describe.
    const chip = read("app/shell/account-chip.tsx");
    expect(chip).toContain('data-auth-branch="anonymous"');
    expect(chip).toContain('data-auth-branch="signed-in"');
    // No early return, and no conditional on a signed-in flag: there is no
    // such flag in React state any more.
    expect(chip).not.toMatch(/if \(\s*signedIn\s*\)/);
    expect(chip).not.toContain("kind: \"signedIn\"");
  });

  it("hides a branch with `visibility`, which leaves the a11y tree AND keeps the box", () => {
    // TWO REQUIREMENTS, AND ONLY ONE PROPERTY MEETS BOTH. The hidden branch
    // must leave the accessibility tree and the tab order, or a screen reader
    // announces a Sign in button and an account menu at once; `opacity: 0`
    // fails that and is still forbidden. It must ALSO keep its box: the two
    // branches are different widths, and under `display: none` the bar
    // reserved whichever was showing, so the whole right-hand side jumped
    // ~48px sideways the moment the boot script stamped the class. The chip
    // stacks both in one grid cell, so a kept box is a bar that does not move.
    const css = readFileSync(resolve(WEB_SRC, "styles/globals.css"), "utf-8");
    const rules = css.slice(css.indexOf('[data-auth-branch="signed-in"]'));
    expect(rules).toContain("visibility: hidden");
    expect(rules).not.toContain("display: none");
    expect(rules).not.toContain("opacity: 0");
    // And the cell that makes the reservation, in the component itself.
    expect(read("app/shell/account-chip.tsx")).toContain("[grid-area:1/1]");
  });

  it("defaults to the anonymous branch, which is the no-JavaScript answer", () => {
    // No script, no cookie, no class — and what shows is AC2c's real anchor
    // to the platform's door.
    const css = readFileSync(resolve(WEB_SRC, "styles/globals.css"), "utf-8");
    expect(css).toMatch(/:root \[data-auth-branch="signed-in"\] \{\s*visibility: hidden;/);
    expect(css).toMatch(new RegExp(`:root\\.${SIGNED_IN_CLASS} \\[data-auth-branch="anonymous"\\]`));
  });

  it("keeps the anonymous branch an anchor to the platform (AC2c)", () => {
    const chip = read("app/shell/account-chip.tsx");
    const anon = chip.slice(chip.indexOf('data-auth-branch="anonymous"'));
    expect(anon.slice(0, 400)).toContain("href={signInHref(returnTo)}");
  });

  it("lets the authority correct the hint rather than trusting it", () => {
    // The hint is a guess about what `/auth/session` will say. This is the
    // line where the guess stops being believed.
    const chip = read("app/shell/account-chip.tsx");
    expect(chip).toMatch(
      /classList\.toggle\(SIGNED_IN_CLASS, body\.data\?\.signedIn === true\)/,
    );
  });
});
