// The inverse of `toPgArrayLiteral` (openproduct-worldclass-v2 LI1).
import { describe, expect, it } from "vitest";

import { toPgArrayLiteral } from "./executor.js";
import { parsePgTextArray } from "./repository.js";

describe("parsePgTextArray — a Postgres array literal, as the fetch_types:false driver hands it back", () => {
  it("reads the empty array, bare elements and quoted elements", () => {
    expect(parsePgTextArray("{}")).toEqual([]);
    expect(parsePgTextArray("{acme-thing,my-project}")).toEqual(["acme-thing", "my-project"]);
    expect(parsePgTextArray('{"One evening a week","Two, with a comma"}')).toEqual([
      "One evening a week",
      "Two, with a comma",
    ]);
  });

  it("unescapes quotes and backslashes inside a quoted element", () => {
    expect(parsePgTextArray('{"say \\"hi\\"","back\\\\slash"}')).toEqual(['say "hi"', "back\\slash"]);
  });

  it("drops NULL and refuses anything that is not a literal", () => {
    expect(parsePgTextArray("{a,NULL,b}")).toEqual(["a", "b"]);
    expect(parsePgTextArray("not an array")).toEqual([]);
    expect(parsePgTextArray("")).toEqual([]);
  });

  it("round-trips whatever the executor serialises", () => {
    const values = ["plain", "with space", 'q"uote', "back\\slash", "comma,inside", "{brace}"];
    expect(parsePgTextArray(toPgArrayLiteral(values))).toEqual(values);
  });
});
