// The signed-in tools, as clients of the routes (openproduct-mcp MC2).
//
// EVERY TOOL HERE IS A REQUEST THE WEBSITE COULD HAVE SENT. A public read is
// a GET of the public route, through `route()`; anything of the person's is
// a request to the authenticated plane, through the same handler the
// website's own calls reach (`handleAuthenticated`), with the person already
// resolved from the agent's credential. Validation, rate limits, moderation,
// core's authorisation, its refusals and the purges are therefore the
// website's, and cannot drift from it (design §3.3).
//
// What this file adds, and only this: the scope check (from the registry),
// the listing restriction, and the shape of an answer an agent can act on.

import {
  AGENT_UNTRUSTED_NOTE,
  signedInTool,
  toolAllowed,
  type ResolvedAgentCredential,
} from "@openproduct/contracts";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** What the router hands the MCP server for one signed-in request. */
export interface SignedInContext {
  readonly agent: ResolvedAgentCredential;
  /** A request to the authenticated plane, as the agent's person. */
  readonly asPerson: (method: string, path: string, body?: unknown) => Promise<Response>;
  /** A GET of a public route. */
  readonly publicGet: (pathAndQuery: string) => Promise<Response>;
}

function result(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
}

function refusal(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** A route's answer as a tool's: its `data`, or its own refusal in words. */
async function answer(res: Response, untrusted = false): Promise<CallToolResult> {
  type Envelope = { data?: unknown; error?: { message?: string; code?: string } };
  let body: Envelope | null = null;
  try {
    body = (await res.json()) as Envelope;
  } catch {
    body = null;
  }
  if (res.ok && body && "data" in body) {
    return result(untrusted ? { note: AGENT_UNTRUSTED_NOTE, data: body.data } : body.data);
  }
  if (res.status === 429) return refusal(body?.error?.message ?? "Too many requests. Wait and try again.");
  if (res.status === 404) return refusal("Not found, or not yours to read.");
  if (res.status === 401 || res.status === 403) return refusal("This connection may not do that.");
  return refusal(body?.error?.message ?? "openproduct could not answer that right now.");
}

const SLUG_RE = /^[A-Za-z0-9-]{1,64}$/;
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,38}$/;
const THREAD_RE = /^[A-Za-z0-9_-]{1,80}$/;
const WEEK_RE = /^\d{4}-w\d{2}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function text(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

interface MyListing {
  id: string;
  orgId: string;
  slug: string;
}

/** The person's listings, within this connection's restriction. */
async function myListings(ctx: SignedInContext): Promise<MyListing[] | CallToolResult> {
  const res = await ctx.asPerson("GET", "/v1/openproduct/me/listings");
  if (!res.ok) return answer(res);
  const body = (await res.json()) as { data?: { listings?: MyListing[] } };
  const all = body.data?.listings ?? [];
  const only = ctx.agent.listingIds;
  return only === null ? all : all.filter((l) => only.includes(l.id));
}

/** The listing a crew tool is about, or a refusal; never one outside the restriction. */
export async function listingBySlug(ctx: SignedInContext, slug: unknown): Promise<MyListing | CallToolResult> {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) return refusal("slug must be a listing slug.");
  const listings = await myListings(ctx);
  if (!Array.isArray(listings)) return listings;
  const found = listings.find((l) => l.slug === slug);
  return found ?? refusal(`No listing "${slug}" that this connection may act on. Call list_my_listings.`);
}

/** The tools this credential may see, by name. */
export function signedInToolNames(agent: ResolvedAgentCredential): string[] {
  return toolNames().filter((name) => toolAllowed(signedInTool(name)!, agent.scopes));
}

function toolNames(): string[] {
  return Object.keys(HANDLERS);
}

type Handler = (args: Record<string, unknown>, ctx: SignedInContext) => Promise<CallToolResult>;

const HANDLERS: Record<string, Handler> = {
  search: async (args, ctx) => {
    const q = text(args, "q");
    if (!q) return refusal("q is required.");
    const limit = typeof args.limit === "number" ? Math.max(1, Math.min(50, Math.floor(args.limit))) : undefined;
    return answer(await ctx.publicGet(withQuery("/v1/search", { q, limit })), true);
  },
  get_feed: async (_args, ctx) => answer(await ctx.publicGet("/v1/public/openproduct/feed"), true),
  list_people: async (args, ctx) =>
    answer(await ctx.publicGet(withQuery("/v1/public/openproduct/contributors", { cursor: text(args, "cursor") })), true),
  get_person: async (args, ctx) => {
    const handle = (text(args, "handle") ?? "").replace(/^@/, "").toLowerCase();
    if (!HANDLE_RE.test(handle)) return refusal("handle must be a person's handle, like ada.");
    return answer(await ctx.publicGet(`/v1/public/openproduct/people/${handle}`), true);
  },
  list_threads: async (args, ctx) =>
    answer(await ctx.publicGet(withQuery("/v1/public/openproduct/threads", { cursor: text(args, "cursor") })), true),
  get_thread: async (args, ctx) => {
    const id = text(args, "id") ?? "";
    if (!THREAD_RE.test(id)) return refusal("id must be a thread id.");
    return answer(await ctx.publicGet(`/v1/public/openproduct/threads/${id}`), true);
  },
  get_digest: async (args, ctx) => {
    const week = text(args, "week");
    if (week !== undefined && !WEEK_RE.test(week)) return refusal("week must look like 2026-w48.");
    return answer(await ctx.publicGet(week ? `/v1/public/openproduct/digest/${week}` : "/v1/public/openproduct/digest"), true);
  },
  get_leaderboard: async (_args, ctx) => answer(await ctx.publicGet("/v1/public/openproduct/leaderboard"), true),
  list_launches: async (args, ctx) => {
    const day = text(args, "day");
    if (day !== undefined && !DAY_RE.test(day)) return refusal("day must look like 2026-11-28.");
    return answer(await ctx.publicGet(day ? `/v1/public/openproduct/launches/${day}` : "/v1/public/openproduct/launches"), true);
  },
  whoami: async (_args, ctx) => {
    const res = await ctx.asPerson("GET", "/v1/openproduct/me");
    if (!res.ok) return answer(res);
    const body = (await res.json()) as { data?: Record<string, unknown> };
    return result({
      ...(body.data ?? {}),
      connection: {
        client: ctx.agent.clientName,
        kind: ctx.agent.kind,
        scopes: ctx.agent.scopes,
        listings: ctx.agent.listingIds ?? "all",
      },
    });
  },
  list_my_listings: async (_args, ctx) => {
    const listings = await myListings(ctx);
    return Array.isArray(listings) ? result({ listings }) : listings;
  },
  get_listing: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (!("id" in listing)) return listing;
    return answer(await ctx.asPerson("GET", `/v1/organizations/${listing.orgId}/openproduct/profiles/${listing.id}`));
  },
};

/** Call a signed-in tool, or say why not. */
export async function callSignedInTool(name: string, args: Record<string, unknown>, ctx: SignedInContext): Promise<CallToolResult | null> {
  const tool = signedInTool(name);
  const handler = HANDLERS[name];
  if (!tool || !handler) return null;
  if (!toolAllowed(tool, ctx.agent.scopes)) {
    return refusal(`This connection was not given "${tool.scope}". The person can reconnect it with more in Settings → Connected agents.`);
  }
  return handler(args, ctx);
}
