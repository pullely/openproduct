// The agent surface (openproduct-worldclass AG1).
//
// ─── WHY IT IS HERE AND NOT ITS OWN WORKER ────────────────────────────────
//
// OX3 made this gateway openproduct's own front door, and the catalog API it
// serves is exactly what the MCP server is a client of. A second worker would
// need its own component, its own deploy, its own CORS, its own rate limits
// and its own request ids — five copies of machinery that exists here — in
// order to turn round and call the same core over the same internal paths.
//
// The design's rule (design.md, AG) is *"the MCP server is a client of
// `/v1/products` and `/v1/facets`, not a second query layer"*, and inside one
// worker the strongest available form of that is not an HTTP hop back to
// itself: it is calling core at the SAME internal path the public route
// proxies to, from the same constants, so the two cannot drift. `router.ts`
// exports those constants for exactly this reason.
//
// ─── ANONYMOUS, AND THAT IS A DECISION ────────────────────────────────────
//
// The platform's own MCP server requires a bearer because it exposes an
// account. This one exposes a catalog that is already public, already
// anonymous and already cached at the edge — so requiring a credential would
// make a public document private, and would hand every agent a reason to ask
// for one. There is nothing here a `curl` of `/v1/products` does not answer.
//
// ─── STATELESS ────────────────────────────────────────────────────────────
//
// No `sessionIdGenerator`, so no session is ever issued and a client-sent one
// is ignored; `enableJsonResponse` so each request gets a single
// `application/json` answer rather than an SSE stream. The same shape the
// platform's mcp-worker chose, for the same reason: a worker isolate is not
// a place to keep a conversation.

import {
  AGENT_SERVER_NAME,
  AGENT_TOOLS,
  agentQueryRefusal,
  filterCatalog,
  type AgentQuery,
  type CatalogCard,
} from "@openproduct/contracts";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

import type { Env } from "./env.js";
import { CATALOG_FACETS_TARGET, CATALOG_LIST_TARGET, catalogProductTarget } from "./targets.js";

/** The version this server reports. The CATALOG's version, not the worker's:
 *  what a client is talking to is the catalog API, and its compatibility is
 *  the only one an agent can act on. */
export const AGENT_SERVER_VERSION = "1";

/** A tool answer, in the one shape the protocol has for "here is some data".
 *  `structuredContent` is what a machine reads; the text is the same JSON, so
 *  a client that only renders text still shows the answer rather than nothing. */
function result(data: unknown): CallToolResult {
  const text = JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }], structuredContent: data as Record<string, unknown> };
}

/** A refusal an agent can act on: what was wrong, and what to call next. */
function refusal(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Read one document from core, through the same path the public route uses.
 *
 * `null` on anything that is not a clean 200 — and the caller turns that into
 * a refusal rather than an empty list, because "the catalog could not be read"
 * and "the catalog is empty" are different claims and an agent cannot tell
 * them apart from `[]`. That is the OD5 finding, applied to a machine.
 */
/** The most pages `list_products` will walk: fifty of the API's largest page
 *  is ten thousand listings, past which OS5 owns the answer. */
const CATALOG_PAGE_WALK_LIMIT = 50;

async function readCore<T>(env: Env, target: string): Promise<T | null> {
  if (!env.CORE) return null;
  try {
    const res = await env.CORE.fetch(new URL(target, "https://openproduct.internal").toString(), {
      method: "GET",
      headers: new Headers(),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: T };
    return body.data ?? null;
  } catch {
    return null;
  }
}

const UNREADABLE = "The catalog could not be read right now. This is not a statement about what is in it.";

async function callTool(env: Env, name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  if (name === "list_facets") {
    const facets = await readCore<unknown>(env, CATALOG_FACETS_TARGET);
    return facets === null ? refusal(UNREADABLE) : result(facets);
  }

  if (name === "get_product") {
    const slug = typeof args.slug === "string" ? args.slug : "";
    if (!/^[A-Za-z0-9-]{1,64}$/.test(slug)) return refusal("slug must be a listing slug.");
    const product = await readCore<unknown>(env, catalogProductTarget(slug));
    // A 404 and an unreachable core are the same `null` here, and the message
    // says both — because the catalog's own answer for "unknown, unpublished
    // and unreachable" is deliberately indistinguishable, and inventing a
    // distinction on this surface would leak the one the API refuses to.
    return product === null
      ? refusal(`No published listing "${slug}" is readable. Unknown, unpublished and unreachable answer the same way.`)
      : result(product);
  }

  if (name === "list_products") {
    const query = args as AgentQuery;
    const wrong = agentQueryRefusal(query);
    if (wrong !== null) return refusal(wrong);
    // OS1 — THE CATALOGUE IS PAGED, AND THIS TOOL IS A CLIENT (WC-9): it
    // follows `next` like anyone else would, page by page, until the API says
    // there is no more — bounded, because a tool that could be sent walking
    // for ever by a `next` that never ends is a tool with a hole in it.
    const all: CatalogCard[] = [];
    let target: string | null = CATALOG_LIST_TARGET;
    for (let pages = 0; target !== null && pages < CATALOG_PAGE_WALK_LIMIT; pages += 1) {
      const doc: { products?: CatalogCard[]; next?: string | null } | null = await readCore(env, target);
      if (doc === null) return refusal(UNREADABLE);
      all.push(...(doc.products ?? []));
      target = typeof doc.next === "string" && doc.next.length > 0 ? `${CATALOG_LIST_TARGET}?cursor=${encodeURIComponent(doc.next)}` : null;
    }
    const products = filterCatalog(all, query, new Date());
    // `total` is the length of the array being returned, and nothing else —
    // the same rule `collectionPageJsonLd` follows (WC-7). A count that could
    // disagree with its list is a count that eventually does.
    return result({ products, total: products.length });
  }

  return refusal(`Unknown tool "${name}".`);
}

/**
 * The MCP endpoint.
 *
 * A fresh `Server` per request, which is what stateless means: nothing
 * survives the isolate, so there is nothing for one caller's request to leave
 * behind for another's.
 */
export async function handleMcp(request: Request, env: Env): Promise<Response> {
  const server = new Server(
    { name: AGENT_SERVER_NAME, version: AGENT_SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: AGENT_TOOLS.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema as { type: "object" },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) =>
    callTool(env, req.params.name, (req.params.arguments ?? {}) as Record<string, unknown>),
  );

  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}
