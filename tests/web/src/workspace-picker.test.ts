// The workspace picker door (seam edge S13).
//
// What is pinned: the console address and its one parameter are the seam
// fixture's; the studio's doors all go through the one helper (the listings
// page, an unlinked listing's banner — opened on that listing's workspace —
// and the link page's empty state); and the dead per-workspace console
// address (`/orgs/{org}/openproduct`) and the "workspace console" copy are
// gone from the studio.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LINK_WORKSPACE_LABEL,
  WORKSPACE_PICKER_PATH,
  consoleWorkspacePickerUrl,
} from "@openproduct-web/app/studio/workspace-picker";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const FIXTURES = resolve(__dirname, "../../../seam-fixtures");
const code = (file: string) =>
  readFileSync(resolve(APP_DIR, file), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

const card = JSON.parse(readFileSync(resolve(FIXTURES, "webhook-contract.json"), "utf-8")) as {
  urlEdges: { listingPicker: { consoleLanding: string; params: string[]; returnsTo: string } };
};
const edge = card.urlEdges.listingPicker;

describe("the address is the seam's (S13)", () => {
  it("is the fixture's landing, with the fixture's one parameter", () => {
    expect(edge.consoleLanding).toBe(WORKSPACE_PICKER_PATH);
    expect(edge.params).toEqual(["workspace"]);
    expect(consoleWorkspacePickerUrl("https://app.orunbase.com")).toBe(
      "https://app.orunbase.com/start/openproduct/link",
    );
    expect(consoleWorkspacePickerUrl("https://app.orunbase.com/", "org_abc")).toBe(
      "https://app.orunbase.com/start/openproduct/link?workspace=org_abc",
    );
  });

  it("is relative when no console origin is configured — the single-host dev setup", () => {
    expect(consoleWorkspacePickerUrl("")).toBe("/start/openproduct/link");
  });

  it("hands back to the studio's link page", () => {
    expect(edge.returnsTo).toBe("/studio/link");
  });
});

describe("the studio's doors go through the one helper", () => {
  it("the listings page offers it, in the empty state and under the list", () => {
    const page = code("studio/page.tsx");
    expect(page).toContain("consoleWorkspacePickerUrl(consoleUrl)");
    expect(page).toContain("{LINK_WORKSPACE_LABEL}");
    expect(page).toContain('href="/submit"');
    expect(LINK_WORKSPACE_LABEL).toBe("Link a workspace");
  });

  it("an unlinked listing's banner opens it on that listing's own workspace", () => {
    expect(code("studio/[org]/[profile]/page.tsx")).toContain("consoleWorkspacePickerUrl(consoleUrl, org)");
  });

  it("the link page's empty state offers it", () => {
    expect(code("studio/link/page.tsx")).toContain("consoleWorkspacePickerUrl(consoleOrigin())");
  });

  it("no studio surface points at the retired per-workspace console page or 'the workspace console'", () => {
    for (const file of ["studio/page.tsx", "studio/[org]/[profile]/page.tsx", "studio/link/page.tsx"]) {
      const source = code(file);
      expect(`${file}: ${source.includes("/openproduct`")}`).toBe(`${file}: false`);
      expect(`${file}: ${/workspace console/i.test(source)}`).toBe(`${file}: false`);
    }
  });
});
