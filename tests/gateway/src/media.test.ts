// The upload path, byte by byte (openproduct-worldclass MD1).
//
// This is the first surface where a stranger hands the product bytes it
// serves back to other people, so what is pinned here is ORDER and REFUSAL
// rather than happy paths:
//
//   THE CEILING IS CHECKED BEFORE THE BODY IS READ. A 50 MB anonymous body
//   is refused at the header, and the test proves the stream was never
//   consumed.
//
//   THE BYTES DECIDE, NEVER THE HEADER. A `content-type: image/png` over HTML
//   is refused; a PNG sent as `application/octet-stream` is accepted.
//
//   A REFUSED ROW REMOVES ONLY WHAT THIS REQUEST STORED. Content-addressing
//   means the same bytes may already be somebody else's hero.
//
//   SERVED IMMUTABLE, NOSNIFF, WITH THE SNIFF'S TYPE. And a derivative that
//   does not exist serves the original rather than a 404.

import { route } from "@openproduct-gateway/router";
import type { Env } from "@openproduct-gateway/env";
import { resetSubjectCache } from "@openproduct-gateway/subject";
import { resetBuckets } from "@openproduct-gateway/ratelimit";
import { sniff } from "@openproduct-gateway/media";

const ORG = "org_0123456789abcdef0123456789abcdef";
const PROFILE = "prf_0123456789abcdef0123456789abcdef";
const UPLOAD = `https://gw.test/v1/organizations/${ORG}/openproduct/profiles/${PROFILE}/media`;

// ── Handcrafted headers: the smallest bytes each sniff accepts ─────────────

function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13], 8); // IHDR length
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

function jpeg(width: number, height: number): Uint8Array {
  // SOI, then an APP0 segment we skip, then SOF0 with the dimensions.
  const b = new Uint8Array(2 + 4 + 2 + 2 + 7 + 2);
  let at = 0;
  b[at++] = 0xff; b[at++] = 0xd8; // SOI
  b[at++] = 0xff; b[at++] = 0xe0; b[at++] = 0x00; b[at++] = 0x04; at += 2; // APP0, len 4, 2 bytes payload
  b[at++] = 0xff; b[at++] = 0xc0; // SOF0
  b[at++] = 0x00; b[at++] = 0x0b; // length 11
  b[at++] = 0x08; // precision
  b[at++] = (height >> 8) & 0xff; b[at++] = height & 0xff;
  b[at++] = (width >> 8) & 0xff; b[at++] = width & 0xff;
  b[at++] = 0x03; b[at++] = 0x01; // components (truncated is fine — sniff stops at SOF)
  return b;
}

function webpLossless(width: number, height: number): Uint8Array {
  const b = new Uint8Array(30);
  b.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  b.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  b.set([0x56, 0x50, 0x38, 0x4c], 12); // VP8L
  b[20] = 0x2f;
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  new DataView(b.buffer).setUint32(21, bits, true);
  return b;
}

function webpLossy(width: number, height: number): Uint8Array {
  const b = new Uint8Array(30);
  b.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  b.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  b.set([0x56, 0x50, 0x38, 0x20], 12); // "VP8 "
  b.set([0x9d, 0x01, 0x2a], 23); // keyframe start code
  new DataView(b.buffer).setUint16(26, width & 0x3fff, true);
  new DataView(b.buffer).setUint16(28, height & 0x3fff, true);
  return b;
}

function webpExtended(width: number, height: number): Uint8Array {
  const b = new Uint8Array(30);
  b.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  b.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  b.set([0x56, 0x50, 0x38, 0x58], 12); // VP8X
  const w = width - 1;
  const h = height - 1;
  b.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff], 24);
  b.set([h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 27);
  return b;
}

// ── A bucket in memory ───────────────────────────────────────────────────

interface Stored {
  // `Uint8Array.buffer` is typed `ArrayBufferLike` (it may be a
  // SharedArrayBuffer); the fake stores what the real code hands it.
  bytes: ArrayBufferLike;
  contentType: string;
}

function fakeBucket(): { bucket: R2Bucket; objects: Map<string, Stored>; puts: string[]; deletes: string[] } {
  const objects = new Map<string, Stored>();
  const puts: string[] = [];
  const deletes: string[] = [];
  const bucket = {
    async head(key: string) {
      return objects.has(key) ? { key } : null;
    },
    async put(key: string, value: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) {
      puts.push(key);
      objects.set(key, { bytes: value, contentType: opts?.httpMetadata?.contentType ?? "" });
      return { key };
    },
    async get(key: string) {
      const o = objects.get(key);
      if (!o) return null;
      return {
        key,
        size: o.bytes.byteLength,
        httpEtag: `"${key.slice(-8)}"`,
        httpMetadata: { contentType: o.contentType },
        body: new Blob([o.bytes as ArrayBuffer]).stream(),
        arrayBuffer: async () => o.bytes as ArrayBuffer,
      };
    },
    async delete(key: string) {
      deletes.push(key);
      objects.delete(key);
    },
  } as unknown as R2Bucket;
  return { bucket, objects, puts, deletes };
}

// ── The harness ──────────────────────────────────────────────────────────

interface Captured {
  url: string;
  method: string;
  body: string | null;
}

function coreStub(respond: (url: string, init?: RequestInit) => Response, captured: Captured[]): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      captured.push({ url, method: init?.method ?? "GET", body: (init?.body as string) ?? null });
      return respond(url, init);
    },
  } as unknown as Fetcher;
}

const realFetch = globalThis.fetch;
function stubIdentity(subjectId: string | null): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("https://platform.test/v1/identity/me")) {
      if (subjectId === null) return new Response("{}", { status: 401 });
      return Response.json({ data: { subjectId, displayName: "Ada" } });
    }
    return new Response("unexpected", { status: 599 });
  }) as typeof fetch;
}

function envWith(core: Fetcher | undefined, bucket?: R2Bucket): Env {
  return {
    CORE: core,
    ENVIRONMENT: "test",
    PLATFORM_API_URL: "https://platform.test",
    SITE_ORIGIN: "https://openproduct.live",
    MEDIA: bucket,
  } as Env;
}

function upload(bytes: Uint8Array, opts: { auth?: boolean; length?: number; type?: string; query?: string } = {}) {
  const headers: Record<string, string> = {
    "content-length": String(opts.length ?? bytes.byteLength),
    "content-type": opts.type ?? "application/octet-stream",
  };
  if (opts.auth !== false) headers.authorization = "Bearer tok";
  return new Request(`${UPLOAD}?${opts.query ?? "kind=hero&alt=The+dashboard&position=0"}`, {
    method: "POST",
    headers,
    body: bytes,
  });
}

const accepts = (captured: Captured[]) =>
  coreStub(() => Response.json({ data: { media: { value: { kind: "hero" } } } }, { status: 201 }), captured);

beforeEach(() => {
  resetSubjectCache();
  resetBuckets();
  stubIdentity("usr_ada");
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

describe("the sniff", () => {
  it("reads PNG, JPEG and all three WebP flavours' dimensions from their headers", () => {
    expect(sniff(png(1200, 630))).toEqual({ format: "png", width: 1200, height: 630 });
    expect(sniff(jpeg(1600, 900))).toEqual({ format: "jpg", width: 1600, height: 900 });
    expect(sniff(webpLossless(800, 450))).toEqual({ format: "webp", width: 800, height: 450 });
    // The other two WebP chunk kinds: lossy carries 14-bit sizes after a
    // keyframe start code; extended carries 24-bit canvas sizes minus one.
    expect(sniff(webpLossy(1024, 512))).toEqual({ format: "webp", width: 1024, height: 512 });
    expect(sniff(webpExtended(4000, 3000))).toEqual({ format: "webp", width: 4000, height: 3000 });
  });

  it("refuses anything it does not recognise exactly", () => {
    expect(sniff(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniff(new TextEncoder().encode("<!doctype html><html>"))).toBeNull();
    expect(sniff(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBeNull(); // GIF89a
    expect(sniff(png(1200, 630).slice(0, 20))).toBeNull(); // truncated before the dimensions
    expect(sniff(new Uint8Array(0))).toBeNull();
  });
});

describe("the ceiling is checked before the body is read", () => {
  it("refuses a declared length over the ceiling without touching the stream", async () => {
    const { bucket } = fakeBucket();
    // A stream, so `bodyUsed` means something. NOT a flag inside `pull()`:
    // a ReadableStream calls `pull` proactively at construction to fill its
    // queue, before anybody reads — the first draft of this test flipped its
    // flag on `new Request` and blamed the router.
    const body = new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024));
      },
    });
    const req = new Request(`${UPLOAD}?kind=hero&alt=x`, {
      method: "POST",
      headers: { "content-length": String(50 * 1024 * 1024), authorization: "Bearer tok" },
      body,
      // @ts-expect-error — undici needs this for a streaming body
      duplex: "half",
    });
    const res = await route(req, envWith(accepts([]), bucket));
    expect(res.status).toBe(413);
    expect(req.bodyUsed).toBe(false);
  });

  it("refuses a body with no declared length", async () => {
    const { bucket } = fakeBucket();
    const req = new Request(`${UPLOAD}?kind=hero&alt=x`, {
      method: "POST",
      headers: { authorization: "Bearer tok" },
    });
    const res = await route(req, envWith(accepts([]), bucket));
    expect(res.status).toBe(411);
  });

  it("refuses an anonymous upload before reading the body", async () => {
    const { bucket, puts } = fakeBucket();
    stubIdentity(null);
    const res = await route(upload(png(1200, 630), { auth: false }), envWith(accepts([]), bucket));
    expect(res.status).toBe(401);
    expect(puts).toEqual([]);
  });

  it("answers 503, not a throw, where no bucket is bound", async () => {
    const res = await route(upload(png(1200, 630)), envWith(accepts([]), undefined));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("storage_unavailable");
  });
});

describe("the bytes decide, never the header", () => {
  it("refuses HTML wearing an image content-type", async () => {
    const { bucket, puts } = fakeBucket();
    const html = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");
    const res = await route(upload(html, { type: "image/png" }), envWith(accepts([]), bucket));
    expect(res.status).toBe(415);
    expect(puts).toEqual([]);
  });

  it("accepts a PNG sent as octet-stream, and stores it under the sniffed type", async () => {
    const { bucket, objects } = fakeBucket();
    const captured: Captured[] = [];
    const res = await route(upload(png(1200, 630), { type: "application/octet-stream" }), envWith(accepts(captured), bucket));
    expect(res.status).toBe(201);
    const [key, stored] = [...objects.entries()][0]!;
    expect(key).toMatch(/^media\/[0-9a-f]{64}\.png$/);
    expect(stored.contentType).toBe("image/png");
  });

  it("refuses an image below the minimum size", async () => {
    const { bucket } = fakeBucket();
    const res = await route(upload(png(300, 100)), envWith(accepts([]), bucket));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("too_small");
  });

  // openproduct-studio OSD-3 — a logo's shape is not a hero's.
  it("accepts a 256×256 logo the hero's 400×200 floor would refuse", async () => {
    const { bucket } = fakeBucket();
    const captured: Captured[] = [];
    const res = await route(
      upload(png(256, 256), { query: "kind=logo&alt=The+mark&position=0" }),
      envWith(accepts(captured), bucket),
    );
    expect(res.status).toBe(201);
  });

  it("refuses a logo under 128 on a side, and a banner offered as a logo", async () => {
    for (const [w, h, code] of [
      [100, 100, "logo_too_small"],
      [1200, 630, "logo_not_square"],
    ] as const) {
      const { bucket } = fakeBucket();
      const res = await route(
        upload(png(w, h), { query: "kind=logo&alt=The+mark&position=0" }),
        envWith(accepts([]), bucket),
      );
      expect(res.status).toBe(422);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(code);
    }
  });

  it("refuses a declared length that lies about a body over the ceiling", async () => {
    // The header said 100 bytes; the body is bigger. The buffered check
    // catches what the header check could not.
    const { bucket, puts } = fakeBucket();
    const big = new Uint8Array(6 * 1024 * 1024);
    big.set(png(1200, 630), 0);
    const res = await route(upload(big, { length: 100 }), envWith(accepts([]), bucket));
    expect(res.status).toBe(413);
    expect(puts).toEqual([]);
  });
});

describe("the row is the authorisation", () => {
  it("stores first, then asks core with the sniffed facts and the actor", async () => {
    const { bucket, puts } = fakeBucket();
    const captured: Captured[] = [];
    await route(upload(png(1200, 630)), envWith(accepts(captured), bucket));
    expect(puts).toHaveLength(1);
    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe(
      `https://openproduct.internal/internal/openproduct/orgs/${ORG}/profiles/${PROFILE}/media`,
    );
    const body = JSON.parse(captured[0]!.body!) as Record<string, unknown>;
    expect(body).toEqual({
      kind: "hero",
      alt: "The dashboard",
      position: 0,
      ref: expect.stringMatching(/^[0-9a-f]{64}\.png$/),
      width: 1200,
      height: 630,
    });
  });

  it("removes the object it stored when core refuses the row", async () => {
    const { bucket, puts, deletes } = fakeBucket();
    const refuses = coreStub(() => Response.json({ error: { code: "not_found" } }, { status: 404 }), []);
    const res = await route(upload(png(1200, 630)), envWith(refuses, bucket));
    expect(res.status).toBe(404);
    expect(deletes).toEqual(puts);
  });

  it("does NOT remove an object that already existed when core refuses", async () => {
    // The same bytes are somebody else's hero. Content-addressing's other
    // edge: a refusal here must not take their picture down.
    const { bucket, objects, deletes } = fakeBucket();
    const bytes = png(1200, 630);
    // Pre-store under the key the upload will compute.
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
    objects.set(`media/${hash}.png`, { bytes: bytes.buffer, contentType: "image/png" });
    const refuses = coreStub(() => Response.json({ error: { code: "not_found" } }, { status: 404 }), []);
    await route(upload(bytes), envWith(refuses, bucket));
    expect(deletes).toEqual([]);
    expect(objects.has(`media/${hash}.png`)).toBe(true);
  });

  it("refuses a screenshot kind at the door — that kind is observed, never uploaded", async () => {
    const { bucket, puts } = fakeBucket();
    const res = await route(upload(png(1200, 630), { query: "kind=screenshot&alt=x" }), envWith(accepts([]), bucket));
    expect(res.status).toBe(422);
    expect(puts).toEqual([]);
  });

  it("requires alt text before it reads a byte", async () => {
    const { bucket, puts } = fakeBucket();
    const res = await route(upload(png(1200, 630), { query: "kind=hero&alt=%20%20" }), envWith(accepts([]), bucket));
    expect(res.status).toBe(422);
    expect(puts).toEqual([]);
  });
});

describe("the three widths, behind the flag", () => {
  // `deriveAll` runs after the row exists, through the zone's /cdn-cgi/image/
  // path, and only where MEDIA_RESIZING is "true". Here fetch is stubbed to
  // answer the identity call as usual and the resizing path with a tiny
  // "webp" — except for one width, which answers with the original's type,
  // the shape an un-resized zone produces, and which must NOT be stored.
  function stubIdentityAndResizing(skipWidth: number | null, calls: string[]): void {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://platform.test/v1/identity/me")) {
        return Response.json({ data: { subjectId: "usr_ada", displayName: "Ada" } });
      }
      if (url.includes("/cdn-cgi/image/")) {
        calls.push(url);
        const width = Number(/width=(\d+)/.exec(url)?.[1]);
        if (width === skipWidth) {
          return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
        }
        return new Response(new Uint8Array([0x52, 0x49, 0x46, 0x46]), { headers: { "content-type": "image/webp" } });
      }
      return new Response("unexpected", { status: 599 });
    }) as typeof fetch;
  }

  it("writes a derivative under the original's hash for every standard width below it, when on", async () => {
    const calls: string[] = [];
    stubIdentityAndResizing(null, calls);
    const { bucket, objects, puts } = fakeBucket();
    const env = { ...envWith(accepts([]), bucket), MEDIA_RESIZING: "true" } as Env;
    const res = await route(upload(png(1200, 630)), env);
    expect(res.status).toBe(201);
    // 1200 wide: 160 (MD3's thumbnail), 400 and 800 apply; 1600 does not (never upscale).
    expect(calls.map((u) => /width=(\d+)/.exec(u)![1])).toEqual(["160", "400", "800"]);
    const original = puts.find((k) => /^media\/[0-9a-f]{64}\.png$/.test(k))!;
    const hash = original.slice("media/".length, -".png".length);
    expect(puts).toEqual([original, `media/${hash}/w160.webp`, `media/${hash}/w400.webp`, `media/${hash}/w800.webp`]);
    expect(objects.get(`media/${hash}/w800.webp`)?.contentType).toBe("image/webp");
    // The source the zone is asked to resize is this worker's own public address.
    expect(calls[0]).toBe(
      `https://gw.test/cdn-cgi/image/width=160,fit=scale-down,format=webp,quality=82/https://gw.test/v1/media/${hash}.png`,
    );
  });

  it("does not store what the zone hands back unresized — the original serves that width instead", async () => {
    const calls: string[] = [];
    stubIdentityAndResizing(800, calls);
    const warn = console.warn;
    console.warn = () => {};
    try {
      const { bucket, puts } = fakeBucket();
      const env = { ...envWith(accepts([]), bucket), MEDIA_RESIZING: "true" } as Env;
      await route(upload(png(1200, 630)), env);
      expect(calls).toHaveLength(3);
      expect(puts.filter((k) => k.includes("/w"))).toEqual([
        expect.stringMatching(/\/w160\.webp$/),
        expect.stringMatching(/\/w400\.webp$/),
      ]);
    } finally {
      console.warn = warn;
    }
  });

  it("fetches nothing and stores only the original when the flag is off — every environment today", async () => {
    const calls: string[] = [];
    stubIdentityAndResizing(null, calls);
    const { bucket, puts } = fakeBucket();
    for (const flag of [undefined, "false", "TRUE", "1"]) {
      puts.length = 0;
      const env = { ...envWith(accepts([]), bucket), ...(flag === undefined ? {} : { MEDIA_RESIZING: flag }) } as Env;
      const res = await route(upload(png(1200, 630)), env);
      expect([flag, res.status]).toEqual([flag, 201]);
      expect(puts.filter((k) => k.includes("/w"))).toEqual([]);
    }
    expect(calls).toEqual([]);
  });
});

describe("serving", () => {
  const HASH = "b".repeat(64);

  it("serves an original immutable, nosniff, with the stored type — and never asks core", async () => {
    const { bucket, objects } = fakeBucket();
    objects.set(`media/${HASH}.png`, { bytes: png(1200, 630).buffer, contentType: "image/png" });
    const captured: Captured[] = [];
    const res = await route(new Request(`https://gw.test/v1/media/${HASH}.png`), envWith(accepts(captured), bucket));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("etag")).toBeTruthy();
    expect(captured).toEqual([]);
  });

  it("serves the ORIGINAL at a derivative's address when the derivative does not exist", async () => {
    // A missing derivative costs bytes. A 404 costs the reader the picture.
    const { bucket, objects } = fakeBucket();
    objects.set(`media/${HASH}.jpg`, { bytes: jpeg(1600, 900).buffer, contentType: "image/jpeg" });
    const res = await route(new Request(`https://gw.test/v1/media/${HASH}/w800.webp`), envWith(accepts([]), bucket));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });

  it("serves the derivative when it exists", async () => {
    const { bucket, objects } = fakeBucket();
    objects.set(`media/${HASH}.jpg`, { bytes: jpeg(1600, 900).buffer, contentType: "image/jpeg" });
    objects.set(`media/${HASH}/w800.webp`, { bytes: new Uint8Array([1, 2, 3]).buffer, contentType: "image/webp" });
    const res = await route(new Request(`https://gw.test/v1/media/${HASH}/w800.webp`), envWith(accepts([]), bucket));
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("content-length")).toBe("3");
  });

  it("404s an unknown reference and a width that is not a standard one", async () => {
    const { bucket } = fakeBucket();
    expect((await route(new Request(`https://gw.test/v1/media/${HASH}.png`), envWith(accepts([]), bucket))).status).toBe(404);
    expect((await route(new Request(`https://gw.test/v1/media/${HASH}/w999.webp`), envWith(accepts([]), bucket))).status).toBe(404);
  });

  it("answers HEAD with the headers and no body", async () => {
    const { bucket, objects } = fakeBucket();
    objects.set(`media/${HASH}.png`, { bytes: png(1200, 630).buffer, contentType: "image/png" });
    const res = await route(new Request(`https://gw.test/v1/media/${HASH}.png`, { method: "HEAD" }), envWith(accepts([]), bucket));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("33");
    expect(await res.text()).toBe("");
  });

  it("refuses a write to a media address", async () => {
    const { bucket } = fakeBucket();
    const res = await route(new Request(`https://gw.test/v1/media/${HASH}.png`, { method: "POST" }), envWith(accepts([]), bucket));
    expect(res.status).toBe(405);
  });
});
