// The upvote on a comment (openproduct-launch DQ1).
//
// The ACT is pinned in tests/core, the READS in packages/db, the ORDERING
// promise at /docs/formulas. What is pinned here is what the web layer owns:
//
//   - the count is public and the state is not (I6)
//   - the control is not drawn on a removed comment
//   - it does not spend the reserved accent (XP-1)
//   - the overlay asks a THIRD bounded question, in its own namespace
//   - the write route never redirects off this origin

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { COMMENT_VOTE_NOTE, ME_OVERLAY_KEYS } from "@openproduct/contracts";
import { overlayPath } from "@openproduct-web/app/ui/overlay";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");

/** The file with its comments removed — a guard about markup must not read
 *  prose, because the comment above a decision names the thing it rejected. */
const markupOf = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const CONTROL = "ui/comment-vote.tsx";
const ROUTE = "me/comment-vote/route.ts";

describe("the count is public and the state is not", () => {
  it("renders the count from the page's own document, and the state from the overlay", () => {
    const src = read(CONTROL);
    // `votes + delta` since OPP2: the base is the page's own cached number
    // and the visitor's own vote moves it optimistically.
    expect(src).toContain("{votes + delta}");
    expect(src).toContain("hasVotedOnPost(state, postId)");
  });

  it("the server render is the ANONYMOUS one, and only the label changes", () => {
    // A thread's anonymous and signed-in renders stay byte-identical until
    // hydration, which is what keeps the page one cacheable document (I6).
    const src = markupOf(CONTROL);
    expect(src).toContain("aria-pressed={voted}");
    expect(src).not.toMatch(/cookies\(|SESSION_COOKIE|decodeSession/);
  });

  it("renders AT ZERO, because something observes a vote now", () => {
    // A zero here has been counted and found empty, unlike TP0's follower
    // count before FL0 (OPC-C).
    expect(markupOf(CONTROL)).not.toMatch(/votes > 0 \?/);
  });
});

describe("XP-1 — it does not spend the reserved accent", () => {
  it("draws no endorse colour anywhere", () => {
    // The accent means ENDORSEMENT — a listing's upvote, the thing that moves
    // the board and the directory. A comment's upvote moves nothing at all,
    // and spending the accent here would make two different-weight acts look
    // identical.
    const SPENDS_GOLD =
      /(?:\b(?:bg|text|border|fill|stroke|ring|outline|from|via|to|shadow|accent|caret|decoration)-endorse\b)|--endorse/g;
    expect(markupOf(CONTROL).match(SPENDS_GOLD)).toBeNull();
  });
});

describe("what it says about itself", () => {
  it("says the upvote orders nothing, where somebody reads it", () => {
    // A reader who assumes otherwise is reading a ranking this product did
    // not make.
    expect(COMMENT_VOTE_NOTE).toContain("do not change the order");
    expect(read(CONTROL)).toContain("COMMENT_VOTE_NOTE");
  });

  it("is absent on a REMOVED comment, on both surfaces", () => {
    // There are no words there to agree with, and a control that let somebody
    // upvote a tombstone would be a number about nothing.
    for (const file of ["[slug]/comments.tsx", "threads/[id]/page.tsx"]) {
      expect([file, read(file).includes('post.state === "removed" ? null : (')]).toEqual([
        file,
        true,
      ]);
    }
  });

  it("is the SAME control on the product page and on a thread page", () => {
    // One act, one component. Two would be two things to keep in step.
    for (const file of ["[slug]/comments.tsx", "threads/[id]/page.tsx"]) {
      expect([file, read(file).includes("<CommentVote")]).toEqual([file, true]);
    }
  });
});

describe("the overlay's third bounded question", () => {
  it("`postVotes` is a pinned key, in its own namespace", () => {
    expect(ME_OVERLAY_KEYS).toContain("postVotes");
  });

  it("post ids ride in their OWN parameter, never merged with slugs", () => {
    // A post id and a slug are different namespaces, so one list holding both
    // would make the answer's meaning depend on which kind of page asked.
    expect(overlayPath(["a-thing"], ["topic:x"], ["11111111-2222-4333-8444-555555555555"])).toBe(
      "/me/overlay?ids=a-thing&follows=topic%3Ax&posts=11111111-2222-4333-8444-555555555555",
    );
    // A page asking about none sends none.
    expect(overlayPath(["a-thing"])).toBe("/me/overlay?ids=a-thing");
  });

  it("the control asks about ONE post and no slugs", () => {
    expect(read(CONTROL)).toContain("useOverlay([], [], [postId])");
  });
});

describe("the write route", () => {
  it("never redirects off this origin", () => {
    // An open redirect on a control every visitor can press is the cheapest
    // phishing primitive there is.
    const route = read(ROUTE);
    expect(route).toContain('raw.startsWith("/") && !raw.startsWith("//")');
  });

  it("bounces through sign-in and comes back to the comment", () => {
    const route = read(ROUTE);
    // Behind `me/act.ts` since OPP2; `routes.test.ts` pins that it is the
    // only place a sign-in redirect is built.
    expect(route).toContain('actAnswer(request, "signin"');
  });

  it("checks the post id's grammar before it reaches the network", () => {
    expect(read(ROUTE)).toContain("POST_ID_RE.test(postId)");
  });

  it("is a POST — a GET-safe verb never casts a vote", () => {
    const route = read(ROUTE);
    expect(route).toContain("export async function POST");
    expect(route).not.toContain("export async function GET");
  });
});
