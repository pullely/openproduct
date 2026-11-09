// The door (openproduct-worldclass-v2 FO0).
//
// W·11: `/threads/new` signed out answered an error status. What is pinned
// here is what the web layer owns: the anonymous read is a page with the
// sign-in panel in it and a return into the composer; the form is the
// contract's vocabulary; the route bounces through sign-in with the small
// fields in the address and never writes a pending-act cookie for a body.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  THREADS_NEW_ACTION,
  THREADS_NEW_PATH,
  THREAD_COMPOSER_SIGNED_OUT,
  threadComposerHref,
} from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("the anonymous read is a 200 with the door in it", () => {
  it("reads the session, and signed out renders the sign-in panel with a return into the composer", () => {
    const page = code("threads/new/page.tsx");
    expect(page).toContain("readSession()");
    expect(page).toContain("<SignInCard returnTo={returnTo} />");
    expect(page).toContain("const returnTo = threadComposerHref(product || null);");
    expect(page).toContain("{THREAD_COMPOSER_SIGNED_OUT}");
    expect(THREAD_COMPOSER_SIGNED_OUT).toMatch(/come straight back/);
    // No 401, no redirect, no `notFound` for a stranger.
    expect(page).not.toMatch(/redirect\(|notFound\(|status: 401/);
  });

  it("is a step, not a page a search result should hold", () => {
    expect(read("threads/new/page.tsx")).toContain("robots: { index: false, follow: false }");
  });

  it("the form is the contract's vocabulary, bounded by the contract's limits", () => {
    const page = code("threads/new/page.tsx");
    expect(page).toContain("{THREAD_TAGS.map((t) =>");
    expect(page).toContain('type="radio"');
    expect(page).toContain("maxLength={MAX_THREAD_TITLE}");
    expect(page).toContain("maxLength={MAX_POST_BODY}");
    expect(page).toContain('list="products"');
    // The form posts to the SIBLING address, never the page's own: see the
    // route's header, and `page-route-collision.test.ts`.
    expect(page).toContain("action={THREADS_NEW_ACTION}");
    expect(THREADS_NEW_ACTION).toBe("/threads/new/actions");
  });
});

describe("the route", () => {
  it("bounces a signed-out post through sign-in with the small fields in the address, and no pending record", () => {
    const route = code("threads/new/actions/route.ts");
    expect(route).toContain('actAnswer(request, "signin", { returnTo: composer })');
    expect(route).not.toMatch(/pending:/);
    expect(route).toContain('back.set("title", title)');
    expect(threadComposerHref("acme-thing")).toBe("/threads/new?product=acme-thing");
    expect(threadComposerHref(null)).toBe(THREADS_NEW_PATH);
  });

  it("signed in, writes through core's own route and lands on the thread's address", () => {
    const route = code("threads/new/actions/route.ts");
    expect(route).toContain("createThread(session.accessToken, { slug: product, tag, title, body })");
    expect(route).toContain("`/threads/${encodeURIComponent(result.data.threadId)}`");
    // 303, so a reload never re-posts the thread.
    expect(route.match(/303/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
