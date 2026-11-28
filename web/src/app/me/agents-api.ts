// Connected agents, from the website's side (openproduct-mcp MC1).
//
// The consent page and Settings → Connected agents read and write through
// these, with the person's own session — the same door every `/me` page
// uses. None of this is cached anywhere: every answer is one person's.

import type { AgentCredentialSummary, AgentScope, PersonalTokenLifetime } from "@openproduct/contracts";

import { publicApiBase } from "../public-api";
import { meHeaders, type MeFetch, type MeResult } from "./me-api";

export interface ConsentClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  registeredAt: string;
}

/** Refusals, in the service's own words, field by field. */
export type AgentWriteResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "unauthorized" }
  | { kind: "refused"; message: string }
  | { kind: "unavailable" };

async function readEnvelope<T>(res: Response): Promise<T | null> {
  try {
    return ((await res.json()) as { data?: T }).data ?? null;
  } catch {
    return null;
  }
}

async function refusalOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string; details?: { fields?: Record<string, string[]> } } };
    const fields = body.error?.details?.fields ?? {};
    const first = Object.values(fields).flat()[0];
    return (first ?? body.error?.message ?? "That was refused.").slice(0, 240);
  } catch {
    return "That was refused.";
  }
}

/** The client a consent screen names. Anonymous: its name is the client's own claim. */
export async function fetchConsentClient(clientId: string, fetchImpl: MeFetch = fetch): Promise<ConsentClient | null | "unavailable"> {
  if (!/^ocl_[A-Za-z0-9_-]{1,64}$/.test(clientId)) return null;
  try {
    const res = await fetchImpl(`${publicApiBase()}/v1/openproduct/oauth/clients/${clientId}`, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) return "unavailable";
    return (await readEnvelope<{ client: ConsentClient }>(res))?.client ?? "unavailable";
  } catch {
    return "unavailable";
  }
}

export interface GrantRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  scopes: AgentScope[];
  listingIds: string[] | null;
  decision: "allow" | "deny";
}

/** The person's Allow (or Cancel); the answer is where to send the browser. */
export async function createGrant(
  token: string,
  grant: GrantRequest,
  fetchImpl: MeFetch = fetch,
): Promise<AgentWriteResult<{ redirectTo: string }>> {
  return write(token, "/v1/openproduct/me/oauth-grants", "POST", grant, fetchImpl);
}

export async function fetchAgentCredentials(
  token: string,
  fetchImpl: MeFetch = fetch,
): Promise<MeResult<{ credentials: AgentCredentialSummary[] }>> {
  try {
    const res = await fetchImpl(`${publicApiBase()}/v1/openproduct/me/agent-credentials`, {
      method: "GET",
      headers: meHeaders(token, false),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) return { kind: "unauthorized" };
    if (!res.ok) return { kind: "unavailable" };
    const data = await readEnvelope<{ credentials: AgentCredentialSummary[] }>(res);
    return data && Array.isArray(data.credentials) ? { kind: "ok", data } : { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}

export async function mintPersonalToken(
  token: string,
  input: { name: string; scopes: AgentScope[]; days: PersonalTokenLifetime; listingIds: string[] | null },
  fetchImpl: MeFetch = fetch,
): Promise<AgentWriteResult<{ credential: AgentCredentialSummary; token: string }>> {
  return write(token, "/v1/openproduct/me/agent-credentials", "POST", input, fetchImpl);
}

export async function revokeAgentCredential(
  token: string,
  id: string,
  fetchImpl: MeFetch = fetch,
): Promise<AgentWriteResult<{ revoked: boolean }>> {
  if (!/^agc_[A-Za-z0-9_-]{1,64}$/.test(id)) return { kind: "refused", message: "No such agent." };
  return write(token, `/v1/openproduct/me/agent-credentials/${id}`, "DELETE", undefined, fetchImpl);
}

async function write<T>(
  token: string,
  path: string,
  method: string,
  body: unknown,
  fetchImpl: MeFetch,
): Promise<AgentWriteResult<T>> {
  try {
    const res = await fetchImpl(`${publicApiBase()}${path}`, {
      method,
      headers: meHeaders(token, body !== undefined),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) return { kind: "unauthorized" };
    if (res.status === 422 || res.status === 400) return { kind: "refused", message: await refusalOf(res) };
    if (!res.ok) return { kind: "unavailable" };
    const data = await readEnvelope<T>(res);
    return data ? { kind: "ok", data } : { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}
