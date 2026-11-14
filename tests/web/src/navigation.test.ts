// The click, shown — and the fetch that starts before it (openproduct-
// performance OPP13).
//
// ─── WHAT THIS PINS ───────────────────────────────────────────────────────
//
// Two things the 2026-09-09 production investigation found, and one claim
// the epic had recorded wrongly:
//
//   1. Under the App Router a soft navigation changes NOTHING on screen until
//      the payload lands — one to two and a half seconds on a cold render.
//      `ui/navigation.ts` is the store the shell's bar reads; every
//      transition is asserted here, without a browser.
//   2. OPP1 recorded that "Next still prefetches on hover at
//      `prefetch={false}`". Next 15.5's `link.js` returns from the hover and
//      touch handlers before prefetching when it is false. `AppLink` now does
//      the intent prefetch itself, and the source is asserted to keep doing
//      it — a source assertion, stated as such (the lane is module-level).
//   3. The shell's five sections are the "small and fixed" set the prefetch
//      policy always reserved viewport prefetch for, and now use it.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  NAVIGATION_TIMEOUT_MS,
  idleNavigation,
  navigationSettled,
  navigationStarted,
  navigationState,
  resetNavigation,
  resolveRoute,
  subscribeNavigation,
} from "@openproduct-web/app/ui/navigation";
import { UNWARMED_PREFIXES, warmable } from "@openproduct-web/app/ui/warmable";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
/** Code only — a guard about behaviour must not match the prose explaining it. */
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

beforeEach(() => resetNavigation());

describe("the navigation store", () => {
  it("is idle on the server and before any click", () => {
    expect(idleNavigation()).toEqual({ loading: false, href: null, sequence: 0 });
    expect(navigationState()).toEqual(idleNavigation());
  });

  it("starts on a click to another route, and tells its subscribers", () => {
    const seen: boolean[] = [];
    const stop = subscribeNavigation(() => seen.push(navigationState().loading));
    navigationStarted("/leaderboard", "/");
    expect(navigationState()).toEqual({ loading: true, href: "/leaderboard", sequence: 1 });
    navigationSettled();
    expect(navigationState()).toEqual({ loading: false, href: null, sequence: 1 });
    stop();
    expect(seen).toEqual([true, false]);
  });

  it("does nothing for a click on the page the visitor is already reading", () => {
    // The router accepts it and changes no route, so nothing would ever
    // settle a bar drawn for it.
    navigationStarted("/", "/");
    navigationStarted("/leaderboard", "/leaderboard?");
    navigationStarted("#discussion", "/my-project");
    navigationStarted("/my-project#people-wanted", "/my-project");
    expect(navigationState().loading).toBe(false);
  });

  it("treats a search-only href as the page's own path with that search", () => {
    expect(resolveRoute("?q=rust", "/search?q=go")).toBe("/search?q=rust");
    navigationStarted("?q=rust", "/search?q=go");
    expect(navigationState().loading).toBe(true);
    resetNavigation();
    navigationStarted("?q=go", "/search?q=go");
    expect(navigationState().loading).toBe(false);
  });

  it("counts navigations, so a timeout can be keyed to the one it guards", () => {
    navigationStarted("/topics", "/");
    navigationStarted("/people", "/");
    expect(navigationState()).toEqual({ loading: true, href: "/people", sequence: 2 });
  });

  it("settling when idle is a no-op, and publishes nothing", () => {
    let calls = 0;
    const stop = subscribeNavigation(() => calls++);
    navigationSettled();
    stop();
    expect(calls).toBe(0);
  });

  it("gives up after a bound that outlasts any real render", () => {
    expect(NAVIGATION_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
    expect(NAVIGATION_TIMEOUT_MS).toBeLessThanOrEqual(20_000);
  });
});

describe("the intent prefetch", () => {
  it("warms every public destination and no personal one", () => {
    for (const href of ["/", "/leaderboard", "/topics/devtools", "/my-project", "/@ada", "/docs", "/submit"]) {
      expect([href, warmable(href)]).toEqual([href, true]);
    }
    for (const prefix of UNWARMED_PREFIXES) {
      expect([prefix, warmable(prefix)]).toEqual([prefix, false]);
      expect([`${prefix}/anything`, warmable(`${prefix}/anything`)]).toEqual([`${prefix}/anything`, false]);
    }
    // A prefix is a path segment, not a string prefix: `/mentors` is public.
    expect(warmable("/mentors")).toBe(true);
    expect(warmable("/search?q=x")).toBe(false);
  });

  it("never warms anything that is not a same-origin path", () => {
    for (const href of ["#discussion", "https://example.com/", "//example.com/", "mailto:x@y"]) {
      expect([href, warmable(href)]).toEqual([href, false]);
    }
  });

  it("is what AppLink does on hover and touch, and the click is reported", () => {
    const link = code("ui/link.tsx");
    expect(link).toMatch(/^"use client";/m);
    expect(link).toContain("router.prefetch(href)");
    expect(link).toContain("onMouseEnter");
    expect(link).toContain("onTouchStart");
    expect(link).toContain("onNavigate");
    expect(link).toContain("navigationStarted(href, window.location.pathname + window.location.search)");
    // The viewport policy is unchanged: off unless the call site says so.
    expect(link).toContain("prefetch = false");
  });

  it("the header search's own push reports the click too", () => {
    const palette = code("shell/palette.tsx");
    expect(palette).toContain("navigationStarted(href, window.location.pathname + window.location.search)");
    expect(palette.indexOf("navigationStarted(")).toBeLessThan(palette.indexOf("router.push(href)"));
  });
});

describe("viewport prefetch on the fixed set", () => {
  const sectionLinks = (source: string) =>
    (source.match(/<AppLink\b[\s\S]*?>/g) ?? []).filter(
      (link) => link.includes("href={section.href}") || link.includes("href={tab.href}"),
    );

  it("is OFF on both bars and the wordmark — QE0's budget on the wire", () => {
    // OPP13 turned it on; the audit counted what it costs (four RSC
    // documents, ~44 KB, on every home load) and the wire lane counted the
    // requests (desktop home 30, the listing 34, at or over WC2-8's 30). The
    // intent warm in AppLink — hover on a pointer, touchstart on a phone —
    // keeps the switch fast for the person who makes it; the viewport
    // prefetch charged everybody else. Explicit `prefetch={false}` rather
    // than absent, so a reader sees a decision where OPP13's was.
    const top = code("shell/top-panel.tsx");
    for (const [file, source] of [
      ["shell/top-panel.tsx", top],
      ["shell/section-bar.tsx", code("shell/section-bar.tsx")],
    ] as const) {
      const links = sectionLinks(source);
      expect([file, links.length]).toEqual([file, 1]);
      expect([file, links[0]!.includes("prefetch={false}")]).toEqual([file, true]);
    }
    const wordmark = (top.match(/<AppLink\b[\s\S]*?>/g) ?? []).find((link) => link.includes('href="/"'));
    expect(wordmark).toContain("prefetch={false}");
  });

  it("stays off on a list row, whose cardinality is the catalogue's", () => {
    for (const file of ["feed/feed-row.tsx", "feed/build-tile.tsx", "feed/more-builds.tsx", "people/people-list.tsx"]) {
      const links = code(file).match(/<AppLink\b[\s\S]*?>/g) ?? [];
      for (const link of links) {
        expect([file, /\bprefetch\b/.test(link)]).toEqual([file, false]);
      }
    }
  });
});

describe("the bar", () => {
  it("is mounted in the root layout, before the shell", () => {
    const layout = code("layout.tsx");
    expect(layout).toContain("<NavigationProgress />");
    expect(layout.indexOf("<NavigationProgress />")).toBeLessThan(layout.indexOf("<TopPanel />"));
  });

  it("renders nothing until a click, is hidden from assistive tech, and is ink", () => {
    const bar = code("shell/navigation-progress.tsx");
    expect(bar).toMatch(/^"use client";/m);
    expect(bar).toContain("idleNavigation");
    expect(bar).toContain('aria-hidden="true"');
    // XP-1: the accent colour means one thing on this site, and it is not "busy".
    expect(bar).not.toMatch(/endorse|accent/);
    expect(bar).toContain("bg-foreground/70");
    // Settled by the route's own arrival, and by a timeout when nothing arrives.
    expect(bar).toContain("usePathname");
    expect(bar).toContain("useSearchParams");
    expect(bar).toContain("NAVIGATION_TIMEOUT_MS");
    // `useSearchParams` on a static route needs its own boundary.
    expect(bar).toContain("<React.Suspense fallback={null}>");
  });
});
