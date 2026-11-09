// The catalog substrate's guards (openproduct-commons CT0).
//
// Four claims, each of which failing means a specific thing the program
// promised stops being true:
//
//   OPC-2  a public fact carries where it came from and when it was true
//   OPC-4  every computed number resolves to a published sentence
//   OPC-7  an observed value cannot exist without the moment it was observed
//   CT-1   a facet count counts one thing, and nobody is blocked by our list

import { describe, expect, it } from "vitest";

import {
  FORMULAS,
  allFormulas,
  authored,
  derived,
  factAt,
  isDerived,
  isObserved,
  observed,
  type Fact,
} from "./provenance.js";
import {
  FACETS,
  assignedFacets,
  canonicalise,
  canonicaliseStack,
  facet,
  foldSpelling,
  labelOf,
} from "./facets.js";

describe("OPC-7 — an observed value cannot exist without its moment", () => {
  it("the constructors require it, at compile time", () => {
    const ok = observed(38, "linked_repo", "2026-08-25T09:00:00Z");
    expect(factAt(ok)).toBe("2026-08-25T09:00:00Z");

    // The mechanism is that there is no overload and no default. Both of
    // these are compile errors, and the assertions below only exist so a
    // reader can see WHAT is refused without running tsc themselves.
    // @ts-expect-error observedAt is required — a number with no moment is not an observation
    observed(38, "linked_repo");
    // @ts-expect-error a formula id must be one of the published ones
    derived(1, "sort.invented-just-now", [], "2026-08-25T09:00:00Z");
    // @ts-expect-error computedAt is required for the same reason observedAt is
    derived(1, "sort.newest", []);
  });

  it("an authored fact has no moment, and says so rather than inventing one", () => {
    // A maintainer's pitch is true in their voice, not as of a timestamp.
    // Returning `null` here rather than a creation date is what stops the
    // renderer from printing "observed 4 Mar" beside somebody's prose.
    expect(factAt(authored("a queue you can read", "maintainer"))).toBeNull();
  });

  it("narrows by class so a renderer branches once", () => {
    const o: Fact<number> = observed(1, "declared_repo", "2026-08-25T09:00:00Z");
    const d: Fact<number> = derived(1, "sort.newest", ["published_at"], "2026-08-25T09:00:00Z");
    const a: Fact<string> = authored("x", "contributor");
    expect(isObserved(o)).toBe(true);
    expect(isDerived(o)).toBe(false);
    expect(isDerived(d)).toBe(true);
    expect(isObserved(a)).toBe(false);
    expect(isDerived(a)).toBe(false);
  });
});

describe("OPC-4 — every computed number resolves to a published sentence", () => {
  it("every formula id has one sentence and names the milestone that emits it", () => {
    for (const [key, formula] of Object.entries(FORMULAS)) {
      expect(formula.id).toBe(key);
      expect(formula.sentence.length).toBeGreaterThan(24);
      // One sentence. If it needs two, the formula is doing too much.
      expect(formula.sentence.trim().endsWith(".")).toBe(true);
      expect(formula.computedBy).toMatch(/^[A-Z]{2}\d$/);
    }
  });

  it("the three published sort orders exist and are distinct from the launch board's", () => {
    // OPC-4 allows exactly three directory orderings; LC-2 says the board's
    // is separate and shares none of their inputs.
    expect(FORMULAS["sort.most-active"].sentence).toMatch(/trailing seven days/);
    expect(FORMULAS["sort.most-saved"].sentence).toMatch(/distinct subjects/);
    expect(FORMULAS["sort.newest"].sentence).toMatch(/first published/);
    expect(FORMULAS["launch.board-rank"].sentence).toMatch(/not the directory's order/);
  });

  it("no ordering formula mentions an engagement term", () => {
    // OPC-4 bans a blended relevance score outright. This is the cheap test
    // that keeps one from arriving as a "small" addition to an existing rule.
    for (const formula of allFormulas()) {
      expect(formula.sentence.toLowerCase()).not.toMatch(
        /click|dwell|impression|engagement|trending|popularity score/,
      );
    }
  });

  it("renders in a stable order, because it is a public document", () => {
    const ids = allFormulas().map((f) => f.id);
    expect(ids).toEqual([...ids].sort());
  });
});

describe("CT-1 — closed vocabularies with one open, canonicalised tail", () => {
  it("is the reference design's rail, in its order", () => {
    expect(FACETS.map((f) => f.id)).toEqual([
      "category",
      "stack",
      "licence",
      "openings",
      "activity",
      "team_size",
      "hosting",
      // PP3 — pricing, beside the other assigned facet.
      "pricing",
    ]);
  });

  it("only assigned facets have a column behind them", () => {
    expect(assignedFacets().map((f) => f.id)).toEqual([
      "category",
      "stack",
      "licence",
      "hosting",
      "pricing",
    ]);
    for (const group of FACETS) {
      if (group.kind === "derived") continue;
      expect(group.values.length).toBeGreaterThan(2);
    }
  });

  it("every facet explains itself, because the docs page renders it", () => {
    for (const group of FACETS) {
      expect(group.description.length).toBeGreaterThan(40);
      // No duplicate values or labels inside a group — a vocabulary with two
      // ways to say one thing is the problem it exists to solve.
      const values = group.values.map((v) => v.value);
      const labels = group.values.map((v) => v.label);
      expect(new Set(values).size).toBe(values.length);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it("folds spellings so one alias covers a family of them", () => {
    expect(foldSpelling("Next.js")).toBe("next.js");
    expect(foldSpelling("  TypeScript  ")).toBe("typescript");
    expect(foldSpelling("Tailwind CSS")).toBe("tailwind-css");
    expect(foldSpelling("C++")).toBe("c++");
    expect(foldSpelling("!!!")).toBe("");
  });

  it("resolves value, label and alias spellings alike", () => {
    expect(canonicalise("stack", "TS")).toBe("typescript");
    expect(canonicalise("stack", "typescript")).toBe("typescript");
    expect(canonicalise("stack", "TypeScript")).toBe("typescript");
    expect(canonicalise("stack", "golang")).toBe("go");
    expect(canonicalise("stack", "Next JS")).toBe("nextjs");
    expect(canonicalise("stack", "k8s")).toBe("kubernetes");
    expect(canonicalise("licence", "Apache-2.0")).toBe("apache-2-0");
    expect(canonicalise("category", "devtools")).toBe("dev-tools");
    expect(canonicalise("hosting", "on-prem")).toBe("self-hosted");
  });

  it("returns null rather than guessing, and null is the load-bearing answer", () => {
    // A maintainer writing something we have never heard of keeps their words
    // on the page; nothing unrecognised reaches a count.
    expect(canonicalise("stack", "Brainfuck")).toBeNull();
    expect(canonicalise("stack", "")).toBeNull();
    expect(canonicalise("stack", "   ")).toBeNull();
    expect(canonicalise("not-a-facet", "typescript")).toBeNull();
  });

  it("splits an authored stack into the countable half and the maintainer's own words", () => {
    const result = canonicaliseStack([
      "TypeScript",
      "ts",
      "Postgres",
      "Hand-rolled CRDT",
      "  ",
      "k8s",
    ]);
    // De-duplicated: TypeScript and ts are one language and count once.
    expect(result.canonical).toEqual(["typescript", "postgres", "kubernetes"]);
    // Kept verbatim — not lower-cased, not folded, not dropped.
    expect(result.unrecognised).toEqual(["Hand-rolled CRDT"]);
  });

  it("labels every canonical value, so no page ever renders a machine name", () => {
    for (const group of FACETS) {
      for (const value of group.values) {
        expect(labelOf(group.id, value.value)).toBe(value.label);
      }
    }
    expect(labelOf("stack", "not-a-value")).toBeNull();
  });

  it("no alias collides across values inside a group", () => {
    // Two values claiming one spelling means canonicalisation depends on
    // declaration order, which is how a vocabulary starts lying quietly.
    for (const group of FACETS) {
      const seen = new Map<string, string>();
      for (const value of group.values) {
        for (const spelling of [value.value, value.label, ...(value.aliases ?? [])]) {
          const folded = foldSpelling(spelling);
          const owner = seen.get(folded);
          if (owner !== undefined) expect(`${group.id}:${folded} -> ${owner}`).toBe(
            `${group.id}:${folded} -> ${value.value}`,
          );
          seen.set(folded, value.value);
        }
      }
    }
  });

  it("licence keeps 'no licence detected' as a real answer (OPC-I)", () => {
    // The directory shows what was observed and does not adjudicate which
    // licences qualify. An unlicensed repository is information, not an error.
    expect(canonicalise("licence", "none")).toBe("none-detected");
    expect(facet("licence")?.values.some((v) => v.value === "source-available")).toBe(true);
  });

  it("activity keeps 'not observed' distinct from 'quiet' (OPC-C)", () => {
    // The whole of OPC-C in one assertion: a listing whose repository we
    // cannot read has not told us it is inactive.
    const activity = facet("activity");
    expect(activity?.values.map((v) => v.value)).toContain("not-observed");
    expect(activity?.values.map((v) => v.value)).toContain("quiet");
  });
});
