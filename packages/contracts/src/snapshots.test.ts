// Snapshot diffs (openproduct-worldclass PV4).
//
// Three claims, and the first is the one that would have shipped a bad page:
//
//   NO BASELINE IS NOT "NOTHING CHANGED". A diff against nothing would render
//   every field as changed — a page announcing that a product rewrote its
//   whole listing on the day we started looking.
//
//   AN AUTHORED CHANGE AND AN OBSERVED CHANGE ARE DIFFERENT EVENTS. OPC-2
//   applied to time: a maintainer rewriting a tagline and a repository's
//   licence moving are not the same kind of fact and must not render alike.
//
//   NOTHING HERE ORDERS THE PRODUCT. "Recently updated" is an engagement term
//   wearing a timestamp, and the module exports no comparator for one.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  DIFFABLE_FIELDS,
  DIFF_NOTHING,
  DIGEST_CHANGE_LIMIT,
  FIELD_CLASS,
  FIELD_LABEL,
  describe as describeValue,
  diffSnapshots,
  digestLead,
  type DigestChange,
  type Snapshot,
} from "./snapshots.js";

const BEFORE = "2026-09-01T00:00:00.000Z";
const AFTER = "2026-09-08T00:00:00.000Z";

const snap = (fields: Snapshot["fields"], takenAt = AFTER): Snapshot => ({ takenAt, fields });

describe("no baseline is not 'nothing changed'", () => {
  it("answers null when there is no earlier snapshot", () => {
    // `null`, never `[]`. An empty list means "we compared and nothing moved",
    // which is a real answer; this is "nobody has looked yet".
    expect(diffSnapshots(null, snap({ tagline: "A thing" }))).toBeNull();
  });

  it("answers an EMPTY LIST when two snapshots agree", () => {
    const fields = { tagline: "A thing", licence: "MIT" };
    expect(diffSnapshots(snap(fields, BEFORE), snap(fields))).toEqual([]);
  });

  it("publishes copy for the compared state and DELIBERATELY none for the other", () => {
    // The no-baseline state gets no sentence, and that is a decision rather
    // than an omission. "There is nothing to compare yet" is true and useless:
    // it would sit on every newly published listing, and on every listing for
    // the first week this table exists, saying something about our recording
    // history rather than about the product. `null` renders NO SECTION.
    expect(DIFF_NOTHING.toLowerCase()).toContain("nothing changed");
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, "snapshots.ts"), "utf-8");
    const exported = [...source.matchAll(/^export const (DIFF_[A-Z_]+)/gm)].map((m) => m[1]);
    expect(exported.sort()).toEqual(["DIFF_HEADING", "DIFF_NOTHING"]);
  });
});

describe("an authored change and an observed change are different events", () => {
  it("gives a maintainer's edit their voice, and no moment", () => {
    // We know it happened between two snapshots. Attaching a timestamp would
    // be inventing precision we do not have.
    const [change] = diffSnapshots(
      snap({ tagline: "Old words" }, BEFORE),
      snap({ tagline: "New words" }),
    )!;
    expect(change!.provenance).toEqual({ class: "authored", by: "maintainer" });
  });

  it("gives an observed change the moment of the read that found it", () => {
    // OPC-7: an observation never travels without one. The snapshot's own
    // `takenAt` is when it became true for us.
    const [change] = diffSnapshots(
      snap({ licence: "MIT" }, BEFORE),
      snap({ licence: "AGPL-3.0" }),
    )!;
    expect(change!.provenance).toEqual({
      class: "observed",
      source: "declared_repo",
      observedAt: AFTER,
    });
  });

  it("classifies every diffable field, and only two are observed", () => {
    // The table is the module's centre. A field added without a class would
    // render as authored by default, which would say a maintainer changed
    // something they never touched.
    for (const field of DIFFABLE_FIELDS) {
      expect([field, FIELD_CLASS[field]]).toEqual([field, FIELD_CLASS[field]]);
      expect(["authored", "observed"]).toContain(FIELD_CLASS[field]);
      expect(FIELD_LABEL[field]?.length ?? 0).toBeGreaterThan(0);
    }
    const observed = DIFFABLE_FIELDS.filter((f) => FIELD_CLASS[f] === "observed");
    expect([...observed].sort()).toEqual(["language", "licence"]);
  });

  it("counts open roles as AUTHORED even though it is a number", () => {
    // A role is opened and closed by a maintainer. A count of their own acts
    // is still their act.
    expect(FIELD_CLASS.openRoles).toBe("authored");
  });
});

describe("what counts as a change", () => {
  it("ignores the order of a list", () => {
    // A maintainer re-ordering their stack has not changed their stack, and a
    // diff that said so would train readers to ignore the section.
    expect(
      diffSnapshots(snap({ stack: ["rust", "postgres"] }, BEFORE), snap({ stack: ["postgres", "rust"] })),
    ).toEqual([]);
  });

  it("notices an addition to a list", () => {
    const changes = diffSnapshots(
      snap({ stack: ["rust"] }, BEFORE),
      snap({ stack: ["rust", "redis"] }),
    )!;
    expect(changes.map((c) => c.field)).toEqual(["stack"]);
    // RENDERED IN THE MAINTAINER'S OWN ORDER, even though the COMPARISON
    // sorts. The two are deliberately different: order does not make a change
    // (the test above), and a reader should still see the list the way its
    // maintainers wrote it (CT-1's respect for their words).
    expect(changes[0]!.to).toBe("rust, redis");
  });

  it("treats null and undefined as the same absence", () => {
    // A field that stopped being stored and a field that was never set are
    // the same thing to a reader, and a diff between them is noise.
    expect(diffSnapshots(snap({ category: null }, BEFORE), snap({}))).toEqual([]);
  });

  it("renders an absence as the dash, not as empty", () => {
    // OPC-C's convention, carried into the diff: a listing that cleared its
    // install line reads "— " rather than a blank the eye skips.
    const [change] = diffSnapshots(
      snap({ installLine: "npx kettle" }, BEFORE),
      snap({ installLine: null }),
    )!;
    expect(change!.to).toBe("—");
  });

  it("truncates a pitch rather than printing paragraphs in a diff line", () => {
    const long = "x".repeat(200);
    expect(describeValue(long).length).toBeLessThanOrEqual(80);
    expect(describeValue(long).endsWith("…")).toBe(true);
  });

  it("takes the diff over the closed list and nothing else", () => {
    // `pitchDigest` moves whenever the pitch does and would double every pitch
    // edit; `publishedAt` never moves. The diffable set is a product decision.
    expect(DIFFABLE_FIELDS).not.toContain("pitchDigest");
    expect(DIFFABLE_FIELDS).not.toContain("publishedAt");
    const changes = diffSnapshots(
      snap({ tagline: "a" } as Snapshot["fields"], BEFORE),
      snap({ tagline: "a", publishedAt: "changed" } as Snapshot["fields"]),
    );
    expect(changes).toEqual([]);
  });
});

describe("the digest leads with a change, not a count", () => {
  const change = (slug: string, field: "licence" | "tagline"): DigestChange => ({
    slug,
    field,
    label: FIELD_LABEL[field],
    provenance:
      field === "licence"
        ? { class: "observed", source: "declared_repo", observedAt: AFTER }
        : { class: "authored", by: "maintainer" },
    from: "a",
    to: "b",
  });

  it("puts observed changes first — they are facts about the world", () => {
    const lead = digestLead([change("zeta", "tagline"), change("alpha", "licence")]);
    expect(lead.map((c) => c.slug)).toEqual(["alpha", "zeta"]);
  });

  it("breaks ties alphabetically, never by popularity or recency", () => {
    const lead = digestLead([change("zeta", "tagline"), change("alpha", "tagline")]);
    expect(lead.map((c) => c.slug)).toEqual(["alpha", "zeta"]);
  });

  it("holds at three, because a lead is a lead", () => {
    const many = ["a", "b", "c", "d", "e"].map((s) => change(s, "tagline"));
    expect(digestLead(many)).toHaveLength(DIGEST_CHANGE_LIMIT);
  });

  it("answers empty for a week with no changes", () => {
    expect(digestLead([])).toEqual([]);
  });
});

describe("nothing here orders the product", () => {
  it("exports no comparator and names no formula", () => {
    // "Recently updated" is the most tempting sort in any directory and it is
    // an engagement term wearing a timestamp: it rewards touching a listing
    // rather than improving a product. OPC-4 asks that an ordering be
    // explainable in one sentence, and this one is explainable and still
    // wrong — so there is no id for it and nothing to sort by.
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, "snapshots.ts"), "utf-8");
    const code = source
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
      .join("\n");
    expect(code).not.toMatch(/FormulaId|formulaHref|byMostActive|byNewest/);
    // `digestLead` sorts, but over a lead of three — not over the catalog.
    expect(code).not.toMatch(/export function (sort|rank|order)/);
  });

  it("reads no clock of its own", () => {
    // Every moment in a diff comes from a snapshot's `takenAt`. A function
    // that read `Date.now()` could not be tested against a fixture and would
    // produce a different answer on every render of the same document.
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, "snapshots.ts"), "utf-8");
    expect(source).not.toMatch(/Date\.now\(\)|new Date\(\)/);
  });
});
