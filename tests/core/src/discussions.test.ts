// The discussion surface, routed (openproduct-commons CB1).
//
// This is the milestone the gate was for, so what is pinned here is mostly
// about who may write and what a reader receives:
//
//   - an anonymous POST never reaches a handler;
//   - a service principal cannot post (CB-2: posts come from people);
//   - somebody with no public profile cannot post — CG-2's eligibility bound,
//     inherited whole, which is most of the spam defence;
//   - a locked thread refuses even when the lock lands mid-request;
//   - a removed post keeps its place and carries no body;
//   - a maintainer can lock and answer, and CANNOT remove;
//   - the public shapes carry no subject id (I3) and exactly their key sets (I2).

import { PUBLIC_POST_KEYS, PUBLIC_THREAD_KEYS } from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { ProfileHandlerDeps } from "@openproduct-worker/handlers/profiles";
import type { PublicHandlerDeps } from "@openproduct-worker/handlers/public";

const AUTHOR = "usr_0123456789abcdef0123456789abcdef";
const STRANGER = "usr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MAINTAINER = "usr_ffffffffffffffffffffffffffffffff";
const THREAD = "cccccccc-1111-4111-8111-cccccccccccc";
const POST = "dddddddd-2222-4222-8222-dddddddddddd";
const LAUNCH = "eeeeeeee-3333-4333-8333-eeeeeeeeeeee";
const PROFILE = "55555555-5555-4555-8555-555555555555";
const NOW = "2026-09-01T09:00:00.000Z";

const THREADS = "https://openproduct.internal/internal/openproduct/threads";
const REPLY = `${THREADS}/${THREAD}/posts`;
const MANAGE = `${THREADS}/${THREAD}`;
const COMMENT = "https://openproduct.internal/internal/openproduct/comments";

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

function req(url: string, body?: unknown, subjectId: string | null = AUTHOR, subjectType = "user"): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "x-request-id": "req_cb1",
      "content-type": "application/json",
      ...(subjectId ? { "x-actor-subject-id": subjectId, "x-actor-subject-type": subjectType } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

interface Harness {
  deps: ProfileHandlerDeps;
  created: Array<{ kind: "thread" | "post" | "ensure"; body?: string; parentPostId?: string | null; tag?: string | null }>;
  launch: { value: Record<string, unknown> | null };
  votes: Map<string, number>;
  voted: Array<{ postId: string; subjectId: string; on: boolean }>;
  state: { value: "open" | "answered" | "locked" | "removed" };
  /** Make createPost miss, as a maintainer locking mid-request would. */
  lockRace: { value: boolean };
  handles: Map<string, string>;
}

function harness(
  over: Partial<{
    state: Harness["state"]["value"];
    role: string | null;
    launch: Record<string, unknown> | null;
    votes: Record<string, number>;
    /** A post id the repository refuses, standing in for the schema's
     *  self-vote trigger. */
    selfVoted: string | null;
    /** A parent id the repository's insert guard refuses (CV1). */
    badParent: string | null;
  }> = {},
): Harness {
  const created: Harness["created"] = [];
  const state = { value: over.state ?? ("open" as Harness["state"]["value"]) };
  const launch: { value: Record<string, unknown> | null } = { value: over.launch ?? null };
  const votes = new Map<string, number>(Object.entries(over.votes ?? {}));
  const voted: Array<{ postId: string; subjectId: string; on: boolean }> = [];
  const selfVoted = { value: over.selfVoted ?? null };
  const badParent = { value: over.badParent ?? null };
  const lockRace = { value: false };
  const handles = new Map([[AUTHOR, "ada"], [MAINTAINER, "grace"]]);

  const repo = {
    async getPublicProfileId(slug: string) {
      return slug === "acme-thing" ? PROFILE : null;
    },
    async getActiveHandleForSubject(subjectId: string) {
      const handle = handles.get(subjectId);
      return handle ? { handle, subjectId } : null;
    },
    async getListingRole(_profileId: string, subjectId: string) {
      if (over.role === null) return null;
      return subjectId === MAINTAINER ? "owner" : null;
    },
    async getThread(id: string) {
      if (id !== THREAD) return null;
      return {
        id: THREAD,
        tag: "question",
        title: "How do I run the tests?",
        state: state.value,
        authorSubjectId: AUTHOR,
        authorHandle: "ada",
        authorName: "Ada",
        createdAt: NOW,
        lastPostAt: NOW,
        postCount: 1,
        profileId: PROFILE,
        answerPostId: null,
      };
    },
    async listThreads() {
      return [];
    },
    async listPosts() {
      return [
        {
          id: POST,
          authorSubjectId: AUTHOR,
          body: "",
          state: "removed" as const,
          authorHandle: "ada",
          authorName: "Ada",
          createdAt: NOW,
          editedAt: null,
          isAnswer: false,
          tag: null,
        },
      ];
    },
    async createThread() {
      created.push({ kind: "thread" });
      return THREAD;
    },
    // DQ0b — the listing's one comment thread. `ensured` records whether the
    // handler was told it made one, which is what a caller that notifies
    // participants has to know.
    async getLaunchThread() {
      return launch.value;
    },
    // DQ1 — the public count on each comment. A map, and a post nobody voted
    // on is ABSENT rather than zero.
    async countPostVotes(postIds: readonly string[]) {
      return new Map(postIds.filter((id) => votes.has(id)).map((id) => [id, votes.get(id)!]));
    },
    async votePost(postId: string, subjectId: string) {
      if (postId === selfVoted.value) return false;
      votes.set(postId, (votes.get(postId) ?? 0) + 1);
      voted.push({ postId, subjectId, on: true });
      return true;
    },
    async withdrawPostVote(postId: string, subjectId: string) {
      const now = votes.get(postId) ?? 0;
      if (now > 0) votes.set(postId, now - 1);
      voted.push({ postId, subjectId, on: false });
      return now > 0;
    },
    async ensureLaunchThread(input: { title: string }) {
      created.push({ kind: "ensure", body: input.title });
      const first = launch.value === null;
      launch.value = launch.value ?? {
        id: LAUNCH,
        tag: "launch",
        title: input.title,
        state: "open",
        authorSubjectId: AUTHOR,
        authorHandle: "ada",
        authorName: "Ada",
        createdAt: NOW,
        lastPostAt: null,
        postCount: 0,
        profileId: PROFILE,
        answerPostId: null,
      };
      return { id: launch.value.id, created: first };
    },
    async createPost(input: { body: string; parentPostId?: string | null; tag?: string | null }) {
      if (lockRace.value) return null;
      // CV1 — the repository's insert refuses a parent that is not top-level
      // and in this thread. `badParent` stands in for that guard, which is in
      // SQL rather than in a check the handler could race.
      if (input.parentPostId != null && input.parentPostId === badParent.value) return null;
      created.push({ kind: "post", body: input.body, parentPostId: input.parentPostId ?? null, tag: input.tag ?? null });
      return POST;
    },
    async setThreadState(_id: string, next: string, legalFrom: readonly string[]) {
      if (!legalFrom.includes(state.value)) return false;
      state.value = next as Harness["state"]["value"];
      return true;
    },
    async markAnswer() {
      state.value = "answered";
      return true;
    },
  } as unknown as OpenproductRepository;

  return { deps: { repo } as unknown as ProfileHandlerDeps, created, state, lockRace, handles, launch, votes, voted };
}

const NEW = { slug: "acme-thing", tag: "question", title: "A title", body: "A body." };

describe("CB-2 — every post is signed, and there is no anonymous path", () => {
  it("refuses a POST with no actor at all, before any handler", async () => {
    const h = harness();
    const res = await route(req(THREADS, NEW, null), env(), h.deps);
    expect(res.status).toBe(401);
    expect(h.created).toEqual([]);
  });

  it("refuses a SERVICE principal — posts come from people", async () => {
    const h = harness();
    const res = await route(req(THREADS, NEW, AUTHOR, "service"), env(), h.deps);
    expect(res.status).toBe(403);
    expect(h.created).toEqual([]);
  });

  it("refuses somebody with no public profile — CG-2's bound, inherited", async () => {
    // The handle IS the eligibility: CG1 only issues one to somebody who
    // opted in and has standing, and CG-2 only gives standing to somebody on
    // a listed product. One read carries the whole bound.
    const h = harness();
    const res = await route(req(THREADS, NEW, STRANGER), env(), h.deps);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      error: { message: expect.stringContaining("public profile") },
    });
    expect(h.created).toEqual([]);
  });

  it("creates a thread for a signed contributor — FO0 reopened what PP0 collapsed", async () => {
    // PP0 answered 410 here while a thread had no home but the listing page.
    // FO0 gives it one (the forum), so the door creates again. The
    // eligibility check is still in front: the stranger above is refused
    // before anything is read.
    const h = harness();
    const res = await route(req(THREADS, NEW), env(), h.deps);
    expect(res.status).toBe(201);
    expect(h.created.map((c) => c.kind)).toEqual(["thread", "post"]);
  });
});

describe("a locked thread refuses, even mid-request", () => {
  it("refuses a reply to a locked thread", async () => {
    const h = harness({ state: "locked" });
    const res = await route(req(REPLY, { body: "hello" }), env(), h.deps);
    expect(res.status).toBe(409);
    expect(h.created).toEqual([]);
  });

  it("refuses when the lock lands BETWEEN the check and the write", async () => {
    // The UPDATE is the authority, not the handler's check — a check alone
    // races with a maintainer locking, and the loser of that race is a post
    // appearing in a thread somebody just closed.
    const h = harness();
    h.lockRace.value = true;
    const res = await route(req(REPLY, { body: "hello" }), env(), h.deps);
    expect(res.status).toBe(409);
  });

  it("takes a reply to an ANSWERED thread — answering is not finishing", async () => {
    const h = harness({ state: "answered" });
    const res = await route(req(REPLY, { body: "one more thing" }), env(), h.deps);
    expect(res.status).toBe(201);
  });
});

describe("what a maintainer may do", () => {
  it("locks and unlocks their own listing's thread", async () => {
    const h = harness();
    expect((await route(req(MANAGE, { intent: "lock" }, MAINTAINER), env(), h.deps)).status).toBe(200);
    expect(h.state.value).toBe("locked");
    expect((await route(req(MANAGE, { intent: "unlock" }, MAINTAINER), env(), h.deps)).status).toBe(200);
    expect(h.state.value).toBe("open");
  });

  it("refuses somebody who does not maintain the listing", async () => {
    const h = harness();
    const res = await route(req(MANAGE, { intent: "lock" }, STRANGER), env(), h.deps);
    expect(res.status).toBe(403);
    expect(h.state.value).toBe("open");
  });

  it("HAS NO REMOVE INTENT — removal is a TS3 act with a reason on the record", async () => {
    // A maintainer with a remove button on their own page can quietly delete
    // every criticism of their software, and the decision trail this sub-epic
    // exists to build would be a trail of only the good news.
    const h = harness();
    const res = await route(req(MANAGE, { intent: "remove", postId: POST }, MAINTAINER), env(), h.deps);
    expect(res.status).toBe(422);
    expect(h.state.value).toBe("open");
  });
});

describe("what a reader receives", () => {
  function publicDeps() {
    const repo = {
      async getPublicProfileId() {
        return PROFILE;
      },
      async getThread() {
        return {
          id: THREAD,
          tag: "question",
          title: "How do I run the tests?",
          state: "open" as const,
          authorSubjectId: AUTHOR,
          authorHandle: "ada",
          authorName: "Ada",
          createdAt: NOW,
          lastPostAt: NOW,
          postCount: 1,
          profileId: PROFILE,
          answerPostId: null,
        };
      },
      async listPosts() {
        return [
          {
            id: POST,
            authorSubjectId: AUTHOR,
            body: "",
            state: "removed" as const,
            authorHandle: "ada",
            authorName: "Ada",
            createdAt: NOW,
            editedAt: null,
            isAnswer: false,
            tag: null,
            parentPostId: null,
          },
        ];
      },
      // CV2 — the published roster the maintainer badge is decided from. The
      // author of the post above IS on it, so the projection's badge is
      // exercised rather than only its absence.
      async listMaintainers() {
        return [{ subjectId: AUTHOR, displayName: "Ada", roleLabel: null, handle: "ada" }];
      },
      async listThreads() {
        return [];
      },
      // DQ1 — the public count on each post, in one read. Absent means zero
      // to the caller, so this returns an empty map and the projection still
      // carries `votes: 0`.
      async countPostVotes() {
        return new Map<string, number>();
      },
    } as unknown as OpenproductRepository;
    return { repo } as unknown as PublicHandlerDeps;
  }

  const url = `https://openproduct.internal/internal/public/openproduct/threads/${THREAD}`;

  it("carries exactly the pinned key sets, and no subject id", async () => {
    const res = await route(new Request(url), env(), undefined, publicDeps());
    const body = (await res.json()) as { data: { thread: Record<string, unknown>; posts: Record<string, unknown>[] } };
    // I2 — exact key sets. I3 — the opaque id does not leave the estate.
    expect(Object.keys(body.data.thread).sort()).toEqual([...PUBLIC_THREAD_KEYS].sort());
    expect(Object.keys(body.data.posts[0]!).sort()).toEqual([...PUBLIC_POST_KEYS].sort());
    expect(JSON.stringify(body.data)).not.toContain(AUTHOR);
  });

  it("DQ1 — the COUNT rides on every post, honest at zero", async () => {
    // Public and identical for everybody. Whether YOU upvoted it arrives
    // after paint from the overlay, so a thread's anonymous and signed-in
    // renders stay byte-identical (I6).
    const res = await route(new Request(url), env(), undefined, publicDeps());
    const body = (await res.json()) as { data: { posts: Array<{ votes: number }> } };
    expect(body.data.posts[0]!.votes).toBe(0);
  });

  it("keeps a removed post in its place, carrying a note instead of a body", async () => {
    // TS-3 on a reply: one that vanishes makes the replies around it
    // unreadable, and the reader cannot tell moderation from a bug.
    const res = await route(new Request(url), env(), undefined, publicDeps());
    const body = (await res.json()) as { data: { posts: Array<{ state: string; body: unknown[] }> } };
    expect(body.data.posts).toHaveLength(1);
    expect(body.data.posts[0]!.state).toBe("removed");
    expect(JSON.stringify(body.data.posts[0]!.body)).toContain("removed");
  });

  it("resolves no actor on the read — it is the public branch", async () => {
    // Same bytes whether or not a credential is attached (I6). A read that
    // varied by viewer could not be edge-cached and would not be one page.
    const anon = await route(new Request(url), env(), undefined, publicDeps());
    const withCreds = await route(
      new Request(url, { headers: { "x-actor-subject-id": STRANGER, "x-actor-subject-type": "user" } }),
      env(),
      undefined,
      publicDeps(),
    );
    // `data` only: `meta.requestId` is per-REQUEST by construction and varies
    // between any two calls, viewer or not. Comparing whole bodies would make
    // this pass or fail on a random string rather than on the claim, which is
    // that nothing about who is asking enters the answer.
    const payload = async (r: Response) => JSON.stringify(((await r.json()) as { data: unknown }).data);
    expect(await payload(anon)).toBe(await payload(withCreds));
  });

  describe("CV2 — the maintainer badge", () => {
    it("badges a post whose author is on the published roster", async () => {
      const res = await route(new Request(url), env(), undefined, publicDeps());
      const body = (await res.json()) as { data: { posts: Array<{ authorIsMaintainer: boolean }> } };
      expect(body.data.posts[0]!.authorIsMaintainer).toBe(true);
    });

    it("decides it from the SUBJECT ID, not the handle", async () => {
      // THE DEFECT CV2 EXISTS TO FIX. The product page used to compare handles,
      // so a maintainer who never published a profile was silently un-badged —
      // an opt-in (CG1) reported as a status, which is the opposite of what
      // OPC-5 is for. Same subject, no handle, still a maintainer.
      const deps = publicDeps();
      const inner = deps as unknown as { repo: Record<string, unknown> };
      inner.repo.listPosts = async () => [
        {
          id: POST,
          authorSubjectId: AUTHOR,
          body: "hello",
          state: "visible" as const,
          authorHandle: null,
          authorName: null,
          createdAt: NOW,
          editedAt: null,
          isAnswer: false,
          tag: null,
          parentPostId: null,
        },
      ];
      const res = await route(new Request(url), env(), undefined, deps);
      const body = (await res.json()) as {
        data: { posts: Array<{ authorIsMaintainer: boolean; authorHandle: string | null }> };
      };
      expect(body.data.posts[0]!.authorHandle).toBeNull();
      expect(body.data.posts[0]!.authorIsMaintainer).toBe(true);
    });

    it("does not badge a stranger", async () => {
      const deps = publicDeps();
      const inner = deps as unknown as { repo: Record<string, unknown> };
      inner.repo.listMaintainers = async () => [];
      const res = await route(new Request(url), env(), undefined, deps);
      const body = (await res.json()) as { data: { posts: Array<{ authorIsMaintainer: boolean }> } };
      expect(body.data.posts[0]!.authorIsMaintainer).toBe(false);
    });

    it("never sends the subject id it decided from (I3)", async () => {
      const res = await route(new Request(url), env(), undefined, publicDeps());
      expect(await res.text()).not.toContain(AUTHOR);
    });
  });
});

describe("DQ0b — the comment box, which is a thread nobody named", () => {
  const COMMENT_BODY = { slug: "acme-thing", body: "How do I run this locally?" };

  it("makes the listing's one thread on the first comment, and posts into it", async () => {
    const h = harness();
    const res = await route(req(COMMENT, COMMENT_BODY), env(), h.deps);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { threadId: string; postId: string } };
    expect(body.data).toEqual({ threadId: LAUNCH, postId: POST });
    // One ensure, one post — and the thread's title came from the listing's
    // own name, because nobody typed one.
    expect(h.created.map((c) => c.kind)).toEqual(["ensure", "post"]);
    expect(h.created[0]!.body).toBe("Comments on acme-thing");
    expect(h.created[1]!.body).toBe("How do I run this locally?");
  });

  it("REUSES the thread on every comment after the first", async () => {
    const h = harness();
    await route(req(COMMENT, COMMENT_BODY), env(), h.deps);
    // A DIFFERENT person, and one with a public profile — CG-2's eligibility
    // bound applies to a comment exactly as it applies to a reply, and
    // STRANGER (no handle) would have been refused before reaching the write.
    await route(req(COMMENT, { ...COMMENT_BODY, body: "And another." }, MAINTAINER), env(), h.deps);
    // Two posts, one thread. The second caller was told it made nothing.
    expect(h.created.filter((c) => c.kind === "post")).toHaveLength(2);
    expect(h.launch.value!.id).toBe(LAUNCH);
  });

  it("takes an OPTIONAL tag — the classification a titled discussion used to carry (PP0)", async () => {
    const h = harness();
    const res = await route(req(COMMENT, { ...COMMENT_BODY, tag: "question" }), env(), h.deps);
    expect(res.status).toBe(201);
    expect(h.created.find((c) => c.kind === "post")).toMatchObject({ tag: "question" });
  });

  it("refuses a tag outside the six rather than dropping it, and never accepts launch", async () => {
    const h = harness();
    expect((await route(req(COMMENT, { ...COMMENT_BODY, tag: "launch" }), env(), h.deps)).status).toBe(422);
    expect((await route(req(COMMENT, { ...COMMENT_BODY, tag: "spam" }), env(), h.deps)).status).toBe(422);
    expect(h.created.filter((c) => c.kind === "post")).toHaveLength(0);
    expect((await route(req(COMMENT, { ...COMMENT_BODY, tag: "" }), env(), h.deps)).status).toBe(201);
  });

  it("asks for NO tag and NO title, which is the difference from a discussion", async () => {
    // The design draws a box: you type and you have said something. Asking
    // somebody to classify a sentence before they may say it is the friction
    // this milestone removes.
    const h = harness();
    const res = await route(req(COMMENT, { slug: "acme-thing", body: "Hello." }), env(), h.deps);
    expect(res.status).toBe(201);
  });

  it("refuses an anonymous comment before any handler (CB-2)", async () => {
    const h = harness();
    const res = await route(req(COMMENT, COMMENT_BODY, null), env(), h.deps);
    expect(res.status).toBe(401);
    expect(h.created).toEqual([]);
  });

  it("refuses a SERVICE principal — comments come from people", async () => {
    const h = harness();
    const res = await route(req(COMMENT, COMMENT_BODY, "svc_1", "service"), env(), h.deps);
    expect([401, 403]).toContain(res.status);
    expect(h.created).toEqual([]);
  });

  it("refuses somebody with no public profile — CG-2's bound, inherited whole", async () => {
    const h = harness();
    h.handles.delete(AUTHOR);
    const res = await route(req(COMMENT, COMMENT_BODY), env(), h.deps);
    expect(res.status).toBe(403);
    expect(h.created).toEqual([]);
  });

  it("404s a listing that is not public, and never opens a thread on it", async () => {
    const h = harness();
    const res = await route(req(COMMENT, { slug: "not-a-listing", body: "Hi." }), env(), h.deps);
    expect(res.status).toBe(404);
    expect(h.created).toEqual([]);
  });

  it("refuses an empty comment and one past the bound", async () => {
    const h = harness();
    for (const body of ["", "   ", "x".repeat(20_000)]) {
      const res = await route(req(COMMENT, { slug: "acme-thing", body }), env(), h.deps);
      expect([body.length, res.status]).toEqual([body.length, 422]);
    }
    expect(h.created).toEqual([]);
  });

  it("A LOCKED discussion refuses, and the UPDATE is the authority", async () => {
    // `ensureLaunchThread` cannot route around a lock: the partial unique
    // index counts a locked thread as the one this listing has, so the
    // existing thread comes back and `createPost` refuses it.
    const h = harness();
    h.lockRace.value = true;
    const res = await route(req(COMMENT, COMMENT_BODY), env(), h.deps);
    expect(res.status).toBe(409);
    expect(h.created.filter((c) => c.kind === "post")).toEqual([]);
  });

  it("refuses a GET — this address is an act, not a page", async () => {
    const h = harness();
    const res = await route(new Request(COMMENT, { headers: { "x-request-id": "r" } }), env(), h.deps);
    expect(res.status).not.toBe(200);
  });
});

describe("DQ1 — the upvote on a comment", () => {
  const VOTE = `https://openproduct.internal/internal/openproduct/posts/${POST}/vote`;

  function voteReq(method: "PUT" | "DELETE", subjectId: string | null = AUTHOR): Request {
    return new Request(VOTE, {
      method,
      headers: {
        "x-request-id": "req_dq1",
        ...(subjectId
          ? { "x-actor-subject-id": subjectId, "x-actor-subject-type": "user" }
          : {}),
      },
    });
  }

  it("votes, and withdraws, and the second is the state you asked for", async () => {
    const h = harness();
    const put = await route(voteReq("PUT"), env(), h.deps);
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({ data: { voted: true } });
    expect(h.votes.get(POST)).toBe(1);

    const del = await route(voteReq("DELETE"), env(), h.deps);
    expect(del.status).toBe(200);
    expect(await del.json()).toMatchObject({ data: { voted: false } });
    expect(h.votes.get(POST)).toBe(0);

    // WITHDRAWING WHAT YOU HAVE NOT VOTED ON IS THE STATE YOU ASKED FOR — a
    // caller pressing an already-unvoted control wants it unvoted.
    const again = await route(voteReq("DELETE"), env(), h.deps);
    expect(again.status).toBe(200);
  });

  it("refuses the AUTHOR'S OWN comment with a sentence, not a silence", async () => {
    // A control that renders and then does nothing is worse than one that
    // says why. The schema's trigger is the other half of this.
    const h = harness({ selfVoted: POST });
    const res = await route(voteReq("PUT"), env(), h.deps);
    expect(res.status).toBe(409);
    expect(h.votes.has(POST)).toBe(false);
  });

  it("refuses an anonymous vote before any handler", async () => {
    const h = harness();
    const res = await route(voteReq("PUT", null), env(), h.deps);
    expect(res.status).toBe(401);
    expect(h.voted).toEqual([]);
  });

  it("refuses somebody with no public profile — CG-2's bound, inherited whole", async () => {
    const h = harness();
    h.handles.delete(AUTHOR);
    const res = await route(voteReq("PUT"), env(), h.deps);
    expect(res.status).toBe(403);
    expect(h.voted).toEqual([]);
  });

  it("404s a post id that is not one", async () => {
    const h = harness();
    const res = await route(
      new Request("https://openproduct.internal/internal/openproduct/posts/not-a-uuid/vote", {
        method: "PUT",
        headers: {
          "x-request-id": "r",
          "x-actor-subject-id": AUTHOR,
          "x-actor-subject-type": "user",
        },
      }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(404);
    expect(h.voted).toEqual([]);
  });

  it("refuses a GET and a POST — this is a PUT/DELETE pair", async () => {
    const h = harness();
    for (const method of ["GET", "POST"] as const) {
      const res = await route(
        new Request(VOTE, {
          method,
          headers: {
            "x-request-id": "r",
            "x-actor-subject-id": AUTHOR,
            "x-actor-subject-type": "user",
          },
        }),
        env(),
        h.deps,
      );
      expect([method, res.status]).toEqual([method, 405]);
    }
  });

});

describe("CB4 — who is told, and who is not", () => {
  const ADA = "usr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const LIN = "usr_llllllllllllllllllllllllllllllll";
  // CV3 — somebody with a handle who is NOT in this thread.
  const GRACE = "usr_gggggggggggggggggggggggggggggggg";

  function notifyHarness(over: { threadMuted?: string[]; globalMuted?: string[] } = {}) {
    const queued: Array<{ subjectId: string; kind: string; eventRef: string }> = [];
    const repo = {
      async getActiveHandleForSubject(subjectId: string) {
        return { handle: "someone", subjectId };
      },
      async getThread() {
        return {
          id: THREAD,
          tag: "question",
          title: "t",
          state: "open" as const,
          authorSubjectId: ADA,
          authorHandle: null,
          authorName: null,
          createdAt: NOW,
          lastPostAt: NOW,
          postCount: 2,
          profileId: PROFILE,
          answerPostId: null,
        };
      },
      async createPost() {
        return POST;
      },
      async listThreadParticipants() {
        // ADA started it, LIN replied, AUTHOR is about to reply.
        return [ADA, LIN, AUTHOR];
      },
      async listMutes() {
        return { thread: over.threadMuted ?? [], global: over.globalMuted ?? [] };
      },
      async queueNotification(input: { subjectId: string; kind: string; eventRef: string }) {
        queued.push(input);
        return true;
      },
      // CV3 — the handle namespace. `grace` is claimed by somebody who is NOT
      // in this thread, which is the case worth telling about; `nobody` is
      // absent, which is a handle nobody showed up for (OPC-5).
      async getSubjectsForHandles(handles: readonly string[]) {
        const known = new Map([
          ["grace", GRACE],
          // ADA is already a participant, so a mention of her must NOT queue a
          // second message about one post.
          ["ada", ADA],
        ]);
        return new Map(
          handles.flatMap((h) => (known.has(h) ? [[h, known.get(h)!] as [string, string]] : [])),
        );
      },
    } as unknown as OpenproductRepository;
    return { deps: { repo } as unknown as ProfileHandlerDeps, queued };
  }

  it("tells the other participants and never the person who wrote", async () => {
    const h = notifyHarness();
    const res = await route(req(REPLY, { body: "hello" }), env(), h.deps);
    expect(res.status).toBe(201);
    expect(h.queued.map((q) => q.subjectId).sort()).toEqual([ADA, LIN].sort());
    expect(h.queued.map((q) => q.subjectId)).not.toContain(AUTHOR);
  });

  it("respects a thread mute and a global mute", async () => {
    const muted = notifyHarness({ threadMuted: [ADA] });
    await route(req(REPLY, { body: "hello" }), env(), muted.deps);
    expect(muted.queued.map((q) => q.subjectId)).toEqual([LIN]);

    const global = notifyHarness({ globalMuted: [ADA, LIN] });
    await route(req(REPLY, { body: "hello" }), env(), global.deps);
    expect(global.queued).toEqual([]);
  });

  it("keys every recipient's row on the same event, so a retry collides", async () => {
    const h = notifyHarness();
    await route(req(REPLY, { body: "hello" }), env(), h.deps);
    const refs = new Set(h.queued.map((q) => q.eventRef));
    expect(refs.size).toBe(1);
    expect([...refs][0]).toBe(`reply:${POST}`);
  });

  it("queues nothing that carries an address (I3)", async () => {
    const h = notifyHarness();
    await route(req(REPLY, { body: "hello" }), env(), h.deps);
    const json = JSON.stringify(h.queued);
    for (const forbidden of ["@", "email", "address", "phone"]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it("does NOT fail the reply when notifying throws", async () => {
    // Somebody who wrote a reply must not lose it because a notification
    // table was unavailable. The reply is the thing they came to do.
    const h = notifyHarness();
    (h.deps.repo as unknown as { listThreadParticipants: () => Promise<never> })
      .listThreadParticipants = async () => {
      throw new Error("notifications are down");
    };
    const res = await route(req(REPLY, { body: "hello" }), env(), h.deps);
    expect(res.status).toBe(201);
    expect(h.queued).toEqual([]);
  });
});

describe("NF0 — the inbox rows a comment writes", () => {
  const ADA = "usr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const LIN = "usr_llllllllllllllllllllllllllllllll";

  interface Row {
    subjectId: string;
    kind: string;
    eventKey: string;
    actor: string | null;
    targetKind: string;
    targetRef: string;
    figure: number | null;
  }

  function inboxHarness(over: { author?: { authorSubjectId: string; threadId: string } | null; slug?: string | null } = {}) {
    const rows: Row[] = [];
    const repo = {
      async getPublicProfileId(slug: string) {
        return slug === "acme-thing" ? PROFILE : null;
      },
      async getActiveHandleForSubject(subjectId: string) {
        return subjectId === AUTHOR ? { handle: "ada", subjectId } : null;
      },
      async getThread() {
        return {
          id: THREAD,
          tag: "question",
          title: "t",
          state: "open" as const,
          authorSubjectId: ADA,
          authorHandle: null,
          authorName: null,
          createdAt: NOW,
          lastPostAt: NOW,
          postCount: 2,
          profileId: PROFILE,
          answerPostId: null,
        };
      },
      async createPost() {
        return POST;
      },
      async listThreadParticipants() {
        return [ADA, LIN, AUTHOR];
      },
      async listMutes() {
        return { thread: [], global: [] };
      },
      async queueNotification() {
        return true;
      },
      // NF0 — the thread's listing, for the link the row points at.
      async getSlugForThread() {
        return over.slug === undefined ? "acme-thing" : over.slug;
      },
      async getPostAuthor() {
        return over.author === undefined ? { authorSubjectId: LIN, threadId: THREAD } : over.author;
      },
      async countPostVotes(ids: readonly string[]) {
        return new Map(ids.map((id) => [id, 3]));
      },
      async votePost() {
        return true;
      },
      async withdrawPostVote() {
        return true;
      },
      async writeNotification(input: Row & { id: string }) {
        rows.push({
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
    } as unknown as OpenproductRepository;
    return { deps: { repo } as unknown as ProfileHandlerDeps, rows };
  }

  it("writes post.reply to the other participants, keyed on the post", async () => {
    const h = inboxHarness();
    const res = await route(req(REPLY, { body: "hello" }), env(), h.deps);
    expect(res.status).toBe(201);
    expect(h.rows.map((r) => r.subjectId).sort()).toEqual([ADA, LIN].sort());
    expect(new Set(h.rows.map((r) => r.kind))).toEqual(new Set(["post.reply"]));
    expect(new Set(h.rows.map((r) => r.eventKey))).toEqual(new Set([`post.reply:${POST}`]));
  });

  it("names the replier, because the reply is already on a page under their handle", async () => {
    const h = inboxHarness();
    await route(req(REPLY, { body: "hello" }), env(), h.deps);
    expect(new Set(h.rows.map((r) => r.actor))).toEqual(new Set(["ada"]));
    // The row points at the LISTING, not the thread: the discussion renders
    // on the product page, so that is where a reader is sent.
    expect(new Set(h.rows.map((r) => r.targetRef))).toEqual(new Set(["acme-thing"]));
  });

  it("writes nothing when the thread's listing no longer resolves", async () => {
    // A delisted or removed listing has no page to send anybody to, and a row
    // whose link goes nowhere is exactly what XP-5 forbids.
    const h = inboxHarness({ slug: null });
    const res = await route(req(REPLY, { body: "hello" }), env(), h.deps);
    expect(res.status).toBe(201);
    expect(h.rows).toEqual([]);
  });

  it("does NOT fail the reply when the inbox write throws", async () => {
    const h = inboxHarness();
    (h.deps.repo as unknown as { writeNotification: () => Promise<never> }).writeNotification =
      async () => {
        throw new Error("inbox is down");
      };
    const res = await route(req(REPLY, { body: "hello" }), env(), h.deps);
    expect(res.status).toBe(201);
  });

  it("writes post.upvoted to the comment's author, saying how many and never who", async () => {
    const h = inboxHarness();
    const res = await route(
      new Request(`https://openproduct.internal/internal/openproduct/posts/${POST}/vote`, {
        method: "PUT",
        headers: {
          "x-request-id": "req_dq1",
          "x-actor-subject-id": AUTHOR,
          "x-actor-subject-type": "user",
        },
      }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(200);
    const row = h.rows.find((r) => r.kind === "post.upvoted");
    expect(row).toBeDefined();
    expect(row!.subjectId).toBe(LIN);
    // NO ACTOR. An upvote's count is public and its voters are listed nowhere
    // on the estate; naming them here would be the one place that did.
    expect(row!.actor).toBeNull();
    expect(row!.figure).toBe(3);
    // One row per (post, voter) — a voter who withdraws and re-votes says
    // nothing new, because the key is the pair rather than the moment.
    expect(row!.eventKey).toBe(`post.upvoted:${POST}:${AUTHOR}`);
  });

  it("writes nothing on a withdrawn vote", async () => {
    // Taking a vote back is not an event anybody is told about. A row saying
    // a number went DOWN is a notification that punishes somebody for a
    // stranger's second thought.
    const h = inboxHarness();
    await route(
      new Request(`https://openproduct.internal/internal/openproduct/posts/${POST}/vote`, {
        method: "DELETE",
        headers: {
          "x-request-id": "req_dq1",
          "x-actor-subject-id": AUTHOR,
          "x-actor-subject-type": "user",
        },
      }),
      env(),
      h.deps,
    );
    expect(h.rows.filter((r) => r.kind === "post.upvoted")).toEqual([]);
  });

  it("writes no post.upvoted when the comment's author no longer resolves", async () => {
    const h = inboxHarness({ author: null });
    const res = await route(
      new Request(`https://openproduct.internal/internal/openproduct/posts/${POST}/vote`, {
        method: "PUT",
        headers: {
          "x-request-id": "req_dq1",
          "x-actor-subject-id": AUTHOR,
          "x-actor-subject-type": "user",
        },
      }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(200);
    expect(h.rows.filter((r) => r.kind === "post.upvoted")).toEqual([]);
  });
});

describe("CV1 — one level of replies", () => {
  const PARENT = "aaaaaaaa-4444-4444-8444-aaaaaaaaaaaa";

  it("carries the post being answered through to the write", async () => {
    const h = harness();
    const res = await route(req(REPLY, { body: "answering you", parentPostId: PARENT }), env(), h.deps);
    expect(res.status).toBe(201);
    expect(h.created).toEqual([{ kind: "post", body: "answering you", parentPostId: PARENT, tag: null }]);
  });

  it("makes a top-level post when no parent is named", async () => {
    const h = harness();
    await route(req(REPLY, { body: "just talking" }), env(), h.deps);
    expect(h.created).toEqual([{ kind: "post", body: "just talking", parentPostId: null, tag: null }]);
  });

  it("refuses a parent that is not a post id", async () => {
    // It reaches SQL. Shape first, existence in the insert.
    const h = harness();
    const res = await route(req(REPLY, { body: "x", parentPostId: "../../evil" }), env(), h.deps);
    expect(res.status).toBe(422);
    expect(h.created).toEqual([]);
  });

  it("refuses a reply the insert's own guard rejects, and says why", async () => {
    // A reply to a reply, or to a post in another thread. The guard is the
    // sub-select in the INSERT, not a check the handler could race — the same
    // reasoning the lock race already forced on this handler.
    const h = harness({ badParent: PARENT });
    const res = await route(req(REPLY, { body: "too deep", parentPostId: PARENT }), env(), h.deps);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("itself a reply");
  });

  it("still says the thread is closed when there is no parent to blame", async () => {
    // The same null from `createPost` means two different things; a reply
    // that named no parent can only be the lock.
    const h = harness();
    h.lockRace.value = true;
    const res = await route(req(REPLY, { body: "hello" }), env(), h.deps);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("closed to new posts");
  });

  it("treats an empty parent as no parent rather than as a bad one", async () => {
    const h = harness();
    const res = await route(req(REPLY, { body: "x", parentPostId: "" }), env(), h.deps);
    expect(res.status).toBe(201);
    expect(h.created[0]).toMatchObject({ parentPostId: null });
  });
});

describe("CV3 — a mention tells whoever was named", () => {
  const ADA = "usr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const GRACE = "usr_gggggggggggggggggggggggggggggggg";

  function mentionHarness() {
    const queued: Array<{ subjectId: string; kind: string; eventRef: string }> = [];
    const repo = {
      // NF0's on-site inbox reads this, and unlike the CB4 fan-out it is not
      // swallowed — omitting it makes the whole reply 500.
      async getActiveHandleForSubject(subjectId: string) {
        return { handle: "someone", subjectId };
      },
      async getThread() {
        return {
          id: THREAD,
          tag: "question",
          title: "t",
          state: "open" as const,
          authorSubjectId: ADA,
          authorHandle: null,
          authorName: null,
          createdAt: NOW,
          lastPostAt: NOW,
          postCount: 2,
          profileId: PROFILE,
          answerPostId: null,
        };
      },
      async createPost() {
        return POST;
      },
      async listThreadParticipants() {
        return [ADA];
      },
      async listMutes() {
        return { thread: [], global: [] };
      },
      async queueNotification(input: { subjectId: string; kind: string; eventRef: string }) {
        queued.push(input);
        return true;
      },
      async getSubjectsForHandles(handles: readonly string[]) {
        const known = new Map([
          ["grace", GRACE],
          ["ada", ADA],
        ]);
        return new Map(
          handles.flatMap((h) => (known.has(h) ? [[h, known.get(h)!] as [string, string]] : [])),
        );
      },
    } as unknown as OpenproductRepository;
    return { deps: { repo } as unknown as ProfileHandlerDeps, queued };
  }

  it("tells somebody who was named and was not in the thread", async () => {
    const h = mentionHarness();
    await route(req(REPLY, { body: "what do you think @grace" }), env(), h.deps);
    const mention = h.queued.filter((q) => q.kind === "mention");
    expect(mention.map((q) => q.subjectId)).toEqual([GRACE]);
  });

  it("does not tell somebody twice about one post", async () => {
    // ADA is a participant, so she is already being told the thread moved.
    // Two messages about one post is how somebody turns all of it off.
    const h = mentionHarness();
    await route(req(REPLY, { body: "thanks @ada" }), env(), h.deps);
    expect(h.queued.filter((q) => q.kind === "mention")).toEqual([]);
    expect(h.queued.filter((q) => q.kind === "reply").map((q) => q.subjectId)).toEqual([ADA]);
  });

  it("tells nobody when the handle belongs to nobody (OPC-5)", async () => {
    // The write side of the rule the renderer applies: an unclaimed handle is
    // text, not a person.
    const h = mentionHarness();
    await route(req(REPLY, { body: "hello @nobody" }), env(), h.deps);
    expect(h.queued.filter((q) => q.kind === "mention")).toEqual([]);
  });

  it("collapses a post that names somebody four times into one message", async () => {
    // The event ref is the POST's id, so the four collide on CB4's unique
    // index rather than each sending a copy.
    const h = mentionHarness();
    await route(req(REPLY, { body: "@grace @grace @grace @grace" }), env(), h.deps);
    const mention = h.queued.filter((q) => q.kind === "mention");
    expect(mention).toHaveLength(1);
    expect(mention[0]!.eventRef).toBe(`mention:${POST}`);
  });

  it("never tells you that you mentioned yourself", async () => {
    const h = mentionHarness();
    (h.deps.repo as unknown as { getSubjectsForHandles: unknown }).getSubjectsForHandles =
      async () => new Map([["me", AUTHOR]]);
    await route(req(REPLY, { body: "note to self @me" }), env(), h.deps);
    expect(h.queued.filter((q) => q.kind === "mention")).toEqual([]);
  });

  it("does not read the namespace at all when nothing was named", async () => {
    const h = mentionHarness();
    let reads = 0;
    (h.deps.repo as unknown as { getSubjectsForHandles: unknown }).getSubjectsForHandles =
      async () => {
        reads += 1;
        return new Map();
      };
    await route(req(REPLY, { body: "no names here" }), env(), h.deps);
    expect(reads).toBe(0);
  });
});
