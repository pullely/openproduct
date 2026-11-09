// Every route, enumerated from the filesystem (openproduct-commons XP4).
//
// WHY THIS FILE EXISTS RATHER THAN ANOTHER `describe` IN `routes.test.ts`.
// That suite asserts rules about a HAND-WRITTEN LIST of six route modules —
// the four archetypes XP1 built and their two islands. It was the right list
// when it was written and it is not the list any more: the epic finished with
// twenty-seven route modules, and the twenty-one added since have never been
// held to I6, to the cacheability rules, or to anything else that list
// enforces. XP4's done-when names exactly this: "I6 is re-asserted on every
// route the epic added, not just the four it started with."
//
// A LIST IS THE WRONG SHAPE FOR THAT. The same lesson the cutover runbook
// learned about its nine-table moving set — a list correct when written and
// wrong within weeks, which then verifies a subset while looking complete.
// So this enumerates `src/app/**/page.tsx` and requires every route it finds
// to declare which KIND it is. A new route cannot be added without landing in
// one of the three classes below, which means it cannot be added while
// quietly skipping these rules.
//
// THE THREE CLASSES, and they are exhaustive by assertion:
//
//   PUBLIC    `export const revalidate = N`. One cacheable document, the same
//             bytes for every visitor (OPC-1, I6). Sixteen of them.
//   PERSONAL  `export const dynamic = "force-dynamic"`. The studio and `/me`:
//             rendered per request, never cached, personalised on purpose.
//   SHELL     `"use client"` with no server read at all — a form that talks
//             to a route handler. Two of them.
//   REDIRECT  A body that is one `permanentRedirect` and nothing else. SB0
//             added this class, and it is a real fourth kind rather than a
//             hole punched to let one file through: it has no content, makes
//             no read, and needs no cache directive, so every rule the three
//             above enforce is vacuous for it. Claiming one of theirs — a
//             `revalidate` on a page with nothing to revalidate — would have
//             been the actual hole, because the checks would then run and
//             find nothing to object to.
//   QUERY     Public and actor-free, but keyed on `searchParams`. SR0's
//             `/search?q=`. It declares NO `revalidate` on purpose: a page
//             reading `searchParams` is dynamic in Next 15, so a revalidate
//             beside it is accepted and silently ignored — which is the exact
//             defect this file was written to catch, and it caught six routes
//             the first time. It is not PERSONAL either; calling it that
//             would be a lie about a page that resolves no actor.
//
// TWO CLASSES WERE ADDED IN TWO MILESTONES, and that is the census working
// rather than eroding. The rule was never "there are three kinds" — it is
// "every route declares which kind it is, and each kind's rules are enforced
// against it". A genuinely new kind of route earns a class WITH RULES; what
// is forbidden is a route slipping into an existing class whose checks then
// pass by finding nothing to check.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");

/** Every `page.tsx` under `src/app`, as a path relative to it. */
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
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");

/** The URL path a `page.tsx` serves, for readable failure messages. */
const urlOf = (file: string) => "/" + file.replace(/\/?page\.tsx$/, "");

/** Does this route sit under a `[dynamic]` segment? */
const isDynamicSegment = (file: string) => /\[[^\]]+\]/.test(file);

const revalidateOf = (file: string): number | null => {
  const m = /export const revalidate = (\d+);/.exec(read(file));
  return m ? Number(m[1]) : null;
};
const isForceDynamic = (file: string) => /export const dynamic = "force-dynamic";/.test(read(file));
const isClientShell = (file: string) => /^"use client";/m.test(read(file));

/** SB0 — a route whose whole body is a permanent redirect to another one. */
const isRedirect = (file: string) => /\bpermanentRedirect\(|\bredirect\(/.test(read(file)) && !isClientShell(file) && revalidateOf(file) === null && !isForceDynamic(file);

const PUBLIC = ROUTES.filter((f) => revalidateOf(f) !== null);
const PERSONAL = ROUTES.filter(isForceDynamic);
const SHELL = ROUTES.filter((f) => revalidateOf(f) === null && !isForceDynamic(f) && isClientShell(f));
const REDIRECT = ROUTES.filter(isRedirect);

/** SR0 — public and actor-free, but keyed on the query string. */
const readsSearchParams = (file: string) => /\bsearchParams\b/.test(read(file));
const QUERY = ROUTES.filter(
  (f) =>
    revalidateOf(f) === null &&
    !isForceDynamic(f) &&
    !isClientShell(f) &&
    !isRedirect(f) &&
    readsSearchParams(f),
);

describe("the route census", () => {
  it("finds every route module, and there are more than the four XP1 started with", () => {
    expect(ROUTES.length).toBeGreaterThan(20);
    expect(ROUTES).toContain("page.tsx");
    expect(ROUTES).toContain("[slug]/page.tsx");
  });

  it("every route declares which kind it is — there is no SIXTH state", () => {
    // SB0 made this four and SR0 made it five. The rule is unchanged: a new
    // route cannot be added without landing in one of them, which means it
    // cannot be added while quietly skipping what that class enforces.
    const unclassified = ROUTES.filter(
      (f) =>
        !PUBLIC.includes(f) &&
        !PERSONAL.includes(f) &&
        !SHELL.includes(f) &&
        !REDIRECT.includes(f) &&
        !QUERY.includes(f),
    );
    expect(unclassified).toEqual([]);
  });

  it("a QUERY route declares no revalidate, because one would be ignored", () => {
    // The whole reason this class exists rather than being folded into PUBLIC.
    // A page reading `searchParams` is dynamic; a `revalidate` beside it is
    // accepted, ignored, and every response goes out `no-store`. Six routes
    // shipped that way before this file existed.
    for (const file of QUERY) {
      expect([file, revalidateOf(file)]).toEqual([file, null]);
    }
  });

  it("a QUERY route resolves no actor — I6 applies to it too", () => {
    // It is not PERSONAL. The same query gives the same bytes to every
    // visitor, signed in or out, which is exactly the property I6 names.
    for (const file of QUERY) {
      expect([file, /cookies\(|headers\(|op_session|SESSION_COOKIE|readSession/.test(read(file))])
        .toEqual([file, false]);
    }
  });

  it("no route is two kinds at once", () => {
    const both = ROUTES.filter((f) => PUBLIC.includes(f) && PERSONAL.includes(f));
    expect(both).toEqual([]);
    const alsoRedirect = REDIRECT.filter(
      (f) => PUBLIC.includes(f) || PERSONAL.includes(f) || SHELL.includes(f),
    );
    expect(alsoRedirect).toEqual([]);
    const alsoQuery = QUERY.filter(
      (f) => PUBLIC.includes(f) || PERSONAL.includes(f) || SHELL.includes(f) || REDIRECT.includes(f),
    );
    expect(alsoQuery).toEqual([]);
  });

  it("no route module is a redirect in disguise", () => {
    // SB0's fix moved `/create` to a `next.config.mjs` entry after production
    // answered its route module with `HTTP 200` and an empty body — Next had
    // prerendered the redirect, so what shipped was an RSC payload rather than
    // a status a crawler could read.
    //
    // A route module CAN still redirect legitimately: `/me/*` sends a
    // signed-out visitor to sign in, which is a decision made per request from
    // state only the server has. What must not come back is a route whose
    // WHOLE body is a static redirect to a fixed path — that belongs in the
    // config, where it is issued at the edge.
    for (const file of ROUTES) {
      const src = read(file);
      const onlyRedirect =
        /permanentRedirect\(\s*["'`]/.test(src) && !/readSession|cookies\(|searchParams/.test(src);
      expect([file, onlyRedirect]).toEqual([file, false]);
    }
  });
});

describe("I6 — every public route is one document with no actor", () => {
  it("no public route module reads cookies, headers, or the session", () => {
    // The rule `routes.test.ts` applies to its six; applied to all sixteen.
    const leaking = PUBLIC.filter((f) =>
      /cookies\(|headers\(|op_session|SESSION_COOKIE|readSession/.test(read(f)),
    );
    expect(leaking).toEqual([]);
  });

  it("no public route imports the auth module", () => {
    // A cheaper, blunter version of the same rule, and the one that catches a
    // helper doing the reading on the page's behalf.
    const importing = PUBLIC.filter((f) => /from ["'][^"']*\/auth\/(auth|session-server)["']/.test(read(f)));
    expect(importing).toEqual([]);
  });
});

describe("OPC-1 — a page that declares a revalidate is actually cacheable", () => {
  it("every public dynamic segment declares generateStaticParams", () => {
    // WHAT THIS PINS, and it is not a style rule.
    //
    // In Next 15 a dynamic segment is entered in the prerender manifest — the
    // registry the ISR cache is keyed from — only when it declares this
    // function. Without it the `revalidate` beside it is accepted, ignored,
    // and every response goes out `Cache-Control: private, no-cache,
    // no-store, must-revalidate`: no edge, no browser and no CDN may keep the
    // page, every visitor pays a full server render, and because the render
    // is then streamed the page also shifts under them when `loading.tsx` is
    // replaced.
    //
    // Six routes shipped that way — the listing, the profile, a collection, a
    // digest week, a board and a thread, which is most of what anybody
    // actually links to. XP4's browser lane found it by asking why the detail
    // archetype scored a layout shift the directory did not; this is the
    // source-level guard so the next dynamic route cannot repeat it.
    //
    // `async` IS OPTIONAL, and the regex says so. Next accepts either, and the
    // property this guards is that the function is DECLARED — UV2's leaderboard
    // returns two literal ranges and has nothing to await, so requiring `async`
    // would have made it add the keyword to satisfy a test rather than to say
    // anything true.
    const missing = PUBLIC.filter(isDynamicSegment).filter(
      (f) => !/export (?:async )?function generateStaticParams\(/.test(read(f)),
    );
    expect(missing.map(urlOf)).toEqual([]);
  });

  it("every public route's revalidate is a positive number of seconds", () => {
    for (const f of PUBLIC) {
      const seconds = revalidateOf(f);
      expect(`${urlOf(f)}: ${seconds !== null && seconds > 0}`).toBe(`${urlOf(f)}: true`);
    }
  });

  it("no personal route claims a revalidate", () => {
    // The opposite failure, and the more dangerous one: a `revalidate` on a
    // studio or `/me` page would put a personalised document in a shared
    // cache. `force-dynamic` and `revalidate` in one file is a contradiction
    // Next resolves silently.
    const cached = PERSONAL.filter((f) => revalidateOf(f) !== null);
    expect(cached.map(urlOf)).toEqual([]);
  });
});

describe("the shell is reachable past on every route", () => {
  it("the layout carries a skip link, and it points at a target the layout defines", () => {
    // XP4's keyboard walk measured eleven tab stops of chrome before the
    // first control of the page itself, on every route. The link is in the
    // root layout so this is one assertion for all twenty-seven.
    const layout = readFileSync(resolve(APP_DIR, "layout.tsx"), "utf-8");
    expect(layout).toContain('href="#content"');
    expect(layout).toContain('id="content"');
    // `tabIndex={-1}` is what makes it move FOCUS rather than only scrolling;
    // without it the next Tab returns to the navigation just skipped.
    expect(layout).toMatch(/id="content"\s+tabIndex=\{-1\}/);
  });
});

// ─── THE CENSUS BECAME LOAD-BEARING (openproduct-performance OPP5) ────────
//
// Every rule above was, until 2026-09-09, a statement about what Next would do
// with each route's own output. Nothing shared those documents between
// visitors, so a misclassified route was a performance bug: a public page
// rendered per request, or a personal page rendered once and served from an
// isolate's memory to the visitor who happened to warm it.
//
// `openproduct-web/wrangler.jsonc` now enables **Workers Caching**, which puts
// a SHARED cache in front of this worker. The classification above is what
// keeps that safe, and the mechanism is the header each class already sends.
//
// OPP13 put a second shared store BEHIND the worker — the ISR entries in the
// Workers Cache API (`open-next.config.ts`) — and the same classification
// keeps that one safe by the same header: only a PUBLIC route's `revalidate`
// makes Next hand a document to the store at all, and a PERSONAL route's
// `force-dynamic` never does. An intercepted response carries the document's
// REMAINING freshness as its `s-maxage`, so the two stores expire together.
// The header shapes below are the ones Next itself emits (the `next start`
// server the budget lane measures); interception rewrites only the number.
//
//   PUBLIC    `revalidate = N` -> `s-maxage=60, stale-while-revalidate=240`
//             -> cached and shared. Safe because of I6: a public document is
//             byte-identical signed-in and signed-out, and the overlay
//             personalises after paint over a separate request.
//   PERSONAL  `force-dynamic` -> `private, no-cache, no-store` -> BYPASS.
//   QUERY     no `revalidate` (a page reading `searchParams` is dynamic) ->
//             `no-store` -> BYPASS.
//
// So the cache reads the same three facts this file asserts, and the failure
// this suite now prevents is no longer a slow page — it is one visitor being
// served another visitor's `/me`.
//
// THE CACHE KEY DOES NOT INCLUDE `Cookie` OR `Authorization`, which is why
// "personal pages are uncacheable" has to hold by classification rather than
// by hoping the request looks different. It also does not include the host,
// and it DOES honour `Vary` — so Next's four RSC router headers keep prefetch
// variants in their own entries rather than serving an RSC payload as a
// document.
describe("the census is what makes a shared cache safe (OPP5)", () => {
  const wrangler = readFileSync(resolve(APP_DIR, "../../wrangler.jsonc"), "utf-8");

  it("declares Workers Caching on this worker", () => {
    // If this flag goes away the pages get slower; if it arrives while a
    // personal route is misclassified, they get wrong. Both halves are here so
    // the second is never reviewed without the first in view.
    const config = JSON.parse(wrangler.replace(/^\s*\/\/.*$/gm, ""));
    expect(config.cache).toEqual({ enabled: true });
  });

  it("keeps every personal route uncacheable — the property the cache relies on", () => {
    // Asserted above as a classification rule; asserted here as a SAFETY rule,
    // because the consequence changed. A `/me` page that lost its
    // `force-dynamic` would emit a cacheable header and be shared between
    // visitors by a cache that cannot tell them apart.
    expect(PERSONAL.length).toBeGreaterThan(0);
    for (const file of PERSONAL) {
      expect([urlOf(file), isForceDynamic(file), revalidateOf(file)]).toEqual([
        urlOf(file),
        true,
        null,
      ]);
    }
  });

  it("has no route that is both public and personal", () => {
    // Already checked as a contradiction; restated as the cache's precondition.
    // `force-dynamic` and `revalidate` in one file is resolved silently by
    // Next, and the header that reaches the cache would be whichever won.
    expect(PUBLIC.filter((f) => PERSONAL.includes(f)).map(urlOf)).toEqual([]);
  });

  it("classifies every route, so none reaches the cache unexamined", () => {
    // The exhaustiveness check is the one that matters most now: an
    // unclassified route is one whose cache behaviour nobody decided.
    const unclassified = ROUTES.filter(
      (f) =>
        !PUBLIC.includes(f) &&
        !PERSONAL.includes(f) &&
        !SHELL.includes(f) &&
        !REDIRECT.includes(f) &&
        !QUERY.includes(f),
    );
    expect(unclassified.map(urlOf)).toEqual([]);
  });
});
