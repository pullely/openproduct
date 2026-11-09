import { describe, expect, it } from "vitest";

import {
  INBOX_BADGE_CAP,
  INBOX_EMPTY,
  INBOX_KINDS,
  INBOX_LIMIT,
  inboxBadge,
  inboxEventKey,
  inboxHref,
  inboxSentence,
} from "./inbox.js";

describe("the four kinds", () => {
  it("are the design's five, minus the one that breaks FL0's promise", () => {
    expect(INBOX_KINDS).toEqual(["rank.first", "post.reply", "launch.topic", "post.upvoted", "launch.listing"]);
  });

  it("HAS NO `follow.maker`, and that absence is the decision", () => {
    // FL0 published a promise on the page where somebody decides to make
    // their profile public: "How many people follow you — a count only, never
    // who they are, not even to you." A per-follow message breaks that
    // outright when it names the follower, and quietly when it does not: a
    // message at 14:03 is a TIMING signal, and timing plus any other trace
    // narrows a private act to a person.
    expect(INBOX_KINDS).not.toContain("follow.maker");
    for (const kind of INBOX_KINDS) {
      expect([kind, kind.startsWith("follow")]).toEqual([kind, false]);
    }
  });
});

describe("the phrasebook", () => {
  it("composes every kind, and stores none of it", () => {
    for (const kind of INBOX_KINDS) {
      const sentence = inboxSentence({ kind, actor: "ada", targetRef: "acme-thing", figure: 3 });
      expect([kind, sentence.length > 10]).toEqual([kind, true]);
      expect([kind, sentence.endsWith(".")]).toEqual([kind, true]);
    }
  });

  it("`post.upvoted` says HOW MANY, never who", () => {
    // An upvote's count is public and its voters are listed nowhere; naming
    // them here would be the one place on the estate that did.
    const sentence = inboxSentence({
      kind: "post.upvoted",
      actor: "ada",
      targetRef: "acme-thing",
      figure: 4,
    });
    expect(sentence).not.toContain("ada");
    expect(sentence).toContain("4 upvotes");
    // One is not "1 upvotes", and it is not worth naming a number for.
    expect(
      inboxSentence({ kind: "post.upvoted", actor: null, targetRef: "acme-thing", figure: 1 }),
    ).toBe("A comment you wrote on acme-thing was upvoted.");
  });

  it("`post.reply` names the actor, because the page already does", () => {
    // The reply is on a public page with their handle beside it, so this
    // publishes nothing a reader could not see by following the link. CB4's
    // MAIL does not name them, and that difference is deliberate.
    expect(
      inboxSentence({ kind: "post.reply", actor: "ada", targetRef: "acme-thing", figure: null }),
    ).toContain("@ada");
    // A handle that stopped resolving is an ordinary state (CG1: a released
    // handle, a profile turned off), and the sentence still reads.
    expect(
      inboxSentence({ kind: "post.reply", actor: null, targetRef: "acme-thing", figure: null }),
    ).toBe("Somebody replied where you commented on acme-thing.");
  });

  it("`rank.first` reads without a figure, because a sweep may not have one", () => {
    expect(
      inboxSentence({ kind: "rank.first", actor: null, targetRef: "acme-thing", figure: null }),
    ).toBe("acme-thing reached #1 on its launch day.");
    expect(
      inboxSentence({ kind: "rank.first", actor: null, targetRef: "acme-thing", figure: 1 }),
    ).toContain("1 upvote.");
  });

  it("`launch.topic` names the topic and nobody at all", () => {
    const sentence = inboxSentence({
      kind: "launch.topic",
      actor: "ada",
      targetRef: "dev-tools",
      figure: null,
    });
    expect(sentence).toContain("dev-tools");
    expect(sentence).not.toContain("ada");
  });
});

describe("where a row goes", () => {
  it("every target kind has a real address (XP-5)", () => {
    expect(inboxHref({ kind: "launch.topic", targetKind: "topic", targetRef: "dev-tools" })).toBe(
      "/topics/dev-tools",
    );
    expect(inboxHref({ kind: "post.reply", targetKind: "post", targetRef: "acme-thing" })).toBe(
      "/acme-thing#discussion",
    );
    expect(inboxHref({ kind: "rank.first", targetKind: "listing", targetRef: "acme-thing" })).toBe(
      "/acme-thing",
    );
  });
});

describe("once per event per person", () => {
  it("the key is built from the EVENT, never from the clock", () => {
    // A key with a timestamp in it changes on a retry, which is the same as
    // having no key at all.
    expect(inboxEventKey("rank.first", "2026-08-17")).toBe("rank.first:2026-08-17");
    expect(inboxEventKey("post.reply", "pst_1")).toBe("post.reply:pst_1");
    // Same event, same key, every time.
    expect(inboxEventKey("post.reply", "pst_1")).toBe(inboxEventKey("post.reply", "pst_1"));
  });
});

describe("the badge", () => {
  it("is absent at zero rather than a `0`", () => {
    expect(inboxBadge(0)).toBeNull();
    expect(inboxBadge(-1)).toBeNull();
  });

  it("caps, because a badge nobody can read at a glance is not a badge", () => {
    expect(inboxBadge(1)).toBe("1");
    expect(inboxBadge(INBOX_BADGE_CAP)).toBe("50");
    expect(inboxBadge(INBOX_BADGE_CAP + 1)).toBe("50+");
    expect(inboxBadge(1284)).toBe("50+");
  });
});

describe("what the page says when there is nothing", () => {
  it("is not an apology and not a suggestion", () => {
    // An empty inbox is the ordinary state, not a failure to do something.
    expect(INBOX_EMPTY).toContain("Nothing yet");
    expect(INBOX_EMPTY).not.toMatch(/sorry|try|should/i);
  });

  it("bounds the read, because this page grows with a person's history", () => {
    expect(INBOX_LIMIT).toBe(50);
  });
});
