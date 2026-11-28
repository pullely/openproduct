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
  PUBLIC_MAINTAINER_KEYS,
  PUBLIC_PROFILE_KEYS,
  PUBLIC_ROLE_OPENING_KEYS,
  signedInTool,
  toolAllowed,
  type ResolvedAgentCredential,
} from "@openproduct/contracts";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** What the router hands the MCP server for one signed-in request. */
export interface SignedInContext {
  readonly agent: ResolvedAgentCredential;
  /** A request to the authenticated plane, as the agent's person. A creating
   *  call may carry an idempotency key: the same key again gets the first answer. */
  readonly asPerson: (method: string, path: string, body?: unknown, opts?: { idempotencyKey?: string }) => Promise<Response>;
  /** The website's origin, for addresses a person must open; empty when unset. */
  readonly siteOrigin: string;
  /** A GET of a public route. */
  readonly publicGet: (pathAndQuery: string) => Promise<Response>;
}

function result(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
}

/** A tool's own answer (rather than the value it was looking for). */
function isRefusal(value: unknown): value is CallToolResult {
  return typeof value === "object" && value !== null && "content" in value;
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
  visibility?: string;
  workspaceLinkedAt?: string | null;
}

function crewPath(listing: MyListing, rest = ""): string {
  return `/v1/organizations/${listing.orgId}/openproduct/profiles/${listing.id}${rest}`;
}

/** Copy only the named fields that were actually sent. */
function pick(args: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) if (args[key] !== undefined) out[key] = args[key];
  return out;
}

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{1,100}$/;

function idempotencyOf(args: Record<string, unknown>): { idempotencyKey?: string } | CallToolResult {
  const key = args.idempotencyKey;
  if (key === undefined) return {};
  if (typeof key !== "string" || !IDEMPOTENCY_KEY_RE.test(key)) {
    return refusal("idempotencyKey is 1 to 100 letters, digits, dots, colons, underscores or hyphens.");
  }
  return { idempotencyKey: key };
}

const UPDATE_FIELDS = [
  "tagline",
  "pitch",
  "installLine",
  "repoUrl",
  "liveUrl",
  "tryUrl",
  "links",
  "stack",
  "category",
  "hosting",
  "pricing",
] as const;

const STAGE_FIELDS = [
  "to",
  "repository",
  "firstMilestone",
  "stageUrl",
  "tryWhat",
  "productionUrl",
  "version",
  "liveSince",
  "access",
  "reason",
  "comment",
  "post",
] as const;

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
    if (isRefusal(listing)) return listing;
    return answer(await ctx.asPerson("GET", crewPath(listing)));
  },

  // ── MC3: listings and their words ──
  list_workspaces: async (_args, ctx) => {
    const listings = await myListings(ctx);
    if (!Array.isArray(listings)) return listings;
    const byOrg = new Map<string, { workspace: string; listings: string[]; linkedAt: string | null }>();
    for (const l of listings) {
      const entry = byOrg.get(l.orgId) ?? { workspace: l.orgId, listings: [], linkedAt: l.workspaceLinkedAt ?? null };
      entry.listings.push(l.slug);
      byOrg.set(l.orgId, entry);
    }
    return result({
      workspaces: [...byOrg.values()],
      linkAnother: {
        how: "A person links a workspace in a browser: open this address, choose Link a workspace, and pick it in Orunbase. Orunbase then hands back a listing_grant for create_listing.",
        open: ctx.siteOrigin ? `${ctx.siteOrigin}/me` : "/me",
      },
    });
  },
  create_listing: async (args, ctx) => {
    if (ctx.agent.listingIds !== null) {
      return refusal("This connection is limited to named listings, so it cannot create one. The person can reconnect it for all listings.");
    }
    const workspace = text(args, "workspace") ?? "";
    if (!/^org_[A-Za-z0-9_-]{1,64}$/.test(workspace)) return refusal("workspace must be a workspace id from list_workspaces.");
    if (!text(args, "grant")) {
      return refusal(
        `create_listing needs the workspace's listing_grant. Ask the person to link the workspace at ${ctx.siteOrigin || ""}/me (Link a workspace), then pass the grant Orunbase hands back.`,
      );
    }
    const keyed = idempotencyOf(args);
    if (isRefusal(keyed)) return keyed;
    const body = pick(args, ["grant", "slug", "tagline", "pitch", "repoUrl", "liveUrl", "stack"]);
    return answer(await ctx.asPerson("POST", `/v1/organizations/${workspace}/openproduct/profiles`, body, keyed));
  },
  update_listing: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    const body = pick(args, UPDATE_FIELDS);
    if (args.newSlug !== undefined) body.slug = args.newSlug;
    if (Object.keys(body).length === 0) return refusal("Send at least one field to change.");
    return answer(await ctx.asPerson("PATCH", crewPath(listing), body));
  },
  change_stage: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    return answer(await ctx.asPerson("PUT", crewPath(listing, "/stage"), pick(args, STAGE_FIELDS)));
  },
  get_publish_checklist: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    return result({
      slug: listing.slug,
      visibility: listing.visibility ?? null,
      becomesPublic: {
        listing: PUBLIC_PROFILE_KEYS,
        crewWhoAgreed: PUBLIC_MAINTAINER_KEYS,
        openRoles: PUBLIC_ROLE_OPENING_KEYS,
      },
      inPlainWords:
        "Publishing puts the listing's page on openproduct.live for anybody, unsigned-in, to read and search: its words, links, stack and stage, what openproduct observed of its repository, the people on its crew who agreed to be shown, and its open roles. Drafts, private threads and crew roles stay private.",
      next: "Show this to the person. If they agree, call publish_listing with acknowledged: true.",
    });
  },
  publish_listing: async (args, ctx) => {
    if (args.acknowledged !== true) {
      return refusal("Call get_publish_checklist, show the person what becomes public, then call this with acknowledged: true.");
    }
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    return answer(await ctx.asPerson("POST", crewPath(listing, "/publish"), {}));
  },
  unpublish_listing: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    return answer(await ctx.asPerson("DELETE", crewPath(listing, "/publish")));
  },
  get_listing_sync: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    return answer(await ctx.asPerson("GET", crewPath(listing, "/orunbase")));
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
