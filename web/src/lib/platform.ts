// Where the platform is (openproduct-independence OX2).
//
// The route group used to import the console's `TARGETS` — its one import
// from the app it lived inside. Standalone, the same three facts are local
// and env-driven:
//
//   - the platform API base (api-edge, until OX3 re-points this at the
//     openproduct gateway) — derived from the deploy environment exactly the
//     way the console derives it, or overridden explicitly;
//   - the console origin, for the funnel hand-off (S10) and the join door
//     (S5/S11) — both are URL edges in the seam contract
//     (specs/components/19-openproduct-seam.md), set in EVERY environment
//     because prod-only was the #1052 regression class;
//   - this site's own canonical origin, for `<link rel="canonical">` and the
//     sitemap.

// Two workers.dev subdomains, because two Cloudflare accounts. The platform
// (api-edge) is on the platform's account; openproduct's own Workers deploy to
// the openproduct account (openproduct-standalone OPN-F), so its gateway
// fallback names that account's subdomain.
const PLATFORM_SUBDOMAIN = "oruncloud";
const PRODUCT_SUBDOMAIN = "openproduct";

export const DEPLOY_ENV: string | undefined =
  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_DEPLOY_ENV || undefined : undefined;

/** The platform API base URL for this deployment. */
export function platformApiBase(): string {
  const explicit = (process.env.NEXT_PUBLIC_PLATFORM_API_URL ?? "").trim();
  if (explicit.length > 0) return explicit;
  const env = DEPLOY_ENV ?? "stage";
  return `https://api-edge-${env}.${PLATFORM_SUBDOMAIN}.workers.dev`;
}

/**
 * openproduct's own API — the gateway (OX3).
 *
 * PROD NAMES `https://api.openproduct.live`; EVERY OTHER ENVIRONMENT FALLS
 * BACK, and the fallback is a first-class address rather than a degraded mode
 * (openproduct-performance, 2026-09-09).
 *
 * OPP3 set this variable once before and took openproduct.live down for ~50
 * minutes: the hostname was created by an infra component that then waited on
 * this worker's own deploy, so the build baked a name that could not yet exist,
 * every public read failed, and the resulting smoke failure blocked the very
 * apply that would have created it.
 *
 * WHAT MAKES IT SAFE NOW IS THE SHAPE, NOT THE FACT THAT THE NAME HAPPENS TO
 * EXIST. The `api.` record and Route moved to `openproduct-api-domain`, which
 * depends on the GATEWAY only, and `openproduct-web` depends on that. The chain
 * is acyclic and the hostname is created before this build on any estate,
 * including one built from nothing. `tests/web/src/deploy-ordering.test.ts`
 * asserts both halves; the account is in the epic's IMPLEMENTATION-STATUS.
 *
 * AND THE FALLBACK LOSES NOTHING, which is why none of it was urgent.
 * `openproduct-gateway-{env}` on workers.dev carries the same cache: since
 * OPP4a that cache is **Workers Caching**, keyed to the worker rather than to a
 * hostname, verified in production at `cf-cache-status: HIT` with an exact 60s
 * TTL on BOTH addresses. The `api.` name buys a canonical public API address
 * and no performance whatsoever.
 */
export function openproductApiBase(): string {
  const explicit = (process.env.NEXT_PUBLIC_OPENPRODUCT_API_URL ?? "").trim();
  if (explicit.length > 0) return explicit;
  const env = DEPLOY_ENV ?? "stage";
  return `https://openproduct-gateway-${env}.${PRODUCT_SUBDOMAIN}.workers.dev`;
}

/**
 * The console origin for cross-product URLs (the S10 funnel hand-off, the
 * S5 join door). Empty means "not configured": callers degrade to a relative
 * URL, which is only ever right in a single-host dev setup.
 */
export function consoleOrigin(): string {
  return (process.env.NEXT_PUBLIC_CONSOLE_ORIGIN ?? "").trim();
}

/**
 * This site's own canonical origin (e.g. `https://openproduct.live`), or null
 * when unset — pages then advertise no canonical, which is correct for
 * workers.dev preview hosts.
 */
export function siteOrigin(): string | null {
  const value = (process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "").trim();
  return value.length > 0 ? value : null;
}
