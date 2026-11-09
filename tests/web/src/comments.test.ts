// The product page's comment section (openproduct-launch DQ0b).
//
// The VOCABULARY is pinned in packages/contracts, the READS in packages/db and
// the WRITE in tests/core. What is pinned here is what the web layer owns:
//
//   - the section is the design's box, with no tag and no title
//   - the page reads ONE document for its discussions and its comments
//   - a locked discussion loses its box and keeps its words
//   - the design's inert controls are absent rather than drawn dead
//   - the composer reads no session, and the POST reads it once (I6)

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LAUNCH_THREAD_TAG,
  THREAD_TAGS,
  THREAD_TAG_LABELS,
} from "@openproduct/contracts";

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

const SECTION = "[slug]/comments.tsx";
/** The box itself. It became its own island when the draft had to survive the
 *  sign-in round trip — see the file's own header — so the field assertions
 *  read it rather than the section that renders it. */
const BOX = "[slug]/comment-draft.tsx";
const PAGE = "[slug]/page.tsx";
const ROUTE = "comment/route.ts";

describe("the box asks for a sentence and nothing else", () => {
  it("has no select and no title field — and its tag is optional radios, after the box (PP0)", () => {
    // The friction DQ0b removed stays removed: you type and you have said
    // something. PP0 folded the titled discussions into this box, so the
    // classification they carried is offered here — as radios with no
    // default and no `required`, below the field, never in front of it.
    const src = markupOf(SECTION);
    const box = markupOf(BOX);
    expect(src).not.toContain("<select");
    expect(src).not.toContain('name="title"');
    expect(box).not.toContain("<select");
    expect(box).not.toContain('name="tag"');
    expect(box).not.toContain('name="title"');
    expect(box).toContain('name="body"');
    expect(src).toContain('name="slug"');
    expect(src).toContain('type="radio" name="tag"');
    expect(src.indexOf("<CommentDraft")).toBeLessThan(src.indexOf('type="radio" name="tag"'));
    const radios = src.slice(src.indexOf("<fieldset"), src.indexOf("</fieldset>"));
    expect(radios).not.toContain("required");
    expect(radios).not.toContain("defaultChecked");
  });

  it("posts to its own address, not to `/threads/new`", () => {
    expect(markupOf(SECTION)).toContain('action="/comment"');
  });

  it("says the act is public BEFORE anybody types", () => {
    // CB-2's standing notice is a rule, not a caution.
    const src = read(SECTION);
    // The notice left the composer: the name on every posted comment says
    // it. The form is the plain form it always was.
    expect(src).toContain('action="/comment"');
  });

  it("`launch` is never offered as a tag anywhere a person picks one", () => {
    // The box's radios are built from the SIX. A `launch` among them would
    // let somebody hand-make a second comment thread.
    expect(THREAD_TAGS).not.toContain(LAUNCH_THREAD_TAG);
    expect(read(SECTION)).toContain("THREAD_TAGS.map");
    // …and it still has a label, because a thread renders its own tag name.
    expect(THREAD_TAG_LABELS[LAUNCH_THREAD_TAG]).toBe("Comments");
  });
});

describe("one read for both halves of the section", () => {
  it("the page reads the discussion document once", () => {
    // Two endpoints would have made the most-read page on the estate pay a
    // third round trip to fill one section, and let the two answers disagree
    // about which threads exist.
    const page = read(PAGE);
    expect(page).toContain("fetchDiscussion(slug)");
    expect(page).not.toContain("fetchThreads(");
  });

  it("renders ONE conversation — the box — and no second module (PP0, WC-6)", () => {
    // P0·04: "Discussion · 5 comments" forty pixels above "DISCUSSIONS · No
    // discussions yet" told a first reader the site did not know its own
    // state. The launch thread is the conversation; titled threads that
    // already existed are a link list under it, with no composer and no
    // heading that claims to be a conversation.
    const src = markupOf(PAGE);
    expect(src.split("<Comments").length - 1).toBe(1);
    expect(src).not.toContain("<Discussions");
    expect(src).not.toContain(">Discussions<");
    expect(src.indexOf("<Comments")).toBeLessThan(src.indexOf("<EarlierDiscussions"));
    const earlier = markupOf("[slug]/discussions.tsx");
    expect(earlier).not.toContain("<form");
    expect(earlier).not.toContain("threads/new");
  });

  it("a failed read and an empty one stay different (OD5)", () => {
    // `null` is "we could not read them", which is NOT "there are none".
    expect(read(PAGE)).toContain("discussion?.threads ?? null");
    expect(read(PAGE)).toContain("discussion?.launch ?? null");
  });

  it("says what an empty comment section is, rather than showing nothing", () => {
    // An empty section shows the composer and nothing else: the box IS the
    // invitation, and a sentence saying "no comments yet" over an empty list
    // explained what the reader could already see.
    expect(read(SECTION)).toContain("posts.length === 0 ? null");
  });
});

describe("what the design draws that this does not", () => {
  it("HAS a vote control now — DQ1 made it work, and this is the inversion", () => {
    // DQ0b asserted the opposite, and was right to: nothing observed a vote,
    // and a button that renders and does nothing is indistinguishable from a
    // working one until you press it. DQ1 built the act, so the control is
    // drawn. The pair, read together, is the history of one decision.
    expect(markupOf(SECTION)).toContain("<CommentVote");
  });

  it("NO reply button — CB0's posts are flat and there is nothing to reply TO", () => {
    const src = markupOf(SECTION);
    expect(src).not.toMatch(/>\s*Reply\s*</);
  });
});

describe("a locked discussion", () => {
  it("keeps its words and loses its box", () => {
    // Locking ends a conversation, it does not retract it — and a box that
    // posts nowhere is worse than an absent one.
    const src = read(SECTION);
    expect(src).toContain('launch?.thread.state === "locked"');
    expect(src).toContain("Closed to new comments.");
  });
});

describe("I6 — the section is one document with no actor in it", () => {
  it("is a server component and reads no session", () => {
    expect(read(SECTION)).not.toContain('"use client"');
    expect(/cookies\(|SESSION_COOKIE|decodeSession/.test(read(SECTION))).toBe(false);
  });

  it("the SESSION is read once, in the route handler", () => {
    const route = read(ROUTE);
    expect(route).toContain("decodeSession(request.cookies.get(SESSION_COOKIE)?.value)");
    // Signed out, their intent survives the round trip — through openproduct's
    // OWN door, not through the first step of the Orunbase handshake, which is
    // where pressing `Post` used to land somebody.
    expect(route).toContain("/signin?return_to=");
    expect(route).not.toContain("/auth/start");
    expect(route).toContain("#discussion");
  });

  it("keeps the comment through the round trip, in this browser and nowhere else", () => {
    // THE OTHER HALF OF THE BUG. Bouncing through sign-in used to return
    // somebody to an EMPTY box: they wrote a comment, pressed a button, and
    // from where they stood the button deleted it. `/submit` already solved
    // this the same way, and an unposted comment is not something openproduct
    // should hold — so the draft is this tab's, and never a cookie the browser
    // would attach to every request for a cached page.
    const box = read(BOX);
    expect(box).toContain("sessionStorage");
    expect(box).not.toMatch(/fetch\(|document\.cookie|navigator\.sendBeacon/);
    // And it is dropped once the comment is on the page, or the box refills
    // with what somebody just posted.
    expect(read(ROUTE)).toContain("?commented=ok#discussion");
    expect(box).toContain('answer === "ok"');
    expect(box).toContain("removeItem(key)");
  });

  it("finally renders the answers the route has always sent back", () => {
    // `?commented=invalid` and `?commented=failed` were redirect targets
    // nothing read: a refused comment looked exactly like an accepted one,
    // minus the comment.
    const route = read(ROUTE);
    const box = read(BOX);
    for (const answer of ["invalid", "failed"]) {
      expect(route).toContain(`?commented=${answer}`);
      expect(box).toContain(`${answer}:`);
    }
    expect(box).toContain('aria-live="polite"');
  });

  it("the route bounds the body before it reaches the network", () => {
    const route = read(ROUTE);
    expect(route).toContain("MAX_POST_BODY");
    expect(route).toContain("SLUG_RE.test(slug)");
  });
});
