// Where a flip goes (OO1, gated on OO-A).
//
// AN ALERT CARRIES THE RUNBOOK LINE, NOT A STACK TRACE (OO-3): one sentence,
// the promise, the mode, and a link to the one page that says what a
// visitor sees, which route re-fires it, and what recovered looks like. No
// address crosses here and none could — openproduct holds none (I3); the
// alert is addressed to an operator SUBJECT and the platform, which holds
// the address, sends (OO-5, CB4's model).
//
// THE SCHEME IS THE SEAM'S, unchanged: `${timestamp}.${body}` signed
// HMAC-SHA256 with a shared secret, `X-Webhook-Signature` /
// `X-Webhook-Timestamp` / `X-Webhook-ID`. The same one LC5's digest delivery
// signs with and the gateway's receivers verify, re-stated here rather than
// imported for the reason `gateway/src/seam.ts` gives: this worker is its
// own deployable and a workspace import would make that a negotiation.
//
// INERT UNTIL THE GATE IS ANSWERED. Without a url, a secret and a subject,
// a flip is logged (`slo_breached` / `slo_recovered`, which the saved
// queries find) and `alert_undeliverable` says `no_channel`. Nobody is paged
// about a threshold nobody agreed to route.

import {
  DEPLOY_UNVERIFIED,
  RUNBOOK_PATH,
  alertLine,
  deployAlertLine,
  runbookAnchor,
  type DeployUnverifiedReason,
  type SloId,
  type SloState,
} from "@openproduct/contracts";

import type { Env } from "./env.js";
import type { Flip } from "./state.js";

export type UndeliverableReason = "no_channel" | "maintenance" | "refused" | "unreachable";

export interface AlertOutcome {
  readonly sent: boolean;
  readonly reason: UndeliverableReason | null;
}

/** What crosses the seam: a kind, a subject, and the line. */
export interface AlertDelivery {
  readonly kind: "openproduct_alert";
  readonly subjectId: string;
  /** One of the three promises — or `deploy`, OO3's line that fires before one breaks. */
  readonly slo: SloId | "deploy";
  readonly state: SloState;
  readonly mode: string | null;
  readonly line: string;
  readonly runbook: string;
  readonly at: string;
}

const SIGNATURE_PREFIX = "sha256=";

export async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** OO-C — a window during which flips are recorded and not sent. */
export function inMaintenance(env: Pick<Env, "MAINTENANCE_UNTIL">, now: Date): boolean {
  const until = Date.parse(env.MAINTENANCE_UNTIL ?? "");
  return Number.isFinite(until) && now.getTime() < until;
}

/** The link the alert carries: the runbook page on the site, at the anchor. */
export function runbookUrl(env: Pick<Env, "SITE_ORIGIN">, flip: Flip): string {
  const anchor = flip.state === "breached" ? runbookAnchor(flip.slo, flip.mode ?? "unreachable") : null;
  const base = `${(env.SITE_ORIGIN ?? "").replace(/\/$/, "")}${RUNBOOK_PATH}`;
  return anchor ? `${base}#${anchor}` : base;
}

export function alertDelivery(env: Pick<Env, "SITE_ORIGIN">, subjectId: string, flip: Flip, now: Date): AlertDelivery {
  return {
    kind: "openproduct_alert",
    subjectId,
    slo: flip.slo,
    state: flip.state,
    mode: flip.mode,
    line: alertLine(flip.slo, flip.state, flip.mode),
    runbook: runbookUrl(env, flip),
    at: now.toISOString(),
  };
}

/** OO3 — a deploy that went unverified, or one verified after it was reported. */
export interface DeployFlip {
  readonly version: string;
  readonly state: SloState;
  readonly reason: DeployUnverifiedReason | null;
}

export function deployAlertDelivery(env: Pick<Env, "SITE_ORIGIN">, subjectId: string, flip: DeployFlip, now: Date): AlertDelivery {
  return {
    kind: "openproduct_alert",
    subjectId,
    slo: "deploy",
    state: flip.state,
    mode: flip.reason,
    line: deployAlertLine(flip.version, flip.state, flip.reason),
    runbook: `${(env.SITE_ORIGIN ?? "").replace(/\/$/, "")}${RUNBOOK_PATH}#${DEPLOY_UNVERIFIED.anchor}`,
    at: now.toISOString(),
  };
}

type ChannelEnv = Pick<Env, "ALERT_DELIVERY_URL" | "ALERT_SEAM_SECRET" | "OPERATOR_SUBJECT_ID" | "MAINTENANCE_UNTIL" | "SITE_ORIGIN">;

export async function deliverAlert(env: ChannelEnv, fetchImpl: typeof fetch, flip: Flip, now: Date): Promise<AlertOutcome> {
  return deliver(env, fetchImpl, (subjectId) => alertDelivery(env, subjectId, flip, now), now);
}

export async function deliverDeployAlert(env: ChannelEnv, fetchImpl: typeof fetch, flip: DeployFlip, now: Date): Promise<AlertOutcome> {
  return deliver(env, fetchImpl, (subjectId) => deployAlertDelivery(env, subjectId, flip, now), now);
}

async function deliver(
  env: ChannelEnv,
  fetchImpl: typeof fetch,
  compose: (subjectId: string) => AlertDelivery,
  now: Date,
): Promise<AlertOutcome> {
  if (inMaintenance(env, now)) return { sent: false, reason: "maintenance" };
  const url = (env.ALERT_DELIVERY_URL ?? "").trim();
  const secret = env.ALERT_SEAM_SECRET ?? "";
  const subjectId = (env.OPERATOR_SUBJECT_ID ?? "").trim();
  if (!/^https:\/\//.test(url) || secret.length === 0 || subjectId.length === 0) return { sent: false, reason: "no_channel" };

  const body = JSON.stringify(compose(subjectId));
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const signature = `${SIGNATURE_PREFIX}${await hmacHex(secret, `${timestamp}.${body}`)}`;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Timestamp": timestamp,
        "X-Webhook-ID": crypto.randomUUID(),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? { sent: true, reason: null } : { sent: false, reason: "refused" };
  } catch {
    return { sent: false, reason: "unreachable" };
  }
}
