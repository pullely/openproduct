// The badge, as it is served (openproduct-worldclass RE4).
//
// `contracts/src/badge.ts` decides what the badge says and draws it, and its
// own suite holds that. This holds how it is SERVED — which is a different set
// of questions, because this is the one address on the site that strangers
// will hotlink.
//
// Every other public route is fetched by somebody looking at openproduct. This
// one is fetched by GitHub's image proxy on behalf of anybody reading any
// repository that pasted it, indefinitely, whether or not that reader has ever
// heard of this product.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BADGE_CACHE_CONTROL, badgeMarkdown, badgeValue } from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP, file), "utf-8");
const code = (file: string) =>
  read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ROUTE = "badge/[slug]/route.ts";

describe("what a stranger's proxy receives", () => {
  it("is an SVG, and nothing is allowed to sniff past that", () => {
    // An SVG is a DOCUMENT, and a document served from this origin that a
    // browser may sniff into something executable is a cross-site-scripting
    // vector on the apex. This one contains no script and never will; the
    // headers are what make that a property of the RESPONSE rather than of
    // the code that produced it.
    const route = code(ROUTE);
    expect(route).toContain('"content-type": "image/svg+xml; charset=utf-8"');
    expect(route).toContain('"x-content-type-options": "nosniff"');
    expect(route).toContain("default-src 'none'");
    expect(route).toContain("sandbox");
  });

  it("may be held for an hour here, and far longer out there", () => {
    expect(code(ROUTE)).toContain("BADGE_CACHE_CONTROL");
    expect(BADGE_CACHE_CONTROL).toContain("max-age=3600");
  });

  it("declares how long it may be held, or it is served no-store", () => {
    // XP4's rule. On the one hotlinked address, `no-store` would mean
    // re-rendering per reader of somebody else's README.
    const route = code(ROUTE);
    expect(route).toMatch(/export const revalidate = \d+;/);
    expect(route).toContain("generateStaticParams");
  });

  it("resolves no actor (WC-4, I6)", () => {
    expect(code(ROUTE)).not.toMatch(/cookies\(|headers\(|session|subject|Authorization/i);
  });
});

describe("the two addresses a maker will type", () => {
  it("answers with and without the extension", () => {
    // `/badge/my-product` is canonical and what `badgeMarkdown` emits;
    // `/badge/my-product.svg` is what somebody will type from memory, because
    // every other badge service on the internet ends in an extension.
    // Answering one and 404ing the other is a broken image in a README,
    // discovered by the maker weeks later if at all.
    expect(code(ROUTE)).toContain('slug.endsWith(".svg") ? slug.slice(0, -4) : slug');
  });

  it("emits the canonical one in the snippet", () => {
    expect(badgeMarkdown("https://openproduct.live", "my-product")).toContain(
      "https://openproduct.live/badge/my-product)",
    );
  });

  it("404s exactly where the listing page 404s", () => {
    // A badge that outlives its listing would keep asserting a product is
    // listed here after it stopped being.
    expect(code(ROUTE)).toContain("fetchPublicProfile");
    expect(code(ROUTE)).toContain("status: 404");
  });
});

describe("the line a maker pastes is on the listing", () => {
  it("is where the person who would paste it already is", () => {
    // A badge is worth nothing unless the maintainer can find the line
    // without reading documentation.
    const page = code("[slug]/page.tsx");
    expect(page).toContain("<BadgeSnippet");
    // OB7 — one line per badge the maker can choose, each at its own path.
    expect(page).toContain("badgeMarkdown(apex, profile.slug, variant)");
    expect(page).toContain("badgeHtml(apex, profile.slug, value, variant)");
  });

  it("offers HTML as well as Markdown, because READMEs are not all Markdown", () => {
    const snippet = code("[slug]/badge-snippet.tsx");
    expect(snippet).toContain('"markdown" | "html"');
    expect(snippet).toContain('aria-label="Snippet format"');
  });

  it("keeps the snippet selectable, so the button is a convenience", () => {
    // The rule `CopyLink` already states: a page that offers only a button
    // has taken the value away from anyone whose clipboard permission was
    // refused, whose browser is old, or who wanted to read it first.
    const snippet = code("[slug]/badge-snippet.tsx");
    expect(snippet).toContain("select-all");
    expect(snippet).toContain("navigator.clipboard.writeText");
  });

  it("shows nothing at all without a canonical origin", () => {
    // A snippet copied off a preview host would put that host in somebody's
    // README permanently.
    expect(code("[slug]/page.tsx")).toContain("if (!apex) return null;");
    expect(code("[slug]/page.tsx")).toContain("badgeChoices ? (");
  });

  it("tells the reader what the badge will say before they paste it", () => {
    expect(code("[slug]/page.tsx")).toContain("badgeValue(profile)");
    // `{}` rather than `{ launch: undefined }`: this lane runs with
    // `exactOptionalPropertyTypes`, under which an explicit `undefined` is
    // not the same as an absent key — which is the same distinction the field
    // itself is making (OPC-C: absent means no launch, and there is no
    // `rank: null` on the wire saying "we looked and it placed nowhere").
    expect(badgeValue({})).toBe("listed");
  });
});

describe("OB7 — the variants are served as the bare badge is", () => {
  const ROUTE = "badge/[slug]/[variant]/route.ts";

  it("lives at a path, cached an hour, and never reads its query", () => {
    const route = code(ROUTE);
    expect(route).toContain("export const revalidate = 3600;");
    expect(route).toContain("export async function generateStaticParams()");
    expect(route).not.toMatch(/searchParams|request\.url|nextUrl/);
  });

  it("is an image nothing may sniff into a document", () => {
    const route = code(ROUTE);
    expect(route).toContain('"content-type": "image/svg+xml; charset=utf-8"');
    expect(route).toContain('"x-content-type-options": "nosniff"');
    expect(route).toContain("sandbox");
  });

  it("404s an unknown variant and a listing the page 404s, and lets the contract decide the words", () => {
    const route = code(ROUTE);
    expect(route).toContain('if (!isBadgeVariant(variant) || variant === "listed") return new Response("not found", { status: 404 });');
    expect(route).toContain('if (profile === null) return new Response("not found", { status: 404 });');
    expect(route).toContain("badgeVariantValue(variant, { profile, rank, merges })");
    // The rank comes from the front page's own order.
    expect(route).toContain("mostActiveRankOf(catalog, profile.slug)");
  });

  it("offers each variant on the listing only when it has something true to say", () => {
    const page = code("[slug]/page.tsx");
    expect(page).toContain('if (variant !== "listed" && value === "listed") continue;');
    expect(code("[slug]/badge-snippet.tsx")).toContain('aria-label="Which badge"');
  });
});
