// Everything is available as MCP, or says why not (openproduct-mcp MC2).
//
// The router's own source is the list of routes. Every internal route
// constant core serves must be in `AGENT_ROUTE_CATALOGUE`, each method it
// lists must be a registry tool, a stated exclusion, or a milestone still to
// come — and nothing may be catalogued that the router no longer has.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AGENT_EXCLUSIONS,
  AGENT_ROUTE_CATALOGUE,
  AGENT_SIGNED_IN_TOOLS,
  AGENT_TOOLS,
  catalogueUses,
} from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUTER = readFileSync(resolve(__dirname, "../../../core/src/router.ts"), "utf-8");

/** Every `const NAME = "/internal/openproduct/…"` or `/^\/internal\/openproduct\/…/` — public reads aside. */
function routeConstants(): string[] {
  const out: string[] = [];
  for (const m of ROUTER.matchAll(/^const ([A-Z0-9_]+)\s*=\s*\n?\s*(["/])(.*)$/gm)) {
    const value = m[3] ?? "";
    if (/internal(\\\/|\/)openproduct/.test(value)) out.push(m[1]!);
  }
  return out.sort();
}

describe("MC2 — every route is a tool, an exclusion, or a milestone still to come", () => {
  it("catalogues every internal route the router declares", () => {
    const missing = routeConstants().filter((name) => !(name in AGENT_ROUTE_CATALOGUE));
    expect(missing).toEqual([]);
  });

  it("catalogues nothing the router no longer has", () => {
    const known = new Set(routeConstants());
    expect(Object.keys(AGENT_ROUTE_CATALOGUE).filter((name) => !known.has(name))).toEqual([]);
  });

  it("names only tools the registry has, and only exclusions with a reason", () => {
    const tools = new Set([...AGENT_TOOLS, ...AGENT_SIGNED_IN_TOOLS].map((t) => t.name));
    for (const { route, method, use } of catalogueUses()) {
      if ("tool" in use) expect([route, method, tools.has(use.tool)]).toEqual([route, method, true]);
      if ("excluded" in use) expect([route, method, use.excluded in AGENT_EXCLUSIONS]).toEqual([route, method, true]);
    }
  });

  it("gives every route at least one method", () => {
    for (const [route, entry] of Object.entries(AGENT_ROUTE_CATALOGUE)) expect([route, Object.keys(entry).length > 0]).toEqual([route, true]);
  });

  it("says plainly how much is still to come", () => {
    const pending = catalogueUses().filter(({ use }) => "notYet" in use);
    // The number only ever goes down; MC7 takes it to zero and MC8 deletes it.
    expect(pending.length).toBeLessThanOrEqual(32);
  });
});
