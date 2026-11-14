// The privacy rule for private threads (openproduct-redesign OPR-4, design §7).
//
// "A private thread and its posts are readable by exactly two groups: the
// thread's author, and the confirmed crew of the product at the time of the
// read. The rule is enforced in the repository read, not in the page."
//
// TWO HALVES.
//
// 1. THE LIST. Every unit of SQL in `repository.ts` that touches
//    `openproduct.threads` or `openproduct.posts` — or a table keyed by a
//    thread or a post (`post_votes`, `thread_mutes`) — is found by reading the
//    file, and must be named in `CLASSIFIED` below with what it is: a public
//    read (which must carry `publicThread(…)`), the signed-in path (which
//    must carry `privateThreadReadableBy(…)`), a guarded write, a plain
//    write, or a read that returns no thread or post content. A read added
//    later is found by the same scan and fails this suite until somebody
//    classifies it — which is the moment to ask who may see what it returns.
//    A statement added INSIDE a unit already classified (an arrow function, a
//    local template, a second query) changes that unit's pinned count of
//    table mentions, and fails the same way.
//
// 2. THE BEHAVIOUR, against a live engine: a private thread whose title and
//    text are marker strings, read as its author, the crew, a third person,
//    nobody, and somebody who has left the crew — and every public read,
//    asked for everything it will give, searched for the markers.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { asUuid } from "../ids.js";
import { OPENPRODUCT_SUBJECT_REGISTRY } from "../subject-registry.js";
import { ACTOR, ADMIN, NOW, PROFILE, PROFILE_TWO, PROJECT_TWO, db, repo, seedPublished, sql, usePgEngine } from "./harness.js";

/** `rejects.toThrow()` with the trigger's own sentence, whatever the driver wraps it in. */
async function refused(run: () => Promise<unknown>, sentence: string) {
  let message = "";
  try {
    await run();
  } catch (error) {
    message = String((error as Error)?.message ?? error);
  }
  expect(message).toContain(sentence);
}

usePgEngine();

const SOURCE = readFileSync(fileURLToPath(new URL("../repository.ts", import.meta.url)), "utf8");

type Class =
  /** Returns thread or post content to a caller with no reader: must filter. */
  | "public"
  /** The one signed-in path: must check author-or-crew in its own statement. */
  | "signed-in"
  /** A write that must itself refuse a private thread to a non-reader. */
  | "guarded-write"
  /** A write that selects no title and no body. */
  | "write"
  /** A read that selects no title and no body (ids, a slug, subjects). */
  | "no-content"
  /** The subject's own rows, by the erasure registry; see each note. */
  | "own-rows";

const CLASSIFIED: Readonly<Record<string, { is: Class; why: string }>> = {
  // ── the satellite tables, keyed by a thread or a post ──
  setThreadMute: { is: "write", why: "one person's own mute of a thread id; returns nothing" },
  withdrawPostVote: { is: "write", why: "takes back the caller's own vote; returns the post id it was given" },
  listMutes: { is: "no-content", why: "subject ids who muted a thread, for a fan-out" },
  isThreadMuted: { is: "no-content", why: "whether the caller muted a thread id: a boolean about their own row" },
  countPostVotes: { is: "no-content", why: "a count per post id the caller already read; ids and numbers" },
  listPostVotesBy: { is: "no-content", why: "which of the given post ids the caller upvoted; their own rows" },
  // ── public reads: thread or post content, to anyone ──
  PUBLIC_PRODUCT_POST_SELECT: { is: "public", why: "a product post's comment count, on the feed and the post page" },
  listThreads: { is: "public", why: "a product's forum and Talk list; also the studio's list" },
  getLaunchThread: { is: "public", why: "a listing's comment thread" },
  getThread: { is: "public", why: "the thread page, and the lookup every thread write starts from" },
  listForumThreads: { is: "public", why: "the forum index" },
  listRecentlyRepliedThreads: { is: "public", why: "the sidebar's recent replies (titles)" },
  listPosts: { is: "public", why: "a thread's posts" },
  countMakerActivity: { is: "public", why: "a person's public comment count" },
  listMakerComments: { is: "public", why: "a person's public comments tab" },
  listMakerHistory: { is: "public", why: "a person's public activity (thread titles)" },
  listFeedLaunches: { is: "public", why: "a launch row's public comment count" },
  // ── the signed-in path ──
  listPrivateThreads: { is: "signed-in", why: "a product's private threads, for their author or the crew" },
  getPrivateThread: { is: "signed-in", why: "one private thread" },
  listPrivatePosts: { is: "signed-in", why: "one private thread's posts" },
  // ── writes that must refuse a private thread to a non-reader ──
  createPost: { is: "guarded-write", why: "a reply; into a private thread only from its author or the crew" },
  votePost: { is: "guarded-write", why: "an upvote; on a private thread's post only from a reader" },
  // ── writes that return no content ──
  createThread: { is: "write", why: "writes visibility once" },
  ensureLaunchThread: { is: "write", why: "the system's public comment thread" },
  setThreadState: { is: "write", why: "lock, unlock, remove" },
  setThreadResolved: { is: "write", why: "an issue's resolved moment" },
  markAnswer: { is: "write", why: "the answer" },
  setPostModerationState: { is: "write", why: "moderation's act on a post" },
  // ── reads with no title and no body ──
  listThreadParticipants: { is: "no-content", why: "subject ids, for a fan-out" },
  getPostAuthor: { is: "no-content", why: "a subject id, a thread id and that thread's visibility" },
  getSlugForThread: { is: "no-content", why: "the product's slug" },
  getPostThreadId: { is: "no-content", why: "a thread id" },
  // ── the erasure registry's statements over the subject's own rows ──
  eraseSubject: { is: "own-rows", why: "rewrites the subject's own author columns; returns counts" },
  subjectFootprint: { is: "own-rows", why: "counts the subject's own rows; returns numbers" },
  exportSubject: {
    is: "own-rows",
    why: "the subject's own rows; the one cross-reference (a thread's title by id) is filtered to public or readable",
  },
};

/** Every unit of the file that holds SQL: a repository method, a helper
 *  function, or a module-level SQL constant. */
function units(): Map<string, string> {
  const starts: Array<{ at: number; name: string }> = [];
  const re = /^(?: {4}async (\w+)\(| {0,2}(?:export )?(?:async )?function (\w+)\(|const ([A-Z][A-Z0-9_]*) = `)/gm;
  for (let m = re.exec(SOURCE); m !== null; m = re.exec(SOURCE)) {
    starts.push({ at: m.index, name: (m[1] ?? m[2] ?? m[3])! });
  }
  const out = new Map<string, string>();
  starts.forEach((start, i) => {
    const body = SOURCE.slice(start.at, starts[i + 1]?.at ?? SOURCE.length);
    out.set(start.name, (out.get(start.name) ?? "") + body);
  });
  return out;
}

/** The forum's two tables, the two keyed by their ids, and a table named at
 *  run time (the erasure registry's statements, which reach every table). */
const TOUCHES = /openproduct\.(threads|posts|post_votes|thread_mutes)\b|openproduct\.\$\{/;
const TOUCHES_ALL = new RegExp(TOUCHES.source, "g");

/** A unit's code with its comments taken out, so prose is not counted. */
function code(body: string): string {
  return body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function touching(): string[] {
  return [...units()].filter(([, body]) => TOUCHES.test(body)).map(([name]) => name);
}

/**
 * HOW MANY TIMES each unit names one of those tables, comments aside.
 *
 * `units()` finds methods, functions and upper-case SQL constants. SQL in an
 * arrow function, a `name: async (` property or a lower-case template is not
 * its own unit: it is counted in the unit it sits in. So a statement added
 * anywhere in the file moves a number here, and the suite fails until
 * somebody reads the new statement and classifies it.
 */
const MENTIONS: Readonly<Record<string, number>> = {
  PUBLIC_PRODUCT_POST_SELECT: 2,
  listThreadParticipants: 2,
  listMutes: 1,
  setThreadMute: 2,
  isThreadMuted: 1,
  listThreads: 2,
  getLaunchThread: 2,
  ensureLaunchThread: 2,
  getThread: 2,
  listForumThreads: 2,
  listRecentlyRepliedThreads: 2,
  listPosts: 2,
  listPrivateThreads: 3,
  getPrivateThread: 2,
  listPrivatePosts: 2,
  setThreadResolved: 1,
  createThread: 1,
  createPost: 3,
  setThreadState: 1,
  markAnswer: 2,
  setPostModerationState: 1,
  votePost: 3,
  withdrawPostVote: 1,
  countPostVotes: 1,
  listPostVotesBy: 1,
  getPostAuthor: 2,
  getSlugForThread: 1,
  getPostThreadId: 1,
  countMakerActivity: 2,
  listMakerComments: 2,
  listMakerHistory: 2,
  listFeedLaunches: 2,
  eraseSubject: 4,
  subjectFootprint: 1,
  exportSubject: 2,
};

function mentions(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, body] of units()) {
    const n = code(body).match(TOUCHES_ALL)?.length ?? 0;
    if (n > 0) out[name] = n;
  }
  return out;
}

/** Whole rows, however they are spelled: `t.*`, a bare `*`, a row as JSON. */
const WHOLE_ROW = /\b\w+\.\*|(?:^|[\s,])\*\s*(?:,|$)|\bto_jsonb\s*\(|\brow_to_json\s*\(/m;

/** The select lists of a unit's statements: what it can hand back. Only the
 *  SQL (the template literals), so a comment's prose is not read as a query. */
function selected(body: string): string {
  const statements = [...body.matchAll(/`([^`]*)`/g)].map((m) => m[1]!);
  return statements
    .flatMap((statement) => [
      ...[...statement.matchAll(/SELECT([\s\S]*?)\bFROM\b/g)].map((m) => m[1]!),
      ...[...statement.matchAll(/RETURNING([\s\S]*)$/g)].map((m) => m[1]!),
    ])
    .join("\n");
}

describe("the privacy rule — every read of threads or posts is classified (design §7)", () => {
  it("finds the same units the classification names, no more and no fewer", () => {
    expect(touching().sort()).toEqual(Object.keys(CLASSIFIED).sort());
  });

  it("pins how many times each unit names those tables, so a statement added inside one is seen", () => {
    expect(
      mentions(),
      "A statement over threads, posts, post_votes or thread_mutes was added to or removed from repository.ts. " +
        "Read it, decide who may see what it returns, classify its unit in CLASSIFIED (and give a public read a case in PUBLIC_CASES), " +
        "then update MENTIONS.",
    ).toEqual(MENTIONS);
    expect(Object.keys(MENTIONS).sort()).toEqual(Object.keys(CLASSIFIED).sort());
    // Nothing before the first unit names them either.
    const first = SOURCE.search(/^(?: {4}async \w+\(| {0,2}(?:export )?(?:async )?function \w+\(|const [A-Z][A-Z0-9_]* = `)/m);
    expect(code(SOURCE.slice(0, first))).not.toMatch(TOUCHES);
  });

  it("names only real repository exports (and the one SQL constant)", () => {
    for (const name of Object.keys(CLASSIFIED)) {
      if (name === "PUBLIC_PRODUCT_POST_SELECT") continue;
      expect(typeof (repo as unknown as Record<string, unknown>)[name], name).toBe("function");
    }
  });

  it("every public read filters on the thread's visibility, in SQL", () => {
    const all = units();
    for (const [name, entry] of Object.entries(CLASSIFIED)) {
      if (entry.is !== "public") continue;
      const body = all.get(name)!;
      expect(body, `${name} must carry publicThread(…)`).toMatch(/\$\{publicThread\("\w+"\)\}/);
      // One filter per statement that names the threads table.
      const statements = body.match(/openproduct\.threads\b/g)?.length ?? 0;
      const filters = body.match(/\$\{publicThread\(/g)?.length ?? 0;
      expect(filters, `${name}: a filter for each statement over threads`).toBeGreaterThanOrEqual(statements);
      expect(body, `${name} is public and must not read by a reader`).not.toContain("privateThreadReadableBy(");
    }
  });

  it("everything that reads the public product-post select inherits its filter", () => {
    const all = units();
    const users = [...all].filter(([name, body]) => name !== "PUBLIC_PRODUCT_POST_SELECT" && body.includes("PUBLIC_PRODUCT_POST_SELECT"));
    expect(users.length).toBeGreaterThan(0);
    expect(all.get("PUBLIC_PRODUCT_POST_SELECT")).toMatch(/\$\{publicThread\("th"\)\}/);
  });

  it("the signed-in path is three reads, and each checks author-or-crew itself", () => {
    const all = units();
    const signedIn = Object.entries(CLASSIFIED).filter(([, e]) => e.is === "signed-in").map(([name]) => name);
    expect(signedIn.sort()).toEqual(["getPrivateThread", "listPrivatePosts", "listPrivateThreads"]);
    for (const name of signedIn) {
      const body = all.get(name)!;
      expect(body, name).toMatch(/async \w+\([^)]*readerSubjectId/);
      expect(body, name).toMatch(/\$\{privateThreadReadableBy\("t", "\$2"\)\}/);
    }
    // And the predicate is what the design says: the author, or the crew now.
    const predicate = all.get("privateThreadReadableBy")!;
    expect(predicate).toContain(".visibility = 'private'");
    expect(predicate).toContain(".author_subject_id = ${readerParam}");
    expect(predicate).toContain("openproduct.listing_maintainers");
    // Nothing else reads by it except the guarded writes and the export.
    const others = [...all]
      .filter(([name, body]) => name !== "privateThreadReadableBy" && body.includes("privateThreadReadableBy("))
      .map(([name]) => name)
      .sort();
    expect(others).toEqual(["createPost", "exportSubject", "getPrivateThread", "listPrivatePosts", "listPrivateThreads", "votePost"]);
  });

  it("a guarded write carries both predicates", () => {
    const all = units();
    for (const [name, entry] of Object.entries(CLASSIFIED)) {
      if (entry.is !== "guarded-write") continue;
      expect(all.get(name), name).toContain("publicThread(");
      expect(all.get(name), name).toContain("privateThreadReadableBy(");
    }
  });

  it("a write or an id lookup selects no title and no body", () => {
    const all = units();
    for (const [name, entry] of Object.entries(CLASSIFIED)) {
      if (entry.is !== "write" && entry.is !== "no-content" && entry.is !== "guarded-write") continue;
      const lists = selected(all.get(name)!);
      expect(lists, name).not.toMatch(/\b(title|body)\b/);
      // Nor a whole row, which would carry both without naming either.
      expect(lists, `${name} selects a whole row`).not.toMatch(WHOLE_ROW);
    }
  });

  it("the whole-row check sees each spelling, and lets a count through", () => {
    for (const list of [" t.* ", " * ", " id, * ", " *, id ", " to_jsonb(t) ", " row_to_json (p) AS row "]) {
      expect(list, list).toMatch(WHOLE_ROW);
    }
    for (const list of [" count(*) AS n ", " po.author_subject_id, po.thread_id, th.visibility ", " 1 ", " count( * ) "]) {
      expect(list, list).not.toMatch(WHOLE_ROW);
    }
  });

  it("the export names another thread's title only when it is public or readable now", () => {
    const body = units().get("exportSubject")!;
    const lookup = body.slice(body.indexOf("SELECT t.id, t.title, p.slug"));
    expect(lookup).toMatch(/\$\{publicThread\("t"\)\} OR \(\$\{privateThreadReadableBy\("t", "\$2"\)\}\)/);
  });

  it("no statement updates a thread's visibility", () => {
    expect(SOURCE).not.toMatch(/SET[^`;]*\bvisibility\s*=[^`]*openproduct\.threads|UPDATE openproduct\.threads[^`]*\bvisibility\s*=\s*(\$|')/);
    for (const [name, body] of units()) {
      if (!/UPDATE openproduct\.threads/.test(body)) continue;
      const sets = [...body.matchAll(/SET([\s\S]*?)WHERE/g)].map((m) => m[1]).join("\n");
      expect(sets, name).not.toContain("visibility");
    }
  });

  it("no statement moves a thread to another product, or a post to another thread", () => {
    // What each UPDATE of the two tables assigns: the text between its SET
    // and its WHERE. A private thread's readers are its author and the crew
    // of `profile_id`, and a post's are its thread's, so neither is assigned.
    const assigned = (table: string) =>
      [...units()].flatMap(([name, body]) =>
        [...body.matchAll(new RegExp(`UPDATE openproduct\\.${table}\\b[^\`]*?\\bSET\\b([^\`]*?)\\bWHERE\\b`, "g"))].map((m) => ({ name, set: m[1]! })),
      );
    const threads = assigned("threads");
    const posts = assigned("posts");
    // The scan finds the statements it is about (or it proves nothing).
    expect(threads.map((u) => u.name).sort()).toEqual(["createPost", "markAnswer", "setThreadResolved", "setThreadState"]);
    expect(posts.map((u) => u.name)).toEqual(["setPostModerationState"]);
    for (const { name, set } of threads) {
      expect(set, `${name} assigns threads.profile_id`).not.toMatch(/\bprofile_id\s*=/);
      expect(set, `${name} assigns threads.visibility`).not.toMatch(/\bvisibility\s*=/);
    }
    for (const { name, set } of posts) expect(set, `${name} assigns posts.thread_id`).not.toMatch(/\bthread_id\s*=/);
    // The erasure registry's UPDATE names its table and column at run time;
    // of these two tables the registry lists the author column and no more.
    expect(units().get("eraseSubject")!).toMatch(/UPDATE openproduct\.\$\{/);
    const registered = OPENPRODUCT_SUBJECT_REGISTRY.filter((entry) => entry.table === "threads" || entry.table === "posts");
    expect(registered.map((entry) => `${entry.table}.${entry.column}:${entry.alsoSet ?? ""}`).sort()).toEqual([
      "posts.author_subject_id:",
      "threads.author_subject_id:",
    ]);
  });

  it("no search-index statement reads a thread or a post", () => {
    for (const [name, body] of units()) {
      if (!body.includes("openproduct.search_index")) continue;
      expect(body, name).not.toMatch(/openproduct\.(threads|posts)\b/);
    }
  });
});

// ─── behaviour ────────────────────────────────────────────────────────────

const TITLE = "ZQPRIVATE-TITLE-7f3a91 where is the invoice";
const BODY = "ZQPRIVATE-BODY-c41d08 my account number is in here";
const CREW_REPLY = "ZQPRIVATE-CREW-9be2f5 here is the answer";
const MARKERS = ["ZQPRIVATE-TITLE", "ZQPRIVATE-BODY", "ZQPRIVATE-CREW"] as const;

const READER = "usr_11111111111111111111111111111111";
const THIRD = "usr_22222222222222222222222222222222";
const EX_CREW = "usr_33333333333333333333333333333333";

const THREAD = asUuid("aaaaaaaa-0000-4000-8000-00000000000a");
const POST_AUTHOR = asUuid("aaaaaaaa-0000-4000-8000-00000000000b");
const POST_CREW = asUuid("aaaaaaaa-0000-4000-8000-00000000000c");
const PUBLIC_THREAD = asUuid("aaaaaaaa-0000-4000-8000-00000000000d");
const PUBLIC_POST = asUuid("aaaaaaaa-0000-4000-8000-00000000000e");
const T1 = "2026-08-17T12:01:00.000Z";
const T2 = "2026-08-17T12:02:00.000Z";
const T3 = "2026-08-17T12:03:00.000Z";

/** A listed product whose crew is ACTOR, a private thread by READER with a
 *  post of theirs and a reply from the crew, and a public thread beside it. */
async function seedPrivate() {
  await seedPublished();
  expect(await repo.getListingRole(PROFILE, ACTOR)).not.toBeNull();
  expect(await repo.getListingRole(PROFILE, READER)).toBeNull();
  await repo.createThread({
    id: THREAD,
    profileId: PROFILE,
    tag: "question",
    title: TITLE,
    authorSubjectId: READER,
    at: NOW,
    kind: "question",
    visibility: "private",
  });
  expect(await repo.createPost({ id: POST_AUTHOR, threadId: THREAD, authorSubjectId: READER, body: BODY, at: T1 })).toBe(POST_AUTHOR);
  expect(await repo.createPost({ id: POST_CREW, threadId: THREAD, authorSubjectId: ACTOR, body: CREW_REPLY, at: T2 })).toBe(POST_CREW);
  await repo.createThread({
    id: PUBLIC_THREAD,
    profileId: PROFILE,
    tag: "question",
    title: "A public question",
    authorSubjectId: READER,
    at: NOW,
    kind: "issue",
  });
  await repo.createPost({ id: PUBLIC_POST, threadId: PUBLIC_THREAD, authorSubjectId: READER, body: "Public words.", at: T1 });
}

function clean(value: unknown, label: string) {
  const text = JSON.stringify(value) ?? "";
  for (const marker of MARKERS) expect(text, `${label} leaks ${marker}`).not.toContain(marker);
}

describe("the privacy rule — who reads a private thread (design §7)", () => {
  it("its author sees it: in their list, by id, with its posts", async () => {
    await seedPrivate();
    const list = await repo.listPrivateThreads(PROFILE, READER);
    expect(list.map((t) => t.id)).toEqual([THREAD]);
    expect(list[0]).toMatchObject({ title: TITLE, visibility: "private", kind: "question", postCount: 2, awaitingCrew: false });
    const one = await repo.getPrivateThread(THREAD, READER);
    expect(one).toMatchObject({ id: THREAD, title: TITLE, visibility: "private", slug: "acme-thing" });
    const posts = await repo.listPrivatePosts(THREAD, READER);
    expect(posts.map((p) => p.body)).toEqual([BODY, CREW_REPLY]);
  });

  it("the crew sees it — every private thread on their product", async () => {
    await seedPrivate();
    expect((await repo.listPrivateThreads(PROFILE, ACTOR)).map((t) => t.id)).toEqual([THREAD]);
    expect((await repo.getPrivateThread(THREAD, ACTOR))?.title).toBe(TITLE);
    expect((await repo.listPrivatePosts(THREAD, ACTOR)).length).toBe(2);
  });

  it("an author sees only their own; a second author's thread is not in the first's list", async () => {
    await seedPrivate();
    const other = asUuid("aaaaaaaa-0000-4000-8000-0000000000f0");
    await repo.createThread({ id: other, profileId: PROFILE, tag: "question", title: "THIRD-OWN", authorSubjectId: THIRD, at: T3, kind: "question", visibility: "private" });
    expect((await repo.listPrivateThreads(PROFILE, READER)).map((t) => t.id)).toEqual([THREAD]);
    expect((await repo.listPrivateThreads(PROFILE, THIRD)).map((t) => t.id)).toEqual([other]);
    expect((await repo.listPrivateThreads(PROFILE, ACTOR)).map((t) => t.id).sort()).toEqual([THREAD, other].sort());
    expect(await repo.getPrivateThread(THREAD, THIRD)).toBeNull();
  });

  it("a third signed-in person gets nothing — the same nothing as a thread that does not exist", async () => {
    await seedPrivate();
    const missing = asUuid("aaaaaaaa-0000-4000-8000-0000000000ff");
    expect(await repo.listPrivateThreads(PROFILE, THIRD)).toEqual([]);
    expect(await repo.getPrivateThread(THREAD, THIRD)).toBeNull();
    expect(await repo.getPrivateThread(missing, THIRD)).toBeNull();
    expect(await repo.listPrivatePosts(THREAD, THIRD)).toEqual([]);
    expect(await repo.listPrivatePosts(missing, THIRD)).toEqual([]);
  });

  it("the crew of ANOTHER product gets nothing", async () => {
    await seedPrivate();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "other-thing");
    await sql.execute(`DELETE FROM openproduct.listing_maintainers WHERE profile_id = $1`, [PROFILE_TWO]);
    await repo.addListingMaintainer(PROFILE_TWO, THIRD, "owner", ADMIN);
    expect(await repo.getPrivateThread(THREAD, THIRD)).toBeNull();
    expect(await repo.listPrivateThreads(PROFILE, THIRD)).toEqual([]);
    expect(await repo.listPrivateThreads(PROFILE_TWO, THIRD)).toEqual([]);
  });

  it("nobody — a reader with no identity — gets nothing from any read", async () => {
    await seedPrivate();
    expect(await repo.getThread(THREAD)).toBeNull();
    expect(await repo.listPosts(THREAD)).toEqual([]);
    expect(await repo.listPrivateThreads(PROFILE, "")).toEqual([]);
    expect(await repo.getPrivateThread(THREAD, "")).toBeNull();
    expect(await repo.listPrivatePosts(THREAD, "")).toEqual([]);
  });

  it("somebody who leaves the crew loses access at the next read", async () => {
    await seedPrivate();
    await repo.addListingMaintainer(PROFILE, EX_CREW, "maintainer", ACTOR);
    expect((await repo.getPrivateThread(THREAD, EX_CREW))?.title).toBe(TITLE);
    expect((await repo.listPrivatePosts(THREAD, EX_CREW)).length).toBe(2);
    // They reply while on the crew, and mute the thread.
    const theirs = asUuid("aaaaaaaa-0000-4000-8000-0000000000e1");
    expect(await repo.createPost({ id: theirs, threadId: THREAD, authorSubjectId: EX_CREW, body: "On it.", at: T3 })).toBe(theirs);
    await repo.setThreadMute(EX_CREW, THREAD, true);

    await sql.execute(`DELETE FROM openproduct.listing_maintainers WHERE profile_id = $1 AND subject_id = $2`, [PROFILE, EX_CREW]);

    expect(await repo.getPrivateThread(THREAD, EX_CREW)).toBeNull();
    expect(await repo.listPrivateThreads(PROFILE, EX_CREW)).toEqual([]);
    expect(await repo.listPrivatePosts(THREAD, EX_CREW)).toEqual([]);
    // No more words into it either.
    expect(
      await repo.createPost({ id: asUuid("aaaaaaaa-0000-4000-8000-0000000000e2"), threadId: THREAD, authorSubjectId: EX_CREW, body: "Still here?", at: T3 }),
    ).toBeNull();
    // Their export keeps their own reply and drops the author's title.
    const doc = await repo.exportSubject(EX_CREW, T3);
    const text = JSON.stringify(doc);
    expect(text).toContain("On it.");
    clean(doc, "an ex-crew member's export");
  });

  it("THE PRODUCT'S OWN LEAVE PATH: a crew member who deletes their account loses access, by the repository's own write", async () => {
    // Today exactly one act in the product removes somebody from a crew:
    // their own exit (`DELETE /me` → `eraseSubject`), which deletes their
    // `listing_maintainers` rows by the subject registry. Nothing else does:
    // no route adds or removes a maintainer, and no event the platform sends
    // says a person left a workspace. This test goes through that one write,
    // not through SQL of its own.
    await seedPrivate();
    await repo.addListingMaintainer(PROFILE, EX_CREW, "maintainer", ACTOR);
    const theirs = asUuid("aaaaaaaa-0000-4000-8000-0000000000e3");
    expect(await repo.createPost({ id: theirs, threadId: THREAD, authorSubjectId: EX_CREW, body: "On it.", at: T3 })).toBe(theirs);
    expect((await repo.getPrivateThread(THREAD, EX_CREW))?.title).toBe(TITLE);

    const erased = await repo.eraseSubject(EX_CREW, T3);
    expect(erased.columns["listing_maintainers.subject_id"]).toBe(1);

    expect(await repo.getListingRole(PROFILE, EX_CREW)).toBeNull();
    expect(await repo.getPrivateThread(THREAD, EX_CREW)).toBeNull();
    expect(await repo.listPrivateThreads(PROFILE, EX_CREW)).toEqual([]);
    expect(await repo.listPrivatePosts(THREAD, EX_CREW)).toEqual([]);
    expect(
      await repo.createPost({ id: asUuid("aaaaaaaa-0000-4000-8000-0000000000e4"), threadId: THREAD, authorSubjectId: EX_CREW, body: "Still here?", at: T3 }),
    ).toBeNull();
    expect(await repo.votePost(POST_AUTHOR, EX_CREW, T3)).toBe(false);
    clean(await repo.exportSubject(EX_CREW, T3), "an erased crew member's export");
    // The thread stands for the two who can still read it; the reply they
    // left is there, under nobody's name.
    expect((await repo.listPrivatePosts(THREAD, READER)).map((p) => p.body)).toEqual([BODY, CREW_REPLY, "On it."]);
    expect((await repo.listPrivatePosts(THREAD, ACTOR)).length).toBe(3);
  });

  it("an AUTHOR who deletes their account stops being its author: the thread is the crew's to read, and nobody else's", async () => {
    await seedPrivate();
    await repo.eraseSubject(READER, T3);
    expect(await repo.getPrivateThread(THREAD, READER)).toBeNull();
    expect(await repo.listPrivateThreads(PROFILE, READER)).toEqual([]);
    expect(await repo.listPrivatePosts(THREAD, READER)).toEqual([]);
    expect((await repo.getPrivateThread(THREAD, ACTOR))?.title).toBe(TITLE);
    expect(await repo.getThread(THREAD)).toBeNull();
  });

  it("says whether the last word is the crew's", async () => {
    await seedPrivate();
    const later = asUuid("aaaaaaaa-0000-4000-8000-0000000000d1");
    await repo.createPost({ id: later, threadId: THREAD, authorSubjectId: READER, body: "And another thing.", at: T3 });
    expect((await repo.listPrivateThreads(PROFILE, ACTOR))[0]?.awaitingCrew).toBe(true);
  });
});

/**
 * EVERY PUBLIC READ, ASKED FOR EVERYTHING IT WILL GIVE. One case per entry
 * `CLASSIFIED` calls public, keyed by the same name; the suite fails when a
 * public entry has no case here, so a read classified public later is run
 * against the private thread or the suite says it is not.
 */
const DAYS = ["2026-08-17", "2026-08-16", "2026-08-15"];
const PAGE = { cursor: null, limit: 100 } as const;
const PUBLIC_CASES: Readonly<Record<string, () => Promise<unknown[]>>> = {
  PUBLIC_PRODUCT_POST_SELECT: async () => [
    await repo.listPublicProductPosts(PAGE),
    await repo.listPublicProductPostsForProfile(PROFILE, PAGE),
    await repo.listPublicProductPostsByAuthor(READER, PAGE),
    await repo.listPublicProductPostsByAuthor(ACTOR, PAGE),
  ],
  listThreads: async () => [
    await repo.listThreads(PROFILE, null, 100),
    await repo.listThreads(PROFILE, "question", 100),
  ],
  getLaunchThread: async () => [await repo.getLaunchThread(PROFILE)],
  getThread: async () => [await repo.getThread(THREAD)],
  listForumThreads: async () => [
    await repo.listForumThreads({ tag: null, order: "latest", limit: 100 }),
    await repo.listForumThreads({ tag: null, order: "replied", limit: 100 }),
    await repo.listForumThreads({ tag: "question", order: "latest", limit: 100 }),
  ],
  listRecentlyRepliedThreads: async () => [await repo.listRecentlyRepliedThreads(20)],
  listPosts: async () => [await repo.listPosts(THREAD, 500)],
  countMakerActivity: async () => [
    await repo.countMakerActivity(READER),
    await repo.countMakerActivity(ACTOR),
    await repo.countMakerActivity(THIRD),
  ],
  listMakerComments: async () => [
    await repo.listMakerComments(READER, 100),
    await repo.listMakerComments(ACTOR, 100),
    await repo.listMakerComments(THIRD, 100),
  ],
  listMakerHistory: async () => [
    await repo.listMakerHistory(READER, 100, null),
    await repo.listMakerHistory(ACTOR, 100, null),
    await repo.listMakerHistory(THIRD, 100, null),
  ],
  listFeedLaunches: async () => [await repo.listFeedLaunches(DAYS)],
};

/** No marker, and no trace of the private thread's or its posts' ids. */
function absent(value: unknown, label: string) {
  clean(value, label);
  const text = JSON.stringify(value) ?? "";
  for (const id of [THREAD, POST_AUTHOR, POST_CREW]) expect(text, `${label} names ${id}`).not.toContain(id);
}

describe("the privacy rule — a private thread is in no public read (design §7.1)", () => {
  it("has a behavioural case for every read classified public, and for nothing else", () => {
    const classified = Object.entries(CLASSIFIED).filter(([, entry]) => entry.is === "public").map(([name]) => name);
    expect(Object.keys(PUBLIC_CASES).sort()).toEqual(classified.sort());
  });

  it("every read classified public returns nothing of a private thread: not its words, not its ids", async () => {
    await seedPrivate();
    for (const [name, entry] of Object.entries(CLASSIFIED)) {
      if (entry.is !== "public") continue;
      const run = PUBLIC_CASES[name];
      expect(run, `${name} is classified public and has no case in PUBLIC_CASES`).toBeTypeOf("function");
      const results = await run!();
      expect(results.length, name).toBeGreaterThan(0);
      results.forEach((result, i) => absent(result, `${name}[${i}]`));
    }
  });

  it("is absent from every public read of threads and posts, and from the counts", async () => {
    await seedPrivate();
    const threads = await repo.listThreads(PROFILE, null, 100);
    expect(threads.map((t) => t.id)).toEqual([PUBLIC_THREAD]);
    clean(threads, "listThreads");
    clean(await repo.listThreads(PROFILE, "question", 100), "listThreads(tag)");
    clean(await repo.getLaunchThread(PROFILE), "getLaunchThread");
    clean(await repo.getThread(THREAD), "getThread");
    clean(await repo.listPosts(THREAD, 500), "listPosts");
    for (const order of ["latest", "replied"] as const) {
      const forum = await repo.listForumThreads({ tag: null, order, limit: 100 });
      expect(forum.map((t) => t.id)).toEqual([PUBLIC_THREAD]);
      clean(forum, `listForumThreads(${order})`);
    }
    const replied = await repo.listRecentlyRepliedThreads(20);
    expect(replied.map((t) => t.threadId)).toEqual([PUBLIC_THREAD]);
    clean(replied, "listRecentlyRepliedThreads");

    // A person's public page: the AUTHOR'S own, and the crew member's. The
    // author wrote one public post and one private one; one is counted.
    for (const subject of [READER, ACTOR, THIRD]) {
      const counts = await repo.countMakerActivity(subject);
      expect(counts.comments, `comments of ${subject}`).toBe(subject === READER ? 1 : 0);
      clean(await repo.listMakerComments(subject, 100), "listMakerComments");
      const history = await repo.listMakerHistory(subject, 100, null);
      clean(history, "listMakerHistory");
      expect(history.filter((row) => row.kind === "commented").length).toBe(subject === READER ? 1 : 0);
    }
    const comments = await repo.listMakerComments(READER, 100);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({ comments: 1, threadId: PUBLIC_THREAD });
  });

  it("is not counted beside a launch, and not named in the search index", async () => {
    await seedPrivate();
    const days = ["2026-08-17", "2026-08-16", "2026-08-15"];
    const launches = await repo.listFeedLaunches(days);
    clean(launches, "listFeedLaunches");
    for (const row of launches) expect(row.commentCount).toBeLessThanOrEqual(1);
    const index = await sql.execute<{ row: unknown }>(`SELECT row_to_json(s) AS row FROM openproduct.search_index s`);
    clean(index.rows, "search_index");
  });

  it("is absent from another person's export, and present in its author's own", async () => {
    await seedPrivate();
    clean(await repo.exportSubject(THIRD, T3), "a third person's export");
    // A stranger who mutes the id learns nothing from their own export.
    await repo.setThreadMute(THIRD, THREAD, true);
    const muted = await repo.exportSubject(THIRD, T3);
    clean(muted, "a third person's export after muting the id");
    // The author's export is their own words.
    const own = JSON.stringify(await repo.exportSubject(READER, T3));
    expect(own).toContain("ZQPRIVATE-TITLE");
    expect(own).toContain("ZQPRIVATE-BODY");
    // The crew member's export holds their own reply, and may name the
    // thread: they can read it.
    const crew = JSON.stringify(await repo.exportSubject(ACTOR, T3));
    expect(crew).toContain("ZQPRIVATE-CREW");
    expect(crew).not.toContain("ZQPRIVATE-BODY");
  });

  it("takes no post and no vote from somebody who cannot read it", async () => {
    await seedPrivate();
    const before = await sql.execute<{ last_post_at: string }>(`SELECT last_post_at FROM openproduct.threads WHERE id = $1`, [THREAD]);
    expect(
      await repo.createPost({ id: asUuid("aaaaaaaa-0000-4000-8000-0000000000c1"), threadId: THREAD, authorSubjectId: THIRD, body: "Let me in.", at: T3 }),
    ).toBeNull();
    const after = await sql.execute<{ last_post_at: string }>(`SELECT last_post_at FROM openproduct.threads WHERE id = $1`, [THREAD]);
    expect(after.rows[0]?.last_post_at).toEqual(before.rows[0]?.last_post_at);
    expect(await repo.votePost(POST_AUTHOR, THIRD, T3)).toBe(false);
    expect((await repo.countPostVotes([POST_AUTHOR])).get(POST_AUTHOR)).toBeUndefined();
    // The crew may vote on the author's post; a public post takes anybody's.
    expect(await repo.votePost(POST_AUTHOR, ACTOR, T3)).toBe(true);
    expect(await repo.votePost(PUBLIC_POST, THIRD, T3)).toBe(true);
  });
});

describe("the privacy rule — what the schema holds (2280)", () => {
  it("refuses to make a private thread public, and allows nothing else to change it", async () => {
    await seedPrivate();
    await expect(
      sql.execute(`UPDATE openproduct.threads SET visibility = 'public' WHERE id = $1`, [THREAD]),
    ).rejects.toThrow();
    const row = await sql.execute<{ visibility: string }>(`SELECT visibility FROM openproduct.threads WHERE id = $1`, [THREAD]);
    expect(row.rows[0]?.visibility).toBe("private");
    // Locking a private thread — an update of other columns — still works.
    expect(await repo.setThreadState(THREAD, "locked", ["open"])).toBe(true);
    expect((await repo.getPrivateThread(THREAD, READER))?.state).toBe("locked");
  });

  it("refuses private → public however the statement is written, and says why", async () => {
    await seedPrivate();
    // The trigger is on every update of the row, not on a column list.
    await refused(
      () => sql.execute(`UPDATE openproduct.threads SET visibility = 'public' WHERE id = $1`, [THREAD]),
      "a private thread cannot be made public",
    );
    await refused(
      () => sql.execute(`UPDATE openproduct.threads SET (title, visibility) = (title, 'public') WHERE id = $1`, [THREAD]),
      "a private thread cannot be made public",
    );
    // private → private, and public → private, are not refused by it.
    await sql.execute(`UPDATE openproduct.threads SET visibility = 'private' WHERE id = $1`, [THREAD]);
    await sql.execute(`UPDATE openproduct.threads SET visibility = 'private' WHERE id = $1`, [PUBLIC_THREAD]);
    expect(await repo.getThread(PUBLIC_THREAD)).toBeNull();
  });

  it("refuses to move a private thread to another product; a public one may move", async () => {
    await seedPrivate();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "other-thing");
    await refused(
      () => sql.execute(`UPDATE openproduct.threads SET profile_id = $2 WHERE id = $1`, [THREAD, PROFILE_TWO]),
      "a private thread cannot be moved to another product",
    );
    await refused(
      () => sql.execute(`UPDATE openproduct.threads SET profile_id = NULL WHERE id = $1`, [THREAD]),
      "a private thread cannot be moved to another product",
    );
    const row = await sql.execute<{ profile_id: string }>(`SELECT profile_id FROM openproduct.threads WHERE id = $1`, [THREAD]);
    expect(row.rows[0]?.profile_id).toBe(PROFILE);
    // The other product's crew still reads nothing.
    await sql.execute(`DELETE FROM openproduct.listing_maintainers WHERE profile_id = $1`, [PROFILE_TWO]);
    await repo.addListingMaintainer(PROFILE_TWO, THIRD, "owner", ADMIN);
    expect(await repo.getPrivateThread(THREAD, THIRD)).toBeNull();
    // The rule is about private threads: the schema does not pin a public one.
    await sql.execute(`UPDATE openproduct.threads SET profile_id = $2 WHERE id = $1`, [PUBLIC_THREAD, PROFILE_TWO]);
  });

  it("refuses to move a post to another thread — out of a private thread, into one, or between public ones", async () => {
    await seedPrivate();
    const other = asUuid("aaaaaaaa-0000-4000-8000-0000000000b1");
    await repo.createThread({ id: other, profileId: PROFILE, tag: "question", title: "Another public one", authorSubjectId: READER, at: T3, kind: "question" });
    const move = (post: string, to: string) => () =>
      sql.execute(`UPDATE openproduct.posts SET thread_id = $2 WHERE id = $1`, [post, to]);
    await refused(move(POST_AUTHOR, PUBLIC_THREAD), "a post cannot be moved to another thread");
    await refused(move(PUBLIC_POST, THREAD), "a post cannot be moved to another thread");
    await refused(move(PUBLIC_POST, other), "a post cannot be moved to another thread");
    const rows = await sql.execute<{ id: string; thread_id: string }>(
      `SELECT id, thread_id FROM openproduct.posts WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [[POST_AUTHOR, PUBLIC_POST]],
    );
    expect(rows.rows).toEqual([
      { id: POST_AUTHOR, thread_id: THREAD },
      { id: PUBLIC_POST, thread_id: PUBLIC_THREAD },
    ]);
    // The private words are still in no public read.
    clean(await repo.listPosts(PUBLIC_THREAD, 500), "listPosts after a refused move");
    // Every other update of a post still works: moderation's, and the exit's.
    expect(await repo.setPostModerationState(POST_CREW, "removed", T3)).toBe(true);
    expect((await repo.eraseSubject(READER, T3)).columns["posts.author_subject_id"]).toBe(2);
  });

  it("the migration can be applied again over itself", async () => {
    await seedPrivate();
    const up = readFileSync(
      fileURLToPath(new URL("../migrations/2280_openproduct_thread_visibility/up.sql", import.meta.url)),
      "utf8",
    );
    await db.exec(up);
    await refused(
      () => sql.execute(`UPDATE openproduct.threads SET visibility = 'public' WHERE id = $1`, [THREAD]),
      "a private thread cannot be made public",
    );
    const triggers = await sql.execute<{ tgname: string }>(
      `SELECT tgname FROM pg_trigger
        WHERE NOT tgisinternal AND tgname IN ('threads_private_stays_private', 'posts_thread_is_fixed')
        ORDER BY tgname`,
    );
    expect(triggers.rows.map((r) => r.tgname)).toEqual(["posts_thread_is_fixed", "threads_private_stays_private"]);
  });

  it("every older thread is public, with no kind", async () => {
    await seedPublished();
    await sql.execute(
      `INSERT INTO openproduct.threads (id, profile_id, tag, title, author_subject_id) VALUES ($1, $2, 'design', 'Old', $3)`,
      [PUBLIC_THREAD, PROFILE, READER],
    );
    expect(await repo.getThread(PUBLIC_THREAD)).toMatchObject({ visibility: "public", kind: null, resolvedAt: null });
  });

  it("refuses an unknown visibility or kind, and a private system thread", async () => {
    await seedPublished();
    const insert = (cols: Record<string, string>) =>
      sql.execute(
        `INSERT INTO openproduct.threads (id, profile_id, tag, title, author_subject_id, visibility, kind)
         VALUES ($1, $2, $3, 'T', $4, $5, $6)`,
        [PUBLIC_THREAD, PROFILE, cols.tag ?? "question", READER, cols.visibility ?? "public", cols.kind ?? null],
      );
    await expect(insert({ visibility: "crew" })).rejects.toThrow();
    await expect(insert({ kind: "rant" })).rejects.toThrow();
    await expect(insert({ visibility: "private", tag: "launch" })).rejects.toThrow();
    await expect(insert({ visibility: "private", tag: "post" })).rejects.toThrow();
    await expect(insert({ visibility: "private", kind: "suggestion" })).resolves.toBeDefined();
  });

  it("resolves an issue and only an issue; the moment is on the public read", async () => {
    await seedPrivate();
    expect(await repo.setThreadResolved(PUBLIC_THREAD, T3)).toBe(true);
    expect((await repo.getThread(PUBLIC_THREAD))?.resolvedAt).toBe(T3);
    expect((await repo.listThreads(PROFILE, null, 10))[0]?.resolvedAt).toBe(T3);
    expect(await repo.setThreadResolved(PUBLIC_THREAD, null)).toBe(true);
    expect((await repo.getThread(PUBLIC_THREAD))?.resolvedAt).toBeNull();
    // The private thread is a question.
    expect(await repo.setThreadResolved(THREAD, T3)).toBe(false);
  });
});
