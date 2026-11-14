import { describe, expect, it } from "vitest";

import { INBOX_ITEM_KEYS } from "./inbox.js";
import { PUBLIC_POST_KEYS, PUBLIC_THREAD_KEYS, THREAD_TAGS } from "./discussions.js";
import {
  CREW_PRIVATE_THREAD_NOTICE_KEYS,
  PRIVATE_THREAD_KEYS,
  TALK_API,
  TALK_FILTERS,
  THREAD_KINDS,
  THREAD_KIND_LABELS,
  THREAD_KIND_TAG,
  THREAD_VISIBILITIES,
  isThreadKind,
  isThreadVisibility,
  privateThreadPath,
  talkPath,
  talkRepliesLabel,
} from "./talk.js";

describe("Talk — kinds and visibility (design §7)", () => {
  it("has three kinds and two visibilities, closed", () => {
    expect(THREAD_KINDS).toEqual(["question", "issue", "suggestion"]);
    expect(THREAD_VISIBILITIES).toEqual(["public", "private"]);
    expect(Object.keys(THREAD_KIND_LABELS).sort()).toEqual([...THREAD_KINDS].sort());
    expect(isThreadKind("idea")).toBe(false);
    expect(isThreadVisibility("crew")).toBe(false);
    expect(isThreadVisibility("private")).toBe(true);
  });

  it("files every kind under one of the six forum tags", () => {
    for (const kind of THREAD_KINDS) {
      expect(THREAD_TAGS as readonly string[]).toContain(THREAD_KIND_TAG[kind]);
    }
  });

  it("the filter is All, Public, Private", () => {
    expect(TALK_FILTERS).toEqual(["all", "public", "private"]);
  });

  it("labels the row's action by its replies", () => {
    expect(talkRepliesLabel(0)).toBe("Reply");
    expect(talkRepliesLabel(0, true)).toBe("Answer");
    expect(talkRepliesLabel(1)).toBe("1 reply");
    expect(talkRepliesLabel(3, true)).toBe("3 replies");
  });
});

describe("Talk — the privacy rule on the wire (design §7)", () => {
  it("a PUBLIC thread shape has no visibility key: everything in it is public", () => {
    expect(PUBLIC_THREAD_KEYS).not.toContain("visibility");
    expect(PUBLIC_THREAD_KEYS).toContain("kind");
    expect(PUBLIC_THREAD_KEYS).toContain("resolvedAt");
  });

  it("a private thread shape is the public one plus who it is for", () => {
    const extra = PRIVATE_THREAD_KEYS.filter((key) => !(PUBLIC_THREAD_KEYS as readonly string[]).includes(key));
    expect([...extra].sort()).toEqual(["awaitingCrew", "mine", "visibility"]);
    expect([...PRIVATE_THREAD_KEYS]).toEqual([...PRIVATE_THREAD_KEYS].sort());
    // No subject id on either (I3).
    expect(PRIVATE_THREAD_KEYS).not.toContain("authorSubjectId");
    expect(PUBLIC_POST_KEYS).not.toContain("authorSubjectId");
  });

  it("the crew's Needs you row and an inbox row have nowhere to put a title or a body", () => {
    expect(CREW_PRIVATE_THREAD_NOTICE_KEYS).toEqual(["authorHandle", "authorName", "createdAt", "id"]);
    for (const key of ["title", "body", "text"]) {
      expect(CREW_PRIVATE_THREAD_NOTICE_KEYS).not.toContain(key);
      expect(INBOX_ITEM_KEYS).not.toContain(key);
    }
  });

  it("private threads are served only under the signed-in thread routes, never a public path", () => {
    const paths = [
      TALK_API.privateThreads("acme-thing"),
      TALK_API.privateThread("0b0b0b0b-0000-4000-8000-000000000001"),
      TALK_API.privateReply("0b0b0b0b-0000-4000-8000-000000000001"),
    ];
    for (const path of paths) {
      expect(path.startsWith("/v1/openproduct/threads/private")).toBe(true);
      expect(path).not.toContain("/public/");
    }
    expect(TALK_API.resolved("x")).toBe("/v1/openproduct/threads/x/resolved");
  });

  it("no route in the API changes a thread's visibility", () => {
    expect(Object.keys(TALK_API).sort()).toEqual(["privateReply", "privateThread", "privateThreads", "resolved", "start"]);
  });

  it("a private thread's address is the same shape for every id", () => {
    expect(privateThreadPath("abc")).toBe("/threads/private/abc");
    expect(talkPath("acme", "shipping")).toBe("/acme/talk");
    expect(talkPath("acme", "idea")).toBe("/acme#talk");
  });
});
