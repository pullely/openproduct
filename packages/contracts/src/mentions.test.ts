// CV3 — mentions (openproduct-worldclass).
//
// A mention looks like the autolinking CB0 refuses, and the difference is the
// whole design: an autolinked URL puts a DESTINATION in a stranger's text; a
// mention puts a handle there, and the destination is this estate's own
// namespace whether the parser guessed the boundary right or not.

import { describe, expect, it } from "vitest";

import { NOTIFICATION_COPY, NOTIFICATION_KINDS } from "./notifications.js";
import {
  RENDER_NODES,
  mentionedHandles,
  parseBody,
  plainText,
  resolveMentions,
  type RenderNode,
} from "./render-subset.js";

const flat = (nodes: RenderNode[]): RenderNode[] =>
  nodes.flatMap((n) => ("children" in n ? flat(n.children) : [n]));
const mentions = (source: string) =>
  flat(parseBody(source)).filter((n): n is Extract<RenderNode, { kind: "mention" }> => n.kind === "mention");

describe("what becomes a mention", () => {
  it("is a node kind, pinned like every other", () => {
    expect(RENDER_NODES).toContain("mention");
  });

  it("finds a handle and keeps the @ out of it", () => {
    expect(mentions("thanks @ada").map((m) => m.handle)).toEqual(["ada"]);
  });

  it("carries no href, ever", () => {
    // THE REASON THIS IS NOT THE AUTOLINKING CB0 REFUSES. The destination is
    // not in the text and is not the author's to supply.
    const node = mentions("hi @ada")[0]!;
    expect(Object.keys(node).sort()).toEqual(["claimed", "handle", "kind"]);
    expect(JSON.stringify(node)).not.toContain("http");
  });

  it("is unclaimed until something says otherwise", () => {
    // The safe default: a parser that never learns the answer under-links
    // rather than inventing a person.
    expect(mentions("hi @ada")[0]!.claimed).toBe(false);
  });

  it("stops at the handle grammar rather than running on", () => {
    expect(mentions("@ada, and @grace-h.").map((m) => m.handle)).toEqual(["ada", "grace-h"]);
    // A trailing dash is not part of a handle, so it stays text.
    expect(mentions("@ada- said").map((m) => m.handle)).toEqual(["ada"]);
  });

  it("does not find one inside an email address", () => {
    // `ada@example.com` is not a mention of `example`. The check looks BEHIND
    // for a word character rather than trying to recognise an email — because
    // recognising an email is the guessing this parser refuses.
    expect(mentions("write to ada@example.com")).toEqual([]);
    expect(mentions("foo@bar")).toEqual([]);
  });

  it("refuses a handle too short or too long to be one", () => {
    expect(mentions("@a")).toEqual([]);
    expect(mentions(`@${"x".repeat(40)}`)).toEqual([]);
    // And it stays the text it was rather than vanishing.
    expect(plainText(parseBody("@a"))).toBe("@a");
  });

  it("finds none inside code, where nothing is parsed", () => {
    expect(mentions("`@ada`")).toEqual([]);
    expect(mentions("```\n@ada\n```")).toEqual([]);
  });

  it("reads as the text it is in plain text", () => {
    // Whatever reads a body as a string must see the name that was written,
    // or a post naming somebody reads as a post with a hole in it.
    expect(plainText(parseBody("thanks @ada"))).toBe("thanks @ada");
  });
});

describe("who a body mentions", () => {
  it("collects them in order, once each", () => {
    expect(mentionedHandles(parseBody("@ada and @grace and @ada again"))).toEqual(["ada", "grace"]);
  });

  it("reaches inside every container", () => {
    expect(mentionedHandles(parseBody("> quoting @ada"))).toEqual(["ada"]);
    expect(mentionedHandles(parseBody("- **@grace**"))).toEqual(["grace"]);
  });

  it("has nothing to say about a body with none", () => {
    expect(mentionedHandles(parseBody("no names here"))).toEqual([]);
  });
});

describe("an unclaimed handle is text, never a person (OPC-5)", () => {
  it("marks only the handles that resolve", () => {
    const resolved = resolveMentions(parseBody("@ada and @nobody"), new Set(["ada"]));
    const found = flat(resolved).filter((n) => n.kind === "mention") as Array<
      Extract<RenderNode, { kind: "mention" }>
    >;
    expect(found.map((m) => [m.handle, m.claimed])).toEqual([
      ["ada", true],
      ["nobody", false],
    ]);
  });

  it("marks nothing when nothing resolves", () => {
    const resolved = resolveMentions(parseBody("@ada"), new Set());
    expect((flat(resolved)[0] as { claimed: boolean }).claimed).toBe(false);
  });

  it("returns a new tree rather than editing the one it was given", () => {
    // The parsed body is shared with `plainText` and the notification path; a
    // function that mutated it would leave whichever caller ran second
    // looking at somebody else's answer.
    const parsed = parseBody("@ada");
    const resolved = resolveMentions(parsed, new Set(["ada"]));
    expect(resolved).not.toBe(parsed);
    expect((flat(parsed)[0] as { claimed: boolean }).claimed).toBe(false);
  });

  it("reaches inside containers to do it", () => {
    const resolved = resolveMentions(parseBody("> hi @ada"), new Set(["ada"]));
    const found = flat(resolved).find((n) => n.kind === "mention") as { claimed: boolean };
    expect(found.claimed).toBe(true);
  });
});

describe("delivery is a new kind, not a new address (I3)", () => {
  it("is in the vocabulary with its copy", () => {
    expect(NOTIFICATION_KINDS).toContain("mention");
    expect(NOTIFICATION_COPY.mention.subject).toBe("Somebody mentioned you in a discussion");
  });

  it("names nobody in the subject line", () => {
    // A name in a subject line is a name in somebody's inbox, searchable and
    // forwardable. The page says who it was, under the page's own rules.
    const { subject, body } = NOTIFICATION_COPY.mention;
    expect(subject).not.toMatch(/@|\bAda\b/);
    expect(body).not.toMatch(/@/);
  });
});
