// Observed screenshots — the capture policy (openproduct-worldclass MD4).
//
// MD0 gave the model a third kind of image, OBSERVED, whose provenance is a
// read of the listing's own live address (`declared_url`); MD2 gave the page
// the dated frame that shows one and withdraws it past its window. This file
// is the policy for PUTTING one there: which listings are asked for a
// capture, how often, what address may be visited, where the capture is made,
// how many a run may make, and what a failure is called. Numbers first, so
// that the sweep, the health document and `/docs/checks` say the same ones.
//
// ─── WHERE THE BROWSER IS, AND WHY IT IS NOT HERE ────────────────────────
//
// A screenshot needs a browser, and the gateway is a Worker with no browser
// in it. Two shapes were possible:
//
//   a BINDING — Cloudflare's Browser Rendering as a `browser` binding on the
//   gateway, driven with a puppeteer client from inside the isolate. A new
//   data resource on the one worker whose binding allowlist test exists so
//   that taking one is "a deliberate, reviewed act rather than a line in a
//   config file nobody read" (MD-4), and a dependency that cannot run in a
//   test.
//
//   a URL — the same service, reached over HTTPS at a pinned host, with a
//   token that is a secret to deliver rather than a decision to take. The
//   shape the rest of this gateway already has for everything outside the
//   estate: GitHub is `api.github.com` pinned in `github.ts`; the platform is
//   "public URLs in vars — never a binding" (wrangler.jsonc's own words); the
//   digest seam is `DIGEST_DELIVERY_URL`, absent meaning no sending.
//
// The URL. It keeps the binding allowlist exactly as MD1 left it (one bucket,
// nothing else), it is testable with the injected `fetch` every other outward
// read uses, and ABSENT MEANS OFF: an environment with no provider configured
// captures nothing, claims nothing, and says so on `/health` — which is RS2's
// per-environment opt-in for ingestion, applied to the one ingestion phase
// that visits an address a maker typed.
//
// ─── THE ADDRESS IS PARSED, NOT TRUSTED ──────────────────────────────────
//
// `live_url` is the maker's own text. The browser that visits it runs in the
// provider's network and not in ours, so the classic SSRF — a private address
// reached from inside the estate — is not on the table. What IS on the table
// is what the sweep is willing to be SEEN asking for on a maker's behalf:
// a credential in the address, an unusual port, a raw IP, a name that does
// not resolve on the public internet. `captureTarget` refuses those, and a
// refusal is a failure the listing is charged for — the remedy is in the
// maker's hands, exactly as `repo_url_unreadable` is for a repository.

import { SCREENSHOT_STALE_AFTER_DAYS } from "./media.js";

// ---------------------------------------------------------------------------
// The numbers
// ---------------------------------------------------------------------------

/**
 * How old a capture may be before the sweep takes a new one.
 *
 * SEVEN, AGAINST A WINDOW OF THIRTY. The window (`SCREENSHOT_STALE_AFTER_DAYS`)
 * is when a READER stops being entitled to believe a capture; the refresh is
 * how often WE look. The gap between them is the whole point: a site that is
 * up is never shown withdrawn because we forgot to look, and a site that has
 * gone down is withdrawn twenty-three days after the last time we saw it —
 * long enough to ride out an outage, short enough that a dead product does
 * not keep a live picture for a season. A test asserts the order.
 */
export const SCREENSHOT_REFRESH_AFTER_DAYS = 7;

/**
 * Captures per ingestion run.
 *
 * FIVE, NOT TWENTY-FIVE. Repository observation's cap exists because of
 * GitHub's unauthenticated ceiling; this one exists because every capture is
 * a browser rendering a stranger's page — the most expensive thing the sweep
 * does by two orders of magnitude, on a schedule whose run has one time
 * budget. Hourly, five a run is a hundred and twenty a day, which refreshes
 * a corpus of eight hundred listings inside the seven-day cadence above. The
 * queue is oldest-first, so a cap that cannot finish in one run finishes in
 * the next.
 */
export const CAPTURE_MAX_PER_RUN = 5;

/**
 * Consecutive failures before a listing's address is withdrawn from the
 * queue. THE SAME EIGHT AS A REPOSITORY SOURCE, for the same reason: past
 * this we stop asking, and the capture already on the page ages out through
 * its own window rather than being frozen. A changed address re-arms it.
 */
export const CAPTURE_FAILURE_TOLERANCE = 8;

/** The viewport a capture is taken at. A laptop, not a phone: the picture is
 *  the product's face, and a 1280-wide frame is what its makers designed
 *  for first. Four times MD1's smallest derivative, so every width serves. */
export const CAPTURE_VIEWPORT = { width: 1280, height: 800 } as const;

/** How long the provider is given to load the page and return the bytes. */
export const CAPTURE_TIMEOUT_MS = 20_000;

/** The provider's host. THE PIN: a configured URL on any other host is
 *  treated as not configured, so a mistyped var can never send the token
 *  anywhere but where it belongs. */
export const CAPTURE_PROVIDER_HOST = "api.cloudflare.com";

/** The longest address the sweep will visit. Longer is not a product page. */
export const CAPTURE_TARGET_MAX_LENGTH = 2048;

// ---------------------------------------------------------------------------
// The address
// ---------------------------------------------------------------------------

export const CAPTURE_TARGET_REFUSALS = [
  "missing",
  "too_long",
  "unparseable",
  "not_https",
  "has_credentials",
  "has_port",
  "ip_literal",
  "not_public_name",
] as const;
export type CaptureTargetRefusal = (typeof CAPTURE_TARGET_REFUSALS)[number];

export type CaptureTarget =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: CaptureTargetRefusal };

/** Top-level labels that never name a public site. `localhost` is a name of
 *  its own as well as a label; both spellings are refused. */
const RESERVED_LABELS = new Set([
  "localhost",
  "local",
  "internal",
  "intranet",
  "lan",
  "home",
  "corp",
  "test",
  "example",
  "invalid",
  "onion",
  "arpa",
]);

const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * Whether a listing's declared address is one the sweep will visit, and the
 * exact string it will visit.
 *
 * PARSED, NOT FETCHED. Every rule is a property of the text, decided before
 * any network is touched: `https:` only, no credentials, no explicit port,
 * no IP literal, and a hostname with at least two labels whose last is not a
 * reserved one. The fragment is dropped — a browser never sends it and two
 * addresses differing only there are one page.
 */
export function captureTarget(raw: string | null | undefined): CaptureTarget {
  const text = (raw ?? "").trim();
  if (text.length === 0) return { ok: false, reason: "missing" };
  if (text.length > CAPTURE_TARGET_MAX_LENGTH) return { ok: false, reason: "too_long" };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, reason: "unparseable" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "not_https" };
  if (url.username.length > 0 || url.password.length > 0) {
    return { ok: false, reason: "has_credentials" };
  }
  if (url.port.length > 0) return { ok: false, reason: "has_port" };
  const host = url.hostname.toLowerCase();
  if (host.startsWith("[") || IPV4_RE.test(host)) return { ok: false, reason: "ip_literal" };
  const labels = host.split(".").filter((label) => label.length > 0);
  const last = labels[labels.length - 1] ?? "";
  if (labels.length < 2 || RESERVED_LABELS.has(last) || host === "localhost") {
    return { ok: false, reason: "not_public_name" };
  }
  url.hash = "";
  return { ok: true, url: url.toString() };
}

// ---------------------------------------------------------------------------
// The provider
// ---------------------------------------------------------------------------

export type CaptureProvider =
  | { readonly ok: true; readonly url: string; readonly token: string }
  | { readonly ok: false; readonly reason: "not_configured" | "not_pinned" };

/**
 * Whether captures are ON in this environment, and where they are made.
 *
 * Both halves must be present — an endpoint with no token, or a token with
 * no endpoint, is not configured — and the endpoint must be `https:` on the
 * pinned host. Nothing here reads a value from anywhere but its arguments,
 * so the gateway passes its two settings and a test passes strings.
 */
export function captureProvider(
  endpoint: string | undefined,
  token: string | undefined,
): CaptureProvider {
  const url = (endpoint ?? "").trim();
  const secret = (token ?? "").trim();
  if (url.length === 0 || secret.length === 0) return { ok: false, reason: "not_configured" };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "not_pinned" };
  }
  if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== CAPTURE_PROVIDER_HOST) {
    return { ok: false, reason: "not_pinned" };
  }
  return { ok: true, url, token: secret };
}

// ---------------------------------------------------------------------------
// The wire: what core hands the sweep, and what the sweep hands back
// ---------------------------------------------------------------------------

/** One listing whose capture is due. The slug is the product's name on
 *  every public surface, and the generated alt text names it by that. */
export interface DueCapture {
  /** The listing's PUBLIC id — internal ids do not cross the binding. */
  readonly profileId: string;
  readonly slug: string;
  /** The declared address, exactly as the maker wrote it. */
  readonly target: string;
  /** When the capture on the page was taken, or null for none. */
  readonly observedAt: string | null;
}

/**
 * What a capture attempt can fail as. A CLOSED LIST, like a signal source's
 * error: the sweep reports one of these and nothing else, so the column that
 * records the last failure holds a word an operator can grep for and never a
 * response body or an address.
 */
export const CAPTURE_FAILURES = [
  "target_refused",
  "provider_unreachable",
  "provider_refused",
  "not_an_image",
  "too_small",
  "too_large",
  "store_failed",
] as const;
export type CaptureFailure = (typeof CAPTURE_FAILURES)[number];

export type CaptureReport =
  | {
      readonly profileId: string;
      readonly target: string;
      readonly ok: true;
      readonly ref: string;
      readonly alt: string;
      readonly width: number;
      readonly height: number;
      readonly observedAt: string;
    }
  | {
      readonly profileId: string;
      readonly target: string;
      readonly ok: false;
      readonly error: CaptureFailure;
    };

/** Whether a capture taken at `observedAt` is old enough to retake. Null —
 *  no capture — is due by definition. */
export function screenshotRefreshDue(observedAt: string | null, now: Date): boolean {
  if (observedAt === null) return true;
  const at = Date.parse(observedAt);
  if (Number.isNaN(at)) return true;
  return now.getTime() - at >= SCREENSHOT_REFRESH_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// The budget, as `/health` and `/docs/checks` report it
// ---------------------------------------------------------------------------

/**
 * The capture budget as a document: whether this environment captures at
 * all, and the three numbers above. THE PRESENCE OF THE SETTINGS, NEVER
 * THEIR VALUES — the same rule `ingestionBudget` keeps for the GitHub token.
 */
export interface ScreenshotBudget {
  readonly configured: boolean;
  readonly maxPerRun: number;
  readonly refreshAfterDays: number;
  readonly withdrawnAfterDays: number;
}

export function screenshotBudget(
  endpoint: string | undefined,
  token: string | undefined,
): ScreenshotBudget {
  return {
    configured: captureProvider(endpoint, token).ok,
    maxPerRun: CAPTURE_MAX_PER_RUN,
    refreshAfterDays: SCREENSHOT_REFRESH_AFTER_DAYS,
    withdrawnAfterDays: SCREENSHOT_STALE_AFTER_DAYS,
  };
}
