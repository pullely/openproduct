// The workspace view door (openproduct-reader OPR5, seam edge S12).
//
// What is pinned: the two addresses and the query the seam fixture names —
// the consent page on this origin, the console's landing — the one decision
// the listing makes (an anchor on `workspaceRef` alone, to the consent page
// and never straight to the console), and, by source, that the consent page
// reads the session the way `/me` does and sends nothing anywhere.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  WORKSPACE_VIEW_FROM,
  WORKSPACE_VIEW_LABEL,
  consoleWorkspaceViewUrl,
  workspaceConsentPath,
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
  it("the consent path is the fixture's, with the slug encoded", () => {
    expect(edge.productConsentPath).toBe("/{slug}/workspace");
    expect(workspaceConsentPath("acme-thing")).toBe("/acme-thing/workspace");
    expect(workspaceConsentPath("a b/c")).toBe("/a%20b%2Fc/workspace");
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

describe("the listing renders the door on workspaceRef alone, to the consent page", () => {
  const page = code("[slug]/page.tsx");

  it("one anchor, gated on the ref, pointing at this origin", () => {
    expect(page).toContain("profile.workspaceRef ? (");
    expect(page).toContain("href={workspaceConsentPath(profile.slug)}");
    expect(page).toContain("{WORKSPACE_VIEW_LABEL}");
    // Never straight to the console from the anonymous page: the consent
    // sentence comes first, and the page stays one document with no actor.
    expect(page).not.toContain("consoleWorkspaceViewUrl(");
  });

  it("says what the door is, as the value of the board's Workspace row", () => {
    // openproduct-redesign OPR1 — the door moved from a pill in the header to
    // the In the open card's `Workspace` row, whose value is these words.
    expect(WORKSPACE_VIEW_LABEL).toBe("Open on Orunbase");
    expect(page).toMatch(
      /<span className="text-muted-foreground">Workspace<\/span>\s*<AppLink\s+href=\{workspaceConsentPath\(profile\.slug\)\}/,
    );
  });
});

describe("the consent page", () => {
  const page = code("[slug]/workspace/page.tsx");

  it("reads the session like /me and bounces signed-out to sign-in with itself as the return", () => {
    expect(page).toContain("const session = await readSession();");
    expect(page).toContain("if (!session) redirect(`/signin?return_to=${encodeURIComponent(workspaceConsentPath(slug))}`);");
    expect(page).toContain('export const dynamic = "force-dynamic";');
  });

  it("404s a listing with no door, exactly as the listing renders no anchor", () => {
    expect(page).toContain("if (!profile || !profile.workspaceRef) notFound();");
  });

  it("hands over with a plain anchor to the console's landing, and speaks to nothing else", () => {
    expect(page).toContain("consoleWorkspaceViewUrl(consoleOrigin(), profile.workspaceRef)");
    expect(page).toContain("<a href={href}");
    expect(page).not.toMatch(/fetch\(|platformApiBase|gatewayBase/);
    // Only the listing read — the same anonymous, cached read the product
    // page makes — reaches the network from here.
    expect(page.match(/await fetch[A-Z]\w*\(/g)).toEqual(["await fetchListing("]);
  });
});
