// IN0 — the live preview (openproduct-worldclass).
//
// What is pinned here is the mapping and, more importantly, the four things
// the preview REFUSES to say: a position, a licence, a topic it has not been
// told, and an address it has no authority to assign.

import { describe, expect, it } from "vitest";

import { FEED_ENTRY_KEYS } from "./feed.js";
import { SIGNAL_SOURCES } from "./provenance.js";
import {
  IMPORTED_FIELDS,
  IMPORT_SOURCE,
  OBSERVED_ONLY_FIELDS,
  PROVENANCE_LABEL,
  hasObservation,
  importedStack,
  importedValue,
  LISTING_STEPS,
  STEP_FIELDS,
  listingBasePath,
  listingStepOf,
  listingStepPath,
  PREVIEW_ABSENT_NOTE,
  PREVIEW_ADDRESS_NOTE,
  PREVIEW_HEADING,
  previewEntry,
} from "./intake.js";

const NOW = new Date("2026-05-20T09:15:00.000Z");
const draft = (name: string, tagline = "") => previewEntry({ name, tagline }, NOW);

describe("IN0 — a draft, as the feed's own row would render it", () => {
  it("is a whole FeedEntry, so the row needs nothing else", () => {
    // The promise is that the preview IS the feed's component. That only
    // holds if the mapping produces the component's whole input — a partial
    // one would push the missing fields into the page, which is where the
    // second implementation starts.
    const entry = draft("Acme Thing");
    for (const key of FEED_ENTRY_KEYS) {
      expect([key, key in entry]).toEqual([key, true]);
    }
    expect(Object.keys(entry).sort()).toEqual([...FEED_ENTRY_KEYS].sort());
  });

  it("shows the name as typed, because on this estate the slug IS the name", () => {
    expect(draft("Acme Thing").slug).toBe("Acme Thing");
  });

  it("has no position, and that is not a zero", () => {
    // OPC-C. The sweep has not run; the row draws no number at all. A zero
    // would claim the board looked and placed it nowhere.
    expect(draft("a").rank).toBeNull();
  });

  it("has no licence, because nothing has been observed", () => {
    // OPC-7 — observed at publish, never a maintainer's claim. `null` makes
    // the row draw nothing; a string here would be a finding we did not make.
    expect(draft("a").licence).toBeNull();
  });

  it("has no topics and no stack, so the row omits its third line entirely", () => {
    const entry = draft("a");
    expect(entry.topics).toEqual([]);
    expect(entry.stack).toEqual([]);
  });

  it("asks for nobody, which the row renders as no badge rather than a zero", () => {
    expect(draft("a").roleOpeningCount).toBe(0);
  });

  it("carries an empty tagline as null, not as an empty line", () => {
    expect(draft("a", "").tagline).toBeNull();
    expect(draft("a", "does a thing").tagline).toBe("does a thing");
  });

  it("counts nothing, because nothing has happened to it", () => {
    const entry = draft("a");
    expect([entry.counted, entry.ineligible, entry.commentCount]).toEqual([0, 0, 0]);
  });

  it("takes its clock from the caller", () => {
    // Not `new Date()` inside: a function that reads the wall clock cannot be
    // tested for the day it derives, and the day is what the row's own
    // grouping would key on.
    expect(draft("a").launchedAt).toBe("2026-05-20T09:15:00.000Z");
    expect(draft("a").day).toBe("2026-05-20");
  });
});

describe("what the preview refuses to promise", () => {
  it("does not guess the address", () => {
    // THE ONE THING THIS LAYER HAS NO AUTHORITY OVER. `/submit` hands a name
    // to the console and the console assigns the address. There is no
    // slugify in these contracts, deliberately — and the note is what a
    // reader gets instead of a confident wrong URL.
    expect(PREVIEW_ADDRESS_NOTE).toContain("assigned when the workspace is created");
    expect(PREVIEW_ADDRESS_NOTE).toContain("does not guess");
  });

  it("says which absences are absences", () => {
    // Four things render as nothing at all, which reads as a sparse listing
    // rather than an unfinished one. The sentence turns the second reading
    // into the first.
    for (const word of ["licence", "topics", "stack"]) {
      expect([word, PREVIEW_ABSENT_NOTE.includes(word)]).toEqual([word, true]);
    }
    expect(PREVIEW_ABSENT_NOTE).toContain("the first time the board runs");
  });

  it("heads the section with a description, not a claim", () => {
    // "How it will look" is a description of a rendering. "Your listing" or
    // "Preview of your product page" would both name something that does not
    // exist yet.
    expect(PREVIEW_HEADING).toBe("How it will look");
  });
});

describe("IN1 — the steps a listing is filled in through", () => {
  it("names all five, in the order the plan gives them", () => {
    expect(LISTING_STEPS.map((s) => s.id)).toEqual([
      "details",
      "media",
      "topics",
      "people",
      "schedule",
    ]);
  });

  it("keeps the scheduler at the address LC0 shipped", () => {
    // `schedule` is the label; `launches` is the address. Renaming a working
    // address to match a vocabulary is a cost paid by everyone holding the
    // old link, and the strip can say one word while the URL says another.
    const schedule = LISTING_STEPS.find((s) => s.id === "schedule");
    expect(schedule?.segment).toBe("launches");
    expect(listingStepPath("acme", "prf_1", schedule!)).toBe("/studio/acme/prf_1/launches");
  });

  it("gives the media step an address now, and nothing to wait on (MD2)", () => {
    // IN1 shipped this step as a sequence entry with no page — "more honest
    // than a strip of four implying there were only ever four" — waiting first
    // on WC-C, then on MD1's store. Both are built. The step is a link, like
    // the other four, and the sentence that named its blocker is gone rather
    // than left to go stale a second time.
    const media = LISTING_STEPS.find((s) => s.id === "media")!;
    expect(media.segment).toBe("media");
    expect(listingStepPath("acme", "prf_1", media)).toBe("/studio/acme/prf_1/media");
    expect(media.awaits).toBeNull();
  });

  it("a step that waits names a BUILD as the blocker, never a decision somebody already took", () => {
    // WC-C was answered on 9 Sep 2026 (R2, derivatives at upload), and the
    // media step's string read "a decision on who hosts uploaded media" for
    // as long as it took somebody to notice — on the page, in front of
    // maintainers, saying the product waited on something it did not.
    //
    // No step waits today. The rule stays, asserted over every step, so the
    // next sentence anybody writes here has to name something that can be
    // finished rather than decided.
    for (const step of LISTING_STEPS) {
      expect([step.id, step.awaits ?? ""]).toEqual([
        step.id,
        expect.not.stringMatching(/decision|WC-[A-J]|gated|waiting on a decision/i),
      ]);
    }
  });

  it("gives every step an address and no excuse", () => {
    // Five of five since MD2; the media step was the one exception.
    for (const step of LISTING_STEPS) {
      expect([step.id, step.awaits]).toEqual([step.id, null]);
      expect([step.id, listingStepPath("o", "p", step)]).toEqual([
        step.id,
        `/studio/o/p/${step.segment}`,
      ]);
    }
  });

  it("says what each step holds, so a strip is not five bare words", () => {
    for (const step of LISTING_STEPS) {
      expect([step.id, step.holds.length > 20]).toEqual([step.id, true]);
      expect([step.id, step.holds.endsWith(".")]).toEqual([step.id, true]);
    }
  });

  it("escapes the ids it puts in a path", () => {
    const details = LISTING_STEPS[0]!;
    expect(listingStepPath("a b", "p/1", details)).toBe("/studio/a%20b/p%2F1/details");
    expect(listingBasePath("a b", "p/1")).toBe("/studio/a%20b/p%2F1");
  });

  it("resolves a segment back to its step, and refuses one it does not know", () => {
    // The actions route reads `from` off a posted form and uses it to build a
    // redirect. Anything outside the vocabulary must not reach a URL.
    expect(listingStepOf("topics")?.id).toBe("topics");
    expect(listingStepOf("launches")?.id).toBe("schedule");
    expect(listingStepOf("../../evil")).toBeNull();
    expect(listingStepOf("")).toBeNull();
    // MD2 — the media step has a segment, so it resolves like the others.
    expect(listingStepOf("media")?.id).toBe("media");
  });
});

describe("a step saves its own fields and nobody else's", () => {
  it("gives each saving step a disjoint field list", () => {
    // THE DEFECT THE SPLIT WOULD OTHERWISE HAVE INTRODUCED. The editor's one
    // form posted every field, and the route read every field from every
    // save. A Details form posts no `stack` — and the route, reading an
    // absent field as an empty one, would have CLEARED the topics set on
    // another page.
    const seen = new Set<string>();
    for (const [step, fields] of Object.entries(STEP_FIELDS)) {
      expect([step, fields.length > 0]).toEqual([step, true]);
      for (const field of fields) {
        expect([step, field, seen.has(field)]).toEqual([step, field, false]);
        seen.add(field);
      }
    }
  });

  it("keeps the licence out of the topics step", () => {
    // Observed from the repository at publish, never a maintainer's claim
    // (OPC-7). A field for it would invite one.
    expect(STEP_FIELDS.topics).not.toContain("licence");
    expect(STEP_FIELDS.topics).toEqual(["stack", "category", "hosting", "pricing"]);
  });

  it("covers every step that has a form", () => {
    // `schedule` posts to its own actions route and `media` has no page, so
    // three saving steps is the whole of it.
    expect(Object.keys(STEP_FIELDS).sort()).toEqual(["details", "people", "topics"]);
  });
});

describe("IN2 — what the repository says, beside what a maintainer wrote", () => {
  it("uses the estate's own provenance vocabulary rather than a second one", () => {
    // `provenance.ts` already carries the three-class union and the four
    // signal sources. IN2 narrows, it does not invent: an intake field is
    // observed or authored, never derived, because nothing here is computed.
    expect(PROVENANCE_LABEL.observed).toBe("from the repository");
    expect(PROVENANCE_LABEL.authored).toBe("yours");
    expect(Object.keys(PROVENANCE_LABEL).sort()).toEqual(["authored", "observed"]);
  });

  it("declares the weaker source, not the stronger one", () => {
    // `declared_repo`, not `linked_repo`: the gateway reads api.github.com
    // over the PUBLIC API from a URL a maintainer typed, with no App and no
    // custody. `linked_repo` promises more than that read can see.
    expect(IMPORT_SOURCE).toBe("declared_repo");
    expect(SIGNAL_SOURCES).toContain(IMPORT_SOURCE);
  });

  it("names the four fields an import fills", () => {
    expect(IMPORTED_FIELDS).toEqual(["name", "description", "licence", "stack"]);
  });

  it("keeps the licence observed-only, because a licence is not ours to claim", () => {
    // OPC-7. There is no field to type one into, and saying so in the
    // contract is what stops a form growing one.
    expect(OBSERVED_ONLY_FIELDS).toEqual(["licence"]);
  });
});

describe("authored always wins, and the observation waits", () => {
  it("shows the observation only where nothing was written", () => {
    const filled = importedValue("description", "A kettle", "Boils water");
    expect([filled.value, filled.provenance]).toEqual(["A kettle", "authored"]);
    const gap = importedValue("description", null, "Boils water");
    expect([gap.value, gap.provenance]).toEqual(["Boils water", "observed"]);
  });

  it("treats whitespace as nothing written", () => {
    // A tagline of three spaces is not an authored sentence, and calling it
    // one would hide the observation behind a value nobody can see.
    const v = importedValue("description", "   ", "Boils water");
    expect([v.value, v.provenance]).toEqual(["Boils water", "observed"]);
  });

  it("keeps the observation visible even when it was overridden", () => {
    // THE POINT OF STORING THE TWO SEPARATELY. A maintainer who overrode a
    // description can still see what the repository says, and change their
    // mind — which prefilling the authored column would have made impossible.
    const v = importedValue("description", "A kettle", "Boils water");
    expect(v.observed).toBe("Boils water");
  });

  it("says nothing at all when neither side has anything", () => {
    const v = importedValue("description", null, null);
    expect([v.value, v.provenance, v.observed]).toEqual([null, "observed", null]);
  });

  it("does the same for the stack, which is a list", () => {
    const own = importedStack(["typescript"], ["rust", "wasm"]);
    expect([own.value, own.provenance, own.observed]).toEqual([
      "typescript",
      "authored",
      "rust, wasm",
    ]);
    const gap = importedStack([], ["rust", "wasm"]);
    expect([gap.value, gap.provenance]).toEqual(["rust, wasm", "observed"]);
  });

  it("distinguishes a repository with no topics from one never read", () => {
    // OPC-C, on the one field where the two are easy to confuse. `[]` is an
    // answer; `null` is the absence of one.
    expect(importedStack([], []).value).toBe("");
    expect(importedStack([], null).value).toBeNull();
  });
});

describe("whether anything was observed at all", () => {
  const base = {
    repoCheckedAt: null as string | null,
    repoName: null as string | null,
    repoDescription: null as string | null,
    repoTopics: null as string[] | null,
    repoLicence: null as string | null,
  };

  it("is false before the first check", () => {
    expect(hasObservation(base)).toBe(false);
  });

  it("is false for a check that read nothing — a private or unlinked repo", () => {
    // The check ran and came back with nothing it may repeat. That is a
    // different sentence from "not checked yet", and the panel says so.
    expect(hasObservation({ ...base, repoCheckedAt: "2026-05-20T09:00:00.000Z" })).toBe(false);
  });

  it("is true once any one of the four came back", () => {
    const at = "2026-05-20T09:00:00.000Z";
    expect(hasObservation({ ...base, repoCheckedAt: at, repoLicence: "MIT" })).toBe(true);
    expect(hasObservation({ ...base, repoCheckedAt: at, repoTopics: [] })).toBe(true);
    expect(hasObservation({ ...base, repoCheckedAt: at, repoName: "kettleworks" })).toBe(true);
  });
});
