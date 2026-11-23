// The workspace view door (openproduct-reader OPR5, seam edge S12).
//
// What is pinned: the two addresses and the query the seam fixture names —
// the door on this origin, the console's landing — the one decision the
// listing makes (an ink button on `workspaceRef` alone, to the door on this
// origin and never spelling the console's address), and, by source, that the
// door is a redirect for every visitor: no session read, no page drawn
// (openproduct-left-rail LR-9).

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  WORKSPACE_VIEW_FROM,
  WORKSPACE_VIEW_LABEL,
  consoleWorkspaceViewUrl,
  workspaceDoorPath,
} from "@openproduct-web/app/[slug]/workspace-view";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const FIXTURES = resolve(__dirname, "../../../seam-fixtures");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

const card = JSON.parse(readFileSync(resolve(FIXTURES, "webhook-contract.json"), "utf-8")) as {
  urlEdges: { workspaceView: { productConsentPath: string; consoleLandingPath: string; query: string } };
};
const edge = card.urlEdges.workspaceView;

describe("the addresses are the seam's (S12)", () => {
  it("the door's path is the fixture's, with the slug encoded", () => {
    expect(edge.productConsentPath).toBe("/{slug}/workspace");
    expect(workspaceDoorPath("acme-thing")).toBe("/acme-thing/workspace");
    expect(workspaceDoorPath("a b/c")).toBe("/a%20b%2Fc/workspace");
  });

  it("the console landing is the fixture's, carrying the ref and the provenance", () => {
    expect(edge.consoleLandingPath).toBe("/view/{workspaceRef}");
    expect(edge.query).toBe(`from=${WORKSPACE_VIEW_FROM}`);
    const ref = "org_0123456789abcdef0123456789abcdef";
    expect(consoleWorkspaceViewUrl("https://app.orunbase.com", ref)).toBe(
      `https://app.orunbase.com/view/${ref}?from=openproduct`,
    );
    // A trailing slash on the origin is not a double slash in the URL.
    expect(consoleWorkspaceViewUrl("https://app.orunbase.com/", ref)).toBe(
      `https://app.orunbase.com/view/${ref}?from=openproduct`,
    );
  });

  it("is relative when no console origin is configured — the single-host dev setup", () => {
    expect(consoleWorkspaceViewUrl("", "org_x")).toBe("/view/org_x?from=openproduct");
  });
});

describe("the listing renders the door on workspaceRef alone, to this origin", () => {
  // openproduct-left-rail LR-9: the door is the header's second ink button
  // (`WorkspaceDoor`), no longer a tile among the links.
  const page = code("[slug]/where-it-runs-strip.tsx");
  const door = page.slice(page.indexOf("export function WorkspaceDoor("));

  it("one button, gated on the ref, pointing at this origin", () => {
    expect(door).toContain("if (!profile.workspaceRef) return null;");
    expect(door).toContain("<a href={workspaceDoorPath(profile.slug)}");
    expect(code("[slug]/product-page.tsx")).not.toContain("workspaceDoorPath(");
    // The cached page never spells the console's address: it stays one
    // document with no actor, and the door does the sending.
    expect(page).not.toContain("consoleWorkspaceViewUrl(");
  });

  it("says what the door is, on the pill Open it wears", () => {
    expect(WORKSPACE_VIEW_LABEL).toBe("Open on Orunbase");
    expect(door).toMatch(/data-workspace-door className=\{BTN_INK\}>\s*\{WORKSPACE_VIEW_LABEL\}/);
    // The address answers with a redirect off this site, so the browser
    // follows it: a plain anchor, never the client router.
    expect(door).not.toContain("<AppLink");
  });
});

describe("the door", () => {
  const page = code("[slug]/workspace/page.tsx");

  it("is a redirect to the console's landing, for every visitor", () => {
    expect(page).toContain("redirect(consoleWorkspaceViewUrl(consoleOrigin(), profile.workspaceRef));");
    expect(page).toContain('export const dynamic = "force-dynamic";');
    // Signed in to this site or not: no session is read and no sign-in of
    // this site stands in the way.
    expect(page).not.toContain("readSession");
    expect(page).not.toContain("/signin");
    // And nothing is drawn — no consent page, no second button.
    expect(page).not.toMatch(/<main|<a |Continue to Orunbase/);
  });

  it("404s a listing with no door, exactly as the listing renders no button", () => {
    expect(page).toContain("if (!profile || !profile.workspaceRef) notFound();");
    expect(page.indexOf("notFound();")).toBeLessThan(page.indexOf("redirect("));
  });

  it("speaks to nothing but the listing read", () => {
    expect(page).not.toMatch(/fetch\(|platformApiBase|gatewayBase/);
    expect(page.match(/await fetch[A-Z]\w*\(/g)).toEqual(["await fetchListing("]);
  });
});
