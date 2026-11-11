import { describe, expect, it } from "vitest";

import {
  FOLLOW_KINDS,
  FOLLOW_MAX_KEYS,
  FOLLOW_VALUE_RE,
  followHref,
  followKey,
  followPath,
  followerLine,
  parseFollowKey,
  parseFollowKeys,
} from "./follows.js";
import { PROFILE_DISCLOSURE, PUBLIC_CONTRIBUTOR_KEYS } from "./profiles.js";
import { DEFAULT_VELOCITY_RULES } from "./velocity.js";

describe("one act, two targets", () => {
  it("has exactly three kinds, and adding a fourth costs a migration", () => {
    // The union matches the schema's CHECK. A closed vocabulary is the point:
    // a kind is a product decision, not a typo in a handler. FL0 shipped two;
    // PP1 (openproduct-worldclass-v2) added the listing, with 1890.
    expect([...FOLLOW_KINDS]).toEqual(["topic", "person", "listing"]);
  });

  it("a listing is followed by its slug and links to its own address (PP1)", () => {
    const target = { kind: "listing", value: "acme-thing" } as const;
    expect(parseFollowKey(followKey(target))).toEqual(target);
    expect(followHref(target)).toBe("/acme-thing");
  });

  it("keys a target as `kind:value`, and reads it back", () => {
    for (const kind of FOLLOW_KINDS) {
      const target = { kind, value: "ada" } as const;
      expect(parseFollowKey(followKey(target))).toEqual(target);
    }
  });

  it("refuses a key it did not write", () => {
    // The overlay's keys come from whatever a page rendered, so a malformed
    // one costs that one answer rather than the visitor's whole overlay.
    for (const bad of ["", ":", "ada", "topic:", ":ada", "product:acme", "topic:Dev-Tools"]) {
      expect([bad, parseFollowKey(bad)]).toEqual([bad, null]);
    }
  });

  it("a value that could never be a topic or a handle is refused early", () => {
    for (const bad of ["Ada", "-ada", "a b", "a".repeat(65)]) {
      expect([bad, FOLLOW_VALUE_RE.test(bad)]).toEqual([bad, false]);
    }
    for (const ok of ["ada", "dev-tools", "a", "a".repeat(64)]) {
      expect([ok, FOLLOW_VALUE_RE.test(ok)]).toEqual([ok, true]);
    }
  });
});

describe("the overlay's parameter", () => {
  it("dedupes and drops what it cannot read", () => {
    expect(parseFollowKeys("topic:a,topic:a,nonsense,person:ada")).toEqual([
      { kind: "topic", value: "a" },
      { kind: "person", value: "ada" },
    ]);
  });

  it("is bounded, so a page cannot ask an unbounded question", () => {
    const many = Array.from({ length: FOLLOW_MAX_KEYS + 20 }, (_, i) => `topic:t${i}`).join(",");
    expect(parseFollowKeys(many)).toHaveLength(FOLLOW_MAX_KEYS);
  });

  it("an absent parameter is no question at all", () => {
    expect(parseFollowKeys(null)).toEqual([]);
    expect(parseFollowKeys("")).toEqual([]);
  });
});

describe("the addresses", () => {
  it("a person is addressed by HANDLE, never by a subject id", () => {
    // CG1 keeps the subject id off the public projection deliberately. The
    // write path takes a handle and core translates, so no public surface
    // teaches a browser to send an internal identifier.
    expect(followPath({ kind: "person", value: "ada" })).toBe("/me/follows/person/ada");
    expect(followHref({ kind: "person", value: "ada" })).toBe("/@ada");
  });

  it("a topic's follow address and its page address agree", () => {
    expect(followPath({ kind: "topic", value: "dev-tools" })).toBe("/me/follows/topic/dev-tools");
    expect(followHref({ kind: "topic", value: "dev-tools" })).toBe("/topics/dev-tools");
  });
});

describe("the count", () => {
  it("renders a ZERO, because from FL0 a zero has been measured", () => {
    // TP0 rendered no count at all — nothing observed a follow, so a zero
    // would have been a claim rather than a measurement (OPC-C). This is the
    // milestone that makes it a fact.
    expect(followerLine(0)).toBe("0 followers");
    expect(followerLine(1)).toBe("1 follower");
    expect(followerLine(12)).toBe("12 followers");
  });
});

describe("the velocity rule", () => {
  const rules = DEFAULT_VELOCITY_RULES.filter((r) => r.action === "follow");

  it("bounds the SUBJECT and nothing else", () => {
    // A target bound catches a brigade moving a PUBLIC number. A follower
    // count ranks nothing and decides nothing about what anybody else is
    // shown, so a target rule would slow a crowd discovering a topic and stop
    // no attack.
    expect(rules.map((r) => r.dimension)).toEqual(["subject"]);
  });

  it("is generous enough for the honest burst the topic index invites", () => {
    // Somebody who has just found `/topics` will follow six of them in twenty
    // seconds, and a limit that treated that as suspicious would punish the
    // exact behaviour the page is for.
    expect(rules[0]!.burst.limit).toBeGreaterThanOrEqual(20);
  });

  it("is published, and its refusal accuses nobody", () => {
    expect(rules[0]!.publish).toBe(true);
    expect(rules[0]!.refusal).not.toMatch(/abuse|spam|suspicious|violat/i);
  });
});

describe("OD6 — what a person is told before it is public", () => {
  it("the follower count has a disclosure line, like every projected field", () => {
    const disclosed = new Set(PROFILE_DISCLOSURE.map((line) => line.key));
    expect(PUBLIC_CONTRIBUTOR_KEYS).toContain("followers");
    expect(disclosed.has("followers")).toBe(true);
  });

  it("its line says what CANNOT be seen, which no other line needs to", () => {
    // Every other field is something the person wrote or did. This one is a
    // number about what OTHER people did, and the question it raises — "will
    // they know who?" — has to be answered where they are deciding.
    const line = PROFILE_DISCLOSURE.find((l) => l.key === "followers")!;
    expect(line.label).toMatch(/never who they are/);
    expect(line.label).toMatch(/not even to you/);
  });
});
