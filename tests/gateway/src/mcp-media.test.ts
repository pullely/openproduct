// The image tools, over the wire (openproduct-mcp MC4).
//
// Every way in — inline, a one-time upload address, a public URL — ends in
// the website's own upload handler, as the agent's person, carrying the
// credential. What is asserted is that, and every refusal before it.

import { route } from "@openproduct-gateway/router";
import { resetAgentCache, resetSubjectCache } from "@openproduct-gateway/subject";
import { resetBuckets } from "@openproduct-gateway/ratelimit";
import type { Env } from "@openproduct-gateway/env";

const API = "https://api.openproduct.test";
const ADA = "usr_0123456789abcdef0123456789abcdef";
const MEDIA = "opa_test_fixture_media_token_not_a_real_1";
const READ = "opa_test_fixture_read_only_media_not_r1x";
const TICKET = "opu_test_fixture_upload_ticket_not_real_1";
const CRED = { credentialId: "agc_media", subjectId: ADA, kind: "oauth", clientName: "Claude", scopes: ["read", "media"], listingIds: null };

function png(width: number, height: number, pad = 0): Uint8Array {
  const b = new Uint8Array(33 + pad);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13], 8);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

function b64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

interface Seen {
  path: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
}

function bucket(): R2Bucket {
  const objects = new Map<string, Uint8Array>();
  return {
    head: async (key: string) => (objects.has(key) ? {} : null),
    put: async (key: string, value: ArrayBuffer) => void objects.set(key, new Uint8Array(value)),
    get: async () => null,
    delete: async () => undefined,
  } as unknown as R2Bucket;
}

function core(seen: Seen[], tickets: Map<string, unknown>): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
      const raw = init?.body ? (typeof init.body === "string" ? init.body : await new Response(init.body as BodyInit).text()) : null;
      const body = raw ? JSON.parse(raw) : null;
      seen.push({ path: url.pathname, method: init?.method ?? "GET", body, headers });
      const ok = (data: unknown, status = 200) => Response.json({ data, meta: {} }, { status });
      switch (url.pathname) {
        case "/internal/openproduct/agent-credentials/resolve":
          return ok({ credential: body.token === MEDIA ? CRED : body.token === READ ? { ...CRED, credentialId: "agc_read", scopes: ["read"] } : null });
        case "/internal/openproduct/me/listings":
          return ok({ listings: [{ id: "opp_one", orgId: "org_a", slug: "one" }] });
        case "/internal/openproduct/agent-upload-tickets":
          tickets.set(TICKET, { orgId: body.orgId, profileId: body.profileId, kind: body.kind, alt: body.alt, position: body.position, byteLength: body.byteLength, credential: CRED });
          return ok({ ticket: TICKET, expiresAt: "2026-11-28T12:10:00.000Z" }, 201);
        case "/internal/openproduct/agent-upload-tickets/consume": {
          const t = tickets.get(body.ticket) ?? null;
          tickets.delete(body.ticket);
          return ok({ upload: t });
        }
        default:
          if (url.pathname.endsWith("/media") && init?.method === "POST") return ok({ media: { id: "m1", kind: body.kind, alt: body.alt } }, 201);
          if (url.pathname.startsWith("/internal/openproduct/orgs/org_a/profiles/opp_one/media")) return ok({ done: init?.method ?? "GET" });
          return Response.json({ error: { message: "nope" } }, { status: 404 });
      }
    },
    connect: () => {
      throw new Error("not used");
    },
  } as unknown as Fetcher;
}

function env(seen: Seen[] = [], tickets = new Map<string, unknown>()): Env {
  return { ENVIRONMENT: "test", CORE: core(seen, tickets), PUBLIC_API_ORIGIN: API, MEDIA: bucket() } as Env;
}

async function call(token: string, name: string, args: Record<string, unknown>, e: Env): Promise<any> {
  const res = await route(
    new Request(`${API}/mcp/me`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }),
    e,
  );
  return ((await res.json()) as { result: unknown }).result;
}

const mediaPosts = (seen: Seen[]) => seen.filter((s) => s.path === "/internal/openproduct/orgs/org_a/profiles/opp_one/media" && s.method === "POST");

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  resetAgentCache();
  resetSubjectCache();
  resetBuckets();
});

describe("MC4 — inline", () => {
  it("uploads a small image through the website's own handler, as the person", async () => {
    const seen: Seen[] = [];
    const result = await call(MEDIA, "upload_media", { slug: "one", kind: "hero", alt: "The dashboard", dataBase64: b64(png(1200, 630)) }, env(seen));
    expect(result.structuredContent).toEqual({ media: { id: "m1", kind: "hero", alt: "The dashboard" } });
    const [post] = mediaPosts(seen);
    expect(post!.body).toMatchObject({ kind: "hero", alt: "The dashboard", width: 1200, height: 630 });
    expect(post!.headers["x-actor-subject-id"]).toBe(ADA);
    expect(post!.headers["x-actor-agent-credential"]).toBe("agc_media");
  });

  it("refuses what the website refuses: no alt, a wrong kind, a tiny hero, an image that is not one", async () => {
    const seen: Seen[] = [];
    const e = env(seen);
    expect((await call(MEDIA, "upload_media", { slug: "one", kind: "hero", alt: "", dataBase64: b64(png(1200, 630)) }, e)).isError).toBe(true);
    expect((await call(MEDIA, "upload_media", { slug: "one", kind: "screenshot", alt: "x", dataBase64: b64(png(1200, 630)) }, e)).isError).toBe(true);
    expect((await call(MEDIA, "upload_media", { slug: "one", kind: "hero", alt: "x", dataBase64: b64(png(100, 50)) }, e)).isError).toBe(true);
    expect((await call(MEDIA, "upload_media", { slug: "one", kind: "hero", alt: "x", dataBase64: btoa("<html>not an image</html>") }, e)).isError).toBe(true);
    expect(mediaPosts(seen)).toEqual([]);
  });

  it("sends anything over a megabyte to the upload address instead", async () => {
    const result = await call(MEDIA, "upload_media", { slug: "one", kind: "hero", alt: "x", dataBase64: b64(png(1200, 630, 1024 * 1024)) }, env());
    expect(result.content[0].text).toContain("request_media_upload");
  });

  it("is refused to a connection without media", async () => {
    expect((await call(READ, "upload_media", { slug: "one", kind: "hero", alt: "x", dataBase64: b64(png(1200, 630)) }, env())).isError).toBe(true);
  });
});

describe("MC4 — by one-time upload address", () => {
  it("gives an address, takes exactly the declared bytes once, and uploads them as the person", async () => {
    const seen: Seen[] = [];
    const tickets = new Map<string, unknown>();
    const e = env(seen, tickets);
    const bytes = png(1200, 630);
    const minted = await call(MEDIA, "request_media_upload", { slug: "one", kind: "gallery", alt: "A screen", byteLength: bytes.byteLength }, e);
    expect(minted.structuredContent.uploadUrl).toBe(`${API}/v1/agent-uploads/${TICKET}`);
    const put = (body: Uint8Array, length = body.byteLength) =>
      route(new Request(minted.structuredContent.uploadUrl, { method: "PUT", headers: { "content-length": String(length) }, body: body as unknown as BodyInit }), e);
    const res = await put(bytes);
    expect(res.status).toBe(201);
    expect(mediaPosts(seen)[0]!.headers["x-actor-agent-credential"]).toBe("agc_media");
    // Once.
    expect((await put(bytes)).status).toBe(404);
  });

  it("refuses a length other than the declared one", async () => {
    const tickets = new Map<string, unknown>();
    const e = env([], tickets);
    await call(MEDIA, "request_media_upload", { slug: "one", kind: "gallery", alt: "A screen", byteLength: 40 }, e);
    const res = await route(new Request(`${API}/v1/agent-uploads/${TICKET}`, { method: "PUT", headers: { "content-length": "33" }, body: png(1200, 630) as unknown as BodyInit }), e);
    expect(res.status).toBe(422);
  });

  it("refuses an address that was never issued, and anything but PUT", async () => {
    const e = env();
    expect((await route(new Request(`${API}/v1/agent-uploads/opu_nonsense_ticket_that_was_never_issued`, { method: "PUT", headers: { "content-length": "33" }, body: png(1200, 630) as unknown as BodyInit }), e)).status).toBe(404);
    expect((await route(new Request(`${API}/v1/agent-uploads/${TICKET}`), e)).status).toBe(405);
  });

  it("refuses a byteLength past the ceiling without minting anything", async () => {
    const seen: Seen[] = [];
    expect((await call(MEDIA, "request_media_upload", { slug: "one", kind: "hero", alt: "x", byteLength: 6 * 1024 * 1024 }, env(seen))).isError).toBe(true);
    expect(seen.some((s) => s.path === "/internal/openproduct/agent-upload-tickets")).toBe(false);
  });
});

describe("MC4 — from a public URL", () => {
  it("refuses a private, local, IP, http or credentialled address without fetching it", async () => {
    let fetched = 0;
    globalThis.fetch = (async () => {
      fetched += 1;
      return new Response(png(1200, 630) as unknown as BodyInit);
    }) as typeof fetch;
    for (const url of ["http://example.com/a.png", "https://localhost/a.png", "https://10.0.0.1/a.png", "https://a:b@example.com/a.png", "https://example.com:8443/a.png", "https://intranet.corp/a.png"]) {
      expect([url, (await call(MEDIA, "add_media_from_url", { slug: "one", kind: "hero", alt: "x", url }, env())).isError]).toEqual([url, true]);
    }
    expect(fetched).toBe(0);
  });

  it("re-checks every redirect, so a public address cannot bounce to a private one", async () => {
    const asked: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      asked.push(String(input));
      return new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest" } });
    }) as typeof fetch;
    const result = await call(MEDIA, "add_media_from_url", { slug: "one", kind: "hero", alt: "x", url: "https://images.example.org/a.png" }, env());
    expect(result.isError).toBe(true);
    expect(asked).toEqual(["https://images.example.org/a.png"]);
  });

  it("refuses an address that answers something other than an image, without reading it", async () => {
    globalThis.fetch = (async () => new Response("<html>hi</html>", { headers: { "content-type": "text/html" } })) as typeof fetch;
    const seen: Seen[] = [];
    const result = await call(MEDIA, "add_media_from_url", { slug: "one", kind: "hero", alt: "x", url: "https://images.example.org/a.png" }, env(seen));
    expect(result.content[0].text).toContain("not an image");
    expect(mediaPosts(seen)).toEqual([]);
  });

  it("spends a write for every fetch, so failing fetches are bounded too", async () => {
    let fetched = 0;
    globalThis.fetch = (async () => {
      fetched += 1;
      return new Response(null, { status: 500 });
    }) as typeof fetch;
    const e = env();
    for (let i = 0; i < 35; i += 1) await call(MEDIA, "add_media_from_url", { slug: "one", kind: "hero", alt: "x", url: "https://images.example.org/a.png" }, e);
    expect(fetched).toBe(30);
  });

  it("fetches a public image and uploads it as the person", async () => {
    globalThis.fetch = (async () => new Response(png(1200, 630) as unknown as BodyInit, { headers: { "content-type": "image/png" } })) as typeof fetch;
    const seen: Seen[] = [];
    const result = await call(MEDIA, "add_media_from_url", { slug: "one", kind: "hero", alt: "The site", url: "https://images.example.org/a.png" }, env(seen));
    expect(result.isError).toBeFalsy();
    expect(mediaPosts(seen)).toHaveLength(1);
  });
});

describe("MC4 — describing, ordering and removing", () => {
  it("uses the website's media item and gallery routes", async () => {
    const seen: Seen[] = [];
    const e = env(seen);
    const id = "0b8f8a47-62a1-4d6c-9e4f-6f0b8f8a4762";
    await call(MEDIA, "update_media", { slug: "one", mediaId: id, alt: "Better words" }, e);
    await call(MEDIA, "reorder_gallery", { slug: "one", gallery: [id] }, e);
    await call(MEDIA, "remove_media", { slug: "one", mediaId: id }, e);
    const crew = seen.filter((s) => s.path.startsWith("/internal/openproduct/orgs/"));
    expect(crew.map((s) => [s.method, s.path.replace("/internal/openproduct/orgs/org_a/profiles/opp_one", "")])).toEqual([
      ["PATCH", `/media/${id}`],
      ["PUT", "/media"],
      ["DELETE", `/media/${id}`],
    ]);
    expect(crew[0]!.body).toEqual({ alt: "Better words" });
    expect(crew[1]!.body).toEqual({ gallery: [id] });
  });
});
