// CV3 — mentions, in the web layer (openproduct-worldclass).

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { RENDER_NODES, handlePath, parseBody, resolveMentions } from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const BODY = "ui/post-body.tsx";

describe("a mention is a link only when somebody is there (OPC-5)", () => {
  it("branches on what the projection said, and re-derives nothing", () => {
    // The decision was made in core from a read of the namespace. A page that
    // guessed would be the second place the rule lives.
    const src = code(BODY);
    expect(src).toContain("node.claimed ?");
    expect(src).toContain("handlePath(node.handle)");
    expect(src).not.toMatch(/mention[\s\S]{0,200}(fetch|includes\()/);
  });

  it("renders an unclaimed one as the text it was", () => {
    expect(code(BODY)).toContain("<>@{node.handle}</>");
  });

  it("uses the estate's own navigation, and no `rel`", () => {
    // This link is ours — `/@handle` on this site — not a stranger's URL, so
    // it gets `AppLink` and none of the `rel` an external link carries.
    const src = code(BODY);
    const arm = src.slice(src.indexOf('case "mention"'), src.indexOf('case "paragraph"'));
    expect(arm).toContain("<AppLink");
    expect(arm).not.toContain("LINK_REL");
    expect(arm).not.toContain("target=");
  });

  it("keeps the switch exhaustive", () => {
    // The renderer's own promise: adding a node kind to the contract is a
    // compile error here until it is drawn.
    for (const kind of RENDER_NODES) {
      expect([kind, code(BODY).includes(`case "${kind}"`)]).toEqual([kind, true]);
    }
  });

  it("addresses a handle the same way the rest of the estate does", () => {
    expect(handlePath("ada")).toBe("/@ada");
  });
});

describe("the tree the page is handed", () => {
  it("carries a claimed mention and an unclaimed one differently", () => {
    const nodes = resolveMentions(parseBody("@ada and @nobody"), new Set(["ada"]));
    const found = JSON.stringify(nodes);
    expect(found).toContain('"handle":"ada","claimed":true');
    expect(found).toContain('"handle":"nobody","claimed":false');
  });

  it("carries no href for either", () => {
    // The destination is not in a stranger's text and never was.
    const nodes = resolveMentions(parseBody("@ada"), new Set(["ada"]));
    expect(JSON.stringify(nodes)).not.toContain("href");
  });
});
