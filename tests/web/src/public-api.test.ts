// The public console's read client (saas-openproduct OD5).
//
// The plan's "done when" for this milestone includes: **no request from either
// page carries an Authorization header**. That is a claim about absence, so it
// is checked against a CLOSED list of headers rather than by grepping for the
// one that must not be there — a denylist would pass a request that invented
// `X-Auth-Token` instead.
//
// It matters because the obvious implementation would have been wrong. Every
// other console surface goes through `createClient(target, token)`, which
// attaches a bearer when one is stored; a visitor with a session in another tab
// would then silently authenticate a request that must be anonymous, and
// api-edge's public branch would be serving a credential it deliberately does
// not read.

import {
  sitemapXml,
  fetchPublicDirectory,
  fetchPublicProfile,
  maintainerLabel,
  MAINTAINER_FALLBACK_LABEL,
  publicReadHeaders,
  PUBLIC_REVALIDATE_SECONDS,
} from "@openproduct-web/app/public-api";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Call {
  url: string;
  init: RequestInit;
}

function recorder(response: unknown, status = 200): { calls: Call[]; fetchImpl: typeof fetch } {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(response), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe("the public read carries no credential", () => {
  // The closed list. If a header is added to this module, this test fails and
  // whoever added it has to say why it belongs on an anonymous request.
  it("sends exactly one header, and it is `accept`", () => {
    expect(Object.keys(publicReadHeaders()).sort()).toEqual(["accept"]);
    expect(publicReadHeaders().accept).toBe("application/json");
  });

  it("sends no Authorization header on the directory read", async () => {
    const { calls, fetchImpl } = recorder({ data: { projects: [] } });
    await fetchPublicDirectory(fetchImpl);

    const headers = calls[0]!.init.headers as Record<string, string>;
    const names = Object.keys(headers).map((h) => h.toLowerCase());
    expect(names).toEqual(["accept"]);
    for (const forbidden of ["authorization", "cookie", "x-api-key", "x-actor-subject-id"]) {
      expect(`${forbidden}: ${names.includes(forbidden)}`).toBe(`${forbidden}: false`);
    }
  });

  it("sends no Authorization header on the profile read", async () => {
    const { calls, fetchImpl } = recorder({ data: { profile: { slug: "acme" } } });
    await fetchPublicProfile("acme", fetchImpl);

    const names = Object.keys(calls[0]!.init.headers as Record<string, string>).map((h) =>
      h.toLowerCase(),
    );
    expect(names).toEqual(["accept"]);
  });

  // A browser would otherwise attach same-site cookies to a request whose whole
  // point is to be anonymous.
  it("omits credentials entirely", async () => {
    const { calls, fetchImpl } = recorder({ data: { projects: [] } });
    await fetchPublicDirectory(fetchImpl);
    expect(calls[0]!.init.credentials).toBe("omit");
  });

  it("revalidates on the same 60s the API caches for", async () => {
    const { calls, fetchImpl } = recorder({ data: { projects: [] } });
    await fetchPublicDirectory(fetchImpl);
    expect(PUBLIC_REVALIDATE_SECONDS).toBe(60);
    expect((calls[0]!.init as { next?: { revalidate?: number } }).next?.revalidate).toBe(60);
  });

  // Next parses `export const revalidate` statically, so the pages cannot
  // import the constant — they hardcode 60. This is the test that keeps the
  // literal and the constant from drifting apart.
  it("matches the literal the route segments export", () => {
    // Product-relative, deliberately: this path must survive the repo cut,
    // where apps/openproduct/ becomes the repository root.
    const root = resolve(__dirname, "../../..");
    for (const page of [
      "web/src/app/page.tsx",
      "web/src/app/[slug]/page.tsx",
    ]) {
      const source = readFileSync(resolve(root, page), "utf-8");
      expect(`${page}: ${source.includes(`export const revalidate = ${PUBLIC_REVALIDATE_SECONDS};`)}`).toBe(
        `${page}: true`,
      );
    }
  });
});

describe("reading the public API", () => {
  it("requests the unauthenticated route family", async () => {
    const { calls, fetchImpl } = recorder({ data: { projects: [] } });
    await fetchPublicDirectory(fetchImpl);
    expect(calls[0]!.url).toContain("/v1/public/openproduct/projects");
  });

  it("percent-encodes a slug rather than pasting it into a path", async () => {
    const { calls, fetchImpl } = recorder({ data: { profile: null } });
    await fetchPublicProfile("../etc/passwd", fetchImpl);
    expect(calls[0]!.url).not.toContain("../");
    expect(calls[0]!.url).toContain("%2F");
  });

  // An empty directory is a state, not an error: a seeding gap must not render
  // as an outage (the epic's own "empty room" risk).
  it("returns an empty list rather than throwing when nothing is listed", async () => {
    const { fetchImpl } = recorder({ data: { projects: [] } });
    expect(await fetchPublicDirectory(fetchImpl)).toEqual([]);
  });

  // …but an UNREADABLE directory is not an empty one. Conflating them shipped a
  // real bug: with the flag off on prod, the page rendered "No projects are
  // listed yet" — advertising a surface that is deliberately dark. An empty
  // room and a locked door look nothing alike to a visitor.
  it.each([404, 500, 503])("returns null — not [] — when the directory answers %s", async (status) => {
    const { fetchImpl } = recorder({ error: { code: "not_found" } }, status);
    expect(await fetchPublicDirectory(fetchImpl)).toBeNull();
  });

  it("returns null when the directory is unreachable", async () => {
    const fetchImpl = (async () => {
      throw new Error("socket");
    }) as unknown as typeof fetch;
    expect(await fetchPublicDirectory(fetchImpl)).toBeNull();
  });

  it.each([404, 500, 503])("returns null for a %s so the page renders one 404", async (status) => {
    const { fetchImpl } = recorder({ error: { code: "not_found" } }, status);
    expect(await fetchPublicProfile("acme", fetchImpl)).toBeNull();
  });

  it("returns null rather than throwing when the network fails", async () => {
    const fetchImpl = (async () => {
      throw new Error("socket");
    }) as unknown as typeof fetch;
    expect(await fetchPublicProfile("acme", fetchImpl)).toBeNull();
  });

  it("returns null on an unparseable body", async () => {
    const fetchImpl = (async () =>
      new Response("not json", { status: 200 })) as unknown as typeof fetch;
    expect(await fetchPublicProfile("acme", fetchImpl)).toBeNull();
  });
});

describe("maintainer labels", () => {
  // PP's discipline: a written fallback, never a raw subject id and never an
  // endless skeleton.
  it.each([null, "", "   "])("falls back to written text for %p", (name) => {
    expect(maintainerLabel(name)).toBe(MAINTAINER_FALLBACK_LABEL);
  });

  it("uses the maintainer's own text when there is some", () => {
    expect(maintainerLabel("  Ada  ")).toBe("Ada");
  });

  it("never renders a subject id", () => {
    expect(maintainerLabel(null)).not.toMatch(/usr_|sp_/);
  });
});

// ─── launch polish — the sitemap document ───

describe("sitemapXml", () => {
  it("lists the root and each path, with a date-only lastmod when published", () => {
    const xml = sitemapXml("https://openproduct.live", [
      { path: "acme-thing", lastmod: "2026-08-01T12:34:56.000Z" },
      { path: "other", lastmod: null },
    ]);
    expect(xml).toContain("<loc>https://openproduct.live/</loc>");
    expect(xml).toContain("<loc>https://openproduct.live/acme-thing</loc>");
    expect(xml).toContain("<lastmod>2026-08-01</lastmod>");
    expect(xml).toContain("<loc>https://openproduct.live/other</loc>");
    expect(xml.startsWith('<?xml version="1.0"')).toBe(true);
  });

  it("escapes every interpolated value — the document cannot be broken from data", () => {
    const xml = sitemapXml("https://x.test", [{ path: 'a&b<c>"d', lastmod: null }]);
    expect(xml).toContain("a&amp;b&lt;c&gt;&quot;d");
    expect(xml).not.toContain('a&b<c>"d');
  });

  // DS4 — the widening. `path` rather than `slug` is the whole change, and it
  // is what lets one function serve two namespaces without knowing about
  // either: the `@` that separates a person from a product (OPC-B) is
  // assembled at the call site, where the decision belongs.
  it("carries a profile's canonical `@handle` address, not its /people/ one", () => {
    const xml = sitemapXml("https://openproduct.live", [
      { path: "acme-thing", lastmod: null },
      { path: "@ada", lastmod: "2026-08-20T09:00:00.000Z" },
    ]);
    expect(xml).toContain("<loc>https://openproduct.live/@ada</loc>");
    // `/people/ada` is a route, `/@ada` is the address. Naming both would put
    // two addresses for one page into the one document whose job is to say
    // which addresses exist.
    expect(xml).not.toContain("/people/");
    expect(xml).toContain("<lastmod>2026-08-20</lastmod>");
  });

  it("names no filtered view of the directory", () => {
    // The omission that matters. There are 2^n permutations of the facet
    // rail; naming even a few would spend a crawler's budget on variations of
    // one document instead of on the listings, and naming all of them is not
    // a finite document. Each permutation carries `<link rel="canonical">` to
    // the bare directory instead.
    const xml = sitemapXml("https://openproduct.live", [{ path: "acme-thing", lastmod: null }]);
    // Every `<loc>`, not the document — the XML declaration is a `?` too.
    for (const loc of xml.match(/<loc>[^<]*<\/loc>/g) ?? []) {
      expect(loc).not.toContain("?");
      expect(loc).not.toContain("=");
    }
    expect(xml).not.toContain("category=");
    expect(xml).not.toContain("sort=");
  });
});

