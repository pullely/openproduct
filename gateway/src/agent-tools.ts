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
  AUTHORED_PRODUCT_POST_KINDS,
  POST_BLOCK_CATALOGUE,
  AGENT_INLINE_MEDIA_MAX_BYTES,
  AGENT_UNTRUSTED_NOTE,
  AUTHORED_MEDIA_KINDS,
  MEDIA_ALT_MAX,
  MEDIA_MAX_BYTES,
  captureTarget,
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
  /** MC4 — bytes to the website's own media upload, as the person. */
  readonly uploadAsPerson: (path: string, query: Record<string, string>, bytes: Uint8Array, opts?: { idempotencyKey?: string }) => Promise<Response>;
  /** MC4 — a one-time upload address for one image. */
  readonly mintUploadTicket: (
    listing: { id: string; orgId: string },
    fields: { kind: string; alt: string; position: number; byteLength: number },
  ) => Promise<{ ok: true; uploadUrl: string; expiresAt: string } | { ok: false; message: string }>;
  /** MC4 — the network, for add_media_from_url. */
  readonly fetchImpl: typeof fetch;
  /** MC4 — spend one of this connection's writes before work that costs (a fetch). */
  readonly spendWrite: () => Promise<Response | null>;
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
const listingsMemo = new WeakMap<SignedInContext, Promise<MyListing[] | CallToolResult>>();

/** The person's listings, read once per MCP request however many tools ask. */
function myListings(ctx: SignedInContext): Promise<MyListing[] | CallToolResult> {
  let memo = listingsMemo.get(ctx);
  if (!memo) {
    memo = readMyListings(ctx);
    listingsMemo.set(ctx, memo);
  }
  return memo;
}

async function readMyListings(ctx: SignedInContext): Promise<MyListing[] | CallToolResult> {
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
    return answer(await ctx.asPerson("GET", crewPath(listing)), true);
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
    return answer(await ctx.asPerson("GET", crewPath(listing, "/orunbase")), true);
  },
};

// ── MC4: images ──

const MEDIA_ID_RE = /^[0-9a-fA-F-]{36}$/;

function mediaFieldsOf(args: Record<string, unknown>): { kind: string; alt: string; position: number } | CallToolResult {
  const kind = text(args, "kind") ?? "";
  if (!(AUTHORED_MEDIA_KINDS as readonly string[]).includes(kind)) return refusal(`kind must be one of: ${AUTHORED_MEDIA_KINDS.join(", ")}.`);
  const alt = (text(args, "alt") ?? "").trim();
  if (alt.length === 0 || alt.length > MEDIA_ALT_MAX) return refusal(`alt is required: what the image shows, 1 to ${MEDIA_ALT_MAX} characters.`);
  const position = typeof args.position === "number" && Number.isInteger(args.position) && args.position >= 0 ? args.position : 0;
  return { kind, alt, position };
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    const clean = value.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(clean)) return null;
    const binary = atob(clean.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** The most redirects add_media_from_url follows, each one checked again. */
const FETCH_REDIRECTS_MAX = 3;
const FETCH_TIMEOUT_MS = 10_000;

/**
 * A public image, fetched the way the screenshot sweep decides where it may
 * go (`captureTarget`): https only, no credentials, no port, no IP literal,
 * a public name. Every redirect is checked by the same rule, and the body is
 * read with a hard cap, because a Content-Length is a claim.
 */
async function fetchPublicImage(raw: unknown, fetchImpl: typeof fetch): Promise<Uint8Array | string> {
  let target = captureTarget(typeof raw === "string" ? raw : null);
  // ONE DEADLINE OVER EVERY HOP, not one per hop.
  const deadline = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  for (let hop = 0; hop <= FETCH_REDIRECTS_MAX; hop += 1) {
    if (!target.ok) return `That address cannot be fetched (${target.reason}). It must be a public https address with no port, credentials or IP address.`;
    let res: Response;
    try {
      res = await fetchImpl(target.url, { redirect: "manual", signal: deadline, headers: { accept: "image/png, image/jpeg, image/webp" } });
    } catch {
      return "That address could not be reached.";
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      target = captureTarget(next ? new URL(next, target.url).toString() : null);
      continue;
    }
    if (!res.ok || !res.body) return `That address answered ${res.status}.`;
    // An image or nothing: a page is refused before a byte of it is read.
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (type && !type.startsWith("image/") && !type.startsWith("application/octet-stream")) {
      await res.body.cancel();
      return "That address is not an image.";
    }
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > MEDIA_MAX_BYTES) return `That image is larger than ${MEDIA_MAX_BYTES} bytes.`;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MEDIA_MAX_BYTES) {
        await reader.cancel();
        return `That image is larger than ${MEDIA_MAX_BYTES} bytes.`;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }
  return "That address redirected too many times.";
}

const MEDIA_HANDLERS: Record<string, Handler> = {
  list_media: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    return answer(await ctx.asPerson("GET", crewPath(listing, "/media")), true);
  },
  request_media_upload: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    const fields = mediaFieldsOf(args);
    if (isRefusal(fields)) return fields;
    const byteLength = args.byteLength;
    if (typeof byteLength !== "number" || !Number.isInteger(byteLength) || byteLength < 1 || byteLength > MEDIA_MAX_BYTES) {
      return refusal(`byteLength must be the image's exact size in bytes, at most ${MEDIA_MAX_BYTES}.`);
    }
    const minted = await ctx.mintUploadTicket(listing, { ...fields, byteLength });
    if (!minted.ok) return refusal(minted.message);
    return result({
      uploadUrl: minted.uploadUrl,
      method: "PUT",
      headers: { "content-length": String(byteLength) },
      expiresAt: minted.expiresAt,
      note: "PUT the image's bytes to uploadUrl with exactly this Content-Length and no Authorization header. It works once.",
    });
  },
  upload_media: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    const fields = mediaFieldsOf(args);
    if (isRefusal(fields)) return fields;
    const keyed = idempotencyOf(args);
    if (isRefusal(keyed)) return keyed;
    const bytes = typeof args.dataBase64 === "string" ? decodeBase64(args.dataBase64) : null;
    if (!bytes || bytes.byteLength === 0) return refusal("dataBase64 must be the image's bytes in base64.");
    if (bytes.byteLength > AGENT_INLINE_MEDIA_MAX_BYTES) {
      return refusal(`Inline images are at most ${AGENT_INLINE_MEDIA_MAX_BYTES} bytes. Use request_media_upload for this one.`);
    }
    return answer(await ctx.uploadAsPerson(crewPath(listing, "/media"), { kind: fields.kind, alt: fields.alt, position: String(fields.position) }, bytes, keyed));
  },
  add_media_from_url: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    const fields = mediaFieldsOf(args);
    if (isRefusal(fields)) return fields;
    const keyed = idempotencyOf(args);
    if (isRefusal(keyed)) return keyed;
    // THE FETCH SPENDS A WRITE BEFORE IT HAPPENS, so a loop of failing fetches
    // is bounded like any other write (second review). Its safety from
    // private addresses is captureTarget's names-only rule plus the Workers
    // runtime, which cannot reach private networks.
    const spent = await ctx.spendWrite();
    if (spent) return answer(spent);
    const bytes = await fetchPublicImage(args.url, ctx.fetchImpl);
    if (typeof bytes === "string") return refusal(bytes);
    return answer(await ctx.uploadAsPerson(crewPath(listing, "/media"), { kind: fields.kind, alt: fields.alt, position: String(fields.position) }, bytes, keyed));
  },
  update_media: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    const id = text(args, "mediaId") ?? "";
    if (!MEDIA_ID_RE.test(id)) return refusal("mediaId must be an image id from list_media.");
    const alt = (text(args, "alt") ?? "").trim();
    if (alt.length === 0 || alt.length > MEDIA_ALT_MAX) return refusal(`alt is 1 to ${MEDIA_ALT_MAX} characters.`);
    return answer(await ctx.asPerson("PATCH", crewPath(listing, `/media/${id}`), { alt }));
  },
  reorder_gallery: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    if (!Array.isArray(args.gallery) || args.gallery.some((id) => typeof id !== "string" || !MEDIA_ID_RE.test(id))) {
      return refusal("gallery must be every gallery image id from list_media, in order.");
    }
    return answer(await ctx.asPerson("PUT", crewPath(listing, "/media"), { gallery: args.gallery }));
  },
  remove_media: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    const id = text(args, "mediaId") ?? "";
    if (!MEDIA_ID_RE.test(id)) return refusal("mediaId must be an image id from list_media.");
    return answer(await ctx.asPerson("DELETE", crewPath(listing, `/media/${id}`)));
  },
};

Object.assign(HANDLERS, MEDIA_HANDLERS);

// ── MC5: posts, milestones, launches ──

const POST_ID_RE = /^ppo_[0-9a-f]{32}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

function blocksOf(value: unknown): unknown[] | CallToolResult {
  if (!Array.isArray(value)) return refusal("blocks must be a list of {block, value}. See describe_post_kinds.");
  return value;
}

function idArg(args: Record<string, unknown>, key: string, re = ID_RE): string | CallToolResult {
  const v = text(args, key) ?? "";
  return re.test(v) ? v : refusal(`${key} must be an id from the listing's own list.`);
}

const POST_HANDLERS: Record<string, Handler> = {
  describe_post_kinds: async () =>
    result({
      kinds: AUTHORED_PRODUCT_POST_KINDS.map((kind) => ({ kind, blocks: POST_BLOCK_CATALOGUE[kind] })),
      note: "A post is a list of {block, value}, each block from its kind's list, each at most once.",
    }),
  list_posts: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    return answer(await ctx.asPerson("GET", crewPath(listing, "/product-posts")), true);
  },
  create_post: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    const kind = text(args, "kind") ?? "";
    if (!(AUTHORED_PRODUCT_POST_KINDS as readonly string[]).includes(kind)) return refusal(`kind must be one of: ${AUTHORED_PRODUCT_POST_KINDS.join(", ")}.`);
    const blocks = blocksOf(args.blocks);
    if (isRefusal(blocks)) return blocks;
    const keyed = idempotencyOf(args);
    if (isRefusal(keyed)) return keyed;
    return answer(await ctx.asPerson("POST", crewPath(listing, "/product-posts"), { kind, blocks }, keyed));
  },
  update_post: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    const id = idArg(args, "postId", POST_ID_RE);
    if (isRefusal(id)) return id;
    const blocks = blocksOf(args.blocks);
    if (isRefusal(blocks)) return blocks;
    return answer(await ctx.asPerson("PATCH", crewPath(listing, `/product-posts/${id}`), { blocks }));
  },
  publish_post: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    const id = idArg(args, "postId", POST_ID_RE);
    if (isRefusal(id)) return id;
    return answer(await ctx.asPerson("POST", crewPath(listing, `/product-posts/${id}/publish`), pick(args, ["blocks", "milestoneId", "roleOpeningId"])));
  },
  delete_post: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    const id = idArg(args, "postId", POST_ID_RE);
    if (isRefusal(id)) return id;
    return answer(await ctx.asPerson("DELETE", crewPath(listing, `/product-posts/${id}`)));
  },
  list_milestones: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    return answer(await ctx.asPerson("GET", crewPath(listing, "/milestones")), true);
  },
  create_milestone: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    if (!text(args, "title")) return refusal("title is required.");
    const keyed = idempotencyOf(args);
    if (isRefusal(keyed)) return keyed;
    return answer(await ctx.asPerson("POST", crewPath(listing, "/milestones"), pick(args, ["title", "summary", "code"]), keyed));
  },
  update_milestone: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    const id = idArg(args, "milestoneId");
    if (isRefusal(id)) return id;
    const body = pick(args, ["title", "summary", "code"]);
    if (Object.keys(body).length === 0) return refusal("Send a title, summary or code to change.");
    return answer(await ctx.asPerson("PATCH", crewPath(listing, `/milestones/${id}`), body));
  },
  reorder_milestones: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    if (!Array.isArray(args.order) || args.order.some((v) => typeof v !== "string" || !ID_RE.test(v))) {
      return refusal("order must be every milestone id, in order.");
    }
    return answer(await ctx.asPerson("PUT", crewPath(listing, "/milestones"), { order: args.order }));
  },
  ship_milestone: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    const id = idArg(args, "milestoneId");
    if (isRefusal(id)) return id;
    if (typeof args.shipped !== "boolean") return refusal("shipped must be true or false.");
    return answer(await ctx.asPerson(args.shipped ? "PUT" : "DELETE", crewPath(listing, `/milestones/${id}/shipped`), args.shipped ? {} : undefined));
  },
  delete_milestone: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    const id = idArg(args, "milestoneId");
    if (isRefusal(id)) return id;
    return answer(await ctx.asPerson("DELETE", crewPath(listing, `/milestones/${id}`)));
  },
  list_listing_launches: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    return answer(await ctx.asPerson("GET", crewPath(listing, "/launches")), true);
  },
  schedule_launch: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    const keyed = idempotencyOf(args);
    if (isRefusal(keyed)) return keyed;
    return answer(await ctx.asPerson("POST", crewPath(listing, "/launches"), pick(args, ["versionLabel", "scheduledFor"]), keyed));
  },
  reschedule_launch: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    const id = idArg(args, "launchId");
    if (isRefusal(id)) return id;
    return answer(await ctx.asPerson("PATCH", crewPath(listing, `/launches/${id}`), pick(args, ["versionLabel", "scheduledFor"])));
  },
  cancel_launch: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    const id = idArg(args, "launchId");
    if (isRefusal(id)) return id;
    return answer(await ctx.asPerson("DELETE", crewPath(listing, `/launches/${id}`)));
  },
  get_needs_you: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    return answer(await ctx.asPerson("GET", crewPath(listing, "/needs-you")), true);
  },
};

Object.assign(HANDLERS, POST_HANDLERS);

// ── MC6: seats, crew and the product's discussions ──

const SUBJECT_RE = /^usr_[0-9a-f]{32}$/;
const CREW_ROLES = ["lead", "maintainer", "member"];

/**
 * A thread is addressed by its id alone, which does not say which listing it
 * is on, so a connection limited to named listings could reach a thread of
 * another listing its person is on the crew of. Thread tools are therefore
 * refused to a limited connection (the restriction cannot be checked, so it
 * is not assumed).
 */
function threadToolAllowed(ctx: SignedInContext): CallToolResult | null {
  return ctx.agent.listingIds === null
    ? null
    : refusal("This connection is limited to named listings, and a thread does not say which listing it is on. The person can reconnect it for all listings.");
}

const CREW_HANDLERS: Record<string, Handler> = {
  open_role: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    if (!text(args, "title")) return refusal("title is required.");
    const keyed = idempotencyOf(args);
    if (isRefusal(keyed)) return keyed;
    return answer(await ctx.asPerson("POST", crewPath(listing, "/role-openings"), pick(args, ["title", "description", "commitment", "sortOrder"]), keyed));
  },
  update_role: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    const id = idArg(args, "openingId");
    if (isRefusal(id)) return id;
    return answer(await ctx.asPerson("PUT", crewPath(listing, `/role-openings/${id}`), pick(args, ["title", "description", "commitment", "status", "sortOrder"])));
  },
  close_role: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    const id = idArg(args, "openingId");
    if (isRefusal(id)) return id;
    return answer(await ctx.asPerson("DELETE", crewPath(listing, `/role-openings/${id}`)));
  },
  list_crew: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    return answer(await ctx.asPerson("GET", withQuery(crewPath(listing, "/crew"), { q: text(args, "q"), role: text(args, "role"), cursor: text(args, "cursor") })), true);
  },
  set_crew_roles: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    const changes = args.changes;
    if (
      !Array.isArray(changes) ||
      changes.length === 0 ||
      changes.some((c) => typeof c !== "object" || c === null || !SUBJECT_RE.test(String((c as Record<string, unknown>).subjectId)) || !CREW_ROLES.includes(String((c as Record<string, unknown>).role)))
    ) {
      return refusal("changes must be a list of {subjectId, role} with role lead, maintainer or member.");
    }
    return answer(await ctx.asPerson("PUT", crewPath(listing, "/crew"), { changes }));
  },
  set_public_crew: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    if (!Array.isArray(args.maintainers)) return refusal("maintainers must be a list of {subjectId, roleLabel}.");
    return answer(await ctx.asPerson("PUT", crewPath(listing, "/maintainers"), { maintainers: args.maintainers }));
  },
  name_on_roster: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    const subjectId = text(args, "subjectId") ?? "";
    if (!SUBJECT_RE.test(subjectId)) return refusal("subjectId must be a person's subject id.");
    return answer(await ctx.asPerson("POST", `/v1/openproduct/listings/${listing.slug}/people`, pick(args, ["subjectId", "roleLabel"])));
  },
  remove_from_roster: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    const subjectId = text(args, "subjectId") ?? "";
    if (!SUBJECT_RE.test(subjectId)) return refusal("subjectId must be a person's subject id.");
    return answer(await ctx.asPerson("DELETE", `/v1/openproduct/listings/${listing.slug}/people/${subjectId}`));
  },
  list_listing_threads: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    return answer(await ctx.asPerson("GET", crewPath(listing, "/threads")), true);
  },
  list_private_threads: async (args, ctx) => {
    const listing = await listingBySlug(ctx, args.slug);
    if (isRefusal(listing)) return listing;
    return answer(await ctx.asPerson("GET", withQuery("/v1/openproduct/threads/private", { slug: listing.slug })), true);
  },
  get_private_thread: async (args, ctx) => {
    const blocked = threadToolAllowed(ctx);
    if (blocked) return blocked;
    const id = idArg(args, "threadId");
    if (isRefusal(id)) return id;
    return answer(await ctx.asPerson("GET", `/v1/openproduct/threads/private/${id}`), true);
  },
  reply_private: async (args, ctx) => {
    const blocked = threadToolAllowed(ctx);
    if (blocked) return blocked;
    const id = idArg(args, "threadId");
    if (isRefusal(id)) return id;
    if (!text(args, "body")) return refusal("body is required.");
    const keyed = idempotencyOf(args);
    if (isRefusal(keyed)) return keyed;
    return answer(await ctx.asPerson("POST", `/v1/openproduct/threads/private/${id}/posts`, { body: args.body }, keyed));
  },
  resolve_thread: async (args, ctx) => {
    const blocked = threadToolAllowed(ctx);
    if (blocked) return blocked;
    const id = idArg(args, "threadId");
    if (isRefusal(id)) return id;
    if (typeof args.resolved !== "boolean") return refusal("resolved must be true or false.");
    return answer(await ctx.asPerson(args.resolved ? "PUT" : "DELETE", `/v1/openproduct/threads/${id}/resolved`, args.resolved ? {} : undefined));
  },
  moderate_thread: async (args, ctx) => {
    const blocked = threadToolAllowed(ctx);
    if (blocked) return blocked;
    const id = idArg(args, "threadId");
    if (isRefusal(id)) return id;
    const intent = text(args, "intent") ?? "";
    if (!["lock", "unlock", "answer"].includes(intent)) return refusal("intent must be lock, unlock or answer.");
    return answer(await ctx.asPerson("POST", `/v1/openproduct/threads/${id}`, pick(args, ["intent", "postId"])));
  },
};

Object.assign(HANDLERS, CREW_HANDLERS);

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
