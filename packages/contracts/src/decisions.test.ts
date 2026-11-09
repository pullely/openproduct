import { describe, expect, it } from "vitest";

import {
  DECISION_KIND,
  DECLINE_PUBLISH_NOTE,
  JOIN_DECISIONS,
  MAX_DECLINE_REASON,
  MIN_DECLINE_REASON,
  decisionPublication,
  primaryAction,
} from "./decisions.js";

const APPLICANT = "usr_0123456789abcdef0123456789abcdef";
const base = { applicantSubjectId: APPLICANT, openingTitle: "Someone who likes tests" };

describe("an acceptance is published, and names the person", () => {
  it("writes a `joined` row attributed to the applicant", () => {
    const out = decisionPublication({ ...base, decision: "approved" });
    expect(out).toEqual({
      publish: true,
      kind: "joined",
      summary: "Joined as Someone who likes tests",
      actorSubjectId: APPLICANT,
    });
  });

  it("summarises by the OPENING, never by the person's name", () => {
    // SN3's filter resolves the name at READ time from the consent edge, so a
    // row written today cannot publish somebody who has not confirmed yet
    // (OPC-5). A name baked into the summary would bypass that entirely.
    const out = decisionPublication({ ...base, decision: "approved" });
    expect(out.summary).not.toContain(APPLICANT);
    expect(out.summary).toContain("Someone who likes tests");
  });
});

describe("a decline is silent by default", () => {
  it("publishes nothing when the maintainer says nothing", () => {
    // The overwhelmingly common case is a maintainer who declined and said
    // nothing. It must cost them nothing and produce nothing.
    for (const publishReason of [undefined, null, "", "   "]) {
      const out = decisionPublication({ ...base, decision: "denied", publishReason });
      expect(out.publish).toBe(false);
      expect(out.summary).toBe("");
    }
  });

  it("stays silent for a reason too short to be a reason", () => {
    const out = decisionPublication({ ...base, decision: "denied", publishReason: "no" });
    expect(out.publish).toBe(false);
  });

  it("bounds a very long one rather than publishing it", () => {
    const out = decisionPublication({
      ...base,
      decision: "denied",
      publishReason: "x".repeat(MAX_DECLINE_REASON + 1),
    });
    expect(out.publish).toBe(false);
  });
});

describe("a published decline NEVER names the applicant", () => {
  const reason = "We are only taking people who have shipped a Rust crate before.";

  it("publishes the maintainer's words, unattributed", () => {
    const out = decisionPublication({ ...base, decision: "denied", publishReason: reason });
    expect(out.publish).toBe(true);
    expect(out.kind).toBe("declined");
    expect(out.summary).toBe(reason);
    // THE LINE THE WHOLE MODULE EXISTS FOR. "Ada was declined" is a fact
    // about Ada, published at an address she does not control, permanently.
    expect(out.actorSubjectId).toBeNull();
  });

  it("carries the applicant's id nowhere at all", () => {
    const out = decisionPublication({ ...base, decision: "denied", publishReason: reason });
    expect(JSON.stringify(out)).not.toContain(APPLICANT);
  });

  it("takes the maintainer's own words and never a canned category", () => {
    // A template reason is the estate's opinion wearing a maintainer's name,
    // and OPC-6 says the estate holds no such authority.
    const own = "Not right now — we are mid-rewrite and cannot onboard anybody.";
    const out = decisionPublication({ ...base, decision: "denied", publishReason: own });
    expect(out.summary).toBe(own);
  });

  it("accepts a reason exactly at the minimum", () => {
    const out = decisionPublication({
      ...base,
      decision: "denied",
      publishReason: "y".repeat(MIN_DECLINE_REASON),
    });
    expect(out.publish).toBe(true);
  });
});

describe("the vocabulary is JR's", () => {
  it("uses JR's own words, so a state it does not have cannot exist here", () => {
    // CB-5: JR is the source of truth and this renders it. `accepted` and
    // `rejected` are not JR's words and are not representable.
    expect([...JOIN_DECISIONS]).toEqual(["approved", "denied"]);
    expect(DECISION_KIND).toEqual({ approved: "joined", denied: "declined" });
  });
});

describe("the header's primary action follows the door", () => {
  it("offers contribution when there is somewhere to offer", () => {
    expect(primaryAction({ openRoleCount: 2 })).toEqual({
      label: "Offer to contribute",
      kind: "offer",
    });
  });

  it("offers the conversation when there is not", () => {
    // A header whose main button leads to a door that is not there wastes the
    // one action most visitors take.
    expect(primaryAction({ openRoleCount: 0 })).toEqual({
      label: "Start a discussion",
      kind: "thread",
    });
  });
});

describe("what the maintainer is told before choosing", () => {
  it("says it is off by default and that nobody is named", () => {
    expect(DECLINE_PUBLISH_NOTE).toContain("off unless you write something");
    expect(DECLINE_PUBLISH_NOTE).toContain("not named");
  });
});
