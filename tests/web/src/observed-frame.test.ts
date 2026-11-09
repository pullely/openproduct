// PV0 — the observed frame, in the web layer (openproduct-worldclass).
//
// The done-when's third clause is the interesting one: "an authored field can
// never render in the observed frame". That is not a thing a component can
// promise about itself — it is a property of what the frame is given, so it
// is asserted over the vocabulary rather than over the markup.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  OBSERVED_SIGNALS,
  OBSERVED_SIGNAL_FORMULA,
  formulaHref,
  observedRow,
} from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const FRAME = "[slug]/observed-row.tsx";
const LISTING = "[slug]/page.tsx";

/** Every field a maintainer types. None of these may reach the frame. */
const AUTHORED = [
  "tagline",
  "pitch",
  "category",
  "hosting",
  "pricing",
  "stack",
  "repoUrl",
  "liveUrl",
  "roleOpenings",
  "maintainers",
  "components",
] as const;

describe("an authored field can never render in the observed frame", () => {
  it("has a closed vocabulary, and no authored field is in it", () => {
    // The frame renders `OBSERVED_SIGNALS` and nothing else, so the guarantee
    // is a property of that list rather than a promise about the markup.
    for (const field of AUTHORED) {
      expect([field, (OBSERVED_SIGNALS as readonly string[]).includes(field)]).toEqual([
        field,
        false,
      ]);
    }
  });

  it("reads only the observed half of the projection", () => {
    // `observedRow` is handed the whole public profile, so what it TOUCHES is
    // the real boundary. It reads five keys and every one of them is a
    // reading of the repository.
    const row = observedRow(
      {
        observedAt: "2026-09-07T00:00:00.000Z",
        licence: "MIT",
        language: "TypeScript",
        lastCommitAt: "2026-09-06T00:00:00.000Z",
        openIssues: 3,
      },
      new Date("2026-09-08T00:00:00.000Z"),
    );
    const rendered = JSON.stringify(row);
    for (const field of AUTHORED) {
      expect([field, rendered.includes(field)]).toEqual([field, false]);
    }
  });

  it("takes its values from the contract, never from the page", () => {
    // A frame that reached into the profile itself would be a second place
    // deciding what counts as observed.
    const src = code(FRAME);
    expect(src).not.toContain("profile.");
    expect(src).toContain("signals.map");
    expect(code(LISTING)).toContain("observedRow(profile, new Date(now))");
  });
});

describe("the frame is visibly not a maker's claim", () => {
  it("says where the values came from, in words", () => {
    const src = code(FRAME);
    expect(src).toContain("{OBSERVED_FRAME_HEADING}");
    expect(src).toContain("{OBSERVED_FRAME_NOTE}");
  });

  it("is drawn as its own half of the rail panel, under its own heading", () => {
    // A reader who never learns this estate's vocabulary should still see
    // that these four are set apart: the redesign draws them as the
    // `Repository` half of the rail panel — its own heading, the provenance
    // sentence riding on it, the moment of the read beside it — and what
    // happened on this site as a separate list under `On openproduct`.
    const src = code(FRAME);
    expect(src).toContain("title={OBSERVED_FRAME_NOTE}");
    expect(src).toContain("Read {agoOf(observedAt, now)}");
    // OB5 — the frame reads *Code* and the list under it *Details*.
    expect(code(LISTING)).toContain("{BUILD_DETAILS_HEADING}");
    expect(code(LISTING)).toMatch(/<ObservedRow signals=\{observed\} now=\{now\} \/>[\s\S]{0,400}\{BUILD_DETAILS_HEADING\}/);
  });

  it("carries the moment, in the estate's one time convention", () => {
    // VC6 — relative under a week with the absolute in `title`.
    const src = code(FRAME);
    expect(src).toContain("agoOf(observedAt, now)");
    expect(src).toContain("title={absoluteOf(observedAt)}");
  });

  it("links every signal's rule (OPC-4)", () => {
    expect(code(FRAME)).toContain("formulaHref(signal.formula)");
    for (const id of OBSERVED_SIGNALS) {
      expect([id, formulaHref(OBSERVED_SIGNAL_FORMULA[id]).startsWith("/docs/formulas#")]).toEqual([
        id,
        true,
      ]);
    }
  });

  it("renders a withdrawn row rather than hiding it", () => {
    const src = code(FRAME);
    expect(src).toContain("{SIGNAL_WITHDRAWN_NOTE}");
    expect(src).toContain("line-through");
  });

  it("draws nothing at all when nothing was read", () => {
    expect(code(FRAME)).toContain("if (signals.length === 0) return null;");
  });
});

describe("the licence left the mixed facts list", () => {
  it("no longer renders beside the fields a maintainer chose", () => {
    // It sat next to Category and Hosting, which a maintainer answered. A
    // page rendering both the same way says they are equally its word for it.
    const src = code(LISTING);
    expect(src).not.toContain('<Fact label="Licence"');
    expect(src).not.toContain("Not detected");
  });

  it("still renders — in the frame", () => {
    expect(code(LISTING)).toContain("<ObservedRow");
    expect(OBSERVED_SIGNALS).toContain("licence");
  });
});
