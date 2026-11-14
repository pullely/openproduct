// Talk on a product: kinds, public and private threads, resolved
// (openproduct-redesign OPR-4; design §4, §7; boards `Product` Talk tab,
// `ProductIdea`, `PhoneProduct`, `PhoneProductIdea`).
//
// Three things are held here:
//
//   1. THE PAGE IS ONE DOCUMENT FOR EVERYBODY (I6). Nothing a public page
//      renders on the server reads a session or asks for a private thread:
//      the signed-in reads are reachable only from route handlers and from
//      client code that runs after the overlay says "signed in".
//   2. THE PRIVATE ROUTES HAVE ONE REFUSAL. No session, not the reader's, no
//      such thread, a malformed id, an outage — one 404, one body; and the
//      page at a private thread's address is the same shell for every id.
//   3. THE BOARD. The composer's field, kinds and Public/Private switch; the
//      filter; a row's kind, badge, replies and Resolved; private in slate,
//      never red.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  TALK_BADGE_PRIVATE,
  TALK_BADGE_PUBLIC,
  TALK_COMPOSER_LABEL,
  TALK_EMPTY,
  TALK_FILTER_LABELS,
  TALK_POST_PRIVATE,
  TALK_POST_PUBLIC,
  THREAD_KIND_LABELS,
  THREAD_VISIBILITY_LABELS,
  type PrivateThread,
  type PublicThread,
} from "@openproduct/contracts";

import {
  NOT_FOUND,
  handlePrivateList,
  handlePrivateReply,
  handlePrivateThread,
  handleResolve,
  handleStartThread,
  type TalkAnswer,
} from "@openproduct-web/app/talk/handlers";
import {
  TALK_PRIVATE_ANCHOR,
  canResolve,
  filterCount,
  filterThreads,
  isResolved,
  isThreadId,
  mergeThreads,
  privateThreadDataRoute,
  privateThreadReplyRoute,
  publicThreadCount,
  talkFilters,
  talkNotice,
  talkPrivateRoute,
  talkStartRoute,
  talkThreadOf,
  threadAuthor,
  threadBadge,
  threadHref,
  threadKindLabel,
  threadMonogram,
  threadRepliesLabel,
  threadResolveRoute,
} from "@openproduct-web/app/talk/model";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP, file), "utf-8");
/** Source without comments: what the file DOES, not what it says about it. */
const code = (file: string) =>
  read(file)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const THREAD_ID = "0b0b0b0b-0000-4000-8000-0000000000b1";
const MISSING_ID = "0b0b0b0b-0000-4000-8000-00000000ffff";

function publicThread(over: Partial<PublicThread> = {}): PublicThread {
  return {
    id: "0b0b0b0b-0000-4000-8000-0000000000a1",
    tag: "question",
    title: "How do I run this locally?",
    authorHandle: "ada",
    authorName: "Ada Lovelace",
    state: "open",
    createdAt: "2026-11-10T09:00:00.000Z",
    lastPostAt: "2026-11-11T09:00:00.000Z",
    postCount: 2,
    kind: "question",
    resolvedAt: null,
    ...over,
  };
}

function privateThread(over: Partial<PrivateThread> = {}): PrivateThread {
  return {
    ...publicThread({ id: THREAD_ID, title: "ZQPRIVATE title", authorHandle: null, authorName: "Lin Park", postCount: 0, lastPostAt: null }),
    visibility: "private",
    mine: true,
    awaitingCrew: true,
    ...over,
  };
}

// ─── 1. one document for everybody ─────────────────────────────────────────

/** Every file under a directory, relative to the app. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(relative(APP, full));
  }
  return out;
}

describe("a public page never reads a private thread (I6, design §4)", () => {
  /** The modules that can ask the gateway for a private thread. */
  const SIGNED_IN = ["talk/talk-api", "talk/handlers", "talk/route-io"];

  it("only route handlers import the signed-in Talk calls — no page, layout or component does", () => {
    const importers = filesUnder(APP).filter((file) => {
      const source = code(file);
      return SIGNED_IN.some((module) => new RegExp(`from "[./]*(?:\\.\\./)*${module}"|from "\\./${module.split("/")[1]}"`).test(source));
    });
    // The handlers import the API; `route-io` imports the handlers' types;
    // and then only `route.ts` files.
    const others = importers.filter((file) => !file.startsWith("talk/"));
    expect(others.length).toBeGreaterThanOrEqual(5);
    for (const file of others) expect([file, /(^|\/)route\.ts$/.test(file)]).toEqual([file, true]);
    expect(importers.filter((file) => file.startsWith("talk/")).sort()).toEqual(["talk/handlers.ts", "talk/route-io.ts"]);
  });

  it("the product page draws Talk from the public discussion read alone", () => {
    const page = code("[slug]/product-page.tsx");
    expect(page).toContain('tab === "talk" ? fetchDiscussion(slug)');
    // Talk's own part is one server module, given the public list.
    expect(page).toContain("<TalkSection slug={slug} threads={discussion?.threads ?? null} onPage={onPage} />");
    expect(page.match(/from "\.\.\/talk\/[^"]+"/g)).toEqual(['from "../talk/talk-section"']);
    const section = code("talk/talk-section.tsx");
    expect(section).not.toMatch(/^"use client";/m);
    expect(section).toContain("<TalkComposer slug={slug}");
    expect(section).toContain("<TalkList slug={slug} publicCount={publicThreadCount(threads)}");
    expect(section).not.toMatch(/readSession|cookies\(\)|headers\(\)|accessToken|talk-api|fetch\(/);
    expect(page).not.toMatch(/readSession|cookies\(\)|headers\(\)|accessToken/);
    expect(page).not.toMatch(/talk-api|fetchPrivate|talkPrivateRoute|privateThreadDataRoute/);
    // The tab is still a cached document of its own.
    expect(read("[slug]/talk/page.tsx")).toMatch(/^export const revalidate = 60;$/m);
  });

  it("the composer is a plain form with no session in it, and works with scripts off", () => {
    const composer = code("talk/composer.tsx");
    expect(composer).not.toContain('"use client"');
    expect(composer).not.toMatch(/readSession|cookies\(|useOverlay|useMaker/);
    expect(composer).toContain('method="post"');
    expect(composer).toContain("action={talkStartRoute(slug)}");
    // Kind and visibility are radio groups — the form's own state.
    expect(composer.match(/type="radio"/g)).toHaveLength(2);
    expect(composer).toContain("name={TALK_FIELD_KIND}");
    expect(composer).toContain("name={TALK_FIELD_VISIBILITY}");
    expect(composer).toContain("defaultChecked={visibility === TALK_VISIBILITY_DEFAULT}");
    // The button's sentence follows the checked visibility by CSS.
    expect(composer).toContain("group-has-[input[value=private]:checked]/compose:hidden");
    expect(composer).toContain("{TALK_POST_PUBLIC}");
    expect(composer).toContain("{TALK_POST_PRIVATE}");
    expect(talkStartRoute("ackstack")).toBe("/ackstack/talk/start");
  });

  it("the draft stays in the tab: no title is ever put in an address", () => {
    const field = code("talk/title-field.tsx");
    expect(field).toContain("window.sessionStorage.setItem(key, value)");
    expect(field).not.toMatch(/searchParams\.set|location\.href =|document\.cookie/);
    const handlers = code("talk/handlers.ts");
    // What a redirect may carry: a code, or a slug. Never `title`.
    expect(handlers).not.toMatch(/withQuery\([^)]*title/);
    expect(handlers.match(/withQuery\(/g)?.length).toBeGreaterThan(0);
  });

  it("the list asks for private threads only after the overlay says signed in, and never on the server", () => {
    const list = code("talk/talk-list.tsx");
    expect(list).toContain('"use client"');
    expect(list).toContain('const signedIn = overlay.status === "ready";');
    expect(list).toMatch(/React\.useEffect\(\(\) => \{\s*if \(!signedIn\) return;[\s\S]*?fetch\(talkPrivateRoute\(slug\)/);
    expect(list).toContain('cache: "no-store"');
    // The Private segment is the signed-in reader's.
    expect(list).toContain("talkFilters(signedIn).map");
    expect(talkFilters(false)).toEqual(["all", "public"]);
    expect(talkFilters(true)).toEqual(["all", "public", "private"]);
    // A row is drawn by the server for a public thread and by the browser
    // for a private one, so it is neither a client nor a server-only module.
    expect(code("talk/thread-row.tsx")).not.toMatch(/^"use client";/m);
    expect(code("talk/thread-row.tsx")).not.toMatch(/\buse[A-Z]\w*\(/);
  });

  it("Talk's client code is one chunk, fetched by the pages that draw Talk and by no other tab", () => {
    // A product's four tabs are one module and a post's page shares its
    // chunks, so anything that module reaches statically is downloaded by
    // all of them. The server files reach Talk's client pieces only through
    // `gates.tsx`, which asks for them with `next/dynamic` from ONE module.
    const gates = code("talk/gates.tsx");
    expect(gates).toMatch(/^"use client";/m);
    expect(gates.match(/dynamic\(\(\) => import\("\.\/client"\)/g)).toHaveLength(3);
    expect(gates).not.toMatch(/ssr:\s*false/);
    expect(code("talk/client.tsx").match(/^export \{ \w+ \} from "\.\/[\w-]+";$/gm)).toHaveLength(3);
    for (const file of ["talk/talk-section.tsx", "talk/composer.tsx", "talk/thread-row.tsx"]) {
      const source = code(file);
      expect([file, /from "\.\/gates"/.test(source)]).toEqual([file, true]);
      expect([file, /from "\.\/(talk-list|title-field|thread-actions|client)"/.test(source)]).toEqual([file, false]);
    }
    // The private rows are a further chunk: only a reader with private
    // threads fetches the row's client code.
    expect(code("talk/talk-list.tsx")).toContain('const PrivateRows = React.lazy(() => import("./private-rows"));');
    expect(code("talk/talk-list.tsx")).not.toMatch(/from "\.\/thread-row"/);
  });

  it("the crew's controls are drawn in the crew's browser: the server render is the visitor's", () => {
    const control = code("talk/resolve-control.tsx");
    expect(control).toContain('"use client"');
    expect(control).toContain("const { managing } = useMaker(slug ?? \"\");");
    expect(control).toContain("if (slug !== null && canResolve(thread, managing))");
    const actions = code("talk/thread-actions.tsx");
    expect(actions).toContain("const answer = managing && thread.postCount === 0;");
  });

  it("the sitemap names no thread and reads nothing signed in", () => {
    const sitemap = code("sitemap.xml/route.ts");
    expect(sitemap).not.toMatch(/private|talk-api|readSession/);
  });
});

// ─── 2. one refusal ────────────────────────────────────────────────────────

describe("a private thread's page is one shell, and its data has one refusal (design §7.2)", () => {
  it("the page renders nothing about the thread: no read, no session, not indexed", () => {
    const page = code("threads/private/[id]/page.tsx");
    expect(page).not.toMatch(/fetch|readSession|cookies\(|headers\(|talk-api|notFound\(/);
    expect(page).toContain("return <PrivateThreadView id={id} />;");
    expect(page).toContain("robots: { index: false, follow: false }");
    // No skeleton above it either: the shell is the page.
    expect(() => read("threads/private/[id]/loading.tsx")).toThrow();
  });

  it("anybody who may not read it sees the site's own not-found, word for word", () => {
    const view = code("talk/private-thread-view.tsx");
    expect(view).toContain('if (state.status === "missing") return <NotFoundBody />;');
    // Every answer that is not the thread is `missing`.
    expect(view).toContain('else setState({ status: "missing" });');
    expect(view.match(/setState\(\{ status: "missing" \}\)/g)!.length).toBeGreaterThanOrEqual(4);
    // One `h1` in the ready state (the thread's words), one in the not-found.
    expect(view.match(/<h1\b/g)).toHaveLength(1);
    expect(code("ui/not-found-body.tsx").match(/<h1\b/g)).toHaveLength(1);
    expect(code("not-found.tsx")).toContain("return <NotFoundBody />;");
  });

  const call = (token: string | null, fields: Record<string, unknown> = {}, json = true, fetchImpl?: typeof fetch) => ({
    token,
    fields,
    json,
    ...(fetchImpl ? { fetchImpl } : {}),
  });

  const gateway = (status: number, body: unknown): typeof fetch =>
    (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
  const neverCalled: typeof fetch = (async () => {
    throw new Error("the gateway must not be asked");
  }) as unknown as typeof fetch;

  it("answers the SAME 404 for no session, a refused read, a malformed id and an outage", async () => {
    const answers: TalkAnswer[] = [
      await handlePrivateThread(THREAD_ID, call(null, {}, true, neverCalled)),
      await handlePrivateThread("not-an-id", call("tok", {}, true, neverCalled)),
      await handlePrivateThread(THREAD_ID, call("tok", {}, true, gateway(404, { error: { code: "not_found" } }))),
      await handlePrivateThread(MISSING_ID, call("tok", {}, true, gateway(404, { error: { code: "not_found" } }))),
      await handlePrivateThread(THREAD_ID, call("tok", {}, true, gateway(401, { error: { code: "unauthenticated" } }))),
      await handlePrivateThread(THREAD_ID, call("tok", {}, true, gateway(403, { error: { code: "forbidden" } }))),
      await handlePrivateThread(THREAD_ID, call("tok", {}, true, gateway(502, {}))),
    ];
    for (const answer of answers) expect(answer).toBe(NOT_FOUND);
    expect(NOT_FOUND).toEqual({ kind: "json", status: 404, body: { error: { code: "not_found", message: "Not found" } } });
  });

  it("hands the thread to a reader core accepted", async () => {
    const document = { slug: "ackstack", crew: false, thread: privateThread(), posts: [] };
    const answer = await handlePrivateThread(THREAD_ID, call("tok", {}, true, gateway(200, { data: document })));
    expect(answer).toEqual({ kind: "json", status: 200, body: { data: document } });
  });

  it("the list is empty for a signed-out reader — without asking — and for a refused one", async () => {
    const empty = { kind: "json", status: 200, body: { data: { crew: false, threads: [] } } };
    expect(await handlePrivateList("ackstack", call(null, {}, true, neverCalled))).toEqual(empty);
    expect(await handlePrivateList("../evil", call("tok", {}, true, neverCalled))).toEqual(empty);
    expect(await handlePrivateList("ackstack", call("tok", {}, true, gateway(404, {})))).toEqual(empty);
  });

  it("a reply from somebody who may not read the thread gets the same 404, and a form is sent back to the shell", async () => {
    expect(await handlePrivateReply(THREAD_ID, call(null, { body: "hi" }, true, neverCalled))).toBe(NOT_FOUND);
    expect(await handlePrivateReply(THREAD_ID, call("tok", { body: "hi" }, true, gateway(404, {})))).toBe(NOT_FOUND);
    expect(await handlePrivateReply("nope", call("tok", { body: "hi" }, true, neverCalled))).toBe(NOT_FOUND);
    // A form (no JSON) lands on the thread's own address, which is the
    // not-found for that reader: the redirect says nothing either.
    expect(await handlePrivateReply(THREAD_ID, call("tok", { body: "hi" }, false, gateway(404, {})))).toEqual({
      kind: "redirect",
      to: `/threads/private/${THREAD_ID}`,
    });
    expect(await handlePrivateReply(THREAD_ID, call("tok", { body: "hi" }, true, gateway(201, { data: { postId: "p1" } })))).toEqual({
      kind: "json",
      status: 201,
      body: { data: { postId: "p1" } },
    });
    expect((await handlePrivateReply(THREAD_ID, call("tok", { body: "  " }, true, neverCalled))) as { status: number }).toMatchObject({ status: 422 });
  });

  it("resolving is the crew's: anybody else gets the 404", async () => {
    expect(await handleResolve(THREAD_ID, call(null, { resolved: "1" }, true, neverCalled))).toBe(NOT_FOUND);
    expect(await handleResolve(THREAD_ID, call("tok", { resolved: "1" }, true, gateway(404, {})))).toBe(NOT_FOUND);
    const sent: Array<{ url: string; method: string }> = [];
    const record: typeof fetch = (async (url: string, init?: RequestInit) => {
      sent.push({ url: String(url), method: init?.method ?? "GET" });
      return new Response(JSON.stringify({ data: { resolvedAt: init?.method === "DELETE" ? null : "2026-11-15T09:00:00.000Z" } }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await handleResolve(THREAD_ID, call("tok", { resolved: "1" }, true, record))).toMatchObject({ status: 200 });
    expect(await handleResolve(THREAD_ID, call("tok", { resolved: "0" }, true, record))).toMatchObject({ status: 200, body: { data: { resolvedAt: null } } });
    expect(sent.map((s) => s.method)).toEqual(["PUT", "DELETE"]);
    expect(sent.every((s) => s.url.endsWith(`/v1/openproduct/threads/${THREAD_ID}/resolved`))).toBe(true);
  });

  it("the route files are thin, and every answer is no-store", () => {
    const io = code("talk/route-io.ts");
    expect(io).toContain('const NO_STORE = { "cache-control": "no-store" } as const;');
    expect(io).toContain('res.headers.set("cache-control", "no-store");');
    for (const file of [
      "[slug]/talk/start/route.ts",
      "[slug]/talk/private/route.ts",
      "threads/private/[id]/data/route.ts",
      "threads/private/[id]/reply/route.ts",
      "threads/[id]/resolve/route.ts",
    ]) {
      expect([file, code(file).includes("talkRespond(request, await handle")]).toEqual([file, true]);
    }
    // The two reads are never prerendered.
    for (const file of ["[slug]/talk/private/route.ts", "threads/private/[id]/data/route.ts"]) {
      expect(code(file)).toMatch(/^export const dynamic = "force-dynamic";$/m);
    }
  });
});

describe("starting a thread", () => {
  const sent: Array<Record<string, unknown>> = [];
  const made = (visibility: string): typeof fetch =>
    (async (_url: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return new Response(JSON.stringify({ data: { threadId: THREAD_ID, visibility } }), { status: 201 });
    }) as unknown as typeof fetch;
  const fields = (over: Record<string, unknown> = {}) => ({ title: " Where is my invoice? ", kind: "question", visibility: "private", return_to: "/ackstack/talk", ...over });

  it("signed out, goes through sign-in and back to Talk — without the words in the address", async () => {
    const answer = await handleStartThread("ackstack", { token: null, fields: fields(), json: false });
    expect(answer).toEqual({ kind: "signin", returnTo: "/ackstack/talk" });
    expect(JSON.stringify(answer)).not.toContain("invoice");
  });

  it("a private thread goes to its private address; a public one to its public address", async () => {
    sent.length = 0;
    const priv = await handleStartThread("ackstack", { token: "tok", fields: fields(), json: false, fetchImpl: made("private") });
    expect(priv).toEqual({ kind: "redirect", to: `/threads/private/${THREAD_ID}?started=ackstack` });
    expect(sent[0]).toEqual({ slug: "ackstack", title: "Where is my invoice?", kind: "question", visibility: "private" });
    const pub = await handleStartThread("ackstack", { token: "tok", fields: fields({ visibility: "public", kind: "issue" }), json: false, fetchImpl: made("public") });
    expect(pub).toEqual({ kind: "redirect", to: `/threads/${THREAD_ID}?started=ackstack` });
  });

  it("the address follows what core WROTE, never what the form asked for", async () => {
    // A form that asked for public and was written private must not be sent
    // to the public address (and the reverse).
    const answer = await handleStartThread("ackstack", { token: "tok", fields: fields({ visibility: "public" }), json: false, fetchImpl: made("private") });
    expect(answer).toEqual({ kind: "redirect", to: `/threads/private/${THREAD_ID}?started=ackstack` });
  });

  it("refuses an unknown kind or visibility before asking, and never defaults a bad visibility to public", async () => {
    const never: typeof fetch = (async () => {
      throw new Error("not asked");
    }) as unknown as typeof fetch;
    for (const bad of [{ visibility: "crew" }, { kind: "rant" }, { title: "   " }, { title: "x".repeat(161) }]) {
      const answer = await handleStartThread("ackstack", { token: "tok", fields: fields(bad), json: false, fetchImpl: never });
      expect([bad, answer]).toEqual([bad, { kind: "redirect", to: "/ackstack/talk?talk=invalid" }]);
    }
    // An idea's Talk is a section: the code goes before the fragment.
    expect(
      await handleStartThread("kettle", { token: "tok", fields: fields({ kind: "rant", return_to: "/kettle#talk" }), json: false, fetchImpl: never }),
    ).toEqual({ kind: "redirect", to: "/kettle?talk=invalid#talk" });
    // A return address off this site is not followed.
    expect(
      await handleStartThread("ackstack", { token: null, fields: fields({ return_to: "https://evil.example/" }), json: false }),
    ).toEqual({ kind: "signin", returnTo: "/ackstack/talk" });
  });

  it("says why a public post was refused: a public profile is asked for, a private thread needs none", async () => {
    const refused: typeof fetch = (async () => new Response(JSON.stringify({ error: { code: "forbidden" } }), { status: 403 })) as unknown as typeof fetch;
    expect(await handleStartThread("ackstack", { token: "tok", fields: fields({ visibility: "public" }), json: false, fetchImpl: refused })).toEqual({
      kind: "redirect",
      to: "/ackstack/talk?talk=profile",
    });
    expect(talkNotice("profile")).toBe("Posting publicly needs a public profile. A private thread does not");
    expect(talkNotice("nonsense")).toBeNull();
  });
});

// ─── 3. the board ──────────────────────────────────────────────────────────

describe("the Talk list (boards `Product` Talk tab, `PhoneProduct`)", () => {
  it("merges the page's public threads with the reader's private ones, most recently active first", () => {
    const older = publicThread({ id: "0b0b0b0b-0000-4000-8000-0000000000a2", lastPostAt: "2026-11-01T09:00:00.000Z" });
    const newer = publicThread();
    const mine = privateThread({ createdAt: "2026-11-12T09:00:00.000Z" });
    const merged = mergeThreads([older, newer], [mine]);
    expect(merged.map((t) => [t.id, t.visibility])).toEqual([
      [mine.id, "private"],
      [newer.id, "public"],
      [older.id, "public"],
    ]);
    expect(filterThreads(merged, "private").map((t) => t.id)).toEqual([mine.id]);
    expect(filterThreads(merged, "public")).toHaveLength(2);
    expect([filterCount(merged, "all"), filterCount(merged, "public"), filterCount(merged, "private")]).toEqual([3, 2, 1]);
    // A private thread can never stand in for a public one of the same id.
    expect(mergeThreads([newer], [privateThread({ id: newer.id })]).map((t) => t.visibility)).toEqual(["public"]);
  });

  it("a public thread is public whatever else the object carries", () => {
    expect(talkThreadOf(publicThread()).visibility).toBe("public");
    expect(talkThreadOf(publicThread()).mine).toBe(false);
    expect(talkThreadOf(privateThread()).visibility).toBe("private");
  });

  it("says a thread's kind, its author and its badge the way the boards do", () => {
    expect(THREAD_KIND_LABELS).toEqual({ question: "Question", issue: "Issue", suggestion: "Suggestion" });
    expect(threadKindLabel(talkThreadOf(publicThread({ kind: "issue" })))).toBe("Issue");
    // An older thread has no kind: its forum category stands.
    expect(threadKindLabel(talkThreadOf(publicThread({ kind: null, tag: "design" })))).toBe("Design");
    expect(threadAuthor(talkThreadOf(privateThread()))).toBe("You");
    expect(threadAuthor(talkThreadOf(privateThread({ mine: false })))).toBe("Lin Park");
    expect(threadAuthor(talkThreadOf(publicThread({ authorName: null, authorHandle: null })))).toBe("Somebody");
    expect(threadMonogram("You")).toBe("Y");
    expect(threadMonogram("@ada")).toBe("A");
    expect(TALK_BADGE_PUBLIC).toBe("Public");
    expect(TALK_BADGE_PRIVATE).toBe("Private · crew only");
    expect(threadBadge("private")).toEqual({ label: "Private · crew only", short: "Private" });
    expect(threadBadge("public")).toEqual({ label: "Public", short: "Public" });
  });

  it("a row opens the thread at its own address, by visibility", () => {
    expect(threadHref({ id: THREAD_ID, visibility: "private" })).toBe(`/threads/private/${THREAD_ID}`);
    expect(threadHref({ id: THREAD_ID, visibility: "public" })).toBe(`/threads/${THREAD_ID}`);
    expect(threadRepliesLabel({ postCount: 0 }, false)).toBe("Reply");
    expect(threadRepliesLabel({ postCount: 0 }, true)).toBe("Answer");
    expect(threadRepliesLabel({ postCount: 1 }, true)).toBe("1 reply");
    expect(threadRepliesLabel({ postCount: 4 }, false)).toBe("4 replies");
  });

  it("Resolved is an issue's, shown to everybody; Mark resolved is the crew's", () => {
    expect(isResolved({ kind: "issue", resolvedAt: "2026-11-15T09:00:00.000Z" })).toBe(true);
    expect(isResolved({ kind: "issue", resolvedAt: null })).toBe(false);
    expect(isResolved({ kind: "question", resolvedAt: "2026-11-15T09:00:00.000Z" })).toBe(false);
    expect(canResolve({ kind: "issue", state: "open" }, true)).toBe(true);
    expect(canResolve({ kind: "issue", state: "open" }, false)).toBe(false);
    expect(canResolve({ kind: "question", state: "open" }, true)).toBe(false);
    expect(canResolve({ kind: "issue", state: "removed" }, true)).toBe(false);
  });

  it("a failed read claims no count and no emptiness (OD5)", () => {
    expect(publicThreadCount(null)).toBeNull();
    expect(publicThreadCount(undefined)).toBeNull();
    expect(publicThreadCount([publicThread()])).toBe(1);
    expect(TALK_EMPTY).toBe("No threads");
  });

  it("the copy is the boards'", () => {
    expect(TALK_COMPOSER_LABEL).toBe("Start a thread");
    expect(TALK_POST_PUBLIC).toBe("Post publicly");
    expect(TALK_POST_PRIVATE).toBe("Send to the crew");
    expect(TALK_FILTER_LABELS).toEqual({ all: "All", public: "Public", private: "Private" });
    expect(THREAD_VISIBILITY_LABELS).toEqual({ public: "Public", private: "Private" });
    expect(TALK_PRIVATE_ANCHOR).toBe("private");
  });

  it("the addresses on this site", () => {
    expect(talkPrivateRoute("ackstack")).toBe("/ackstack/talk/private");
    expect(privateThreadDataRoute(THREAD_ID)).toBe(`/threads/private/${THREAD_ID}/data`);
    expect(privateThreadReplyRoute(THREAD_ID)).toBe(`/threads/private/${THREAD_ID}/reply`);
    expect(threadResolveRoute(THREAD_ID)).toBe(`/threads/${THREAD_ID}/resolve`);
    expect(isThreadId(THREAD_ID)).toBe(true);
    expect(isThreadId("private")).toBe(false);
  });
});

describe("the owner's rules on Talk (design §2)", () => {
  const classes = read("talk/classes.ts");
  const files = ["talk/classes.ts", "talk/composer.tsx", "talk/thread-row.tsx", "talk/thread-actions.tsx", "talk/resolve-control.tsx", "talk/talk-list.tsx", "talk/private-thread-view.tsx", "talk/title-field.tsx"];

  it("private is slate, never red: no danger colour anywhere in Talk", () => {
    expect(classes).toContain('TALK_CARD_PRIVATE = "border-version/[0.28]"');
    expect(classes).toContain('TALK_BADGE_PRIVATE_CLASS = "bg-version-soft text-version"');
    for (const file of files) {
      expect([file, /destructive|danger|text-red|bg-red|border-red/.test(code(file))]).toEqual([file, false]);
    }
  });

  it("is flat, and uses tokens: no shadow and no raw colour", () => {
    for (const file of files) {
      const source = code(file);
      expect([file, /\bshadow-|box-shadow/.test(source)]).toEqual([file, false]);
      expect([file, /#[0-9a-fA-F]{3,8}\b(?![^"]*id=)/.test(source.replace(/`#\$\{[^}]+\}`/g, ""))]).toEqual([file, false]);
    }
  });

  it("every control is at least 44px on a phone", () => {
    for (const name of ["TALK_SEGMENT", "TALK_ACTION"]) {
      const value = new RegExp(`export const ${name} =\\s*"([^"]+)"`).exec(classes)?.[1] ?? "";
      expect([name, value.includes("max-sm:h-[44px]")]).toEqual([name, true]);
    }
    expect(classes).toMatch(/export const TALK_FIELD =\s*"[^"]*\bh-\[44px\]/);
    expect(code("talk/composer.tsx")).toContain("max-sm:h-[44px]");
  });

  it("nothing explains a control: the composer and the list hold no helper sentence", () => {
    // The one sentence either may draw is the answer to a refused post
    // (`role="status"`), which is an outcome, not an explanation.
    for (const file of ["talk/composer.tsx", "talk/talk-list.tsx", "talk/thread-row.tsx", "talk/thread-actions.tsx"]) {
      const paragraphs = code(file).match(/<p\b[^>]*>/g) ?? [];
      expect([file, paragraphs.filter((p) => !p.includes("data-talk-empty")).length]).toEqual([file, 0]);
    }
  });
});
