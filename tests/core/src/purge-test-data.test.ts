// The purge, recorded (openproduct-worldclass-v2 CF2) — the script against a
// fixture that stands in for production.
import { ACTS_PATH, CATALOGUE_PATH, REASON, run } from "../scripts/purge-test-data.mjs";

interface Call {
  url: string;
  init?: RequestInit | undefined;
}

function world(listings: string[], refuse: string[] = []) {
  const calls: Call[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith(CATALOGUE_PATH)) {
      return new Response(JSON.stringify({ data: listings.map((slug) => ({ slug })) }), { status: 200 });
    }
    if (url.endsWith(ACTS_PATH)) {
      const body = JSON.parse(String(init?.body)) as { slug: string };
      return new Response("", { status: refuse.includes(body.slug) ? 403 : 200 });
    }
    return new Response("", { status: 404 });
  };
  return { calls, fetch: fetch as unknown as typeof globalThis.fetch };
}

const ORIGIN = "https://api.openproduct.example";
const ENV = { OPENPRODUCT_OPERATOR_TOKEN: "tok_operator" };

describe("the purge goes through the door, one named slug at a time", () => {
  it("removes each slug with reason test_data, in order, as the operator", async () => {
    const w = world(["a-thing", "b-thing", "c-thing"]);
    const code = await run({ argv: ["--origin", ORIGIN, "a-thing", "b-thing"], env: ENV, fetch: w.fetch });
    expect(code).toBe(0);
    const acts = w.calls.filter((c) => c.url.endsWith(ACTS_PATH));
    expect(acts.map((c) => JSON.parse(String(c.init?.body)))).toEqual([
      { act: "remove", slug: "a-thing", reason: REASON },
      { act: "remove", slug: "b-thing", reason: REASON },
    ]);
    expect((acts[0]!.init?.headers as Record<string, string>).authorization).toBe("Bearer tok_operator");
    expect(REASON).toBe("test_data");
  });

  it("reads the catalogue BEFORE writing anything, and stops at the first refusal", async () => {
    const w = world(["a-thing", "b-thing"], ["a-thing"]);
    await expect(run({ argv: ["--origin", ORIGIN, "a-thing", "b-thing"], env: ENV, fetch: w.fetch })).rejects.toThrow(
      /refused a-thing/,
    );
    expect(w.calls[0]!.url).toBe(`${ORIGIN}${CATALOGUE_PATH}`);
    expect(w.calls.filter((c) => c.url.endsWith(ACTS_PATH))).toHaveLength(1);
  });
});

describe("it refuses a production that has grown, and anything unnamed", () => {
  it("refuses a catalogue of more than ten listings without writing", async () => {
    const w = world(Array.from({ length: 11 }, (_, i) => `real-${i}`));
    await expect(run({ argv: ["--origin", ORIGIN, "real-0"], env: ENV, fetch: w.fetch })).rejects.toThrow(/more than 10/);
    expect(w.calls.filter((c) => c.url.endsWith(ACTS_PATH))).toHaveLength(0);
  });

  it("refuses a slug that is not in the catalogue, a pattern, no slugs, and no token", async () => {
    const w = world(["a-thing"]);
    await expect(run({ argv: ["--origin", ORIGIN, "z-thing"], env: ENV, fetch: w.fetch })).rejects.toThrow(/not in the catalogue/);
    await expect(run({ argv: ["--origin", ORIGIN, "test-*"], env: ENV, fetch: w.fetch })).rejects.toThrow(/not a slug/);
    await expect(run({ argv: ["--origin", ORIGIN], env: ENV, fetch: w.fetch })).rejects.toThrow(/name every slug/);
    await expect(run({ argv: ["--origin", ORIGIN, "a-thing"], env: {}, fetch: w.fetch })).rejects.toThrow(/OPERATOR_TOKEN/);
    await expect(run({ argv: ["a-thing"], env: ENV, fetch: w.fetch })).rejects.toThrow(/--origin/);
    expect(w.calls.filter((c) => c.url.endsWith(ACTS_PATH))).toHaveLength(0);
  });
});
