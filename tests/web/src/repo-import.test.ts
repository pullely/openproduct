// IN2 — repo import, in the web layer (openproduct-worldclass).
//
// The done-when is two clauses: importing fills four fields with their
// provenance shown, and editing one flips its type. The second is the whole
// point, and it only works because the observation and the authored value are
// stored in different columns — so what is pinned here is that the form never
// blurs them.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  IMPORTED_FIELDS,
  OBSERVED_ONLY_FIELDS,
  PROVENANCE_LABEL,
} from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const LISTING = "studio/[org]/[profile]";
const DETAILS = `${LISTING}/details/page.tsx`;
const TOPICS = `${LISTING}/topics/page.tsx`;
const PANEL = `${LISTING}/import-panel.tsx`;

describe("the four fields, with where each came from", () => {
  it("shows all four", () => {
    const src = code(DETAILS);
    for (const field of IMPORTED_FIELDS) {
      if (field === "stack") {
        expect(src).toContain("importedStack(profile.stack, profile.repoTopics)");
        continue;
      }
      expect([field, src.includes(`importedValue("${field}"`)]).toEqual([field, true]);
    }
  });

  it("names the class in words, not in a colour", () => {
    // A green outline and a grey one are a legend somebody has to be taught.
    // "from the repository" and "yours" are the sentence itself.
    expect(code(PANEL)).toContain("PROVENANCE_LABEL[value.provenance]");
    expect(PROVENANCE_LABEL.observed).toBe("from the repository");
    expect(PROVENANCE_LABEL.authored).toBe("yours");
  });

  it("carries the longer explanation where a reader can reach it", () => {
    expect(code(PANEL)).toContain("title={PROVENANCE_NOTE[value.provenance]}");
  });

  it("offers no field for the licence", () => {
    // OPC-7 — a licence is observed, and a box to type one into would be
    // this product inviting a claim it does not make on anybody's behalf.
    expect(OBSERVED_ONLY_FIELDS).toEqual(["licence"]);
    expect(code(PANEL)).toContain("OBSERVED_ONLY_FIELDS.includes(value.field)");
    expect(code(DETAILS)).not.toMatch(/name="licence"/);
    expect(code(TOPICS)).not.toMatch(/name="licence"/);
  });

  it("renders a dash where neither side has anything", () => {
    // OPC-C, again: not an empty line and not a zero.
    expect(code(PANEL)).toContain("value.value ??");
    expect(read(PANEL)).toContain("—");
  });
});

describe("editing flips the type, because the two are never merged", () => {
  it("fills a gap and never overwrites", () => {
    // `authored ?? observed`. The maintainer's sentence always wins; the
    // repository's only appears where there was nothing.
    expect(code(DETAILS)).toContain("defaultValue={imported[1]!.value ?? \"\"}");
    expect(code(TOPICS)).toContain('defaultValue={stack.value ?? ""}');
  });

  it("saves into the authored field, which is what makes it authored", () => {
    // There is no "use this" button, deliberately: adopting an observation
    // is editing the field, so there is ONE way a value becomes authored.
    expect(code(DETAILS)).toContain('name="tagline"');
    expect(code(TOPICS)).toContain('name="stack"');
    expect(code(PANEL)).not.toContain("<form");
    expect(code(PANEL)).not.toContain("<button");
  });

  it("keeps showing what the repository says after an override", () => {
    // THE REASON THE TWO ARE STORED SEPARATELY. A maintainer who overrode a
    // description can still see the original and change their mind —
    // impossible if the import had written into the authored column.
    expect(code(PANEL)).toContain("The repository says");
    expect(code(TOPICS)).toContain("stack.observed !== null && stack.observed !== stack.value");
  });
});

describe("what the panel says about the check itself", () => {
  it("tells the three states apart", () => {
    const src = read(PANEL);
    expect(src).toContain("Not checked yet");
    // The design's line: `Read 11 Sep 2026`, beside the heading.
    expect(src).toContain("`Read ${readDay(checkedAt)}`");
    // Checked, and it read nothing it may repeat — private, unlinked, or a
    // repository that says none of this. Not the same sentence as "never
    // checked", and not an empty panel.
    expect(src).toContain("The last check read nothing");
    expect(code(DETAILS)).toContain("hasObservation(profile)");
  });
});
