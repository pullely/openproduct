// The thread page (openproduct-worldclass-v2 FO3).
//
// Permalinks per post, RE3's share control, "Replying to" context, CV2's
// badge and FR4's traversal — every one reusing the estate's own piece.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { postPermalink, threadShareText, threadShareUrl } from "@openproduct/contracts";

import { BINDINGS, ROW_ATTRIBUTE } from "@openproduct-web/app/ui/keys";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PAGE = "threads/[id]/page.tsx";

describe("every post has a stable address", () => {
  it("is the thread with the post as its fragment, and the row draws it first", () => {
    expect(postPermalink("t1", "p1")).toBe("/threads/t1#post-p1");
    const page = code(PAGE);
    expect(page).toContain("id={`post-${post.id}`}");
    expect(page).toContain("href={postPermalink(threadId, post.id)}");
    // The permalink comes before the author in the row, so FR4's traversal
    // (first reachable link) lands on the address, not on a person.
    expect(page.indexOf("href={postPermalink(threadId, post.id)}")).toBeLessThan(page.indexOf("<PersonName"));
  });

  it("a post is a ROW for the keyboard layer, and `u` presses the comment's own upvote", () => {
    const page = code(PAGE);
    expect(page).toContain("{...{ [ROW_ATTRIBUTE]: true }}");
    expect(ROW_ATTRIBUTE).toBe("data-keyrow");
    const layer = code("shell/keyboard-layer.tsx");
    expect(layer).toContain('form[id^="comment-"] button[type="submit"]');
    expect(BINDINGS.find((b) => b.shows === "u")?.does).toMatch(/or the comment/);
    // The comment vote's form id is what the layer looks for.
    expect(code("ui/comment-vote.tsx")).toContain("id={`comment-${postId}`}");
  });
});

describe("the share control, the reply context and the badge", () => {
  it("shares the thread through RE3's own control, never a removed one", () => {
    expect(threadShareUrl("https://openproduct.live", "t1")).toBe("https://openproduct.live/threads/t1");
    expect(threadShareUrl(null, "t1")).toBeNull();
    expect(threadShareText("A title", "acme")).toBe("A title — acme");
    const page = code(PAGE);
    expect(page).toContain("<ShareControl url={share.url} text={share.text} intents={share.intents} />");
    expect(page).toContain('if (!url || thread.state === "removed") return null;');
  });

  it("a reply says whose words it answers, linking the parent's permalink", () => {
    const page = code(PAGE);
    expect(page).toContain("parent={post}");
    expect(page).toContain("href={postPermalink(threadId, parent.id)}");
    expect(page).toMatch(/replying to/);
  });

  it("the maintainer badge is CV2's one component", () => {
    expect(code(PAGE)).toContain("{post.authorIsMaintainer ? <MaintainerBadge /> : null}");
  });
});

describe("CB-2 — the standing notice is beside every composer on the page", () => {
  it("the thread's composer and each post's reply form both carry it", () => {
    // The a11y lane asserts it in the rendered form; this pins the source,
    // so a cut that takes it out again fails here first.
    expect(code(PAGE).match(/\{POSTING_NOTICE\}/g)?.length).toBe(2);
  });
});
