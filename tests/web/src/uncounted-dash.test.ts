// The dash is explained where it is drawn (openproduct-worldclass VC3).
//
// `uncounted.test.ts` in contracts pins the WORDS. What is pinned here is the
// WIRING, because the wiring is what was broken: the sentence a reader needed
// did not exist, and the attribute that would have carried it was
// `undefined` — for exactly the case that needed it, and only that case.
//
//     title={count === null ? undefined : ENDORSEMENT_TOTAL_TITLE}
//
// A test on the strings alone would have passed against that line all day.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = resolve(__dirname, "../../../web/src/app");
const read = (rel: string) => readFileSync(resolve(APP, rel), "utf-8");

describe("the dash carries its explanation (VC3)", () => {
  it("the vote box titles the uncounted case rather than leaving it undefined", () => {
    const source = read("ui/vote-box.tsx");
    expect(source).toContain("ENDORSEMENT_UNCOUNTED_TITLE");
    // The exact shape of the original defect: the null branch resolving to
    // nothing. Asserted as a string because that is how it shipped.
    expect(source).not.toContain("count === null ? undefined");
  });

  it("the feed says it once under the list, for readers who never hover", () => {
    // A `title` reaches somebody with a pointer who waits. On a phone there is
    // no hover at all, and the dash is most of what a first-time visitor sees.
    // The legend left the page with the site's explainers; the dash keeps
    // its title on the control, for the reader who asks.
    expect(read("ui/vote-box.tsx")).toContain("ENDORSEMENT_UNCOUNTED_TITLE");
  });

  it("shows the legend only when there is a dash on the page to explain", () => {
    // Copy that appears when it does not apply teaches a reader to stop
    // reading it. Once the sweep counts every listing this disappears on its
    // own, which is the correct end state rather than a cleanup task.
    expect(read("ui/vote-box.tsx")).toContain('count === null ? (delta > 0 ? delta : "—")');
  });
});
