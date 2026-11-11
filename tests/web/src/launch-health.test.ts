// The launch-health checklist on the listing page (PV1 carried, WC2 PP6).
//
// The rule is in the contract; what is pinned here is what the web layer
// owns: the component renders items it was handed and never a count, a
// dash for an unobserved row, the refused input said in the open, and a
// dispute route that lands on the page's own report control.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LAUNCH_HEALTH_DISPUTE } from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("a checklist, not a score", () => {
  it("renders the items it is handed and computes no number from them", () => {
    const src = code("[slug]/launch-health.tsx");
    expect(src).toMatch(/\{items\.map\(\(item\) =>/);
    // No count, no fraction, no percentage: the ways a checklist becomes a score.
    expect(src).not.toMatch(/items\.(length|filter|reduce)/);
    expect(src).not.toMatch(/of 5|\/ ?5|%/);
  });

  it("a dash for an unobserved or withdrawn row, never an unticked box", () => {
    const src = code("[slug]/launch-health.tsx");
    expect(src).toContain("{DASH}");
    expect(src).not.toMatch(/type="checkbox"|☐|\[ \]/);
  });

  it("the dispute route is the page's own report control, which a human reads", () => {
    const src = code("[slug]/launch-health.tsx");
    expect(src).toContain('href="#report"');
    expect(src).toContain("{LAUNCH_HEALTH_DISPUTE}");
    expect(LAUNCH_HEALTH_DISPUTE).toBe("Dispute an item");
    expect(code("ui/report-control.tsx")).toContain('<details id="report"');
  });

  it("the page feeds it the contract's items from the projection it already holds", () => {
    const page = code("[slug]/page.tsx");
    expect(page).toContain("<LaunchHealth items={launchHealth(profile, new Date(now))} now={now} />");
  });
});
