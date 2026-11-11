// The OpenAPI document, GENERATED (openproduct-commons CT2).
//
// Generated from the same literals the renderer and the handlers import,
// rather than written beside them. A hand-written API document is a second
// source of truth that drifts silently and is discovered by whoever trusted
// it — which for a catalog whose whole claim is machine-readability is the
// worst possible bug.
//
// So: `CATALOG_CARD_KEYS`, `CATALOG_PRODUCT_KEYS`, `FACETS` and `FORMULAS`
// are the inputs, and invariant I8 asserts the output names every one of
// them. Adding a field to the API without documenting it is not possible;
// documenting a field that does not exist is caught by the same test.

import { API_DEPRECATIONS, API_STABILITY_SENTENCE, type ApiDeprecation } from "./api-changelog.js";
import { CATALOG_PAGE_KEYS, PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from "./pagination.js";
import { CATALOG_API_VERSION, CATALOG_CARD_KEYS, CATALOG_PRODUCT_KEYS } from "./catalog-api.js";
import { FACETS } from "./facets.js";
import { FORMULAS, SIGNAL_SOURCES } from "./provenance.js";
import { RATE_LIMITS, RATE_LIMIT_NAMES, RATE_LIMIT_SENTENCE } from "./rate-limits.js";

/** A minimal OpenAPI 3.1 document. Typed loosely on purpose: this is a
 *  serialization target, and modelling the whole spec would be a library. */
export type OpenApiDocument = Record<string, unknown>;

const FACT_SCHEMA = {
  type: "object",
  required: ["value", "provenance"],
  description:
    "A value and where it came from. Every field a human reads is wrapped: a catalog that hands out numbers without saying where they came from is a catalog of assertions.",
  properties: {
    value: { description: "The value itself; type varies by field." },
    provenance: {
      oneOf: [
        {
          type: "object",
          required: ["class", "by"],
          properties: {
            class: { type: "string", enum: ["authored"] },
            by: { type: "string", enum: ["maintainer", "contributor"] },
          },
          description: "A person wrote it, and it is visibly in their voice.",
        },
        {
          type: "object",
          required: ["class", "source", "observedAt"],
          properties: {
            class: { type: "string", enum: ["observed"] },
            source: { type: "string", enum: [...SIGNAL_SOURCES] },
            observedAt: {
              type: "string",
              format: "date-time",
              description:
                "When this was true. Required: a measurement without a moment is not a measurement.",
            },
          },
          description: "Something measured it, at a stated time.",
        },
        {
          type: "object",
          required: ["class", "formula", "inputs", "computedAt"],
          properties: {
            class: { type: "string", enum: ["derived"] },
            formula: {
              type: "string",
              enum: Object.keys(FORMULAS),
              description: "Resolves to a published sentence at /docs/formulas.",
            },
            inputs: { type: "array", items: { type: "string" } },
            computedAt: { type: "string", format: "date-time" },
          },
          description: "We computed it, from a published formula.",
        },
      ],
    },
  },
} as const;

export function propsFor(keys: readonly string[], deprecations: readonly ApiDeprecation[] = API_DEPRECATIONS): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key === "slug") {
      out[key] = { type: "string", description: "The listing's public address segment." };
    } else if (key === "publishedAt") {
      out[key] = { type: "string", format: "date-time", nullable: true };
    } else if (key === "workspaceRef") {
      // OPR5 (seam S12): a plain nullable string, not a Fact — the platform's
      // attestation of the public workspace behind the listing, and the one
      // input to `{console}/view/{workspaceRef}`.
      out[key] = {
        type: "string",
        nullable: true,
        description:
          "The console address (org_…) of the public workspace the maintainers attested with their link grant; null while the listing holds none. Open it at the console's /view/{workspaceRef}.",
      };
    } else if (key === "pitchDigest") {
      out[key] = {
        type: "string",
        nullable: true,
        description: "sha256:<hex> of the pitch as published — a cache key, and a receipt.",
      };
    } else if (key === "metrics") {
      out[key] = {
        type: "object",
        additionalProperties: { $ref: "#/components/schemas/Fact" },
        description:
          "Observed metrics by name. A metric is ABSENT — never zero — when this listing's tier cannot see it, or when the last reading has gone stale past its window.",
      };
    } else if (key === "media") {
      // MD0 — an ARRAY OF FACTS, and the only field here that is one. A hero
      // is authored and a screenshot is observed, so a single wrapper around
      // the list would have to claim a class for both; provenance sits per
      // row instead, and the document says so rather than leaving a client to
      // discover it from an example.
      out[key] = {
        type: "array",
        items: { $ref: "#/components/schemas/Fact" },
        description:
          "The listing's media, in document order: the hero, then the gallery in the maker's order, then the automated capture. Each row carries its OWN provenance — a hero and a gallery image are authored by the maker and never go stale; a capture is observed, carries the moment it was taken, and is withdrawn past its window rather than presented as current. An empty list means the listing published no images, not that a picture was taken and found nothing.",
      };
    } else if (key === "cleanVotes") {
      out[key] = {
        $ref: "#/components/schemas/Fact",
        description:
          "Whether this listing's upvotes were checked by the integrity model and almost none discounted: at least 10 counted upvotes and no more than 5% of everything cast set aside. A BOOLEAN AND NEVER A COUNT — no per-listing suppression figure is published anywhere. `false` IS NOT A FINDING: it covers both a listing with too few upvotes to check, which is most of them, and one that did not clear the bar, and nothing distinguishes the two. It orders nothing; the catalog's own orderings read the discounted total, which already reflects the same check.",
      };
    } else if (key === "installLine") {
      out[key] = {
        $ref: "#/components/schemas/Fact",
        description:
          "One copyable install command, in the maintainer's own words. ALWAYS `authored` — this catalog never derives an install line, and a client should treat the provenance as load-bearing rather than decorative: nobody measured this and nothing has run it. It is one command by construction; pipes, chaining, substitution and redirection are refused at the column and in the contract, so a consumer does not receive a script. `null` means the listing has no install line, not that one could not be worked out.",
      };
    } else if (key === "changes") {
      // PV4 — an ARRAY, and NOT of Facts. Each entry carries its own
      // provenance because the entries disagree: a licence moving is
      // `observed` with the moment of the read that found it, a tagline
      // rewrite is `authored` and carries no moment at all. The description
      // states the null/empty distinction rather than leaving a client to
      // discover it from a quiet week.
      out[key] = {
        type: "array",
        nullable: true,
        items: { type: "object" },
        description:
          "What changed on this listing in the last week, oldest snapshot to newest. Each entry carries its OWN provenance: a maintainer's edit is `authored` and carries NO moment — we know it happened between two daily snapshots and a timestamp would be inventing precision — while a licence or language change is `observed` and carries the moment of the read that found it. `null` means there is no earlier snapshot to compare against and NOT that nothing changed; `[]` means we compared and nothing moved. Nothing here is an ordering input and no formula id names one: \"recently updated\" rewards touching a listing rather than improving a product.",
      };
    } else if (key === "maintainers" || key === "openings") {
      out[key] = { type: "array", items: { type: "object" } };
    } else {
      out[key] = { $ref: "#/components/schemas/Fact" };
    }
  }
  // CS0 — a field in its notice period says so in the schema, from the same
  // entry that puts it on /docs/api and the Deprecation header on the wire.
  for (const notice of deprecations) {
    const existing = out[notice.key];
    if (existing && typeof existing === "object") {
      out[notice.key] = { ...(existing as Record<string, unknown>), "x-deprecated": { since: notice.since, until: notice.until } };
    }
  }
  return out;
}

export function buildOpenApiDocument(serverUrl: string | null, docsUrl: string | null = null): OpenApiDocument {
  return {
    openapi: "3.1.0",
    info: {
      title: "openproduct catalog",
      version: CATALOG_API_VERSION,
      description:
        `Products built in the open, as a machine-readable catalog. Every field a human reads carries its provenance: whether a person wrote it, something measured it, or we computed it — and for the last two, when. Anonymous, edge-cached for 60 seconds, and no credential is accepted on any route here. ${API_STABILITY_SENTENCE} ${RATE_LIMIT_SENTENCE}`,
      // CS1 — the buckets as data, beside the sentence: the same object the
      // gateway's limiter reads, so a client that wants to pace itself has
      // the numbers without parsing prose.
      "x-rate-limits": RATE_LIMITS,
    },
    // CS0 — the changelog and the policy, at an address a consumer can read.
    ...(docsUrl ? { externalDocs: { url: docsUrl, description: "The changelog and the stability policy" } } : {}),
    ...(serverUrl ? { servers: [{ url: serverUrl }] } : {}),
    paths: {
      "/v1/products": {
        get: {
          summary: "The catalog, one page at a time",
          description:
            "Every published listing, in the published order (sort.most-active), cut into pages. `next` is on every page: a cursor for the page after this one, or null on the last. A cursor is opaque — a position in the ordering, issued by this API — and lives in a URL. No credential is accepted; the response is identical for every caller, which is what makes it cacheable.",
          parameters: [
            {
              name: "cursor",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "The `next` of the previous page. Absent for the first page. A cursor this API did not issue is refused (422).",
            },
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: PAGE_SIZE_MAX, default: PAGE_SIZE_DEFAULT },
              description: "Rows on the page. Bounded; a larger number is served as the maximum.",
            },
          ],
          responses: {
            "200": {
              description: "One page of the catalog",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "object",
                        required: [...CATALOG_PAGE_KEYS],
                        properties: {
                          products: {
                            type: "array",
                            items: { $ref: "#/components/schemas/CatalogCard" },
                          },
                          next: {
                            type: ["string", "null"],
                            description: "The cursor for the page after this one; null on the last page, never absent.",
                          },
                          total: {
                            type: "integer",
                            description: "Every published listing, counted — a number about the catalog, not about the page.",
                          },
                          computedAt: {
                            type: ["string", "null"],
                            format: "date-time",
                            description:
                              "When the catalogue these cards came from was computed (OS5). The sweep materialises it every ten minutes; null while a page is served from the live join, before the first sweep.",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            "422": { description: "A cursor this API did not issue" },
            "429": { $ref: "#/components/responses/RateLimited" },
          },
        },
      },
      "/v1/products/{slug}": {
        get: {
          summary: "One product",
          description:
            "Unknown, unpublished and unreachable all answer 404 — deliberately indistinguishable, so this endpoint cannot be used to discover drafts.",
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "The product" },
            "404": { description: "No published listing at this address" },
            "429": { $ref: "#/components/responses/RateLimited" },
          },
        },
      },
      "/v1/facets": {
        get: {
          summary: "The facet taxonomy",
          description:
            "The vocabulary the catalog is filterable by, so a client can build its own navigation rather than hard-coding ours.",
          responses: {
            "200": { description: "The taxonomy" },
            "429": { $ref: "#/components/responses/RateLimited" },
          },
        },
      },
      // MD1 — where a `media` row's `ref` resolves. Public, immutable, and
      // served without a database read; the document says so because a
      // client that caches this for a year is doing the right thing.
      "/v1/media/{ref}": {
        get: {
          summary: "A media asset, by reference",
          description:
            "The bytes a listing's `media[].value.ref` names: 64 hex characters of SHA-256, a dot, and png, jpg or webp. Content-addressed, so the answer is immutable and carries `cache-control: public, max-age=31536000, immutable` — cache it for a year. Derivatives are at `/v1/media/{hash}/w{400|800|1600}.webp`, exist only at widths below the original's, and where one was not generated the original is served at that address rather than a 404. Served with `x-content-type-options: nosniff` and the type the upload was sniffed as, never the type the uploader claimed.",
          responses: {
            "200": { description: "The asset" },
            "404": { description: "No such reference" },
          },
        },
      },
    },
    components: {
      // CS1 — the one refusal every catalogue route can answer, described
      // once: the header a client should honour and the body that names the
      // bucket, from the same table as `info["x-rate-limits"]`.
      responses: {
        RateLimited: {
          description:
            "Too many requests from this caller. Retry-After is whole seconds until the bucket holds a token for you — computed from its refill, not a flat window — and the body names which bucket refused and what it allows.",
          headers: {
            "Retry-After": {
              required: true,
              schema: { type: "integer", minimum: 1 },
              description: "Seconds until the next request is yours.",
            },
          },
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["error"],
                properties: {
                  error: {
                    type: "object",
                    required: ["code", "message", "details", "requestId"],
                    properties: {
                      code: { type: "string", enum: ["rate_limited"] },
                      message: { type: "string" },
                      requestId: { type: "string" },
                      details: {
                        type: "object",
                        required: ["bucket", "limit", "windowSec", "retryAfterSeconds"],
                        properties: {
                          bucket: { type: "string", enum: [...RATE_LIMIT_NAMES] },
                          limit: { type: "integer" },
                          windowSec: { type: "integer" },
                          retryAfterSeconds: { type: "integer", minimum: 1 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      schemas: {
        Fact: FACT_SCHEMA,
        CatalogCard: {
          type: "object",
          required: [...CATALOG_CARD_KEYS],
          properties: propsFor(CATALOG_CARD_KEYS),
        },
        CatalogProduct: {
          type: "object",
          required: [...CATALOG_PRODUCT_KEYS],
          properties: propsFor(CATALOG_PRODUCT_KEYS),
        },
        FacetGroup: {
          type: "object",
          properties: {
            id: { type: "string", enum: FACETS.map((f) => f.id) },
            label: { type: "string" },
            kind: { type: "string", enum: ["assigned", "derived"] },
            cardinality: { type: "string", enum: ["single", "multi"] },
            description: { type: "string" },
            values: { type: "array", items: { type: "object" } },
          },
        },
      },
    },
  };
}
