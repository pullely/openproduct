// Where a flip goes, and where it does not (OO1, OO-A, OO-C).

import { describe, expect, it } from "vitest";

import { RUNBOOK, RUNBOOK_PATH, alertLine, runbookAnchor } from "@openproduct/contracts";

import { alertDelivery, deliverAlert, deliverDeployAlert, hmacHex, inMaintenance, runbookUrl } from "./alert.js";
import type { Flip } from "./state.js";

const NOW = new Date("2026-09-10T12:00:00Z");
const BREACH: Flip = { slo: "search-freshness", state: "breached", mode: "sweep_not_run" };
const RECOVERY: Flip = { slo: "search-freshness", state: "recovered", mode: null };
const SITE = { SITE_ORIGIN: "https://openproduct.live" };

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: string;
}

function capturing(status = 202): { fetch: typeof fetch; sent: Sent[] } {
  const sent: Sent[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({
      url: String(input),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: String(init?.body),
    });
    return new Response(null, { status });
  }) as typeof fetch;
  return { fetch: fetchImpl, sent };
}

describe("inert until the gate is answered", () => {
  it("no url, no secret or no subject is `no_channel`, and nothing is fetched", async () => {
    const { fetch: f, sent } = capturing();
    for (const env of [
      {},
      { ALERT_DELIVERY_URL: "https://platform.test/seam/alert" },
      { ALERT_DELIVERY_URL: "https://platform.test/seam/alert", ALERT_SEAM_SECRET: "s" },
      { ALERT_SEAM_SECRET: "s", OPERATOR_SUBJECT_ID: "usr_op" },
      // Not https is not a channel either.
      { ALERT_DELIVERY_URL: "http://platform.test/seam/alert", ALERT_SEAM_SECRET: "s", OPERATOR_SUBJECT_ID: "usr_op" },
    ]) {
      expect(await deliverAlert({ ...SITE, ...env }, f, BREACH, NOW)).toEqual({ sent: false, reason: "no_channel" });
    }
    expect(sent).toEqual([]);
  });

  it("a maintenance window suppresses the send and says so, and a past one does not", async () => {
    const { fetch: f, sent } = capturing();
    const channel = { ...SITE, ALERT_DELIVERY_URL: "https://platform.test/seam/alert", ALERT_SEAM_SECRET: "s", OPERATOR_SUBJECT_ID: "usr_op" };
    expect(inMaintenance({ MAINTENANCE_UNTIL: "2026-09-10T13:00:00Z" }, NOW)).toBe(true);
    expect(inMaintenance({ MAINTENANCE_UNTIL: "2026-09-10T11:00:00Z" }, NOW)).toBe(false);
    expect(inMaintenance({ MAINTENANCE_UNTIL: "soon" }, NOW)).toBe(false);
    expect(inMaintenance({}, NOW)).toBe(false);
    expect(await deliverAlert({ ...channel, MAINTENANCE_UNTIL: "2026-09-10T13:00:00Z" }, f, BREACH, NOW)).toEqual({ sent: false, reason: "maintenance" });
    expect(sent).toEqual([]);
    expect(await deliverAlert({ ...channel, MAINTENANCE_UNTIL: "2026-09-10T11:00:00Z" }, f, BREACH, NOW)).toEqual({ sent: true, reason: null });
    expect(sent).toHaveLength(1);
  });
});

describe("with a channel, the seam's scheme", () => {
  const channel = { ...SITE, ALERT_DELIVERY_URL: "https://platform.test/seam/alert", ALERT_SEAM_SECRET: "shared-secret", OPERATOR_SUBJECT_ID: "usr_op" };

  it("posts a signed notification kind addressed to a subject, carrying the line and the runbook link", async () => {
    const { fetch: f, sent } = capturing();
    expect(await deliverAlert(channel, f, BREACH, NOW)).toEqual({ sent: true, reason: null });
    expect(sent).toHaveLength(1);
    const [post] = sent;
    expect(post!.url).toBe("https://platform.test/seam/alert");
    expect(post!.headers["content-type"]).toBe("application/json");
    expect(post!.headers["x-webhook-timestamp"]).toBe(String(Math.floor(NOW.getTime() / 1000)));
    expect(post!.headers["x-webhook-id"]).toMatch(/^[0-9a-f-]{36}$/);
    const expected = `sha256=${await hmacHex("shared-secret", `${post!.headers["x-webhook-timestamp"]}.${post!.body}`)}`;
    expect(post!.headers["x-webhook-signature"]).toBe(expected);
    expect(JSON.parse(post!.body)).toEqual({
      kind: "openproduct_alert",
      subjectId: "usr_op",
      slo: "search-freshness",
      state: "breached",
      mode: "sweep_not_run",
      line: "openproduct: search-freshness is breached — the sweep did not run.",
      runbook: "https://openproduct.live/docs/runbook#search-freshness-sweep-not-run",
      at: "2026-09-10T12:00:00.000Z",
    });
    // No address anywhere in what crosses (I3).
    expect(post!.body).not.toMatch(/@|email/);
  });

  it("a non-2xx is `refused`, a throw is `unreachable` — and neither throws out of the cycle", async () => {
    const refusing = capturing(503);
    expect(await deliverAlert(channel, refusing.fetch, BREACH, NOW)).toEqual({ sent: false, reason: "refused" });
    const throwing = (async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    expect(await deliverAlert(channel, throwing, BREACH, NOW)).toEqual({ sent: false, reason: "unreachable" });
  });
});

describe("the runbook line (OO-3)", () => {
  it("every failure mode of every promise points at an anchor the runbook has", () => {
    const anchors = new Set(RUNBOOK.map((e) => e.anchor));
    for (const slo of ["search-freshness", "count-freshness", "cache-hit"] as const) {
      expect(anchors.has(runbookAnchor(slo, "unreachable"))).toBe(true);
    }
    expect(anchors.has(runbookAnchor("search-freshness", "sweep_not_run"))).toBe(true);
    expect(anchors.has(runbookAnchor("search-freshness", "page_disagrees"))).toBe(true);
    expect(anchors.has(runbookAnchor("count-freshness", "sweep_not_run"))).toBe(true);
    expect(anchors.has(runbookAnchor("cache-hit", "cache_cold"))).toBe(true);
    // Anchors are unique and fragment-safe.
    expect(anchors.size).toBe(RUNBOOK.length);
    for (const anchor of anchors) expect(anchor).toMatch(/^[a-z0-9-]+$/);
  });

  it("a breach links to its page; a recovery links to the runbook and says it holds again", () => {
    expect(runbookUrl(SITE, BREACH)).toBe(`https://openproduct.live${RUNBOOK_PATH}#search-freshness-sweep-not-run`);
    expect(runbookUrl(SITE, RECOVERY)).toBe(`https://openproduct.live${RUNBOOK_PATH}`);
    expect(runbookUrl(SITE, { slo: "cache-hit", state: "breached", mode: null })).toBe(`https://openproduct.live${RUNBOOK_PATH}#unreachable`);
    expect(alertLine("search-freshness", "recovered", null)).toBe("openproduct: search-freshness holds again.");
    expect(alertLine("cache-hit", "breached", "cache_cold")).toBe("openproduct: cache-hit is breached — the front page is rendered more than one time in ten.");
    expect(alertDelivery(SITE, "usr_op", RECOVERY, NOW).line).toBe("openproduct: search-freshness holds again.");
  });
});

describe("OO3 — the deploy line", () => {
  const channel = { ...SITE, ALERT_DELIVERY_URL: "https://platform.test/seam/alert", ALERT_SEAM_SECRET: "s", OPERATOR_SUBJECT_ID: "usr_op" };

  it("an unverified deploy is delivered as `deploy`, with the reason as its mode and the unverified page as its link", async () => {
    const { fetch: f, sent } = capturing();
    expect(await deliverDeployAlert(channel, f, { version: "7b3c9f2e-0000-4000-8000-000000000001", state: "breached", reason: "phases_stale" }, NOW)).toEqual({ sent: true, reason: null });
    expect(JSON.parse(sent[0]!.body)).toEqual({
      kind: "openproduct_alert",
      subjectId: "usr_op",
      slo: "deploy",
      state: "breached",
      mode: "phases_stale",
      line: "openproduct: deploy 7b3c9f2e is not verified — a per-tick phase has not run since it was uploaded.",
      runbook: "https://openproduct.live/docs/runbook#deploy-unverified",
      at: "2026-09-10T12:00:00.000Z",
    });
    const { fetch: g, sent: later } = capturing();
    await deliverDeployAlert(channel, g, { version: "7b3c9f2e-0000-4000-8000-000000000001", state: "recovered", reason: null }, NOW);
    expect((JSON.parse(later[0]!.body) as { line: string }).line).toBe("openproduct: deploy 7b3c9f2e is verified — every per-tick phase has run since it.");
    // The same gate as every other alert: no channel, no send.
    expect(await deliverDeployAlert(SITE, f, { version: "x", state: "breached", reason: "walk_failed" }, NOW)).toEqual({ sent: false, reason: "no_channel" });
  });
});
