import { describe, expect, it } from "vitest";

import { FORMULAS } from "./provenance.js";

import {
  POSTABLE_STATES,
  POSTING_NOTICE,
  POST_STATES,
  PUBLIC_POST_KEYS,
  PUBLIC_THREAD_KEYS,
  THREAD_STATES,
  ALL_THREAD_TAGS,
  COMMENT_VOTED_LABEL,
  COMMENT_VOTE_LABEL,
  COMMENT_VOTE_NOTE,
  LAUNCH_THREAD_TAG,
  canVoteOnComment,
  THREAD_TAGS,
  isChosenThreadTag,
  launchThreadTitle,
  THREAD_TAG_LABELS,
  threadAcceptsPosts,
} from "./discussions.js";

describe("CB-3 — the tag vocabulary is closed", () => {
  it("is the six the epic locked, and no more", () => {
    expect([...THREAD_TAGS]).toEqual([
      "design",
      "proposal",
      "question",
      "governance",
      "contributing",
      "accessibility",
    ]);
  });

  it("labels every tag that can EXIST, and nothing that cannot", () => {
    // A surface with its own gloss is a surface that drifts from the CHECK
    // constraint that actually accepts the value. `ALL_THREAD_TAGS` is that
    // constraint's set: the six a person picks plus DQ0b's `launch`, which
    // the system writes and which still has to render its own name wherever a
    // thread names its tag.
    expect(Object.keys(THREAD_TAG_LABELS).sort()).toEqual([...ALL_THREAD_TAGS].sort());
  });

  it("keeps `launch` OUT of the six a person may pick (DQ0b)", () => {
    // `THREAD_TAGS` is what the composer's select offers and what the write
    // path accepts from a form. A `launch` in it would let somebody hand-make
    // a second comment thread, and "one discussion per listing" would become
    // a thing the schema enforced and the UI fought.
    expect(THREAD_TAGS).not.toContain(LAUNCH_THREAD_TAG);
    expect(ALL_THREAD_TAGS).toContain(LAUNCH_THREAD_TAG);
    expect(isChosenThreadTag("question")).toBe(true);
    expect(isChosenThreadTag(LAUNCH_THREAD_TAG)).toBe(false);
    expect(isChosenThreadTag("nonsense")).toBe(false);
  });

  it("gives a launch thread a title nobody typed, from the listing's own name", () => {
    // A thread needs a title and the box asked for none. "Untitled" in the
    // moderation queue is a row nobody can act on.
    expect(launchThreadTitle("acme-thing")).toBe("Comments on acme-thing");
  });
});

describe("DQ1 — the upvote on a comment", () => {
  it("carries the count in the pinned key set", () => {
    expect(PUBLIC_POST_KEYS).toContain("votes");
  });

  it("says, where somebody reads it, that it orders nothing", () => {
    // A reader who assumes otherwise is reading a ranking this product did
    // not make. `/docs/formulas` says the same thing at length.
    expect(COMMENT_VOTE_NOTE).toContain("do not change the order");
    expect(COMMENT_VOTE_NOTE).toContain("one per person");
  });

  it("uses the SAME word as every other upvote (UV0's rename)", () => {
    expect(COMMENT_VOTE_LABEL).toBe("Upvote");
    expect(COMMENT_VOTED_LABEL).toBe("Upvoted");
  });

  it("refuses a REMOVED comment and an author's own", () => {
    // There are no words on a removed comment to agree with, and a self-vote
    // inflates a number on your own words with your own click. The schema
    // refuses the second as well; this is the surface's half.
    const visible = { state: "visible" as const };
    const removed = { state: "removed" as const };
    expect(canVoteOnComment(visible, false)).toBe(true);
    expect(canVoteOnComment(visible, true)).toBe(false);
    expect(canVoteOnComment(removed, false)).toBe(false);
  });

  it("the published sentence says why there is NO integrity discount", () => {
    // The one count on this estate that deliberately has none, and the reason
    // has to be readable rather than inferred from an absence.
    const sentence = FORMULAS["comment.votes"].sentence;
    expect(sentence).toContain("ORDERS NOTHING");
    expect(sentence).toContain("no integrity discount");
    expect(sentence).toContain("If comments are ever ordered by it");
  });
});

describe("the two state machines", () => {
  it("accepts posts only where a conversation is still happening", () => {
    expect(POSTABLE_STATES.every((s) => THREAD_STATES.includes(s))).toBe(true);
    expect(threadAcceptsPosts("open")).toBe(true);
    // An answered thread still takes posts: somebody answering is not the
    // same as everybody being finished.
    expect(threadAcceptsPosts("answered")).toBe(true);
    expect(threadAcceptsPosts("locked")).toBe(false);
    expect(threadAcceptsPosts("removed")).toBe(false);
  });

  it("gives a post no state between visible and removed", () => {
    // No `hidden`, no `pending`. A post held for review is a post the author
    // cannot tell from a lost one, and they will post it again.
    expect([...POST_STATES]).toEqual(["visible", "removed"]);
  });
});

describe("what a public shape carries", () => {
  it("never carries the author's subject id", () => {
    // I3 — the opaque id does not leave the estate. The page shows the handle
    // CG1 resolves, or plain text when there is none (XP-5).
    expect(PUBLIC_POST_KEYS).not.toContain("authorSubjectId");
    expect(PUBLIC_THREAD_KEYS).not.toContain("authorSubjectId");
  });

  it("never ships the authored source beside the rendered tree", () => {
    // The source is what the AUTHOR edits, not what a reader receives.
    // Shipping both would put unrendered text on a public page for anybody
    // who read the JSON.
    expect(PUBLIC_POST_KEYS).not.toContain("source");
    expect(PUBLIC_POST_KEYS).not.toContain("rawBody");
  });

  it("says a post was edited", () => {
    // A decision trail whose posts can be rewritten silently is a trail
    // nobody can rely on.
    expect(PUBLIC_POST_KEYS).toContain("editedAt");
  });
});

describe("the standing notice is a rule, not a warning", () => {
  it("says what happens, in the present tense", () => {
    expect(POSTING_NOTICE).toBe("Posts here are public and signed with your profile.");
    // A caution invites somebody to weigh a risk. This is not a risk to
    // weigh, it is how the surface works.
    for (const hedge of ["careful", "may be", "could be", "please note", "warning"]) {
      expect(POSTING_NOTICE.toLowerCase()).not.toContain(hedge);
    }
  });
});
