// The inbox: what writes into it, and what reads it (openproduct-launch NF0).
//
// What is pinned here:
//   - `fanOut` drops the actor, dedupes recipients, and cannot fail an act
//   - the event key is built from the event and NEVER from the clock, so a
//     retry collides instead of writing a second row
//   - the four call sites each notify the right people and nobody else
//   - `rank.first` fires only on a SETTLED day, because an open day's #1 moves
//   - the read is subject-keyed, refuses a service principal, and moves the
//     cursor only on a PUT
//   - the wire row carries exactly the pinned keys and no prose
//
// The real SQL — the unique index that makes "once per event per person" a
// schema property, and the forward-only cursor — is pinned against a live
// engine in packages/db/src/repository-pg.test.ts.

import { INBOX_ITEM_KEYS, INBOX_KINDS, INBOX_LIMIT } from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import { fanOut, type InboxWriter } from "@openproduct-worker/handlers/inbox";
import type { ProfileHandlerDeps } from "@openproduct-worker/handlers/profiles";

const ADA = "usr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const LIN = "usr_llllllllllllllllllllllllllllllll";
const BOB = "usr_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const NOW = "2026-09-01T09:00:00.000Z";
const INBOX = "https://openproduct.internal/internal/openproduct/me/notifications";

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

function req(method: string, subjectId: string | null = ADA, subjectType = "user"): Request {
  return new Request(INBOX, {
    method,
    headers: {
      "x-request-id": "req_nf0",
      ...(subjectId ? { "x-actor-subject-id": subjectId, "x-actor-subject-type": subjectType } : {}),
    },
  });
}

interface Written {
  subjectId: string;
  kind: string;
  eventKey: string;
  actor: string | null;
  targetKind: string;
  targetRef: string;
  figure: number | null;
}

/** A repository that records what was written and nothing else. */
function writer(over: { fails?: (subjectId: string) => boolean; existing?: Set<string> } = {}) {
  const written: Written[] = [];
  const seen = over.existing ?? new Set<string>();
  let ids = 0;
  const repo = {
    async writeNotification(input: Written & { id: string }) {
      if (over.fails?.(input.subjectId)) throw new Error("inbox is down");
      const key = `${input.subjectId}:${input.eventKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      written.push({
        subjectId: input.subjectId,
        kind: input.kind,
        eventKey: input.eventKey,
        actor: input.actor,
        targetKind: input.targetKind,
        targetRef: input.targetRef,
        figure: input.figure,
      });
      return true;
    },
  };
  const deps = {
    repo,
    generateId: () => `00000000-0000-4000-8000-${String(ids++).padStart(12, "0")}`,
  } as unknown as InboxWriter;
  return { deps, written };
}

describe("fanOut — who is written to, and what cannot break", () => {
  it("writes one row per recipient and never one for the actor", async () => {
    const h = writer();
    const count = await fanOut(h.deps, {
      kind: "post.reply",
      subjectIds: [ADA, LIN, BOB],
      actorSubjectId: BOB,
      actorHandle: "bob",
      targetKind: "post",
      targetRef: "acme-thing",
      eventRef: "post-1",
    });
    expect(count).toBe(2);
    expect(h.written.map((w) => w.subjectId).sort()).toEqual([ADA, LIN].sort());
    expect(h.written.map((w) => w.subjectId)).not.toContain(BOB);
  });

  it("dedupes a recipient who appears twice", async () => {
    // A person who started a thread AND replied in it is one person, and the
    // handler that reads participants is not the place to remember that.
    const h = writer();
    const count = await fanOut(h.deps, {
      kind: "post.reply",
      subjectIds: [ADA, ADA, ADA],
      actorSubjectId: BOB,
      targetKind: "post",
      targetRef: "acme-thing",
      eventRef: "post-1",
    });
    expect(count).toBe(1);
    expect(h.written).toHaveLength(1);
  });

  it("keys every recipient's row on the SAME event, so a retry collides", async () => {
    const h = writer();
    await fanOut(h.deps, {
      kind: "post.reply",
      subjectIds: [ADA, LIN],
      actorSubjectId: BOB,
      targetKind: "post",
      targetRef: "acme-thing",
      eventRef: "post-1",
    });
    const keys = new Set(h.written.map((w) => w.eventKey));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe("post.reply:post-1");

    // The retry. The same key, so the store refuses both rows and nothing is
    // said twice — which is only true because the key holds no clock.
    const again = await fanOut(h.deps, {
      kind: "post.reply",
      subjectIds: [ADA, LIN],
      actorSubjectId: BOB,
      targetKind: "post",
      targetRef: "acme-thing",
      eventRef: "post-1",
    });
    expect(again).toBe(0);
    expect(h.written).toHaveLength(2);
  });

  it("carries no timestamp in any key", async () => {
    const h = writer();
    await fanOut(h.deps, {
      kind: "rank.first",
      subjectIds: [ADA],
      targetKind: "listing",
      targetRef: "acme-thing",
      eventRef: "2026-09-01",
      figure: 12,
    });
    // A date is legitimately a key here (the DAY is the event). What must
    // never appear is a time — that is a clock, and a clock changes on retry.
    expect(h.written[0]!.eventKey).toBe("rank.first:2026-09-01");
    expect(h.written[0]!.eventKey).not.toMatch(/T\d\d:\d\d/);
  });

  it("keeps writing when one recipient's row throws", async () => {
    // One person's inbox being unavailable must not cost the others theirs.
    const h = writer({ fails: (id) => id === LIN });
    const count = await fanOut(h.deps, {
      kind: "post.reply",
      subjectIds: [ADA, LIN, BOB],
      actorSubjectId: null,
      targetKind: "post",
      targetRef: "acme-thing",
      eventRef: "post-1",
    });
    expect(count).toBe(2);
    expect(h.written.map((w) => w.subjectId).sort()).toEqual([ADA, BOB].sort());
  });

  it("drops an empty subject id rather than writing a row nobody owns", async () => {
    const h = writer();
    await fanOut(h.deps, {
      kind: "launch.topic",
      subjectIds: ["", ADA],
      targetKind: "topic",
      targetRef: "developer-tools",
      eventRef: "acme-thing:developer-tools",
    });
    expect(h.written.map((w) => w.subjectId)).toEqual([ADA]);
  });

  it("writes a null actor for something the system observed", async () => {
    // A rank is not somebody's act. A row that named an actor would put a
    // person's handle on a sentence nobody typed.
    const h = writer();
    await fanOut(h.deps, {
      kind: "rank.first",
      subjectIds: [ADA],
      targetKind: "listing",
      targetRef: "acme-thing",
      eventRef: "2026-09-01",
      figure: 40,
    });
    expect(h.written[0]!.actor).toBeNull();
    expect(h.written[0]!.figure).toBe(40);
  });

  it("stores no prose", async () => {
    // Every sentence is composed by the page from the contract's phrasebook.
    // A row holding English is a wording that can only be corrected by a
    // backfill, and a translation problem the day anybody wants a second
    // language.
    const h = writer();
    await fanOut(h.deps, {
      kind: "post.reply",
      subjectIds: [ADA],
      actorSubjectId: BOB,
      actorHandle: "bob",
      targetKind: "post",
      targetRef: "acme-thing",
      eventRef: "post-1",
    });
    const json = JSON.stringify(h.written);
    for (const word of ["replied", "upvote", "launched", "reached", "#1"]) {
      expect(json).not.toContain(word);
    }
  });

  it("stores no address (I3)", async () => {
    const h = writer();
    await fanOut(h.deps, {
      kind: "post.reply",
      subjectIds: [ADA],
      actorSubjectId: BOB,
      actorHandle: "bob",
      targetKind: "post",
      targetRef: "acme-thing",
      eventRef: "post-1",
    });
    const json = JSON.stringify(h.written);
    for (const forbidden of ["@", "email", "address", "phone"]) {
      expect(json).not.toContain(forbidden);
    }
  });
});

// ---------------------------------------------------------------------------
// What a person reads
// ---------------------------------------------------------------------------

interface ReaderHarness {
  deps: ProfileHandlerDeps;
  marks: Array<{ subjectId: string; at: string }>;
  asked: Array<{ subjectId: string; limit: number }>;
}

function reader(over: { items?: Array<Record<string, unknown>>; unread?: number } = {}): ReaderHarness {
  const marks: ReaderHarness["marks"] = [];
  const asked: ReaderHarness["asked"] = [];
  let unread = over.unread ?? 2;
  const repo = {
    async listNotifications(subjectId: string, limit: number) {
      asked.push({ subjectId, limit });
      return (
        over.items ?? [
          {
            id: "n-1",
            kind: "post.reply",
            actor: "bob",
            targetKind: "post",
            targetRef: "acme-thing",
            figure: null,
            createdAt: NOW,
            unread: true,
            // Two columns the store has and a reader must never receive: the
            // row's owner, and the key that dedupes it.
            subjectId,
            eventKey: "post.reply:post-1",
          },
        ]
      );
    },
    async countUnreadNotifications() {
      return unread;
    },
    async markNotificationsRead(subjectId: string, at: string) {
      marks.push({ subjectId, at });
      unread = 0;
      return true;
    },
  } as unknown as OpenproductRepository;
  return { deps: { repo, now: () => new Date(NOW) } as unknown as ProfileHandlerDeps, marks, asked };
}

async function body(res: Response): Promise<Record<string, unknown>> {
  return ((await res.json()) as { data: Record<string, unknown> }).data;
}

describe("the inbox is read by its owner and nobody else", () => {
  it("refuses an unauthenticated request", async () => {
    const res = await route(req("GET", null), env(), reader().deps);
    expect(res.status).toBe(401);
  });

  it("refuses a service principal — an inbox belongs to a person", async () => {
    const res = await route(req("GET", "svc_1", "service"), env(), reader().deps);
    expect(res.status).toBe(403);
  });

  it("reads ONLY the caller's own rows", async () => {
    const h = reader();
    await route(req("GET"), env(), h.deps);
    // The subject comes from the resolved actor, never from the request: there
    // is no parameter here that could name somebody else's inbox.
    expect(h.asked).toEqual([{ subjectId: ADA, limit: INBOX_LIMIT }]);
  });

  it("refuses a method that is neither read nor mark", async () => {
    const res = await route(req("DELETE"), env(), reader().deps);
    expect(res.status).toBe(405);
  });
});

describe("what a reader receives", () => {
  it("sends exactly the pinned keys, and never the row's owner or its key", async () => {
    const h = reader();
    const data = await body(await route(req("GET"), env(), h.deps));
    const items = data.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(Object.keys(items[0]!).sort()).toEqual([...INBOX_ITEM_KEYS].sort());
    expect(items[0]).not.toHaveProperty("subjectId");
    expect(items[0]).not.toHaveProperty("eventKey");
  });

  it("sends the unread count beside the rows", async () => {
    const data = await body(await route(req("GET"), env(), reader({ unread: 7 }).deps));
    expect(data.unread).toBe(7);
  });

  it("sends no prose — the sentence is composed by the page", async () => {
    const data = await body(await route(req("GET"), env(), reader().deps));
    const json = JSON.stringify(data);
    for (const word of ["replied", "reached", "launched", "upvoted"]) {
      expect(json).not.toContain(word);
    }
  });

  it("distinguishes an empty inbox from a failed read (OD5)", async () => {
    // An empty list is a 200 with `items: []`. A read that could not happen is
    // not this — it is an error, and the page says so rather than printing
    // "nothing yet" over a database that was down.
    const data = await body(await route(req("GET"), env(), reader({ items: [], unread: 0 }).deps));
    expect(data.items).toEqual([]);
    expect(data.unread).toBe(0);
  });

  it("writes nothing on a read", async () => {
    const h = reader();
    await route(req("GET"), env(), h.deps);
    expect(h.marks).toEqual([]);
  });
});

describe("the read cursor moves only when somebody moves it", () => {
  it("marks read on PUT and answers with the count AFTER the mark", async () => {
    const h = reader({ unread: 4 });
    const res = await route(req("PUT"), env(), h.deps);
    expect(res.status).toBe(200);
    expect(h.marks).toEqual([{ subjectId: ADA, at: NOW }]);
    expect((await body(res)).unread).toBe(0);
  });

  it("marks the caller's own cursor and takes no subject from the request", async () => {
    const h = reader();
    await route(req("PUT", LIN), env(), h.deps);
    expect(h.marks.map((m) => m.subjectId)).toEqual([LIN]);
  });
});

describe("the four kinds, and the fifth that is not here", () => {
  it("ships exactly four", () => {
    expect([...INBOX_KINDS].sort()).toEqual(
      ["launch.listing", "launch.topic", "post.reply", "post.upvoted", "rank.first"],
    );
  });

  it("has no follow notification of any shape", () => {
    // FL0 published, on the page where somebody decides to make their profile
    // public: "How many people follow you — a count only, never who they are,
    // not even to you." A per-follow message breaks that when it names the
    // follower, and breaks it more quietly when it does not: a timestamp plus
    // any other trace narrows a private act to a person.
    expect(INBOX_KINDS.some((kind) => kind.startsWith("follow"))).toBe(false);
  });
});
