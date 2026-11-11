// The act, named where its absence shows (openproduct-worldclass-v2 CF5).
//
// W·05: three empty states described the sweep ("not counted yet") when what
// the reader saw was the absence of a maintainer's act. Each now says one
// sentence — the contract's — and links one address. And the studio's
// checklist ends with that act, so the maker learns there is a button.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FEED_HOW_HREF, LAUNCH_HOW_HREF, PUBLISH_STEP_LABEL, publishStepHref } from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const EMPTY_STATES = [
  ["the board", "launches/board.tsx"],
  ["a person's launched tab", "people/[handle]/maker-rows.tsx"],
] as const;

describe("the three empty states name the act and link it", () => {
  it.each(EMPTY_STATES)("%s says the contract's sentence, from the contract", (_name, file) => {
    const src = code(file);
    // The empty states say the one sentence and stop; the "how launching
    // works" footnote left with the rest of the site's explainers.
    expect(src).not.toContain("LAUNCH_ACT_NOTE");
    expect(src).not.toContain("LAUNCH_HOW_HREF");
    // No page writes its own version of the sentence.
    expect(src).not.toMatch(/maintainer says so/);
  });

  it("the board keeps its reasoning behind VC0's disclosure rather than losing it", () => {
    const board = code("launches/board.tsx");
    expect(board).toContain("<EmptyState");
    expect(board).toContain("says={BOARD_EMPTY_NOTE}");
  });

  it("the person page names the act only under the launched tab", () => {
    // The upvoted and commented tabs are not about launching; a sentence
    // about launching under "0 upvotes given" would be an instruction to
    // somebody who did not ask for one.
    expect(code("people/[handle]/maker-rows.tsx")).toContain('tab === "launched" ?');
  });

  it("HB1's Today links the same address", () => {
    expect(FEED_HOW_HREF).toBe(LAUNCH_HOW_HREF);
  });
});

describe("the studio's checklist ends with Publish it (OB6)", () => {
  const PANEL = "studio/[org]/[profile]/completeness-panel.tsx";

  it("renders the row in both states, after the list", () => {
    // OB6 — a build is published, not launched: the last row is the
    // overview's publish panel. The scheduler keeps its address.
    const panel = code(PANEL);
    expect(PUBLISH_STEP_LABEL).toBe("Publish it");
    expect(panel).toContain("PUBLISH_STEP_LABEL");
    expect(panel).not.toContain("LAUNCH_STEP_LABEL");
    expect(panel).toContain("publishStepHref(org, profileId)");
    expect(publishStepHref("acme", "opp_1")).toBe("/studio/acme/opp_1#publish");
    // After the list and outside the empty/missing branch, so a fully
    // filled-in listing still ends with the act.
    const row = panel.indexOf("publishStepHref(org, profileId)");
    const branch = panel.indexOf("meter.missing.length === 0 ?");
    const branchEnd = panel.indexOf(")}", branch);
    expect(row).toBeGreaterThan(branchEnd);
  });

  it("is a link to the act, never a button that fires", () => {
    // The checklist links the overview's publish panel, where the act and its
    // confirmation live; nothing in this panel posts anything.
    const panel = code(PANEL);
    expect(panel).not.toMatch(/<form|<button/);
    expect(panel).toContain("<AppLink");
  });
});
