// The agent surface, driven as a client would (openproduct-worldclass AG1).
//
// THE PROTOCOL IS ASSERTED OVER THE WIRE, not against the handler's internals:
// every case below builds a JSON-RPC request, posts it at `route()`, and reads
// what comes back. That is the only way to catch the class of defect an MCP
// server actually has — a tool that exists in the registry and is not in
// `tools/list`, a result shaped so a client renders nothing, an error that
// arrives as a 200 with a body nobody parses.
//
// WC-9 is asserted on a REAL ANSWER: the keys a `list_products` result carries
// are compared to the key set the catalog API pins. A tool that started
// reshaping cards fails here even if somebody updated a list to match.

import {
  AGENT_TOOLS,
  CATALOG_CARD_KEYS,
  authored,
  observed,
} from "@openproduct/contracts";
import { route } from "@openproduct-gateway/router";
import type { Env } from "@openproduct-gateway/env";
import {
  CATALOG_FACETS_TARGET,
  CATALOG_LIST_TARGET,
} from "@openproduct-gateway/targets";

const AT = "2026-09-01T00:00:00.000Z";

function card(slug: string, over: Partial<{ category: string; licence: string; openRoles: number; stack: string[] }> = {}) {
  return {
    slug,
    tagline: authored("A product", "maintainer"),
    stack: authored(over.stack ?? [], "maintainer"),
    stackCanonical: authored(over.stack ?? [], "maintainer"),
    category: authored(over.category ?? null, "maintainer"),
    hosting: authored(null, "maintainer"),
    pricing: authored(null, "maintainer"),
    // PV0 — `declared_repo`: a public API read from a URL a maintainer typed,
    // with no App. And the three signals that ride with it.
    licence: observed(over.licence ?? null, "declared_repo", AT),
    language: observed(null, "declared_repo", AT),
    lastCommitAt: observed(null, "declared_repo", AT),
    openIssues: observed(null, "declared_repo", AT),
    openRoles: authored(over.openRoles ?? 0, "maintainer"),
    openingCommitments: authored([], "maintainer"),
    hasLiveUrl: authored(false, "maintainer"),
    indexable: observed(true, "linked_repo", AT),
    // MD0 — the media plane on the wire. Empty on every listing until MD1
    // (gated on WC-C) gives a maker somewhere to put a picture; the key is
    // here regardless, because an MCP client parses the same key set the API
    // pins and a key that arrived later would make it branch on presence.
    media: [],
    publishedAt: AT,
    metrics: {},
  };
}

const CATALOG = [
  card("alpha", { category: "dev-tools", licence: "MIT", openRoles: 2, stack: ["rust"] }),
  card("beta", { category: "dev-tools", licence: "AGPL-3.0", openRoles: 1 }),
  card("gamma", { licence: "MIT" }),
];

/** Core, answering the three internal reads the public routes proxy to. */
function coreStub(seen: string[] = []): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      seen.push(url.pathname);
      if (url.pathname === CATALOG_LIST_TARGET) {
        // OS1 — the catalogue is paged. Without a cursor: the first two
        // cards and a `next`; with the cursor: the third and `null`.
        const cursor = url.searchParams.get("cursor");
        if (cursor === null) {
          return new Response(JSON.stringify({ data: { products: CATALOG.slice(0, 2), next: "page-two", total: CATALOG.length } }), { status: 200 });
        }
        if (cursor === "page-two") {
          return new Response(JSON.stringify({ data: { products: CATALOG.slice(2), next: null, total: CATALOG.length } }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: { code: "validation_failed" } }), { status: 422 });
      }
      if (url.pathname === CATALOG_FACETS_TARGET) {
        return new Response(JSON.stringify({ data: { facets: [{ id: "category" }] } }), { status: 200 });
      }
      if (url.pathname === `${CATALOG_LIST_TARGET}/alpha`) {
        return new Response(JSON.stringify({ data: { product: card("alpha") } }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { code: "not_found" } }), { status: 404 });
    },
  } as unknown as Fetcher;
}

function envWith(core: Fetcher | undefined): Env {
  return { CORE: core, ENVIRONMENT: "test", PLATFORM_API_URL: "https://platform.test" } as Env;
}

const MCP = "https://gw.test/mcp";
const PROTOCOL = "2025-06-18";

let id = 0;
async function rpc(
  method: string,
  params: Record<string, unknown> | undefined,
  env: Env,
): Promise<{ status: number; body: Record<string, unknown> }> {
  id += 1;
  const res = await route(
    new Request(MCP, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // The transport requires a client to say it can take JSON back.
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }),
    }),
    env,
  );
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

const INITIALIZE = {
  protocolVersion: PROTOCOL,
  capabilities: {},
  clientInfo: { name: "test", version: "0" },
};

describe("it speaks the protocol", () => {
  it("initializes, and names itself", async () => {
    const { status, body } = await rpc("initialize", INITIALIZE, envWith(coreStub()));
    expect(status).toBe(200);
    const result = body.result as Record<string, unknown>;
    expect((result.serverInfo as { name: string }).name).toBe("openproduct");
    expect(result.capabilities).toHaveProperty("tools");
  });

  it("lists exactly the tools the contract declares", async () => {
    // The registry and the advertisement are one list, so a tool cannot exist
    // and be unreachable — which is the commonest way an MCP server ships
    // something nobody can call.
    const { body } = await rpc("tools/list", {}, envWith(coreStub()));
    const tools = (body.result as { tools: Array<{ name: string; inputSchema: unknown }> }).tools;
    expect(tools.map((t) => t.name)).toEqual(AGENT_TOOLS.map((t) => t.name));
    for (const tool of tools) {
      expect([tool.name, (tool.inputSchema as { type: string }).type]).toEqual([tool.name, "object"]);
    }
  });

  it("answers an unknown method with -32601 rather than a 500", async () => {
    const { status, body } = await rpc("nope/at/all", {}, envWith(coreStub()));
    expect(status).toBe(200);
    expect((body.error as { code: number }).code).toBe(-32601);
  });

  it("refuses every method but POST, and says which one it wants", async () => {
    // A client opening the SSE stream a STATEFUL server would offer must learn
    // "this one does not stream", not "no server here".
    for (const method of ["GET", "DELETE", "PUT"]) {
      const res = await route(new Request(MCP, { method }), envWith(coreStub()));
      expect([method, res.status]).toEqual([method, 405]);
      expect([method, res.headers.get("allow")]).toEqual([method, "POST"]);
    }
  });

  it("issues no session, because it keeps none", async () => {
    const res = await route(
      new Request(MCP, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 99, method: "initialize", params: INITIALIZE }),
      }),
      envWith(coreStub()),
    );
    expect(res.headers.get("mcp-session-id")).toBeNull();
  });
});

describe("WC-9 — the tool returns the document the API returns", () => {
  async function call(name: string, args: Record<string, unknown>, env = envWith(coreStub())) {
    const { body } = await rpc("tools/call", { name, arguments: args }, env);
    return body.result as { content: Array<{ type: string; text: string }>; structuredContent?: Record<string, unknown>; isError?: boolean };
  }

  it("hands back cards carrying EXACTLY the API's key set", async () => {
    const result = await call("list_products", {});
    const products = (result.structuredContent as { products: Array<Record<string, unknown>> }).products;
    expect(products.length).toBeGreaterThan(0);
    for (const product of products) {
      expect([product.slug, Object.keys(product).sort()]).toEqual([
        product.slug,
        [...CATALOG_CARD_KEYS].sort(),
      ]);
    }
  });

  it("keeps the provenance on every field", async () => {
    const result = await call("list_products", { limit: 1 });
    const [first] = (result.structuredContent as { products: Array<Record<string, unknown>> }).products;
    expect(first!.licence).toEqual({
      value: "MIT",
      // PV0 — `declared_repo`, not `linked_repo`. The read has no App.
      provenance: { class: "observed", source: "declared_repo", observedAt: AT },
    });
  });

  it("reads core at the SAME path the public route proxies to", async () => {
    // The whole of "a client, not a second query layer": one constant, two
    // callers, and a test that would fail if either grew its own.
    const seen: string[] = [];
    await call("list_products", {}, envWith(coreStub(seen)));
    // OS1 — a client follows `next`: two pages, two reads of the one target.
    expect(seen).toEqual([CATALOG_LIST_TARGET, CATALOG_LIST_TARGET]);

    const viaPublicRoute: string[] = [];
    await route(new Request("https://gw.test/v1/products"), envWith(coreStub(viaPublicRoute)));
    expect(viaPublicRoute).toEqual([CATALOG_LIST_TARGET]);
  });

  it("counts what it returns, and nothing else", async () => {
    const result = await call("list_products", { limit: 2 });
    const doc = result.structuredContent as { products: unknown[]; total: number };
    expect(doc.total).toBe(doc.products.length);
    expect(doc.total).toBe(2);
  });

  it("renders the same answer as text, so a client that shows only text shows it", async () => {
    const result = await call("list_products", { limit: 1 });
    expect(result.content[0]!.type).toBe("text");
    expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
  });
});

describe("the query this audience actually has", () => {
  async function call(name: string, args: Record<string, unknown>) {
    const { body } = await rpc("tools/call", { name, arguments: args }, envWith(coreStub()));
    return body.result as { structuredContent?: Record<string, unknown>; isError?: boolean; content: Array<{ text: string }> };
  }

  it("narrows by category, licence class and open roles at once", async () => {
    // `dev-tools`, not `developer-tools` — the vocabulary's own spelling. The
    // first draft of this test used the longer one and the refusal below
    // caught it, which is the guard doing exactly what it is for: an agent
    // that guessed the same way gets told, rather than getting an empty list
    // it would read as "nothing is listed".
    const result = await call("list_products", {
      category: "dev-tools",
      permissiveLicence: true,
      openRoles: true,
    });
    const products = (result.structuredContent as { products: Array<{ slug: string }> }).products;
    expect(products.map((p) => p.slug)).toEqual(["alpha"]);
  });

  it("refuses a value the vocabulary does not have, and points at list_facets", async () => {
    // An empty list would tell an agent that nothing is listed, which is false
    // and which it cannot tell apart from the truth.
    const result = await call("list_products", { category: "observabillity" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("list_facets");
  });

  it("answers one listing by slug", async () => {
    const result = await call("get_product", { slug: "alpha" });
    expect((result.structuredContent as { product: { slug: string } }).product.slug).toBe("alpha");
  });

  it("answers unknown, unpublished and unreachable the same way", async () => {
    // The catalog's own refusal is deliberately indistinguishable, and
    // inventing a distinction on this surface would leak the one the API
    // refuses to.
    const result = await call("get_product", { slug: "nope" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("answer the same way");
  });

  it("refuses a slug that could not be one", async () => {
    const result = await call("get_product", { slug: "../../etc" });
    expect(result.isError).toBe(true);
  });

  it("hands back the facet vocabulary unchanged", async () => {
    const result = await call("list_facets", {});
    expect(result.structuredContent).toEqual({ facets: [{ id: "category" }] });
  });
});

describe("an unreadable catalog is not an empty one", () => {
  it("says so, rather than answering with a list of nothing", async () => {
    // The OD5 finding applied to a machine: an agent has less recourse than a
    // reader, not more, and `[]` is indistinguishable from a quiet catalog.
    const broken = {
      fetch: async () => new Response("nope", { status: 502 }),
    } as unknown as Fetcher;
    const { body } = await rpc(
      "tools/call",
      { name: "list_products", arguments: {} },
      envWith(broken),
    );
    const result = body.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not a statement about what is in it");
  });

  it("answers 503 when there is no core binding at all", async () => {
    const res = await route(
      new Request(MCP, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: INITIALIZE }),
      }),
      envWith(undefined),
    );
    expect(res.status).toBe(503);
  });
});

describe("it is anonymous, and that is the decision", () => {
  it("serves a request carrying no credential", async () => {
    const { status } = await rpc("tools/list", {}, envWith(coreStub()));
    expect(status).toBe(200);
  });

  it("serves a request carrying one exactly the same way", async () => {
    // The catalog is public. A bearer changes nothing here, and a surface that
    // behaved differently for one would have started keeping a secret.
    const withBearer = await route(
      new Request(MCP, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: "Bearer whatever",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list", params: {} }),
      }),
      envWith(coreStub()),
    );
    expect(withBearer.status).toBe(200);
    const body = (await withBearer.json()) as { result: { tools: unknown[] } };
    expect(body.result.tools).toHaveLength(AGENT_TOOLS.length);
  });
});
