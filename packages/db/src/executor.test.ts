import { describe, expect, it } from "vitest";
import { bindParams, createSqlExecutor, toPgArrayLiteral } from "./executor.js";

describe("toPgArrayLiteral — a JavaScript array as Postgres reads one", () => {
  it("quotes and separates elements", () => {
    expect(toPgArrayLiteral(["my-project", "other"])).toBe('{"my-project","other"}');
  });
  it("escapes quotes and backslashes inside an element", () => {
    expect(toPgArrayLiteral(['a"quote', "back\\slash"])).toBe('{"a\\"quote","back\\\\slash"}');
  });
  it("keeps nulls as NULL, dates as ISO text, and nests arrays", () => {
    expect(toPgArrayLiteral([null, undefined])).toBe("{NULL,NULL}");
    expect(toPgArrayLiteral([new Date("2026-09-03T06:09:38.800Z")])).toBe('{"2026-09-03T06:09:38.800Z"}');
    expect(toPgArrayLiteral([["a"], ["b", "c"]])).toBe('{{"a"},{"b","c"}}');
  });
  it("serializes an empty array to the empty literal", () => {
    expect(toPgArrayLiteral([])).toBe("{}");
  });
});

describe("bindParams — arrays become literals, everything else passes through", () => {
  it("touches only arrays", () => {
    expect(bindParams(["x", 1, null, ["a"], true, undefined])).toEqual(["x", 1, null, '{"a"}', true, undefined]);
    expect(bindParams(undefined)).toEqual([]);
  });
});

/** A client that records what `unsafe` was handed — the driver's side of the seam. */
function fakeClient() {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const unsafe = async (text: string, params: unknown[]) => {
    calls.push({ text, params });
    return Object.assign([], { length: 0 }) as unknown as never;
  };
  const client = {
    unsafe,
    begin: async (fn: (tx: { unsafe: typeof unsafe }) => Promise<unknown>) => fn({ unsafe }),
    end: async () => undefined,
  };
  return { client, calls };
}

describe("createSqlExecutor binds arrays as literals on both paths", () => {
  it("in execute", async () => {
    const { client, calls } = fakeClient();
    const executor = createSqlExecutor({ connectionString: "postgres://x" }, () => client as never);
    await executor.execute("SELECT 1 WHERE $1 = ANY($2::text[])", ["a", ["a", "b"]]);
    expect(calls[0]!.params).toEqual(["a", '{"a","b"}']);
  });
  it("inside a transaction", async () => {
    const { client, calls } = fakeClient();
    const executor = createSqlExecutor({ connectionString: "postgres://x" }, () => client as never);
    await executor.transaction(async (tx) => tx.execute("UPDATE t SET x = 1 WHERE id = ANY($1::uuid[])", [["u1"]]));
    expect(calls[0]!.params).toEqual(['{"u1"}']);
  });
});
