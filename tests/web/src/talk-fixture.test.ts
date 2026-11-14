// The fixture gateway's privacy rule for private threads (openproduct-redesign
// OPR-4, design §7).
//
// `tests/web-perf/src/fixture.mjs` stands in for the gateway and core in
// every browser lane. If it served a private thread to the wrong reader, the
// lanes would be walking a product that leaks and proving nothing — so the
// rule the lanes rely on is held here, against the fixture itself, with the
// marker strings the leak lane looks for:
//
//   * a private thread is in NO public answer, and its id is a 404 there;
//   * the signed-in routes answer BY THE BEARER: the author and the crew get
//     the thread; another signed-in person and no bearer at all get the 404
//     a missing thread gets, with the same body;
//   * what it answers is the contract's key sets, and the rows that tell
//     somebody about a private thread carry no title and no text.

import {
  CREW_NEEDS_YOU_KEYS,
  CREW_PRIVATE_THREAD_NOTICE_KEYS,
  INBOX_ITEM_KEYS,
  PRIVATE_THREAD_KEYS,
  PRODUCT_POST_API,
  PUBLIC_POST_KEYS,
  PUBLIC_THREAD_KEYS,
  TALK_API,
  inboxHref,
  inboxSentence,
  type InboxItem,
} from "@openproduct/contracts";

import { fetchPrivateThread, fetchPrivateThreads, replyPrivately, setThreadResolved, startThread } from "@openproduct-web/app/talk/talk-api";

interface Gateway {
  url: string;
  unmatched: string[];
  privateAsks: Array<{ path: string; token: string | null }>;
  close(): Promise<void>;
}
interface Fixture {
  startGateway(): Promise<Gateway>;
  resetTalk(): void;
  SAMPLE_SLUG: string;
  SAMPLE_IDEA_SLUG: string;
  SAMPLE_THREAD: string;
  SAMPLE_ISSUE_THREAD: string;
  SAMPLE_OPEN_ISSUE_THREAD: string;
  SAMPLE_PRIVATE_THREAD: string;
  STARTED_PRIVATE_THREAD: string;
  PRIVATE_MARKER: string;
  PRIVATE_MARKERS: { title: string; body: string; reply: string };
  READER_TOKEN: string;
  THIRD_TOKEN: string;
  CREW_SLUG: string;
  CREW_ORG: string;
  CREW_PROFILE: string;
  SAMPLE_HANDLE: string;
  SAMPLE_WEEK: string;
}

const FIXTURE_PATH = "../../web-perf/src/fixture.mjs";
const CREW = "tok_walk";

let fixture: Fixture;
let gateway: Gateway;
const realBase = process.env.NEXT_PUBLIC_OPENPRODUCT_API_URL;

beforeAll(async () => {
  fixture = (await import(FIXTURE_PATH)) as Fixture;
  gateway = await fixture.startGateway();
  process.env.NEXT_PUBLIC_OPENPRODUCT_API_URL = gateway.url;
});

afterAll(async () => {
  await gateway.close();
  if (realBase === undefined) delete process.env.NEXT_PUBLIC_OPENPRODUCT_API_URL;
  else process.env.NEXT_PUBLIC_OPENPRODUCT_API_URL = realBase;
});

beforeEach(() => fixture.resetTalk());

async function raw(path: string, token: string | null, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${gateway.url}${path}`, {
    method: init.method ?? "GET",
    headers: {
      accept: "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  return { status: res.status, text: await res.text() };
}

const keys = (value: object) => Object.keys(value).sort();

describe("a private thread is in no public answer", () => {
  it("every public route the fixture answers is free of the markers", async () => {
    const P = "/v1/public/openproduct";
    const paths = [
      `${P}/projects/${fixture.CREW_SLUG}/threads`,
      `${P}/projects/${fixture.SAMPLE_IDEA_SLUG}/threads`,
      `${P}/projects/${fixture.CREW_SLUG}`,
      `${P}/threads`,
      `${P}/threads?order=replied`,
      `${P}/threads/${fixture.SAMPLE_THREAD}`,
      `${P}/threads/${fixture.SAMPLE_ISSUE_THREAD}`,
      `${P}/people/${fixture.SAMPLE_HANDLE}/tab/comments`,
      `${P}/people/${fixture.SAMPLE_HANDLE}/tab/history`,
      `${P}/product-posts`,
      `${P}/sidebar`,
      `${P}/digest`,
      `${P}/digest/${fixture.SAMPLE_WEEK}`,
      "/v1/search?q=invoice",
      `/v1/search?q=${fixture.PRIVATE_MARKER}`,
    ];
    for (const path of paths) {
      // Asked as nobody, and asked with the AUTHOR'S and the CREW'S bearer:
      // a public path gives a private thread to none of them.
      for (const token of [null, fixture.READER_TOKEN, CREW]) {
        const res = await raw(path, token);
        expect([path, token, res.text.includes(fixture.PRIVATE_MARKER)]).toEqual([path, token, false]);
      }
    }
  });

  it("the private thread's id is a 404 on the public thread read — the 404 an id never issued gets", async () => {
    const real = await raw(`/v1/public/openproduct/threads/${fixture.SAMPLE_PRIVATE_THREAD}`, null);
    const never = await raw("/v1/public/openproduct/threads/0b0b0b0b-0000-4000-8000-00000000ffff", null);
    expect([real.status, never.status]).toEqual([404, 404]);
    expect(real.text).toBe(never.text);
    // …with the crew's bearer too: the public branch does not know anybody.
    expect((await raw(`/v1/public/openproduct/threads/${fixture.SAMPLE_PRIVATE_THREAD}`, CREW)).status).toBe(404);
  });

  it("public threads carry the pinned keys, a kind, and no visibility", async () => {
    const res = await raw(`/v1/public/openproduct/projects/${fixture.SAMPLE_IDEA_SLUG}/threads`, null);
    const threads = (JSON.parse(res.text) as { data: { threads: Array<Record<string, unknown>> } }).data.threads;
    expect(threads.map((thread) => thread.kind)).toEqual(["question", "issue"]);
    for (const thread of threads) {
      expect(keys(thread)).toEqual([...PUBLIC_THREAD_KEYS].sort());
      expect(thread).not.toHaveProperty("visibility");
    }
    // The issue was resolved by its crew, and says so to everybody.
    expect(threads[1]!.resolvedAt).not.toBeNull();
  });
});

describe("the signed-in routes answer by the bearer", () => {
  it("the author sees their own; the crew sees it too; each in the pinned shape", async () => {
    const author = await fetchPrivateThreads(fixture.READER_TOKEN, fixture.CREW_SLUG);
    expect(author?.crew).toBe(false);
    expect(author?.threads.map((thread) => thread.id)).toEqual([fixture.SAMPLE_PRIVATE_THREAD]);
    expect(author?.threads[0]).toMatchObject({ mine: true, visibility: "private", title: fixture.PRIVATE_MARKERS.title });
    expect(keys(author!.threads[0]!)).toEqual([...PRIVATE_THREAD_KEYS]);

    const crew = await fetchPrivateThreads(CREW, fixture.CREW_SLUG);
    expect(crew?.crew).toBe(true);
    expect(crew?.threads[0]).toMatchObject({ id: fixture.SAMPLE_PRIVATE_THREAD, mine: false });

    const doc = await fetchPrivateThread(CREW, fixture.SAMPLE_PRIVATE_THREAD);
    expect(doc?.slug).toBe(fixture.CREW_SLUG);
    expect(doc?.posts.map((post) => post.authorIsMaintainer)).toEqual([false, true]);
    for (const post of doc!.posts) expect(keys(post)).toEqual([...PUBLIC_POST_KEYS].sort());
  });

  it("a third signed-in person gets an empty list and the one 404 — as nobody does, and as a missing id does", async () => {
    expect(await fetchPrivateThreads(fixture.THIRD_TOKEN, fixture.CREW_SLUG)).toEqual({ crew: false, threads: [] });
    expect(await fetchPrivateThread(fixture.THIRD_TOKEN, fixture.SAMPLE_PRIVATE_THREAD)).toBeNull();

    const path = TALK_API.privateThread(fixture.SAMPLE_PRIVATE_THREAD);
    const third = await raw(path, fixture.THIRD_TOKEN);
    const nobody = await raw(path, null);
    const never = await raw(TALK_API.privateThread("0b0b0b0b-0000-4000-8000-00000000ffff"), CREW);
    expect([third.status, nobody.status, never.status]).toEqual([404, 404, 404]);
    expect(third.text).toBe(nobody.text);
    expect(third.text).toBe(never.text);
    expect(third.text).not.toContain(fixture.PRIVATE_MARKER);
    // The list, with no bearer, is the gateway's 404 too.
    expect((await raw(TALK_API.privateThreads(fixture.CREW_SLUG), null)).status).toBe(404);
  });

  it("takes a reply from the author and the crew, and none from anybody else", async () => {
    expect((await replyPrivately(fixture.THIRD_TOKEN, fixture.SAMPLE_PRIVATE_THREAD, "Let me in.")).kind).toBe("missing");
    expect((await fetchPrivateThread(CREW, fixture.SAMPLE_PRIVATE_THREAD))?.posts).toHaveLength(2);
    expect((await replyPrivately(CREW, fixture.SAMPLE_PRIVATE_THREAD, "Anything else?")).kind).toBe("ok");
    const after = await fetchPrivateThread(fixture.READER_TOKEN, fixture.SAMPLE_PRIVATE_THREAD);
    expect(after?.posts).toHaveLength(3);
    expect(after?.posts.at(-1)?.authorIsMaintainer).toBe(true);
  });

  it("a private thread somebody starts is theirs and the crew's — and no third person's", async () => {
    const started = await startThread(fixture.THIRD_TOKEN, {
      slug: fixture.CREW_SLUG,
      title: "A thread of my own",
      kind: "issue",
      visibility: "private",
    });
    expect(started).toEqual({ kind: "ok", data: { threadId: fixture.STARTED_PRIVATE_THREAD, visibility: "private" } });
    // Its author sees it in their list and at its address…
    const mine = await fetchPrivateThreads(fixture.THIRD_TOKEN, fixture.CREW_SLUG);
    expect(mine?.threads.map((thread) => [thread.id, thread.mine, thread.kind])).toEqual([
      [fixture.STARTED_PRIVATE_THREAD, true, "issue"],
    ]);
    expect((await fetchPrivateThread(fixture.THIRD_TOKEN, fixture.STARTED_PRIVATE_THREAD))?.thread.title).toBe("A thread of my own");
    // …the crew sees it under the product's private threads, as not theirs…
    const crew = await fetchPrivateThreads(CREW, fixture.CREW_SLUG);
    expect(crew?.threads.map((thread) => [thread.id, thread.mine])).toEqual([
      [fixture.STARTED_PRIVATE_THREAD, false],
      [fixture.SAMPLE_PRIVATE_THREAD, false],
    ]);
    // …and the crew resolves it, because it is an issue; its author then
    // reads it resolved.
    expect((await setThreadResolved(fixture.THIRD_TOKEN, fixture.STARTED_PRIVATE_THREAD, true)).kind).toBe("missing");
    expect((await setThreadResolved(CREW, fixture.STARTED_PRIVATE_THREAD, true)).kind).toBe("ok");
    expect((await fetchPrivateThread(fixture.THIRD_TOKEN, fixture.STARTED_PRIVATE_THREAD))?.thread.resolvedAt).not.toBeNull();
    // …and the OTHER non-crew walker does not see it, anywhere.
    expect(await fetchPrivateThread(fixture.READER_TOKEN, fixture.STARTED_PRIVATE_THREAD)).toBeNull();
    const theirs = await fetchPrivateThreads(fixture.READER_TOKEN, fixture.CREW_SLUG);
    expect(theirs?.threads.map((thread) => thread.id)).toEqual([fixture.SAMPLE_PRIVATE_THREAD]);
  });

  it("only the crew resolves an issue; anybody else gets the missing answer; everybody then reads it resolved", async () => {
    const open = async () => {
      const res = await raw(`/v1/public/openproduct/threads/${fixture.SAMPLE_OPEN_ISSUE_THREAD}`, null);
      return (JSON.parse(res.text) as { data: { thread: { resolvedAt: string | null }; slug: string } }).data;
    };
    expect((await open()).thread.resolvedAt).toBeNull();
    expect((await open()).slug).toBe(fixture.CREW_SLUG);
    expect((await setThreadResolved(fixture.READER_TOKEN, fixture.SAMPLE_OPEN_ISSUE_THREAD, true)).kind).toBe("missing");
    expect((await open()).thread.resolvedAt).toBeNull();
    expect((await setThreadResolved(CREW, fixture.SAMPLE_OPEN_ISSUE_THREAD, true)).kind).toBe("ok");
    // The PUBLIC read — no bearer — now says resolved, on the thread and in
    // the product's list.
    expect((await open()).thread.resolvedAt).not.toBeNull();
    const list = await raw(`/v1/public/openproduct/projects/${fixture.CREW_SLUG}/threads`, null);
    const threads = (JSON.parse(list.text) as { data: { threads: Array<{ id: string; resolvedAt: string | null }> } }).data.threads;
    expect(threads.find((thread) => thread.id === fixture.SAMPLE_OPEN_ISSUE_THREAD)?.resolvedAt).not.toBeNull();
    expect(await setThreadResolved(CREW, fixture.SAMPLE_OPEN_ISSUE_THREAD, false)).toEqual({ kind: "ok", data: { resolvedAt: null } });
    expect((await open()).thread.resolvedAt).toBeNull();
  });

  it("records every ask for a private thread with its bearer — the leak lane's receipt", async () => {
    const before = gateway.privateAsks.length;
    await raw(TALK_API.privateThread(fixture.SAMPLE_PRIVATE_THREAD), null);
    await raw(TALK_API.privateThreads(fixture.CREW_SLUG), CREW);
    expect(gateway.privateAsks.slice(before).map((ask) => ask.token)).toEqual([null, CREW]);
    // A public read is never one of them.
    await raw(`/v1/public/openproduct/projects/${fixture.CREW_SLUG}/threads`, CREW);
    expect(gateway.privateAsks.length).toBe(before + 2);
  });
});

describe("what tells somebody about a private thread holds none of it", () => {
  it("the crew's Needs you row: who and when, in the pinned keys", async () => {
    const res = await raw(PRODUCT_POST_API.crewNeedsYou(fixture.CREW_ORG, fixture.CREW_PROFILE), CREW);
    const needsYou = (JSON.parse(res.text) as { data: { needsYou: Record<string, unknown[]> } }).data.needsYou;
    expect(keys(needsYou)).toEqual([...CREW_NEEDS_YOU_KEYS]);
    expect(needsYou.threads).toHaveLength(1);
    expect(keys(needsYou.threads![0] as object)).toEqual([...CREW_PRIVATE_THREAD_NOTICE_KEYS]);
    expect(res.text).not.toContain(fixture.PRIVATE_MARKER);
    // And the crew's door is not open to the other walkers.
    for (const token of [fixture.READER_TOKEN, fixture.THIRD_TOKEN]) {
      expect((await raw(PRODUCT_POST_API.crewNeedsYou(fixture.CREW_ORG, fixture.CREW_PROFILE), token)).status).toBe(404);
    }
  });

  it("the Activity rows: the author hears of the crew's reply, the crew of the thread, a third person of nothing", async () => {
    const inbox = async (token: string) => {
      const res = await raw("/v1/openproduct/me/notifications", token);
      expect(res.text).not.toContain(fixture.PRIVATE_MARKER);
      return (JSON.parse(res.text) as { data: { items: InboxItem[] } }).data.items;
    };
    const author = (await inbox(fixture.READER_TOKEN)).filter((item) => item.targetKind === "thread");
    expect(author.map((item) => item.kind)).toEqual(["thread.private.answered"]);
    expect(keys(author[0]!)).toEqual([...INBOX_ITEM_KEYS]);
    expect(inboxSentence(author[0]!)).toBe(`@${fixture.SAMPLE_HANDLE} replied to your private thread on ${fixture.CREW_SLUG}.`);
    expect(inboxHref(author[0]!)).toBe(`/threads/private/${fixture.SAMPLE_PRIVATE_THREAD}`);

    const crew = (await inbox(CREW)).filter((item) => item.targetKind === "thread");
    expect(crew.map((item) => item.kind)).toEqual(["thread.private"]);
    expect(inboxSentence(crew[0]!)).toBe(`Somebody started a private thread on ${fixture.CREW_SLUG}.`);

    expect((await inbox(fixture.THIRD_TOKEN)).filter((item) => item.targetKind === "thread")).toEqual([]);
  });

  it("the overlay says who is on the crew by the bearer: the two other walkers are on none", async () => {
    const crewOf = async (token: string) => {
      const res = await raw(`/v1/openproduct/me/overlay?ids=${fixture.CREW_SLUG}`, token);
      return (JSON.parse(res.text) as { data: { overlay: { crew: unknown[] } } }).data.overlay.crew.length;
    };
    expect(await crewOf(CREW)).toBe(1);
    expect(await crewOf(fixture.READER_TOKEN)).toBe(0);
    expect(await crewOf(fixture.THIRD_TOKEN)).toBe(0);
  });
});
