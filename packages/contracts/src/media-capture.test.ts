// The capture policy (openproduct-worldclass MD4).
//
// Every rule here is a property of text and numbers, decided before any
// network is touched — which is what lets it be proved without one.

import { describe, expect, it } from "vitest";

import {
  CAPTURE_FAILURES,
  CAPTURE_FAILURE_TOLERANCE,
  CAPTURE_MAX_PER_RUN,
  CAPTURE_PROVIDER_HOST,
  CAPTURE_TARGET_MAX_LENGTH,
  CAPTURE_VIEWPORT,
  INGESTION_MAX_SOURCES_PER_RUN,
  MEDIA_WIDTHS,
  SCREENSHOT_REFRESH_AFTER_DAYS,
  SCREENSHOT_STALE_AFTER_DAYS,
  SOURCE_FAILURE_TOLERANCE,
  captureProvider,
  captureTarget,
  screenshotBudget,
  screenshotRefreshDue,
} from "./index.js";
import { SCREENSHOT_COPY, screenshotBudgetCopy } from "./sweep-copy.js";

const NOW = new Date("2026-09-10T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe("the numbers agree with the rest of the plane", () => {
  it("refreshes well inside the window, so a live site is never withdrawn for want of a look", () => {
    expect(SCREENSHOT_REFRESH_AFTER_DAYS).toBeLessThan(SCREENSHOT_STALE_AFTER_DAYS);
    // At least two refreshes fit inside one window: one missed run does
    // not put a live site's picture on the edge of withdrawal.
    expect(SCREENSHOT_REFRESH_AFTER_DAYS * 2).toBeLessThanOrEqual(SCREENSHOT_STALE_AFTER_DAYS);
  });

  it("caps a run below repository observation — a browser render is not a JSON read", () => {
    expect(CAPTURE_MAX_PER_RUN).toBeGreaterThan(0);
    expect(CAPTURE_MAX_PER_RUN).toBeLessThan(INGESTION_MAX_SOURCES_PER_RUN);
  });

  it("withdraws an address after the same run of failures as a repository source", () => {
    expect(CAPTURE_FAILURE_TOLERANCE).toBe(SOURCE_FAILURE_TOLERANCE);
  });

  it("captures wide enough that every standard derivative is a reduction", () => {
    // MD1's `derivativeWidths` only makes widths strictly below the original;
    // a capture narrower than the widest standard width would serve the
    // original at that width.
    expect(CAPTURE_VIEWPORT.width).toBeGreaterThanOrEqual(Math.max(...MEDIA_WIDTHS) / 2);
    expect(CAPTURE_VIEWPORT.width).toBeGreaterThan(CAPTURE_VIEWPORT.height);
  });

  it("names its failures as a closed list, and none of them is a body or an address", () => {
    expect(CAPTURE_FAILURES.length).toBeGreaterThan(3);
    for (const failure of CAPTURE_FAILURES) expect(failure).toMatch(/^[a-z_]+$/);
  });
});

describe("which addresses the sweep will visit", () => {
  it("accepts an ordinary https site and drops the fragment", () => {
    expect(captureTarget("https://acme.example.com/app#top")).toEqual({
      ok: true,
      url: "https://acme.example.com/app",
    });
    expect(captureTarget("  https://Acme.Example.COM  ")).toEqual({
      ok: true,
      url: "https://acme.example.com/",
    });
  });

  it("refuses what is not a public https address, naming why", () => {
    const reason = (raw: string | null) => {
      const target = captureTarget(raw);
      return target.ok ? "ACCEPTED" : target.reason;
    };
    expect(reason(null)).toBe("missing");
    expect(reason("   ")).toBe("missing");
    expect(reason(`https://a.example.com/${"x".repeat(CAPTURE_TARGET_MAX_LENGTH)}`)).toBe("too_long");
    expect(reason("not a url")).toBe("unparseable");
    expect(reason("http://acme.example.com")).toBe("not_https");
    expect(reason("ftp://acme.example.com")).toBe("not_https");
    expect(reason("https://user:pw@acme.example.com")).toBe("has_credentials");
    expect(reason("https://user@acme.example.com")).toBe("has_credentials");
    expect(reason("https://acme.example.com:8443/")).toBe("has_port");
    expect(reason("https://10.0.0.1/")).toBe("ip_literal");
    expect(reason("https://[::1]/")).toBe("ip_literal");
    expect(reason("https://localhost/")).toBe("not_public_name");
    expect(reason("https://acme/")).toBe("not_public_name");
    expect(reason("https://gateway.internal/")).toBe("not_public_name");
    expect(reason("https://printer.local/")).toBe("not_public_name");
    expect(reason("https://acme.test/")).toBe("not_public_name");
    expect(reason("https://acme.example/")).toBe("not_public_name");
  });

  it("does not refuse the ordinary shapes a product actually has", () => {
    for (const raw of [
      "https://acme.dev",
      "https://acme.workers.dev",
      "https://www.acme.co.uk/product?ref=openproduct",
      "https://acme.github.io/thing/",
      "https://xn--bcher-kva.example.org/",
    ]) {
      expect([raw, captureTarget(raw).ok]).toEqual([raw, true]);
    }
  });
});

describe("where the browser is", () => {
  const ENDPOINT = `https://${CAPTURE_PROVIDER_HOST}/client/v4/accounts/abc/browser-rendering/screenshot`;

  it("is configured only when both the endpoint and the token are present", () => {
    expect(captureProvider(ENDPOINT, "tok").ok).toBe(true);
    expect(captureProvider(ENDPOINT, undefined)).toEqual({ ok: false, reason: "not_configured" });
    expect(captureProvider(ENDPOINT, "   ")).toEqual({ ok: false, reason: "not_configured" });
    expect(captureProvider(undefined, "tok")).toEqual({ ok: false, reason: "not_configured" });
    expect(captureProvider("", "")).toEqual({ ok: false, reason: "not_configured" });
  });

  it("treats an endpoint on any other host, or over http, as not configured — the token goes nowhere else", () => {
    expect(captureProvider("https://api.cloudflare.com.evil.example/x", "tok")).toEqual({
      ok: false,
      reason: "not_pinned",
    });
    expect(captureProvider("https://example.com/screenshot", "tok")).toEqual({ ok: false, reason: "not_pinned" });
    expect(captureProvider(`http://${CAPTURE_PROVIDER_HOST}/x`, "tok")).toEqual({ ok: false, reason: "not_pinned" });
    expect(captureProvider("nonsense", "tok")).toEqual({ ok: false, reason: "not_pinned" });
  });

  it("hands back the token it was given and nothing derived from it", () => {
    const provider = captureProvider(ENDPOINT, " tok ");
    expect(provider).toEqual({ ok: true, url: ENDPOINT, token: "tok" });
  });
});

describe("when a capture is due", () => {
  it("is due with no capture, past the refresh, and on an unreadable moment", () => {
    expect(screenshotRefreshDue(null, NOW)).toBe(true);
    expect(screenshotRefreshDue(daysAgo(SCREENSHOT_REFRESH_AFTER_DAYS), NOW)).toBe(true);
    expect(screenshotRefreshDue(daysAgo(SCREENSHOT_REFRESH_AFTER_DAYS + 20), NOW)).toBe(true);
    expect(screenshotRefreshDue("yesterday", NOW)).toBe(true);
  });

  it("is not due inside the refresh", () => {
    expect(screenshotRefreshDue(daysAgo(1), NOW)).toBe(false);
    expect(screenshotRefreshDue(daysAgo(SCREENSHOT_REFRESH_AFTER_DAYS - 1), NOW)).toBe(false);
  });
});

describe("the budget on /health", () => {
  const ENDPOINT = `https://${CAPTURE_PROVIDER_HOST}/client/v4/accounts/abc/browser-rendering/screenshot`;

  it("reports the presence of the settings, never their values", () => {
    const on = screenshotBudget(ENDPOINT, "secret-token-value");
    expect(on).toEqual({
      configured: true,
      maxPerRun: CAPTURE_MAX_PER_RUN,
      refreshAfterDays: SCREENSHOT_REFRESH_AFTER_DAYS,
      withdrawnAfterDays: SCREENSHOT_STALE_AFTER_DAYS,
    });
    expect(JSON.stringify(on)).not.toContain("secret-token-value");
    expect(JSON.stringify(on)).not.toContain("accounts/abc");
    expect(screenshotBudget(undefined, undefined).configured).toBe(false);
  });

  it("reads as a sentence either way, and says what an unconfigured environment does NOT claim", () => {
    const on = screenshotBudgetCopy(screenshotBudget(ENDPOINT, "t"));
    expect(on).toBe(
      `Up to ${CAPTURE_MAX_PER_RUN} captures a run, each retaken after ${SCREENSHOT_REFRESH_AFTER_DAYS} days and withdrawn from the page after ${SCREENSHOT_STALE_AFTER_DAYS}.`,
    );
    const off = screenshotBudgetCopy(screenshotBudget(undefined, undefined));
    expect(off).toContain("Not configured in this environment");
    expect(off).toContain("no capture is shown");
    expect(off).toContain(`Up to ${CAPTURE_MAX_PER_RUN} captures a run`);
    expect(SCREENSHOT_COPY.cadence).toContain("hourly");
    expect(SCREENSHOT_COPY.does).toContain("withdrawn");
  });
});
