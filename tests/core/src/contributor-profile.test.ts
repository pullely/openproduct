// The public contributor profile (openproduct-commons CG1).
//
// This is the most exposed thing the estate publishes about a person, so what
// is pinned here is mostly what the page must NOT do:
//
//   CG-4  nothing is sourced from `identity.*` — every field is authored here
//   CG-5  a stat we cannot see is ABSENT, never zero
//   CG-2  a profile needs an opt-in AND standing, and 404s identically for
//         every reason it does not exist
//   I2    the projection serializes exactly its pinned literal

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PROFILE_DISCLOSURE,
  PROFILE_PROVENANCE_NOTE,
  PUBLIC_CONTRIBUTOR_CARD_KEYS,
  PUBLIC_CONTRIBUTOR_KEYS,
  parseProfileLink,
  profileTitle,
} from "@openproduct/contracts";
import type { OpenproductRepository, PublicContributorRecord } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = "https://openproduct.internal";
const ENV = { ENVIRONMENT: "test" } as Env;

const RECORD: PublicContributorRecord = {
  handle: "ada",
  displayName: "Ada Fenwick",
  bio: "Builds queues that can be read in an afternoon.",
  githubUrl: "https://github.com/ada",
  siteUrl: "https://ada.example",
  openToProject: true,
  publishedAt: "2026-01-04T00:00:00.000Z",
  maintains: [{ slug: "kettleworks", tagline: "A job queue" }],
  // CG4 — a place they CONFIRMED and do not run. The fixture keeps the two
  // sets disjoint on purpose: a listing in both would let a handler that
  // conflated them still pass.
  contributesTo: [{ slug: "ledgerwick", tagline: "Double-entry, plainly" }],
};

function deps(
  record: PublicContributorRecord | null = RECORD,
  seen: string[] = [],
  handles: Array<{ handle: string; publishedAt: string }> = [
    { handle: "ada", publishedAt: "2026-01-04T00:00:00.000Z" },
  ],
  cards: Array<Record<string, unknown>> = [
    {
      handle: "ada",
      displayName: "Ada Fenwick",
      bio: "Builds queues that can be read in an afternoon.",
      openToProject: true,
      maintains: ["kettleworks"],
      contributesTo: 1,
      launched: false,
    },
  ],
) {
  return {
    repo: {
      // openproduct-studio OSD3 — the rows' logos; none unless a test says so.
      async listPublicMediaForSlugs() {
        return new Map();
      },
      async getPublicContributor(handle: string) {
        seen.push(handle);
        return record;
      },
      // DS4 — the index behind the sitemap. Same deps object, same public
      // branch: one place where a public read happens, not two.
      async listPublicContributorHandles() {
        seen.push("index");
        return handles;
      },
      // CG2 — the directory. A DIFFERENT read from the index above, with a
      // different projection, and the fake keeps them separate for the same
      // reason the repository does.
      async listPublicContributorCards(limit: number) {
        seen.push(`cards:${limit}`);
        return cards;
      },
    // FL0 — the follower count and the handle it is keyed by. Counted here so
    // the projection can carry a number; nothing lists followers anywhere.
    async getSubjectsForHandles(handles: readonly string[]) {
      return new Map(handles.map((h) => [h, `sub_${h}`]));
    },
    async countFollowers() {
      return new Map<string, number>();
    },
    } as unknown as OpenproductRepository,
  };
}

function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, { headers: { "x-request-id": "req_cg1", ...headers } });
}

async function read(path: string, d = deps()) {
  const res = await route(get(path), ENV, undefined, d as never);
  return {
    status: res.status,
    body: (await res.json()) as { data?: { contributor: Record<string, unknown> } },
    text: async () => res.text(),
  };
}

describe("I2 — the profile serializes exactly its pinned literal", () => {
  it("no more and no less", async () => {
    const { body } = await read("/internal/public/openproduct/people/ada");
    // On this surface a silent widening is a disclosure ABOUT A PERSON, which
    // is why the literal is edited by hand and this test exists to force it.
    expect(Object.keys(body.data!.contributor).sort()).toEqual([...PUBLIC_CONTRIBUTOR_KEYS]);
  });

  it("carries no subject id, no email, and nothing that could be either", async () => {
    const { body } = await read("/internal/public/openproduct/people/ada");
    const json = JSON.stringify(body);
    // I3 — a subject id on a public page is a join key handed to a stranger,
    // and an email would be a leak outright.
    expect(json).not.toMatch(/usr_|sp_|@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(json).not.toContain("subjectId");
  });
});

describe("CG-5 — a stat we cannot see is absent, never zero", () => {
  it("`reviews` is still null, not 0 — and that is not an oversight", async () => {
    const { body } = await read("/internal/public/openproduct/people/ada");
    // NOTHING OBSERVES PER-PERSON REVIEWS. SN watches repositories, not
    // people, so `Reviews 0` would say somebody reviewed nothing when what we
    // mean is that we cannot look — and a profile stat is a claim about a
    // person's WORK, the one place a fabricated number does real harm.
    expect(body.data!.contributor.reviews).toBeNull();
  });

  it("`contributesTo` is a real count now, and 0 when it is genuinely 0", async () => {
    // CG4 — the distinction OPC-C actually turns on is OBSERVABILITY, not
    // whether the number happens to be zero. We hold every confirmed edge, so
    // a zero here is a fact we measured; `reviews` is a fact we cannot see.
    // Rendering both as a dash would have conflated them forever.
    const { body } = await read("/internal/public/openproduct/people/ada");
    expect(body.data!.contributor.contributesTo).toBe(1);

    const none = await read(
      "/internal/public/openproduct/people/ada",
      deps({ ...RECORD, contributesTo: [] }),
    );
    expect(none.body.data!.contributor.contributesTo).toBe(0);
  });

  it("names the listings behind the count, so it is checkable", async () => {
    // A stat card saying "1" that a reader cannot expand is a number they
    // have to take on trust — and this is a claim about somebody's work.
    const { body } = await read("/internal/public/openproduct/people/ada");
    expect(body.data!.contributor.contributesToListings).toEqual([
      { slug: "ledgerwick", tagline: "Double-entry, plainly", thumbnail: null },
    ]);
  });

  it("counts what it names, always", async () => {
    // The one bug this projection could have: a count from one source and a
    // list from another, drifting the first time somebody edits one of them.
    const { body } = await read("/internal/public/openproduct/people/ada");
    const c = body.data!.contributor as { contributesTo: number; contributesToListings: unknown[] };
    expect(c.contributesTo).toBe(c.contributesToListings.length);
  });

  it("does not count a listing they MAINTAIN twice", async () => {
    // "maintains 1 · contributes to 1" about ONE product is a claim nobody
    // made. The repository subtracts; this pins that the handler does not
    // quietly add it back by unioning the two lists.
    const { body } = await read("/internal/public/openproduct/people/ada");
    const c = body.data!.contributor as {
      maintains: Array<{ slug: string }>;
      contributesToListings: Array<{ slug: string }>;
    };
    const overlap = c.contributesToListings.filter((l) =>
      c.maintains.some((m) => m.slug === l.slug),
    );
    expect(overlap).toEqual([]);
  });
});

describe("CG-2 — four reasons to 404, and one answer for all of them", () => {
  it("answers identically whether the handle is unknown, released, private or without standing", async () => {
    // The repository collapses all four into null on purpose. Distinguishing
    // them would make this read an oracle for "does this person have an
    // account here", which is not a question anybody is entitled to ask of a
    // stranger.
    const { status } = await read("/internal/public/openproduct/people/ada", deps(null));
    expect(status).toBe(404);
  });

  it("a malformed handle 404s rather than 400s", async () => {
    const seen: string[] = [];
    for (const bad of ["a", "-ada", "Ada!", "a".repeat(40)]) {
      const res = await route(
        get(`/internal/public/openproduct/people/${encodeURIComponent(bad)}`),
        ENV,
        undefined,
        deps(RECORD, seen) as never,
      );
      // The SHAPE of the string is not information this surface owes anybody
      // either — and the repository is never even asked.
      expect([bad, res.status]).toEqual([bad, 404]);
    }
    expect(seen).toEqual([]);
  });

  it("resolves case-insensitively to one canonical handle", async () => {
    const seen: string[] = [];
    await route(get("/internal/public/openproduct/people/ADA"), ENV, undefined, deps(RECORD, seen) as never);
    expect(seen).toEqual(["ada"]);
  });
});

describe("OPC-1 / I6 — a profile is a page ABOUT a person, not a page FOR a viewer", () => {
  it("is byte-identical with and without forwarded actor headers", async () => {
    const anonymous = await route(get("/internal/public/openproduct/people/ada"), ENV, undefined, deps() as never);
    const withActor = await route(
      get("/internal/public/openproduct/people/ada", {
        "x-actor-subject-id": "usr_0123456789abcdef0123456789abcdef",
        "x-actor-subject-type": "user",
      }),
      ENV,
      undefined,
      deps() as never,
    );
    expect(await withActor.text()).toBe(await anonymous.text());
  });

  it("is on the public branch, which resolves no actor at all", () => {
    const router = readFileSync(resolve(HERE, "../../../core/src/router.ts"), "utf-8");
    // The route sits inside `publicRoutes`, whose whole property is that
    // there is no principal on the path.
    const publicSection = router.slice(router.indexOf("async function publicRoutes"));
    expect(publicSection).toContain("PUBLIC_PEOPLE_RE.exec(url.pathname)");
    expect(publicSection.slice(0, publicSection.indexOf("async function"))).not.toContain("resolveActor");
  });
});

describe("CG-4 — nothing is copied from identity.*", () => {
  it("the projection has no field that could hold a platform fact", () => {
    const handler = readFileSync(resolve(HERE, "../../../core/src/handlers/public.ts"), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    const section = handler.slice(handler.indexOf("handlePublicContributor"));
    // A copied name goes stale against a platform rename and carries platform
    // authority onto a public page; a copied email would be a leak. The
    // handler reaches for neither because there is nothing to reach for.
    expect(section).not.toMatch(/identity|IDENTITY_WORKER|resolveDisplayName|email/i);
  });

  it("the footer sentence says so, and it is only true because of the shape", () => {
    expect(PROFILE_PROVENANCE_NOTE).toContain("authored on openproduct");
    expect(PROFILE_PROVENANCE_NOTE).toContain("Nothing here is copied from an Orunbase account");
  });

  it("a profile with no authored name renders its HANDLE, never an id", () => {
    // The fallback matters: `null` display name is the common case for
    // somebody who claimed a handle and wrote nothing else, and rendering a
    // subject id there would put a join key on a public page.
    expect(profileTitle({ handle: "ada", displayName: null })).toBe("@ada");
    expect(profileTitle({ handle: "ada", displayName: "   " })).toBe("@ada");
    expect(profileTitle({ handle: "ada", displayName: "Ada Fenwick" })).toBe("Ada Fenwick");
  });
});

describe("authored links are validated where they are written", () => {
  it("https only — an http link on a public page is a downgrade for whoever clicks it", () => {
    expect(parseProfileLink("http://ada.example", "site")).toMatchObject({ reason: "not-https" });
    expect(parseProfileLink("javascript:alert(1)", "site")).toMatchObject({ reason: "not-https" });
    expect(parseProfileLink("ada.example", "site")).toMatchObject({ reason: "not-a-url" });
  });

  it("a `githubUrl` must be github.com — a mislabelled link is a phishing shape", () => {
    expect(parseProfileLink("https://github.com/ada", "github")).toEqual({
      ok: true,
      url: "https://github.com/ada",
    });
    expect(parseProfileLink("https://github.com.evil.test/ada", "github")).toMatchObject({
      reason: "wrong-host",
    });
    // ...but a site link may point anywhere https.
    expect(parseProfileLink("https://ada.example", "site").ok).toBe(true);
  });

  it("clearing a link is allowed, and normalises rather than storing what was typed", () => {
    expect(parseProfileLink("", "site")).toEqual({ ok: true, url: null });
    expect(parseProfileLink(null, "site")).toEqual({ ok: true, url: null });
    // Two spellings of one address must not become two different links.
    expect(parseProfileLink("https://ADA.example:443/x", "site")).toEqual({
      ok: true,
      url: "https://ada.example/x",
    });
  });
});

describe("OD6 — the maker is told what becomes public BEFORE it does", () => {
  it("every projected field has a disclosure line", () => {
    const disclosed = new Set(PROFILE_DISCLOSURE.map((line) => line.key));
    for (const key of PUBLIC_CONTRIBUTOR_KEYS) {
      expect(`${key}: ${disclosed.has(key)}`).toBe(`${key}: true`);
    }
  });

  it("every line says something a person can read, not a field name", () => {
    for (const line of PROFILE_DISCLOSURE) {
      expect(line.label.length).toBeGreaterThan(15);
      expect(line.label).not.toBe(line.key);
    }
    // The one that matters most: their name is theirs, not the platform's.
    expect(PROFILE_DISCLOSURE.find((l) => l.key === "displayName")!.label).toContain(
      "not your Orunbase account name",
    );
  });
});

describe("DS4 — the index of public profiles, for the sitemap", () => {
  const INDEX = "/internal/public/openproduct/people";

  it("answers handles and dates, and NOTHING a person wrote", () => {
    // A public endpoint returning every contributor's name and biography
    // would be a scrapeable people database assembled from pages people
    // published one at a time — which is a materially different thing from
    // what any of them agreed to. What is enumerated here is ADDRESSES a
    // crawler was going to fetch anyway.
    return read(INDEX).then(({ status, body }) => {
      expect(status).toBe(200);
      const people = (body as unknown as { data: { people: Array<Record<string, unknown>> } }).data
        .people;
      expect(people).toEqual([{ handle: "ada", publishedAt: "2026-01-04T00:00:00.000Z" }]);
      for (const person of people) {
        expect(Object.keys(person).sort()).toEqual(["handle", "publishedAt"]);
      }
      const serialised = JSON.stringify(body);
      expect(serialised).not.toContain("Ada Fenwick");
      expect(serialised).not.toContain("bio");
      expect(serialised).not.toContain("ada.example");
      expect(serialised).not.toContain("usr_");
    });
  });

  it("is the COLLECTION, and does not shadow a member", () => {
    // `/people` and `/people/ada` are different routes and the first must not
    // swallow the second. The CG0 grammar happens to forbid a one-character
    // handle, so `/people` could not be one — but relying on a grammar to
    // keep a collection and a member apart stops being safe the day the
    // grammar is relaxed.
    const seen: string[] = [];
    return route(get(INDEX), ENV, undefined, deps(RECORD, seen) as never).then(() => {
      expect(seen).toEqual(["index"]);
      return route(get(`${INDEX}/ada`), ENV, undefined, deps(RECORD, seen) as never);
    }).then(() => {
      expect(seen).toEqual(["index", "ada"]);
    });
  });

  it("answers an empty list when nobody is public — not an error", () => {
    // A young estate with no public profiles is a FACT about the estate. A
    // sitemap route that could not tell "nobody yet" from "the read failed"
    // would either 503 forever or silently drop a namespace.
    return route(get(INDEX), ENV, undefined, deps(RECORD, [], []) as never)
      .then((res) => res.json())
      .then((body) => {
        expect((body as { data: { people: unknown[] } }).data.people).toEqual([]);
      });
  });

  it("resolves no actor — it is on the public branch (I6)", async () => {
    const anonymous = await route(get(INDEX), ENV, undefined, deps() as never);
    const withHeaders = await route(
      get(INDEX, {
        "x-actor-subject-id": "usr_0123456789abcdef0123456789abcdef",
        "x-actor-subject-type": "user",
      }),
      ENV,
      undefined,
      deps() as never,
    );
    expect(anonymous.status).toBe(200);
    // Byte-identical: a forwarded actor header changes nothing about this
    // answer, which is what makes it edge-cacheable for everyone.
    expect(await anonymous.text()).toBe(await withHeaders.text());
  });
});


describe("CG2 — the contributors directory", () => {
  const DIRECTORY = "/internal/public/openproduct/contributors";

  it("returns cards, and EXACTLY the pinned key set", async () => {
    const { status, body } = await read(DIRECTORY);
    expect(status).toBe(200);
    const contributors = (body as unknown as { data: { contributors: Array<Record<string, unknown>> } })
      .data.contributors;
    expect(contributors).toHaveLength(1);
    // A silent widening on THIS surface is a disclosure about a person, which
    // is why the key set is a literal somebody has to edit on purpose (I2).
    expect(Object.keys(contributors[0]!).sort()).toEqual([...PUBLIC_CONTRIBUTOR_CARD_KEYS]);
  });

  it("carries NO links — a card grid is not a link-harvesting endpoint", async () => {
    // The card is deliberately a smaller shape than the page. A directory
    // that shipped every contributor's GitHub and personal site in one
    // response would be a scrapeable list of outbound links wearing a grid;
    // a reader who wants somebody's links opens their page and takes them one
    // at a time.
    const { body } = await read(DIRECTORY);
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain("githubUrl");
    expect(serialised).not.toContain("siteUrl");
    expect(serialised).not.toContain("usr_");
  });

  it("carries the count and NOT a second list of slugs", async () => {
    const { body } = await read(DIRECTORY);
    const card = (body as unknown as { data: { contributors: Array<Record<string, unknown>> } })
      .data.contributors[0]!;
    // CG4 — real now. Counted rather than named: the card already carries one
    // list of slugs, and a second would make a directory of PEOPLE read as a
    // directory of products, which is exactly the widening CG2 narrowed away
    // from. Somebody who wants the names opens the page.
    expect(card.contributesTo).toBe(1);
    expect(Object.keys(card)).not.toContain("contributesToListings");
  });

  it("clamps a hostile limit before it reaches the repository", async () => {
    const seen: string[] = [];
    for (const [raw, expected] of [
      ["", 100],
      ["0", 100],
      ["-5", 100],
      ["abc", 100],
      ["7", 7],
      ["99999", 200],
    ] as const) {
      seen.length = 0;
      await route(get(`${DIRECTORY}?limit=${raw}`), ENV, undefined, deps(RECORD, seen) as never);
      expect([raw, seen[0]]).toEqual([raw, `cards:${expected}`]);
    }
  });

  it("is its own read, and does not go through the sitemap index", async () => {
    // Two endpoints with two projections, because one serving both would end
    // up carrying the union of what each needs.
    const seen: string[] = [];
    await route(get(DIRECTORY), ENV, undefined, deps(RECORD, seen) as never);
    expect(seen).toEqual(["cards:100"]);
    expect(seen).not.toContain("index");
  });

  it("answers an empty list when nobody is eligible — not an error", async () => {
    const res = await route(get(DIRECTORY), ENV, undefined, deps(RECORD, [], [], []) as never);
    const body = (await res.json()) as { data: { contributors: unknown[] } };
    expect(res.status).toBe(200);
    // A young estate with nobody public is a FACT about the estate. The page
    // distinguishes it from a failed read, so the read must not conflate them.
    expect(body.data.contributors).toEqual([]);
  });

  it("resolves no actor — it is one cacheable document (I6)", async () => {
    const anonymous = await route(get(DIRECTORY), ENV, undefined, deps() as never);
    const withHeaders = await route(
      get(DIRECTORY, {
        "x-actor-subject-id": "usr_0123456789abcdef0123456789abcdef",
        "x-actor-subject-type": "user",
      }),
      ENV,
      undefined,
      deps() as never,
    );
    // Who is in the directory does not depend on who is asking.
    expect(await anonymous.text()).toBe(await withHeaders.text());
  });
});
