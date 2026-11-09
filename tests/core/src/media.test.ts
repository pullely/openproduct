// The media row handlers (openproduct-worldclass MD1).
//
// The bytes never come here; the gateway sniffed and stored them. What this
// door decides is whether a maker may have a ROW, and it decides it the way
// every maintainer write does — `authorizeFor("write")` from openproduct's
// own `listing_maintainers` — and then refuses what MD0's model refuses,
// as a whole list rather than one constraint at a time.

import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { ProfileHandlerDeps } from "@openproduct-worker/handlers/profiles";
import type { ProductMediaRecord } from "@openproduct/db";

const ORG_PUBLIC = "org_0123456789abcdef0123456789abcdef";
const PROFILE_PUBLIC = "opp_0123456789abcdef0123456789abcdef";
const BASE = `https://openproduct-worker.internal/internal/openproduct/orgs/${ORG_PUBLIC}/profiles/${PROFILE_PUBLIC}/media`;
const ENV = { ENVIRONMENT: "test" } as Env;
const MAINTAINER = { subjectId: "usr_ada", subjectType: "user" };
const STRANGER = { subjectId: "usr_zed", subjectType: "user" };
const REF = `${"c".repeat(64)}.png`;

function req(url: string, method: string, body?: unknown, actor = MAINTAINER): Request {
  return new Request(url, {
    method,
    headers: {
      "content-type": "application/json",
      "x-actor-subject-id": actor.subjectId,
      "x-actor-subject-type": actor.subjectType,
      "x-request-id": "req_md1",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function harness(rows: ProductMediaRecord[] = []) {
  const inserted: unknown[] = [];
  const deleted: string[] = [];
  const audits: Array<{ type: string }> = [];
  const media = [...rows];
  const repo = {
    async getProfileForOrg() {
      return { id: "11111111-1111-4111-8111-111111111111", slug: "acme-thing", visibility: "private" };
    },
    async getListingRole(_profileId: string, subjectId: string) {
      return subjectId === MAINTAINER.subjectId ? "maintainer" : null;
    },
    async listMediaForProfile() {
      return media;
    },
    async insertMedia(input: ProductMediaRecord & { profileId: string }) {
      inserted.push(input);
      const row = { ...input };
      media.push(row);
      return row;
    },
    // openproduct-studio OSD4 — the slot's upsert, as the column does it.
    async replaceAuthoredSingleton(input: ProductMediaRecord & { profileId: string }) {
      inserted.push(input);
      const at = media.findIndex((m) => m.kind === input.kind && m.position === 0);
      const row = { ...input, observedAt: null };
      if (at >= 0) media.splice(at, 1, row);
      else media.push(row);
      return row;
    },
    async updateMediaAlt(_profileId: string, id: string, alt: string) {
      const row = media.find((m) => m.id === id && m.kind !== "screenshot");
      if (!row) return null;
      row.alt = alt;
      return row;
    },
    async reorderGallery(_profileId: string, ids: readonly string[]) {
      ids.forEach((id, i) => {
        const row = media.find((m) => m.id === id);
        if (row) row.position = i;
      });
      return media.filter((m) => m.kind === "gallery").sort((x, y) => x.position - y.position);
    },
    async refreshCatalogueMedia() {
      return false;
    },
    async deleteMedia(_profileId: string, id: string) {
      const at = media.findIndex((m) => m.id === id);
      if (at < 0) return null;
      deleted.push(id);
      return media.splice(at, 1)[0]!;
    },
    async appendAudit(a: { type: string }) {
      audits.push(a);
    },
  };
  const deps = { repo, now: () => new Date("2026-09-10T09:00:00.000Z") } as unknown as ProfileHandlerDeps;
  return { deps, inserted, deleted, audits };
}

const hero = (over: Partial<ProductMediaRecord> = {}): ProductMediaRecord => ({
  id: "22222222-2222-4222-8222-222222222222",
  kind: "hero",
  storageRef: REF,
  alt: "The dashboard",
  width: 1200,
  height: 630,
  position: 0,
  observedAt: null,
  ...over,
});

const good = { kind: "hero", alt: "The dashboard", position: 0, ref: REF, width: 1200, height: 630 };

describe("MD1 — adding a row", () => {
  it("writes the row, audits it, and answers 201 with the authored fact", async () => {
    const h = harness();
    const res = await route(req(BASE, "POST", good), ENV, h.deps as never);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { media: { value: { kind: string; ref: string }; provenance: { class: string } } } };
    expect(body.data.media.value.kind).toBe("hero");
    expect(body.data.media.value.ref).toBe(REF);
    // AUTHORED, by the type. An observedAt here would be a compile error
    // in the contract and a CHECK failure in the column.
    expect(body.data.media.provenance).toEqual({ class: "authored", by: "maintainer" });
    expect(h.inserted).toHaveLength(1);
    expect(h.audits.map((a) => a.type)).toEqual(["openproduct.media.added"]);
  });

  it("refuses a stranger with 404, like every maintainer door", async () => {
    const h = harness();
    const res = await route(req(BASE, "POST", good, STRANGER), ENV, h.deps as never);
    expect(res.status).toBe(404);
    expect(h.inserted).toEqual([]);
  });

  it("refuses a screenshot BY NAME — that kind is observed, never uploaded", async () => {
    const h = harness();
    const res = await route(req(BASE, "POST", { ...good, kind: "screenshot" }), ENV, h.deps as never);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { details: { fields: Record<string, string[]> } } };
    expect(body.error.details.fields.kind![0]).toMatch(/observed by the sweep/);
  });

  // openproduct-studio OSD4: this used to refuse ("at most one hero") and
  // make the maker remove the old one first — two acts, and a listing with no
  // face between them. A second upload now REPLACES the one in the slot.
  it("replaces the hero in one step rather than refusing a second", async () => {
    const h = harness([hero()]);
    const next = `${"d".repeat(64)}.png`;
    const res = await route(req(BASE, "POST", { ...good, ref: next }), ENV, h.deps as never);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { media: { value: { kind: string; ref: string } } } };
    expect(body.data.media.value.ref).toBe(next);
    expect(h.inserted).toHaveLength(1);
  });

  it("replaces a logo the same way, at the logo's own shape", async () => {
    const logo = { kind: "logo", alt: "The mark", position: 0, width: 256, height: 256 };
    const h = harness([hero({ id: "44444444-4444-4444-8444-444444444444", kind: "logo", width: 256, height: 256 })]);
    const res = await route(req(BASE, "POST", { ...logo, ref: `${"e".repeat(64)}.png` }), ENV, h.deps as never);
    expect(res.status).toBe(201);
    const banner = await route(req(BASE, "POST", { ...logo, width: 1200, height: 630, ref: REF }), ENV, h.deps as never);
    expect(banner.status).toBe(422);
  });

  it("refuses a gallery beyond the ceiling, and a taken slot, in one answer", async () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      hero({ id: `3333333${i}-3333-4333-8333-333333333333`, kind: "gallery", position: i }),
    );
    const h = harness(rows);
    const res = await route(req(BASE, "POST", { ...good, kind: "gallery", position: 3 }), ENV, h.deps as never);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { details: { fields: { media: string[] } } } };
    const said = body.error.details.fields.media.join(" ");
    expect(said).toMatch(/at most 8 images/);
    expect(said).toMatch(/claim position 3/);
  });

  it("refuses a reference the gateway could not have produced", async () => {
    const h = harness();
    for (const ref of ["../etc/passwd", `${"c".repeat(64)}.svg`, "https://evil/x.png", ""]) {
      const res = await route(req(BASE, "POST", { ...good, ref }), ENV, h.deps as never);
      expect([ref, res.status]).toEqual([ref, 422]);
    }
    expect(h.inserted).toEqual([]);
  });

  it("refuses blank alt text and out-of-range dimensions", async () => {
    const h = harness();
    expect((await route(req(BASE, "POST", { ...good, alt: "   " }), ENV, h.deps as never)).status).toBe(422);
    expect((await route(req(BASE, "POST", { ...good, width: 100 }), ENV, h.deps as never)).status).toBe(422);
    expect((await route(req(BASE, "POST", { ...good, height: 9000 }), ENV, h.deps as never)).status).toBe(422);
    expect(h.inserted).toEqual([]);
  });

  it("answers 409 when the column beats the check — a race for one slot", async () => {
    const h = harness();
    (h.deps.repo as unknown as { insertMedia: unknown }).insertMedia = async () => {
      throw new Error('duplicate key value violates unique constraint "openproduct_product_media_slot"');
    };
    // A gallery slot: a logo or a hero no longer races — it upserts (OSD4).
    const res = await route(req(BASE, "POST", { ...good, kind: "gallery", position: 2 }), ENV, h.deps as never);
    expect(res.status).toBe(409);
  });
});

describe("MD1 — listing and removing", () => {
  it("lists every row for a maintainer, on a draft", async () => {
    const h = harness([hero()]);
    const res = await route(req(BASE, "GET"), ENV, h.deps as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { media: unknown[] } };
    expect(body.data.media).toHaveLength(1);
  });

  it("removes a row by id, scoped to the listing, and audits it", async () => {
    const h = harness([hero()]);
    const res = await route(req(`${BASE}/22222222-2222-4222-8222-222222222222`, "DELETE"), ENV, h.deps as never);
    expect(res.status).toBe(200);
    expect(h.deleted).toEqual(["22222222-2222-4222-8222-222222222222"]);
    expect(h.audits.map((a) => a.type)).toEqual(["openproduct.media.removed"]);
  });

  it("404s a row that is not there, and a stranger", async () => {
    const h = harness([hero()]);
    expect((await route(req(`${BASE}/99999999-9999-4999-8999-999999999999`, "DELETE"), ENV, h.deps as never)).status).toBe(404);
    expect((await route(req(`${BASE}/22222222-2222-4222-8222-222222222222`, "DELETE", undefined, STRANGER), ENV, h.deps as never)).status).toBe(404);
    expect(h.deleted).toEqual([]);
  });
});

describe("openproduct-studio OSD3 — the home list's catalogue row follows the media", () => {
  const LOGO_REF = `${"e".repeat(64)}.png`;
  const logo = { kind: "logo", alt: "The mark", position: 0, ref: LOGO_REF, width: 256, height: 256 };

  function withRefresh(h: ReturnType<typeof harness>, refresh: (profileId: string) => Promise<boolean>) {
    const refreshed: string[] = [];
    (h.deps.repo as unknown as { refreshCatalogueMedia: (id: string) => Promise<boolean> }).refreshCatalogueMedia = async (
      profileId: string,
    ) => {
      refreshed.push(profileId);
      return refresh(profileId);
    };
    return refreshed;
  }

  it("refreshes the listing's catalogue row after an add", async () => {
    const h = harness();
    const refreshed = withRefresh(h, async () => true);
    expect((await route(req(BASE, "POST", logo), ENV, h.deps as never)).status).toBe(201);
    expect(refreshed).toEqual(["01234567-89ab-cdef-0123-456789abcdef"]);
  });

  it("refreshes it after a remove", async () => {
    const h = harness([hero()]);
    const refreshed = withRefresh(h, async () => true);
    const res = await route(req(`${BASE}/22222222-2222-4222-8222-222222222222`, "DELETE"), ENV, h.deps as never);
    expect(res.status).toBe(200);
    expect(refreshed).toHaveLength(1);
  });

  it("a failed refresh never fails the upload — the sweep catches up", async () => {
    const h = harness();
    withRefresh(h, async () => {
      throw new Error("catalog_cards unavailable");
    });
    const res = await route(req(BASE, "POST", logo), ENV, h.deps as never);
    expect(res.status).toBe(201);
    expect(h.inserted).toHaveLength(1);
    expect(h.audits.map((a) => a.type)).toEqual(["openproduct.media.added"]);
  });

  it("a refused upload refreshes nothing", async () => {
    const h = harness();
    const refreshed = withRefresh(h, async () => true);
    expect((await route(req(BASE, "POST", { ...logo, kind: "screenshot" }), ENV, h.deps as never)).status).toBe(422);
    expect(refreshed).toEqual([]);
  });
});

// openproduct-studio OSD6 — words and order, changed in place.
describe("OSD6 — alt text and gallery order", () => {
  const g = (id: string, position: number) => hero({ id, kind: "gallery", position });
  const A = "55555555-5555-4555-8555-555555555555";
  const B = "66666666-6666-4666-8666-666666666666";
  const C = "77777777-7777-4777-8777-777777777777";

  it("changes the alt text of an image in place, and audits it", async () => {
    const h = harness([hero()]);
    const res = await route(req(`${BASE}/22222222-2222-4222-8222-222222222222`, "PATCH", { alt: "The dashboard, at night" }), ENV, h.deps as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { media: { value: { alt: string } } } };
    expect(body.data.media.value.alt).toBe("The dashboard, at night");
    expect(h.audits.map((a) => a.type)).toEqual(["openproduct.media.described"]);
  });

  it("refuses blank alt text, and a stranger", async () => {
    const h = harness([hero()]);
    expect((await route(req(`${BASE}/22222222-2222-4222-8222-222222222222`, "PATCH", { alt: "  " }), ENV, h.deps as never)).status).toBe(422);
    expect((await route(req(`${BASE}/22222222-2222-4222-8222-222222222222`, "PATCH", { alt: "x" }, STRANGER), ENV, h.deps as never)).status).toBe(404);
  });

  it("puts the gallery in the maker's order", async () => {
    const h = harness([g(A, 0), g(B, 1), g(C, 2)]);
    const res = await route(req(BASE, "PUT", { gallery: [C, A, B] }), ENV, h.deps as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { media: Array<{ value: { id: string; position: number } }> } };
    expect(body.data.media.map((m) => `${m.value.id.slice(0, 1)}:${m.value.position}`)).toEqual(["7:0", "5:1", "6:2"]);
    expect(h.audits.map((a) => a.type)).toEqual(["openproduct.media.reordered"]);
  });

  it("refuses an order that drops or repeats an image", async () => {
    const h = harness([g(A, 0), g(B, 1), g(C, 2)]);
    for (const gallery of [[A, B], [A, A, B], [A, B, "88888888-8888-4888-8888-888888888888"]]) {
      expect((await route(req(BASE, "PUT", { gallery }), ENV, h.deps as never)).status).toBe(422);
    }
  });
});
