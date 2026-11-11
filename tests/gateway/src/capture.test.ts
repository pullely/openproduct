// Taking one screenshot (openproduct-worldclass MD4).
//
// The provider is a stubbed `fetch`, the bucket is a Map, and what these
// prove is that the provider's reply gets exactly the treatment a stranger's
// upload gets: sniffed before it is stored, ceilinged, content-addressed —
// and that nothing the policy refuses is ever asked for.

import {
  CAPTURE_PROVIDER_HOST,
  CAPTURE_VIEWPORT,
  MEDIA_MAX_BYTES,
  captureProvider,
  screenshotAlt,
  type DueCapture,
} from "@openproduct/contracts";
import { captureOne, captureRequest, type ConfiguredProvider } from "@openproduct-gateway/capture";
import { derivativeKey, originalKey, sha256Hex } from "@openproduct-gateway/media";
import type { Env } from "@openproduct-gateway/env";

function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13], 8);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

interface Stored {
  bytes: ArrayBuffer;
  contentType: string;
}

function fakeBucket(opts: { failPut?: boolean } = {}) {
  const objects = new Map<string, Stored>();
  const puts: string[] = [];
  const bucket = {
    async head(key: string) {
      return objects.has(key) ? { key } : null;
    },
    async put(key: string, value: ArrayBuffer, o?: { httpMetadata?: { contentType?: string } }) {
      if (opts.failPut) throw new Error("r2 down");
      puts.push(key);
      objects.set(key, { bytes: value, contentType: o?.httpMetadata?.contentType ?? "" });
      return { key };
    },
    async get() {
      return null;
    },
    async delete() {
      return undefined;
    },
  } as unknown as R2Bucket;
  return { bucket, objects, puts };
}

const ENDPOINT = `https://${CAPTURE_PROVIDER_HOST}/client/v4/accounts/abc/browser-rendering/screenshot`;
const PROVIDER = captureProvider(ENDPOINT, "tok-secret") as ConfiguredProvider;
const NOW = new Date("2026-09-10T12:00:00.000Z");
const DUE: DueCapture = {
  profileId: "opp_55555555555545558555555555555555",
  slug: "acme-thing",
  target: "https://acme.example.com/app#top",
  observedAt: null,
};

interface Call {
  url: string;
  init: RequestInit | undefined;
}

function provider(reply: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return reply();
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const env = (extra: Partial<Env> = {}): Env => ({ ENVIRONMENT: "test", ...extra }) as Env;
const bytesOf = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

describe("what the browser is asked", () => {
  it("is pointed at the policy's address, with the token, for a laptop-sized PNG", () => {
    const init = captureRequest(PROVIDER, "https://acme.example.com/app");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok-secret");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.url).toBe("https://acme.example.com/app");
    expect(body.viewport).toEqual({ width: CAPTURE_VIEWPORT.width, height: CAPTURE_VIEWPORT.height });
    expect((body.screenshotOptions as { type: string }).type).toBe("png");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("a capture that comes back", () => {
  it("is sniffed, stored under its hash, and reported with the generated alt and the sweep's moment", async () => {
    const shot = png(1280, 800);
    const p = provider(() => new Response(shot, { status: 200, headers: { "content-type": "image/png" } }));
    const store = fakeBucket();
    const report = await captureOne(env(), store.bucket, PROVIDER, DUE, NOW, p.fetchImpl);
    const hash = await sha256Hex(bytesOf(shot));
    expect(report).toEqual({
      profileId: DUE.profileId,
      target: DUE.target,
      ok: true,
      ref: `${hash}.png`,
      alt: screenshotAlt("acme-thing", NOW.toISOString()),
      width: 1280,
      height: 800,
      observedAt: NOW.toISOString(),
    });
    expect(store.puts).toEqual([originalKey(hash, "png")]);
    expect(store.objects.get(originalKey(hash, "png"))?.contentType).toBe("image/png");
    // The browser was sent to the address the policy produced — fragment gone.
    expect(p.calls.map((c) => c.url)).toEqual([ENDPOINT]);
    expect((JSON.parse(String(p.calls[0]!.init?.body)) as { url: string }).url).toBe("https://acme.example.com/app");
  });

  it("stores identical bytes once — a retake that changed nothing writes nothing", async () => {
    const shot = png(1280, 800);
    const p = provider(() => new Response(shot, { status: 200 }));
    const store = fakeBucket();
    await captureOne(env(), store.bucket, PROVIDER, DUE, NOW, p.fetchImpl);
    await captureOne(env(), store.bucket, PROVIDER, DUE, NOW, p.fetchImpl);
    expect(store.puts).toHaveLength(1);
  });

  it("makes the derivatives through the zone when this API knows its origin and resizing is on, and otherwise leaves the original to serve", async () => {
    const shot = png(1280, 800);
    const p = provider(() => new Response(shot, { status: 200 }));
    const zone: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      zone.push(String(input));
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/webp" } });
    }) as typeof fetch;
    try {
      const store = fakeBucket();
      await captureOne(
        env({ PUBLIC_API_ORIGIN: "https://api.openproduct.live/", MEDIA_RESIZING: "true" }),
        store.bucket,
        PROVIDER,
        DUE,
        NOW,
        p.fetchImpl,
      );
      const hash = await sha256Hex(bytesOf(shot));
      expect(store.puts).toEqual([
        originalKey(hash, "png"),
        derivativeKey(hash, 160),
        derivativeKey(hash, 400),
        derivativeKey(hash, 800),
      ]);
      expect(zone.every((u) => u.startsWith("https://api.openproduct.live/cdn-cgi/image/"))).toBe(true);

      const quiet = fakeBucket();
      zone.length = 0;
      await captureOne(env({ MEDIA_RESIZING: "true" }), quiet.bucket, PROVIDER, DUE, NOW, p.fetchImpl);
      expect(quiet.puts).toHaveLength(1);
      expect(zone).toEqual([]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("a capture that does not", () => {
  it("never asks for an address the policy refuses", async () => {
    const p = provider(() => new Response(png(1280, 800), { status: 200 }));
    const store = fakeBucket();
    const report = await captureOne(env(), store.bucket, PROVIDER, { ...DUE, target: "http://acme.example.com" }, NOW, p.fetchImpl);
    expect(report).toEqual({ profileId: DUE.profileId, target: "http://acme.example.com", ok: false, error: "target_refused" });
    expect(p.calls).toEqual([]);
    expect(store.puts).toEqual([]);
  });

  it("names each way the provider or its reply can fail, and stores nothing for any of them", async () => {
    const cases: Array<[string, () => Response | Promise<Response>]> = [
      ["provider_unreachable", () => Promise.reject(new Error("ECONNRESET"))],
      ["provider_refused", () => new Response("{\"success\":false}", { status: 429 })],
      ["not_an_image", () => new Response("{\"success\":false,\"errors\":[]}", { status: 200 })],
      ["not_an_image", () => new Response(new Uint8Array(0), { status: 200 })],
      ["too_small", () => new Response(png(300, 100), { status: 200 })],
      ["too_large", () => new Response(png(9000, 800), { status: 200 })],
      ["too_large", () => new Response(new Uint8Array(MEDIA_MAX_BYTES + 1), { status: 200 })],
    ];
    for (const [error, reply] of cases) {
      const p = provider(reply);
      const store = fakeBucket();
      const report = await captureOne(env(), store.bucket, PROVIDER, DUE, NOW, p.fetchImpl);
      expect([error, report.ok ? "OK" : report.error]).toEqual([error, error]);
      expect([error, store.puts]).toEqual([error, []]);
    }
  });

  it("reports a store that would not take the bytes, rather than throwing into the sweep", async () => {
    const p = provider(() => new Response(png(1280, 800), { status: 200 }));
    const store = fakeBucket({ failPut: true });
    const report = await captureOne(env(), store.bucket, PROVIDER, DUE, NOW, p.fetchImpl);
    expect(report.ok ? "OK" : report.error).toBe("store_failed");
  });
});
