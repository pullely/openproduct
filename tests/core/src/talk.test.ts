// Talk, routed: kinds, private threads, resolved (openproduct-redesign OPR-4,
// design §7).
//
// The privacy rule itself is held in the repository's SQL and proved against
// a live engine in `packages/db/src/pg/thread-privacy.test.ts`. What is
// pinned HERE is that the routes pass the reader through and add nothing:
//
//   - a private thread is read only through the signed-in routes, as the
//     actor, and every refusal is one 404 with one body — the body an id
//     that was never issued gets;
//   - the public routes answer 404 for a private thread's id;
//   - visibility is chosen at creation and no route changes it;
//   - a private thread tells the crew, a crew reply tells the author, the
//     author's reply tells the crew — and no row carries the title or text;
//   - no mention is resolved and nobody outside the thread is told;
//   - the crew marks an issue resolved, and only the crew, and only an issue.
//
// The repository here is a fake that keeps threads in memory and applies the
// same author-or-crew predicate the SQL does, so a handler that forgot to
// pass the actor, or read through the wrong method, shows up as a leak.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CREW_PRIVATE_THREAD_NOTICE_KEYS, PRIVATE_THREAD_KEYS, PUBLIC_POST_KEYS, PUBLIC_THREAD_KEYS } from "@openproduct/contracts";
import { OPENPRODUCT_SUBJECT_REGISTRY, type OpenproductRepository } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { ProfileHandlerDeps } from "@openproduct-worker/handlers/profiles";
import type { PublicHandlerDeps } from "@openproduct-worker/handlers/public";
import { privateThreadNotices } from "@openproduct-worker/handlers/talk";

const AUTHOR = "usr_0123456789abcdef0123456789abcdef"; // has a public profile
const READER = "usr_1111111111111111111111111111111a"; // signed in, no public profile
const THIRD = "usr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CREW = "usr_ffffffffffffffffffffffffffffffff";
const CREW_TWO = "usr_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const PROFILE = "55555555-5555-4555-8555-555555555555";
const MISSING = "99999999-9999-4999-8999-999999999999";
const NOW = "2026-11-15T09:00:00.000Z";

const TITLE = "ZQPRIVATE-TITLE where is my invoice";
const TEXT = "ZQPRIVATE-BODY the account number is here";

const BASE = "https://openproduct.internal/internal/openproduct/threads";
const PUBLIC = "https://openproduct.internal/internal/public/openproduct";

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

function req(method: string, url: string, subjectId: string | null, body?: unknown, subjectType = "user"): Request {
  return new Request(url, {
    method,
    headers: {
      "x-request-id": "req_talk",
      "content-type": "application/json",
      ...(subjectId ? { "x-actor-subject-id": subjectId, "x-actor-subject-type": subjectType } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

interface StoredThread {
  id: string;
  tag: string;
  title: string;
  state: "open" | "answered" | "locked" | "removed";
  authorSubjectId: string;
  kind: "question" | "issue" | "suggestion" | null;
  visibility: "public" | "private";
  resolvedAt: string | null;
  createdAt: string;
}
interface StoredPost {
  id: string;
  threadId: string;
  authorSubjectId: string;
  body: string;
}

function harness() {
  const threads: StoredThread[] = [];
  const posts: StoredPost[] = [];
  const crew = new Set([CREW, CREW_TWO]);
  const handles = new Map([[AUTHOR, "ada"], [CREW, "grace"]]);
  const notifications: Array<Record<string, unknown>> = [];
  const outbox: Array<Record<string, unknown>> = [];
  const calls: string[] = [];
  let n = 0;
  const nextId = () => `0b0b0b0b-0000-4000-8000-${String(++n).padStart(12, "0")}`;

  const readable = (thread: StoredThread, reader: string) =>
    thread.visibility === "private" && (thread.authorSubjectId === reader || crew.has(reader));
  const record = (thread: StoredThread) => ({
    id: thread.id,
    tag: thread.tag,
    title: thread.title,
    state: thread.state,
    authorSubjectId: thread.authorSubjectId,
    authorHandle: handles.get(thread.authorSubjectId) ?? null,
    authorName: null,
    createdAt: thread.createdAt,
    lastPostAt: null,
    postCount: posts.filter((p) => p.threadId === thread.id).length,
    profileId: PROFILE,
    answerPostId: null,
    visibility: thread.visibility,
    kind: thread.kind,
    resolvedAt: thread.resolvedAt,
  });
  const postRecord = (post: StoredPost) => ({
    id: post.id,
    authorSubjectId: post.authorSubjectId,
    body: post.body,
    state: "visible" as const,
    authorHandle: handles.get(post.authorSubjectId) ?? null,
    authorName: null,
    createdAt: NOW,
    editedAt: null,
    isAnswer: false,
    parentPostId: null,
    tag: null,
  });

  const repo = {
    async getPublicProfileId(slug: string) {
      return slug === "acme-thing" ? PROFILE : null;
    },
    async getActiveHandleForSubject(subjectId: string) {
      const handle = handles.get(subjectId);
      return handle ? { handle, subjectId } : null;
    },
    async getListingRole(_profileId: string, subjectId: string) {
      return crew.has(subjectId) ? "maintainer" : null;
    },
    async listMaintainerSubjects() {
      return [...crew];
    },
    async listMaintainers() {
      return [...crew].map((subjectId) => ({ subjectId }));
    },
    async getSubjectsForHandles() {
      calls.push("getSubjectsForHandles");
      return new Map<string, string>();
    },
    async listThreadParticipants() {
      calls.push("listThreadParticipants");
      return [];
    },
    // ── the PUBLIC reads: a private thread is not in them ──
    async getThread(id: string) {
      const thread = threads.find((t) => t.id === id && t.visibility === "public");
      return thread ? record(thread) : null;
    },
    async listPosts(threadId: string) {
      const thread = threads.find((t) => t.id === threadId && t.visibility === "public");
      return thread ? posts.filter((p) => p.threadId === threadId).map(postRecord) : [];
    },
    async listThreads() {
      return threads.filter((t) => t.visibility === "public").map(record);
    },
    async getLaunchThread() {
      return null;
    },
    // ── the signed-in path: author or crew, per call ──
    async listPrivateThreads(_profileId: string, reader: string) {
      calls.push(`listPrivateThreads:${reader}`);
      return threads.filter((t) => readable(t, reader)).map((t) => {
        const last = posts.filter((p) => p.threadId === t.id).at(-1);
        return { ...record(t), awaitingCrew: last ? !crew.has(last.authorSubjectId) : true };
      });
    },
    async getPrivateThread(id: string, reader: string) {
      calls.push(`getPrivateThread:${reader}`);
      const thread = threads.find((t) => t.id === id && readable(t, reader));
      return thread ? { ...record(thread), slug: "acme-thing" } : null;
    },
    async listPrivatePosts(threadId: string, reader: string) {
      calls.push(`listPrivatePosts:${reader}`);
      const thread = threads.find((t) => t.id === threadId && readable(t, reader));
      return thread ? posts.filter((p) => p.threadId === threadId).map(postRecord) : [];
    },
    async createThread(input: { id: string; tag: string; title: string; authorSubjectId: string; kind?: StoredThread["kind"]; visibility?: StoredThread["visibility"] }) {
      threads.push({
        id: input.id,
        tag: input.tag,
        title: input.title,
        state: "open",
        authorSubjectId: input.authorSubjectId,
        kind: input.kind ?? null,
        visibility: input.visibility ?? "public",
        resolvedAt: null,
        createdAt: NOW,
      });
      return input.id;
    },
    async createPost(input: { id: string; threadId: string; authorSubjectId: string; body: string }) {
      const thread = threads.find((t) => t.id === input.threadId);
      if (!thread || thread.state === "locked") return null;
      if (thread.visibility === "private" && !readable(thread, input.authorSubjectId)) return null;
      posts.push({ id: input.id, threadId: input.threadId, authorSubjectId: input.authorSubjectId, body: input.body });
      return input.id;
    },
    async setThreadResolved(id: string, resolvedAt: string | null) {
      const thread = threads.find((t) => t.id === id);
      if (!thread || thread.kind !== "issue") return false;
      thread.resolvedAt = resolvedAt;
      return true;
    },
    async setThreadState(id: string, next: StoredThread["state"]) {
      const thread = threads.find((t) => t.id === id);
      if (!thread) return false;
      thread.state = next;
      return true;
    },
    async countPostVotes() {
      return new Map<string, number>();
    },
    async writeNotification(input: Record<string, unknown>) {
      notifications.push(input);
      return true;
    },
    async listMutes() {
      return { thread: [], global: [] };
    },
    async queueNotification(input: Record<string, unknown>) {
      outbox.push(input);
      return true;
    },
    async getSlugForThread() {
      return "acme-thing";
    },
    // The subject's own exit. The real one walks the subject registry, where
    // `listing_maintainers.subject_id` is `theirs` (deleted) and a thread's
    // and a post's author are `anonymise` (kept, under nobody's name); this
    // fake does those three things and is pinned to the registry below.
    async eraseSubject(subjectId: string) {
      calls.push(`eraseSubject:${subjectId}`);
      const wasCrew = crew.delete(subjectId);
      for (const thread of threads) if (thread.authorSubjectId === subjectId) thread.authorSubjectId = "usr_gone";
      for (const post of posts) if (post.authorSubjectId === subjectId) post.authorSubjectId = "usr_gone";
      return { deleted: wasCrew ? 1 : 0, anonymised: 0, columns: {} };
    },
  } as unknown as OpenproductRepository;

  const deps = { repo, generateId: nextId, now: () => new Date(NOW) } as unknown as ProfileHandlerDeps;
  return { deps, threads, posts, crew, notifications, outbox, calls, repo };
}

type H = ReturnType<typeof harness>;

async function start(h: H, who: string, body: Record<string, unknown>) {
  const res = await route(req("POST", BASE, who, { slug: "acme-thing", ...body }), env(), h.deps);
  const json = (await res.json()) as { data?: { threadId: string; visibility: string }; error?: { details?: { fields?: Record<string, string[]> } } };
  return { status: res.status, id: json.data?.threadId ?? "", json };
}

async function privateThread(h: H, who = READER) {
  const made = await start(h, who, { title: TITLE, kind: "question", visibility: "private" });
  expect(made.status).toBe(201);
  return made.id;
}

async function text(res: Response) {
  return res.text();
}

describe("starting a thread from Talk", () => {
  it("starts a PRIVATE thread for any signed-in person, with its kind — no public profile asked for", async () => {
    const h = harness();
    const made = await start(h, READER, { title: TITLE, kind: "issue", visibility: "private" });
    expect(made.status).toBe(201);
    expect(made.json.data).toEqual({ threadId: made.id, visibility: "private" });
    expect(h.threads).toEqual([expect.objectContaining({ title: TITLE, kind: "issue", visibility: "private", tag: "question", authorSubjectId: READER })]);
    // Talk's one field is the title: no opening post is made.
    expect(h.posts).toEqual([]);
  });

  it("still requires a public profile for a PUBLIC thread: public words are signed (CB-2)", async () => {
    const h = harness();
    const refused = await start(h, READER, { title: "A public question", kind: "question", visibility: "public" });
    expect(refused.status).toBe(403);
    expect(h.threads).toEqual([]);
    const made = await start(h, AUTHOR, { title: "A public question", kind: "suggestion" });
    expect(made.status).toBe(201);
    expect(made.json.data?.visibility).toBe("public");
    expect(h.threads[0]).toMatchObject({ visibility: "public", kind: "suggestion", tag: "proposal" });
  });

  it("refuses a service principal, privately too", async () => {
    const h = harness();
    const res = await route(req("POST", BASE, READER, { slug: "acme-thing", title: TITLE, kind: "question", visibility: "private" }, "service"), env(), h.deps);
    expect(res.status).toBe(403);
    expect(h.threads).toEqual([]);
  });

  it("refuses an unknown visibility or kind rather than coercing it to public", async () => {
    const h = harness();
    for (const body of [
      { title: TITLE, kind: "question", visibility: "crew" },
      { title: TITLE, kind: "rant", visibility: "public" },
      // A private thread is a Talk thread: it has a kind.
      { title: TITLE, visibility: "private" },
    ]) {
      const refused = await start(h, AUTHOR, body);
      expect([body, refused.status]).toEqual([body, 422]);
    }
    expect(h.threads).toEqual([]);
  });

  it("answers 404 for a product that is not listed, privately too", async () => {
    const h = harness();
    const res = await route(req("POST", BASE, READER, { slug: "no-such", title: TITLE, kind: "question", visibility: "private" }), env(), h.deps);
    expect(res.status).toBe(404);
  });

  it("tells the crew, and only the crew, with no title and no text in the row", async () => {
    const h = harness();
    const id = await privateThread(h);
    expect(h.notifications.map((row) => row.subjectId).sort()).toEqual([CREW, CREW_TWO].sort());
    for (const row of h.notifications) {
      expect(row).toMatchObject({ kind: "thread.private", targetKind: "thread", targetRef: `acme-thing/${id}` });
      expect(JSON.stringify(row)).not.toContain("ZQPRIVATE");
    }
    // No participant mail and no mention read for a private thread.
    expect(h.outbox).toEqual([]);
    expect(h.calls).not.toContain("getSubjectsForHandles");
    expect(h.calls).not.toContain("listThreadParticipants");
  });
});

describe("reading private threads — the one signed-in path", () => {
  it("lists an author's own, and all of them for the crew, in the pinned shape", async () => {
    const h = harness();
    const mine = await privateThread(h, READER);
    const theirs = await privateThread(h, THIRD);
    const list = async (who: string) =>
      (await (await route(req("GET", `${BASE}/private?slug=acme-thing`, who), env(), h.deps)).json()) as {
        data: { crew: boolean; threads: Array<Record<string, unknown>> };
      };

    const author = await list(READER);
    expect(author.data.crew).toBe(false);
    expect(author.data.threads.map((t) => t.id)).toEqual([mine]);
    expect(Object.keys(author.data.threads[0]!).sort()).toEqual([...PRIVATE_THREAD_KEYS]);
    expect(author.data.threads[0]).toMatchObject({ visibility: "private", mine: true, awaitingCrew: true, title: TITLE });

    const crew = await list(CREW);
    expect(crew.data.crew).toBe(true);
    expect(crew.data.threads.map((t) => t.id).sort()).toEqual([mine, theirs].sort());
    expect(crew.data.threads.every((t) => t.mine === false)).toBe(true);

    // No subject id crosses (I3).
    expect(JSON.stringify([author, crew])).not.toContain("usr_");
    // And the read was made AS THE ACTOR.
    expect(h.calls).toContain(`listPrivateThreads:${READER}`);
    expect(h.calls).toContain(`listPrivateThreads:${CREW}`);
  });

  it("gives somebody with none an empty list — the same answer as an unknown product", async () => {
    const h = harness();
    await privateThread(h, READER);
    const stranger = await text(await route(req("GET", `${BASE}/private?slug=acme-thing`, AUTHOR), env(), h.deps));
    const unknown = await text(await route(req("GET", `${BASE}/private?slug=no-such`, AUTHOR), env(), h.deps));
    expect(stranger).toBe(unknown);
    expect(stranger).not.toContain("ZQPRIVATE");
    expect(JSON.parse(stranger).data).toEqual({ crew: false, threads: [] });
  });

  it("serves one private thread to its author and to the crew, with the Crew mark on crew replies", async () => {
    const h = harness();
    const id = await privateThread(h);
    await route(req("POST", `${BASE}/private/${id}/posts`, READER, { body: TEXT }), env(), h.deps);
    await route(req("POST", `${BASE}/private/${id}/posts`, CREW, { body: "Here you go." }), env(), h.deps);
    for (const who of [READER, CREW]) {
      const res = await route(req("GET", `${BASE}/private/${id}`, who), env(), h.deps);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { slug: string; crew: boolean; thread: Record<string, unknown>; posts: Array<Record<string, unknown>> } };
      expect(body.data.slug).toBe("acme-thing");
      expect(body.data.crew).toBe(who === CREW);
      expect(Object.keys(body.data.thread).sort()).toEqual([...PRIVATE_THREAD_KEYS]);
      expect(body.data.thread).toMatchObject({ title: TITLE, mine: who === READER, awaitingCrew: false });
      expect(body.data.posts.map((p) => Object.keys(p).sort())).toEqual([[...PUBLIC_POST_KEYS].sort(), [...PUBLIC_POST_KEYS].sort()]);
      expect(body.data.posts.map((p) => p.authorIsMaintainer)).toEqual([false, true]);
      expect(JSON.stringify(body)).not.toContain("usr_");
    }
  });

  it("answers ONE 404 — the same bytes — to a third person, for a real id and for one never issued", async () => {
    const h = harness();
    const id = await privateThread(h);
    const real = await route(req("GET", `${BASE}/private/${id}`, THIRD), env(), h.deps);
    const never = await route(req("GET", `${BASE}/private/${MISSING}`, THIRD), env(), h.deps);
    const garbage = await route(req("GET", `${BASE}/private/not-an-id`, THIRD), env(), h.deps);
    expect([real.status, never.status, garbage.status]).toEqual([404, 404, 404]);
    const [a, b, c] = await Promise.all([text(real), text(never), text(garbage)]);
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(a).not.toContain("ZQPRIVATE");
    // Never a 403: that would say "it exists".
    expect(a).not.toContain("forbidden");
  });

  it("answers the same 404 to a service principal, and 401 with no actor at all (the gateway's 404)", async () => {
    const h = harness();
    const id = await privateThread(h);
    const service = await route(req("GET", `${BASE}/private/${id}`, CREW, undefined, "service"), env(), h.deps);
    expect(service.status).toBe(404);
    const anonymous = await route(req("GET", `${BASE}/private/${id}`, null), env(), h.deps);
    const anonymousMissing = await route(req("GET", `${BASE}/private/${MISSING}`, null), env(), h.deps);
    expect([anonymous.status, anonymousMissing.status]).toEqual([401, 401]);
    expect(await text(anonymous)).toBe(await text(anonymousMissing));
  });

  it("ends access the moment somebody leaves the crew", async () => {
    const h = harness();
    const id = await privateThread(h);
    expect((await route(req("GET", `${BASE}/private/${id}`, CREW_TWO), env(), h.deps)).status).toBe(200);
    h.crew.delete(CREW_TWO);
    expect((await route(req("GET", `${BASE}/private/${id}`, CREW_TWO), env(), h.deps)).status).toBe(404);
    const list = (await (await route(req("GET", `${BASE}/private?slug=acme-thing`, CREW_TWO), env(), h.deps)).json()) as { data: unknown };
    expect(list.data).toEqual({ crew: false, threads: [] });
    const reply = await route(req("POST", `${BASE}/private/${id}/posts`, CREW_TWO, { body: "Still here?" }), env(), h.deps);
    expect(reply.status).toBe(404);
    expect(h.posts).toEqual([]);
  });
});

// WHAT "LEAVES THE CREW" MEANS TODAY, stated exactly (design §7.4).
//
// The crew is `listing_maintainers`. The privacy check reads it per request,
// so a row that goes takes the access with it at the next read — that part
// is held above and in `packages/db`. What this block pins is HOW a row can
// go, because the rule is only as real as the acts that remove one:
//
//   - a person's own exit, `DELETE /me`, deletes their rows (the subject
//     registry), and their access ends with it;
//   - deleting the listing or purging its workspace deletes the threads too.
//
// And nothing else. No route adds or removes a maintainer; the platform
// sends no event saying a person left a workspace (the seam carries join
// requests, `workspace.visibility_narrowed` and the purge); no request reads
// workspace membership; retiring somebody from the public roster
// (`product_people`) is a different fact and does not touch the crew. So a
// person who leaves the WORKSPACE on the platform, and keeps their account,
// keeps their place on the crew here — and keeps reading its private threads
// — until an operator removes the row by hand. That is the listing's whole
// authority model since OX4, not something private threads added, and it is
// written down here so nobody reads §7.4 as more than it is.
describe("leaving the crew — the acts that exist, and the one that does not", () => {
  const CORE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../core/src");
  const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? files(resolve(dir, entry.name)) : entry.name.endsWith(".ts") ? [resolve(dir, entry.name)] : [],
    );

  it("a crew member's own exit (DELETE /me) ends their access, through the route", async () => {
    const h = harness();
    const id = await privateThread(h);
    expect((await route(req("GET", `${BASE}/private/${id}`, CREW_TWO), env(), h.deps)).status).toBe(200);

    const exit = await route(req("DELETE", "https://openproduct.internal/internal/openproduct/me", CREW_TWO), env(), h.deps);
    expect(exit.status).toBe(200);
    expect(h.calls).toContain(`eraseSubject:${CREW_TWO}`);

    const after = await route(req("GET", `${BASE}/private/${id}`, CREW_TWO), env(), h.deps);
    const missing = await route(req("GET", `${BASE}/private/${MISSING}`, CREW_TWO), env(), h.deps);
    expect([after.status, missing.status]).toEqual([404, 404]);
    expect(await text(after)).toBe(await text(missing));
    expect((await route(req("POST", `${BASE}/private/${id}/posts`, CREW_TWO, { body: "Still here?" }), env(), h.deps)).status).toBe(404);
    // The rest of the crew and the author are untouched.
    expect((await route(req("GET", `${BASE}/private/${id}`, CREW), env(), h.deps)).status).toBe(200);
    expect((await route(req("GET", `${BASE}/private/${id}`, READER), env(), h.deps)).status).toBe(200);
  });

  it("an author's own exit ends theirs; the thread stays the crew's to read", async () => {
    const h = harness();
    const id = await privateThread(h);
    expect((await route(req("DELETE", "https://openproduct.internal/internal/openproduct/me", READER), env(), h.deps)).status).toBe(200);
    expect((await route(req("GET", `${BASE}/private/${id}`, READER), env(), h.deps)).status).toBe(404);
    expect((await route(req("GET", `${BASE}/private/${id}`, CREW), env(), h.deps)).status).toBe(200);
  });

  it("the exit deletes the crew row and keeps the words: what the fake above does is what the registry says", () => {
    const of = (table: string, column: string) => OPENPRODUCT_SUBJECT_REGISTRY.find((e) => e.table === table && e.column === column)?.class;
    expect(of("listing_maintainers", "subject_id")).toBe("theirs");
    expect(of("threads", "author_subject_id")).toBe("anonymise");
    expect(of("posts", "author_subject_id")).toBe("anonymise");
  });

  it("NO OTHER ACT REMOVES SOMEBODY FROM A CREW: no route writes the crew list, and no event says a person left", () => {
    const all = files(CORE).map((file) => ({ file, text: strip(readFileSync(file, "utf-8")) }));
    // Nothing in the worker adds or removes a maintainer. (Creating a listing
    // makes its creator the owner, inside the repository's `createProfile`.)
    const writers = all.filter(({ text }) => /\b(addListingMaintainer|removeListingMaintainer|removeMaintainer|setListingRole)\b/.test(text));
    expect(writers.map(({ file }) => file)).toEqual([]);
    expect(all.filter(({ text }) => /listing_maintainers/.test(text) && /\b(DELETE|INSERT|UPDATE)\b/.test(text)).map(({ file }) => file)).toEqual([]);

    // The platform's deliveries, in full: join requests, one workspace event.
    const seam = strip(readFileSync(resolve(CORE, "handlers/seam-events.ts"), "utf-8"));
    expect([...new Set(seam.match(/"(?:join_request|workspace|member|membership)\.[a-z_]+"/g))].sort()).toEqual([
      '"join_request.decided"',
      '"join_request.submitted"',
      '"workspace.visibility_narrowed"',
    ]);
    // None of them, and no roster act, reaches the crew list.
    for (const file of ["handlers/seam-events.ts", "handlers/roster.ts"]) {
      const source = strip(readFileSync(resolve(CORE, file), "utf-8"));
      expect([file, /ListingMaintainer|listing_maintainers|eraseSubject/.test(source)]).toEqual([file, false]);
    }
    // The one caller of the exit is the subject's own route.
    expect(all.filter(({ text }) => /repo\.eraseSubject\(/.test(text)).map(({ file }) => file.slice(CORE.length + 1))).toEqual(["handlers/me.ts"]);
  });
});

describe("a private thread on the PUBLIC routes does not exist", () => {
  it("404s on the public thread read, identically to an id never issued, and is in no public list", async () => {
    const h = harness();
    const id = await privateThread(h);
    await route(req("POST", `${BASE}/private/${id}/posts`, READER, { body: TEXT }), env(), h.deps);
    const publicDeps = h.deps as unknown as PublicHandlerDeps;
    const real = await route(req("GET", `${PUBLIC}/threads/${id}`, null), env(), undefined, publicDeps);
    const never = await route(req("GET", `${PUBLIC}/threads/${MISSING}`, null), env(), undefined, publicDeps);
    expect([real.status, never.status]).toEqual([404, 404]);
    expect((await text(real)).replace(id, "")).toBe((await text(never)).replace(MISSING, ""));

    const list = await route(new Request(`${PUBLIC}/projects/acme-thing/threads`), env(), undefined, publicDeps);
    expect(list.status).toBe(200);
    expect(await text(list)).not.toContain("ZQPRIVATE");
  });

  it("takes no reply, no lock and no answer through the public thread's write routes", async () => {
    const h = harness();
    const id = await privateThread(h);
    for (const who of [THIRD, AUTHOR, CREW]) {
      const reply = await route(req("POST", `${BASE}/${id}/posts`, who, { body: "Let me in." }), env(), h.deps);
      // AUTHOR and CREW hold a profile and reach the lookup; THIRD is
      // refused for having none, as on any thread. Nobody gets a post in.
      expect([who, [403, 404].includes(reply.status)]).toEqual([who, true]);
      const manage = await route(req("POST", `${BASE}/${id}`, who, { intent: "lock" }), env(), h.deps);
      expect([who, manage.status]).toEqual([who, 404]);
    }
    expect(h.posts).toEqual([]);
    expect(h.threads[0]?.state).toBe("open");
  });
});

describe("a private thread cannot be made public (design §7.3)", () => {
  it("no thread route accepts a visibility, on a private thread or a public one", async () => {
    const h = harness();
    const id = await privateThread(h);
    const pub = (await start(h, AUTHOR, { title: "Public", kind: "issue" })).id;
    for (const body of [{ visibility: "public" }, { intent: "publish" }, { intent: "visibility", visibility: "public" }]) {
      // On the private thread: it is not there to be managed.
      expect((await route(req("POST", `${BASE}/${id}`, CREW, body), env(), h.deps)).status).toBe(404);
      // On a public thread the intent is refused by name.
      expect((await route(req("POST", `${BASE}/${pub}`, CREW, body), env(), h.deps)).status).toBe(422);
    }
    for (const method of ["PUT", "PATCH", "DELETE", "POST"]) {
      const res = await route(req(method, `${BASE}/private/${id}`, CREW, { visibility: "public" }), env(), h.deps);
      expect([method, res.status]).toEqual([method, 405]);
    }
    expect(h.threads.find((t) => t.id === id)?.visibility).toBe("private");
  });
});

describe("replies in a private thread, and who hears of them", () => {
  it("a crew reply reaches the AUTHOR'S Activity; the author's reply reaches the crew's", async () => {
    const h = harness();
    const id = await privateThread(h);
    h.notifications.length = 0;

    const crewReply = await route(req("POST", `${BASE}/private/${id}/posts`, CREW, { body: TEXT }), env(), h.deps);
    expect(crewReply.status).toBe(201);
    expect(h.notifications).toEqual([
      expect.objectContaining({ subjectId: READER, kind: "thread.private.answered", actor: "grace", targetKind: "thread", targetRef: `acme-thing/${id}` }),
    ]);

    h.notifications.length = 0;
    const authorReply = await route(req("POST", `${BASE}/private/${id}/posts`, READER, { body: "Thanks." }), env(), h.deps);
    expect(authorReply.status).toBe(201);
    expect(h.notifications.map((row) => [row.subjectId, row.kind]).sort()).toEqual(
      [[CREW, "thread.private.reply"], [CREW_TWO, "thread.private.reply"]].sort(),
    );
    // Nothing a row or a queued mail holds is the thread's title or text.
    expect(JSON.stringify([h.notifications, h.outbox])).not.toContain("ZQPRIVATE");
    // The mail outbox names the generic `reply` kind and the thread id only.
    for (const row of h.outbox) expect(Object.keys(row).sort()).toEqual(["eventRef", "id", "kind", "subjectId", "threadId"]);
  });

  it("resolves no mention and tells nobody outside the thread", async () => {
    const h = harness();
    const id = await privateThread(h);
    h.notifications.length = 0;
    await route(req("POST", `${BASE}/private/${id}/posts`, READER, { body: "@ada can you look at this?" }), env(), h.deps);
    expect(h.calls).not.toContain("getSubjectsForHandles");
    expect(h.calls).not.toContain("listThreadParticipants");
    expect(h.notifications.every((row) => row.subjectId === CREW || row.subjectId === CREW_TWO)).toBe(true);
    expect(h.outbox.every((row) => row.kind === "reply")).toBe(true);
    // The mentioned handle stays text in what the readers get back.
    const doc = (await (await route(req("GET", `${BASE}/private/${id}`, CREW), env(), h.deps)).json()) as { data: { posts: Array<{ body: unknown }> } };
    expect(JSON.stringify(doc.data.posts[0]!.body)).not.toContain('"claimed":true');
  });

  it("refuses a third person's reply with the 404 a missing thread gets, and writes nothing", async () => {
    const h = harness();
    const id = await privateThread(h);
    const real = await route(req("POST", `${BASE}/private/${id}/posts`, THIRD, { body: "Let me in." }), env(), h.deps);
    const never = await route(req("POST", `${BASE}/private/${MISSING}/posts`, THIRD, { body: "Let me in." }), env(), h.deps);
    expect([real.status, never.status]).toEqual([404, 404]);
    expect(await text(real)).toBe(await text(never));
    expect(h.posts).toEqual([]);
  });

  it("validates the body for somebody who may read it", async () => {
    const h = harness();
    const id = await privateThread(h);
    const res = await route(req("POST", `${BASE}/private/${id}/posts`, READER, { body: "   " }), env(), h.deps);
    expect(res.status).toBe(422);
  });
});

describe("the crew marks an issue resolved", () => {
  it("a crew member resolves a public issue and it shows on the public read; DELETE reopens it", async () => {
    const h = harness();
    const id = (await start(h, AUTHOR, { title: "It crashes", kind: "issue" })).id;
    const put = await route(req("PUT", `${BASE}/${id}/resolved`, CREW), env(), h.deps);
    expect(put.status).toBe(200);
    expect(((await put.json()) as { data: { resolvedAt: string } }).data.resolvedAt).toBe(NOW);

    const read = await route(new Request(`${PUBLIC}/threads/${id}`), env(), undefined, h.deps as unknown as PublicHandlerDeps);
    const body = (await read.json()) as { data: { thread: Record<string, unknown> } };
    expect(Object.keys(body.data.thread).sort()).toEqual([...PUBLIC_THREAD_KEYS].sort());
    expect(body.data.thread).toMatchObject({ kind: "issue", resolvedAt: NOW });
    expect(body.data.thread).not.toHaveProperty("visibility");

    const del = await route(req("DELETE", `${BASE}/${id}/resolved`, CREW), env(), h.deps);
    expect(((await del.json()) as { data: { resolvedAt: null } }).data.resolvedAt).toBeNull();
    expect(h.threads[0]?.resolvedAt).toBeNull();
  });

  it("is the crew's alone: anybody else gets 404, the author included", async () => {
    const h = harness();
    const id = (await start(h, AUTHOR, { title: "It crashes", kind: "issue" })).id;
    for (const who of [AUTHOR, THIRD]) {
      const res = await route(req("PUT", `${BASE}/${id}/resolved`, who), env(), h.deps);
      expect([who, res.status]).toEqual([who, 404]);
    }
    expect(h.threads[0]?.resolvedAt).toBeNull();
  });

  it("only an issue can be resolved", async () => {
    const h = harness();
    const id = (await start(h, AUTHOR, { title: "How?", kind: "question" })).id;
    expect((await route(req("PUT", `${BASE}/${id}/resolved`, CREW), env(), h.deps)).status).toBe(409);
  });

  it("resolves a PRIVATE issue for the crew, and answers a stranger exactly as for a missing id", async () => {
    const h = harness();
    const id = (await start(h, READER, { title: TITLE, kind: "issue", visibility: "private" })).id;
    const stranger = await route(req("PUT", `${BASE}/${id}/resolved`, THIRD), env(), h.deps);
    const never = await route(req("PUT", `${BASE}/${MISSING}/resolved`, THIRD), env(), h.deps);
    expect([stranger.status, never.status]).toEqual([404, 404]);
    expect(await text(stranger)).toBe(await text(never));
    // Its author is not the crew.
    expect((await route(req("PUT", `${BASE}/${id}/resolved`, READER), env(), h.deps)).status).toBe(404);
    expect((await route(req("PUT", `${BASE}/${id}/resolved`, CREW), env(), h.deps)).status).toBe(200);
    expect(h.threads[0]?.resolvedAt).toBe(NOW);
  });
});

describe("the crew's Needs you", () => {
  it("names who started a private thread and when — never its title", async () => {
    const h = harness();
    const id = await privateThread(h, AUTHOR);
    const rows = await privateThreadNotices({ repo: h.repo }, PROFILE, { subjectId: CREW, subjectType: "user" });
    expect(rows).toEqual([{ id, authorHandle: "ada", authorName: null, createdAt: NOW }]);
    expect(Object.keys(rows[0]!).sort()).toEqual([...CREW_PRIVATE_THREAD_NOTICE_KEYS]);
    expect(JSON.stringify(rows)).not.toContain("ZQPRIVATE");
  });

  it("drops a thread once the crew has had the last word, and gives a non-crew caller nothing", async () => {
    const h = harness();
    const id = await privateThread(h, AUTHOR);
    expect(await privateThreadNotices({ repo: h.repo }, PROFILE, { subjectId: THIRD, subjectType: "user" })).toEqual([]);
    await route(req("POST", `${BASE}/private/${id}/posts`, CREW, { body: "Answered." }), env(), h.deps);
    expect(await privateThreadNotices({ repo: h.repo }, PROFILE, { subjectId: CREW, subjectType: "user" })).toEqual([]);
  });
});

describe("the signed-in reads are called from one place (design §7.2)", () => {
  const HANDLERS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../core/src/handlers");
  const source = (file: string) =>
    readFileSync(resolve(HANDLERS, file), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  const PRIVATE_CALL = /repo\.(listPrivateThreads|getPrivateThread|listPrivatePosts)\(/;

  it("only `talk.ts` calls the repository's private reads — and always as the actor", () => {
    const callers = readdirSync(HANDLERS).filter((file) => file.endsWith(".ts") && PRIVATE_CALL.test(source(file)));
    expect(callers).toEqual(["talk.ts"]);
    const calls = source("talk.ts").match(/repo\.(?:listPrivateThreads|getPrivateThread|listPrivatePosts)\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(5);
    // Every call passes the ACTOR as the reader: there is no call with a
    // constant, an author's id, or nothing.
    for (const call of calls) expect([call, call.includes("actor.subjectId")]).toEqual([call, true]);
  });

  it("no public surface's handler can reach them: the feed, search, the digest and its mail, a person's page, the sidebar, the catalog", () => {
    for (const file of ["feed.ts", "search.ts", "digest.ts", "digest-mail.ts", "maker.ts", "sidebar.ts", "catalog.ts", "catalogue.ts", "public.ts", "board.ts", "topics.ts", "leaderboard.ts"]) {
      const text = source(file);
      expect([file, /PrivateThread|PrivatePost|visibility === "private"/.test(text)]).toEqual([file, false]);
    }
    // The export is the repository's own (`exportSubject`), which filters a
    // private thread's title in SQL; the handler adds no thread read to it.
    expect(source("me.ts")).not.toMatch(/PrivateThread|PrivatePost|getThread\(/);
  });

  it("`talk.ts` answers no 403: every refusal there is the one 404", () => {
    const talk = source("talk.ts");
    expect(talk).not.toMatch(/\b403\b|"forbidden"/);
    // `requirePerson`'s own 403 is never returned from it — only tested.
    expect(talk.match(/requirePerson\(actor, requestId\)/g)!.length).toBeGreaterThanOrEqual(4);
    expect(talk).not.toMatch(/return requirePerson|return refusal;/);
  });
});
