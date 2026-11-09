// The endorsement's rules (openproduct-commons EN0).
//
// The distinction this sub-epic exists to protect is one keystroke wide, so
// what is pinned here is mostly that the two objects stay two.

import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ENDORSEMENT_MEANING,
  ENDORSEMENT_STATES,
  ENDORSEMENT_TOTAL_KEYS,
  SAVE_MEANING,
  countsTowardTotal,
  endorsementStateFor,
} from "./endorsements.js";
import { FORMULAS } from "./provenance.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(
  resolve(HERE, "../../db/src/migrations/1390_openproduct_endorsements/up.sql"),
  "utf-8",
);

describe("EN-1 — two objects, and the migration touches only one of them", () => {
  it("no STATEMENT in the migration touches `saved_products`", () => {
    // Comments and COMMENT ON are prose and may name it — the reason has to
    // be written down, because the pressure to merge the two tables returns
    // every time somebody notices they look similar. What must not exist is a
    // statement that READS or ALTERS it: every row there was created under a
    // promise that nobody would ever see it, and counting them now would
    // retroactively publish a private gesture made by people who cannot be
    // asked and did not agree.
    const executable = MIGRATION.split(/;\s*\n/)
      .map((statement) =>
        statement
          .split("\n")
          .filter((line) => !line.trimStart().startsWith("--"))
          .join("\n"),
      )
      .filter((statement) => !/^\s*COMMENT\s+ON/i.test(statement));
    for (const statement of executable) {
      expect(statement).not.toContain("saved_products");
    }
    // The reason is written down.
    expect(MIGRATION).toContain("saved_products");
  });

  it("there is no counter column anywhere in it (EN-3)", () => {
    // A counter cannot be restated without erasing history, and it drifts the
    // first time a write path forgets it.
    expect(MIGRATION).not.toMatch(/endorsement_count|total\s+INTEGER|count\s+INTEGER/i);
  });

  it("withdrawal is a column, not a delete", () => {
    expect(MIGRATION).toContain("withdrawn_at TIMESTAMPTZ");
    expect(MIGRATION).not.toMatch(/ON DELETE SET NULL/);
  });
});

describe("the button says which act it is", () => {
  it("both sentences exist, and each names what the OTHER one is", () => {
    // The single most likely failure of this sub-epic is somebody clicking
    // `▲` believing it is a private bookmark. The remedy is one sentence in
    // the place they are looking.
    expect(ENDORSEMENT_MEANING).toContain("public");
    expect(ENDORSEMENT_MEANING).toContain("save it instead");
    expect(SAVE_MEANING).toContain("private");
    expect(SAVE_MEANING).toContain("no count");
  });
});

describe("what counts, decided in one place", () => {
  it("three different ways not to count, and they are different things", () => {
    const base = { state: "confirmed" as const, withdrawnAt: null, discounted: false };
    expect(countsTowardTotal(base)).toBe(true);
    // the person took it back
    expect(countsTowardTotal({ ...base, withdrawnAt: "2026-08-19T00:00:00.000Z" })).toBe(false);
    // they have not cleared TS1's floor
    expect(countsTowardTotal({ ...base, state: "pending" })).toBe(false);
    // the integrity model's opinion, which the person is never told
    expect(countsTowardTotal({ ...base, discounted: true })).toBe(false);
  });

  it("the state vocabulary is closed", () => {
    expect([...ENDORSEMENT_STATES]).toEqual(["confirmed", "pending"]);
  });
});

describe("OPC-4 — the total resolves to published prose", () => {
  it("`endorsements.total` and `endorsements.7d` both exist and say what they count", () => {
    for (const id of ["endorsements.total", "endorsements.7d"] as const) {
      const formula = FORMULAS[id];
      expect(formula.sentence).toContain("withdrawn");
      expect(formula.sentence).toContain("discount");
    }
    // One subject counts once — the property the primary key enforces.
    expect(FORMULAS["endorsements.total"].sentence).toContain("One subject counts once");
  });

  it("only the DISCOUNTED figure is a published total", () => {
    // Publishing both per listing would let anybody compute exactly which
    // listings we discounted and by how much, which is an accusation about a
    // specific product's supporters, made in public, by arithmetic.
    expect([...ENDORSEMENT_TOTAL_KEYS]).toEqual(["recent", "total"]);
    expect(ENDORSEMENT_TOTAL_KEYS).not.toContain("raw");
    expect(ENDORSEMENT_TOTAL_KEYS).not.toContain("discounted");
  });
});

describe("EN1 — what state a new endorsement starts in", () => {
  it("the floor is TS1's, and it is total over the level vocabulary", () => {
    // Exhaustive rather than illustrative: a fifth trust level added later
    // must force somebody to decide what it means here, not inherit
    // `confirmed` from a `!==` somewhere.
    expect(endorsementStateFor("new")).toBe("pending");
    expect(endorsementStateFor("restricted")).toBe("pending");
    expect(endorsementStateFor("established")).toBe("confirmed");
    expect(endorsementStateFor("trusted")).toBe("confirmed");
  });

  it("`restricted` still endorses — restriction defers a write, it does not delete an opinion", () => {
    // This looks wrong for about a second. The point of restriction is that
    // a person's public writes wait for review, not that their view of a
    // product is erased. A `pending` row is the honest record of what they
    // did, it moves no number, and it is there to count if the restriction
    // is lifted or successfully appealed.
    expect(ENDORSEMENT_STATES).toContain(endorsementStateFor("restricted"));
    expect(endorsementStateFor("restricted")).not.toBe("confirmed");
  });

  it("a pending endorsement is recorded and simply does not count", () => {
    // The two halves of "record rather than refuse", pinned together: the
    // state is a legal state, and `countsTowardTotal` declines it. Refusing
    // the click instead would discard a newcomer's honest gesture and teach
    // them the button is broken.
    const row = {
      state: endorsementStateFor("new"),
      withdrawnAt: null,
      discounted: false,
    };
    expect(countsTowardTotal(row)).toBe(false);
    expect(countsTowardTotal({ ...row, state: endorsementStateFor("established") })).toBe(true);
  });
});
