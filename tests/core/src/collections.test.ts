// Collections (openproduct-commons LC4).
//
// The REPOSITORY's half — the listed() join that hides an item, the curator
// coupling, the dense reorder — is tested in packages/db against real
// Postgres. What is pinned here is the gate and the refusals:
//
//   - an unsigned collection cannot be created, which is the milestone's own
//     done-when, and the refusal says how to clear the bar
//   - every write asks the same question, so none of them can be the one that
//     forgot
//   - ownership is answered by the curator-scoped read, not by a comparison
//   - the bounds are checked against what is HELD, never what is visible
//   - the public reads resolve no actor
//   - a failed add says WHICH failure it was

import { COLLECTION_REFUSALS, MAX_COLLECTION_ITEMS, MAX_LIVE_COLLECTIONS_PER_CURATOR } from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { CollectionHandlerDeps } from "@openproduct-worker/handlers/collections";

const PUBLIC = "https://openproduct.internal/internal/public/openproduct/collections";
const MINE = "https://openproduct.internal/internal/openproduct/me/collections";
const NOW = new Date("2026-08-26T12:00:00.000Z");
const SUBJECT = "usr_0123456789abcdef0123456789abcdef";
const COLL = "aaaaaaaa-4444-4444-8444-aaaaaaaaaaa1";

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

function req(url: string, method = "GET", body?: unknown): Request {
  return new Request(url, {
    method,
    headers: {
      "x-request-id": "req_lc4",
      "x-actor-subject-id": SUBJECT,
      "x-actor-subject-type": "user",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function anon(url: string, method = "GET"): Request {
  return new Request(url, { method, headers: { "x-request-id": "req_lc4" } });
}

interface Harness {
  deps: CollectionHandlerDeps;
  created: unknown[];
  added: unknown[];
  removed: unknown[];
  reordered: unknown[];
  states: unknown[];
}

function harness(options: {
  handle?: string | null;
  owned?: { held: number; visible: number } | null;
  live?: number;
  addable?: boolean;
  addSucceeds?: boolean;
  createSucceeds?: boolean;
  stateSucceeds?: boolean;
  published?: unknown[];
  collection?: unknown | null;
} = {}): Harness {
  const created: unknown[] = [];
  const added: unknown[] = [];
  const removed: unknown[] = [];
  const reordered: unknown[] = [];
  const states: unknown[] = [];

  const repo = {
    async curatorHandleFor() {
      return options.handle === undefined ? "ada" : options.handle;
    },
    async getPublicProfileId() {
      return options.addable === false ? null : "p1";
    },
    async countLiveCollections() {
      return options.live ?? 0;
    },
    async listPublishedCollections() {
      return options.published ?? [];
    },
    async getPublicCollection() {
      return options.collection === undefined ? null : options.collection;
    },
    async listCollectionsForCurator() {
      return [];
    },
    async getCuratorCollection() {
      return options.owned === undefined ? { id: COLL, held: 1, visible: 1 } : options.owned;
    },
    async createCollection(input: unknown) {
      created.push(input);
      return options.createSucceeds === false ? null : { id: COLL, state: "draft" };
    },
    async addCollectionItem(input: unknown) {
      added.push(input);
      return options.addSucceeds !== false;
    },
    async removeCollectionItem(id: string, slug: string) {
      removed.push({ id, slug });
      return true;
    },
    async reorderCollectionItems(id: string, slugs: readonly string[]) {
      reordered.push({ id, slugs });
      return slugs.length;
    },
    async setCollectionState(id: string, subjectId: string, state: string) {
      states.push({ id, subjectId, state });
      return options.stateSucceeds === false ? null : { id, state };
    },
  } as unknown as OpenproductRepository;

  return {
    deps: { repo, now: () => NOW, generateId: () => COLL as never } as CollectionHandlerDeps,
    created,
    added,
    removed,
    reordered,
    states,
  };
}

async function body(res: Response): Promise<Record<string, unknown>> {
  const parsed = (await res.json()) as { data?: Record<string, unknown>; error?: Record<string, unknown> };
  return parsed.data ?? parsed.error ?? {};
}

describe("an unsigned collection cannot be created (LC4's done-when)", () => {
  it("refuses somebody whose handle does not resolve", async () => {
    const h = harness({ handle: null });
    const res = await route(
      req(MINE, "POST", { slug: "picks", title: "Picks" }),
      env(),
      h.deps as never,
    );
    expect(res.status).toBe(403);
    expect(h.created).toEqual([]);
  });

  it("the refusal tells them how to clear the bar", async () => {
    const h = harness({ handle: null });
    const res = await route(req(MINE, "POST", { slug: "p", title: "P" }), env(), h.deps as never);
    const said = String((await body(res)).message ?? "");
    // A refusal aimed at somebody who has done nothing wrong. "403 forbidden"
    // would be accurate and would read as a door with no handle.
    expect(said).toBe(COLLECTION_REFUSALS["not-a-curator"].says);
    expect(said).toMatch(/publish a listing/i);
  });

  it("asks the SAME question on every write, so none can be the one that forgot", async () => {
    for (const [url, payload] of [
      [MINE, { slug: "p", title: "P" }],
      [`${MINE}/add`, { collectionId: COLL, slug: "thing" }],
      [`${MINE}/remove`, { collectionId: COLL, slug: "thing" }],
      [`${MINE}/reorder`, { collectionId: COLL, order: ["a"] }],
      [`${MINE}/state`, { collectionId: COLL, state: "published" }],
    ] as const) {
      const h = harness({ handle: null });
      const res = await route(req(url, "POST", payload), env(), h.deps as never);
      expect({ url, status: res.status }).toEqual({ url, status: 403 });
    }
  });

  it("lets a curator through, and records their subject as the signature", async () => {
    const h = harness();
    const res = await route(
      req(MINE, "POST", { slug: "picks", title: "Eight things", blurb: "Why" }),
      env(),
      h.deps as never,
    );
    expect(res.status).toBe(201);
    expect(h.created[0]).toMatchObject({
      slug: "picks",
      title: "Eight things",
      curatorSubjectId: SUBJECT,
    });
  });

  it("tells the studio whether they may curate, even with nothing to show", async () => {
    // The studio has to render two quite different pages — "you have none
    // yet" and "you cannot yet, and here is why" — and cannot tell them apart
    // from an empty array.
    const yes = await body(await route(req(MINE), env(), harness().deps as never));
    expect(yes).toMatchObject({ eligible: true, curatorHandle: "ada", collections: [] });
    const no = await body(await route(req(MINE), env(), harness({ handle: null }).deps as never));
    expect(no).toMatchObject({ eligible: false, curatorHandle: null });
  });
});

describe("ownership and bounds", () => {
  it("refuses a collection that is not theirs, through the scoped read", async () => {
    const h = harness({ owned: null });
    const res = await route(
      req(`${MINE}/add`, "POST", { collectionId: COLL, slug: "thing" }),
      env(),
      h.deps as never,
    );
    expect(res.status).toBe(404);
    expect(h.added).toEqual([]);
  });

  it("normalises a slug before it reaches the repository", async () => {
    const h = harness();
    await route(
      req(`${MINE}/add`, "POST", { collectionId: COLL, slug: "  Acme-Thing  " }),
      env(),
      h.deps as never,
    );
    expect(h.added[0]).toMatchObject({ slug: "acme-thing" });
  });

  it("bounds items against what is HELD, not what is visible", async () => {
    // A curator at the limit whose listings went private has not freed a
    // slot: the items are still theirs and still come back.
    const h = harness({ owned: { held: MAX_COLLECTION_ITEMS, visible: 2 } });
    const res = await route(
      req(`${MINE}/add`, "POST", { collectionId: COLL, slug: "thing" }),
      env(),
      h.deps as never,
    );
    expect(res.status).toBe(409);
    expect(String((await body(res)).message)).toMatch(/second directory/i);
    expect(h.added).toEqual([]);
  });

  it("says WHICH failure a refused add was", async () => {
    // "Already in" and "not addable" are different to the person, and
    // classified by a read AFTER the failed write — the INSERT's own SELECT
    // is the correctness guard, this only picks the sentence.
    const alreadyIn = harness({ addSucceeds: false, addable: true });
    expect(String((await body(await route(
      req(`${MINE}/add`, "POST", { collectionId: COLL, slug: "thing" }),
      env(),
      alreadyIn.deps as never,
    ))).message)).toMatch(/already in this collection/i);

    const notAddable = harness({ addSucceeds: false, addable: false });
    expect(String((await body(await route(
      req(`${MINE}/add`, "POST", { collectionId: COLL, slug: "thing" }),
      env(),
      notAddable.deps as never,
    ))).message)).toMatch(/unpublished or may not exist/i);
  });

  it("refuses to publish an empty collection, counting what is HELD", async () => {
    const empty = harness({ owned: { held: 0, visible: 0 } });
    const res = await route(
      req(`${MINE}/state`, "POST", { collectionId: COLL, state: "published" }),
      env(),
      empty.deps as never,
    );
    expect(res.status).toBe(422);
    expect(empty.states).toEqual([]);

    // A collection whose items are ALL currently private is not empty — it is
    // having a bad day, and refusing it would be refusing on the strength of
    // somebody else's unpublish.
    const allHidden = harness({ owned: { held: 3, visible: 0 } });
    expect(
      (await route(
        req(`${MINE}/state`, "POST", { collectionId: COLL, state: "published" }),
        env(),
        allHidden.deps as never,
      )).status,
    ).toBe(200);
  });

  it("bounds how much of the index one voice may be", async () => {
    const h = harness({ live: MAX_LIVE_COLLECTIONS_PER_CURATOR });
    const res = await route(
      req(`${MINE}/state`, "POST", { collectionId: COLL, state: "published" }),
      env(),
      h.deps as never,
    );
    expect(res.status).toBe(409);
    expect(String((await body(res)).message)).toMatch(/retire one/i);
  });

  it("does not count live collections when merely retiring", async () => {
    // The cap is about what reaches the index. Taking something DOWN can
    // never breach it, and asking would refuse a curator at the limit the one
    // act that would put them back under it.
    const h = harness({ live: MAX_LIVE_COLLECTIONS_PER_CURATOR });
    const res = await route(
      req(`${MINE}/state`, "POST", { collectionId: COLL, state: "retired" }),
      env(),
      h.deps as never,
    );
    expect(res.status).toBe(200);
    expect(h.states[0]).toMatchObject({ state: "retired" });
  });

  it("refuses an illegal transition rather than inventing one", async () => {
    const h = harness({ stateSucceeds: false });
    const res = await route(
      req(`${MINE}/state`, "POST", { collectionId: COLL, state: "published" }),
      env(),
      h.deps as never,
    );
    expect(res.status).toBe(409);
  });

  it("validates the shape of what it is given", async () => {
    const h = harness();
    // A title is what a reader sees before anything else.
    expect((await route(req(MINE, "POST", { slug: "p", title: "  " }), env(), h.deps as never)).status).toBe(422);
    // An address a person cannot predict is an address they cannot share.
    expect((await route(req(MINE, "POST", { slug: "Not A Slug", title: "T" }), env(), h.deps as never)).status).toBe(422);
    expect(
      (await route(req(`${MINE}/reorder`, "POST", { collectionId: COLL, order: "nope" }), env(), h.deps as never)).status,
    ).toBe(422);
    expect(h.created).toEqual([]);
  });
});

describe("the public reads", () => {
  it("serve the index anonymously", async () => {
    const h = harness({ published: [{ slug: "picks", curatorHandle: "ada", count: 3 }] });
    const res = await route(anon(PUBLIC), env(), h.deps as never);
    expect(res.status).toBe(200);
    expect((await body(res)).collections).toHaveLength(1);
  });

  it("404 a collection that is not published or whose curator went private", async () => {
    // The two are deliberately indistinguishable from outside: telling a
    // stranger "this exists but its curator went private" reports on
    // somebody's privacy setting to people with no business knowing.
    const h = harness({ collection: null });
    expect((await route(anon(`${PUBLIC}/picks`), env(), h.deps as never)).status).toBe(404);
  });

  it("resolve no actor — a collection is one document for everybody", async () => {
    const h = harness({
      collection: { slug: "picks", title: "Picks", curatorHandle: "ada", items: [] },
    });
    const anonymous = await body(await route(anon(`${PUBLIC}/picks`), env(), h.deps as never));
    const signedIn = await body(await route(req(`${PUBLIC}/picks`), env(), h.deps as never));
    // There is no "your view" of somebody's published judgement.
    expect(JSON.stringify(signedIn)).toBe(JSON.stringify(anonymous));
  });

  it("refuse a write to a read", async () => {
    const h = harness();
    expect((await route(anon(PUBLIC, "POST"), env(), h.deps as never)).status).toBe(405);
    expect((await route(anon(`${PUBLIC}/picks`, "POST"), env(), h.deps as never)).status).toBe(405);
  });

  it("are not reachable from the maintainer plane by accident", async () => {
    // `collections` is matched before the profile matcher, so it can never
    // parse as a listing slug.
    const h = harness({ collection: null });
    const res = await route(anon("https://openproduct.internal/internal/public/openproduct/collections"), env(), h.deps as never);
    expect(res.status).toBe(200);
  });
});
