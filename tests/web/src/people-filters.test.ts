// The people index's filters (openproduct-worldclass-v2 PE3).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PEOPLE_FILTER_LABELS } from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const code = (file: string) =>
  readFileSync(resolve(APP_DIR, file), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("every filter is an address, and the count is the list's own", () => {
  const list = code("people/people-list.tsx");

  it("parses and prints its state with the contract, never its own query string", () => {
    expect(list).toContain("parsePeopleFilters(window.location.search)");
    expect(list).toContain("peopleFiltersQuery(merged)");
    expect(list).not.toMatch(/p\.set\("open"/);
  });

  it("filters with the contract and offers the four facts and a topic", () => {
    expect(list).toContain("filterPeople(people, state, topicOf, cardTitle)");
    for (const label of Object.values(PEOPLE_FILTER_LABELS)) expect(list).toContain(label === "Everyone" ? "PEOPLE_FILTER_LABELS.everyone" : "PEOPLE_FILTER_LABELS.");
    expect(list).toContain('aria-label="Filter by topic"');
  });

  it("computes the count from what is shown", () => {
    expect(list).toContain("peopleCountLine(visible.length, openCount, state)");
    // The page no longer prints a count of its own beside the list.
    const page = code("people/(index)/page.tsx");
    expect(page).not.toMatch(/contributors\.length\} \{contributors\.length === 1/);
    expect(page).toContain("topicOf={topicOf}");
  });
});
