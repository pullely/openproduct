// A post's own page, `/{slug}/posts/{id}` (openproduct-redesign OPR-3; boards
// `Post`, `PhonePost`).
//
// The pure half (`[slug]/posts/post-page.ts`) is called; the page, the thread
// and the comment route are read as source:
//
//   - an unknown, draft or removed post is the site's not-found
//   - the slug in the address must be the post's product; a stale one
//     redirects to the post's own address
//   - the two ids the cards link to, `comments` and `comment`, always exist
//   - nothing personal is in the server render
//   - a comment is written to the thread the POST names, never one from a form

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { emptyReactionCounts, productPostPagePath, type PublicProductPost } from "@openproduct/contracts";

import {
  POST_COMMENTS_ID,
  POST_COMMENT_ID,
  morePostsOf,
  postCommentPath,
  postPageDescription,
  postPageHeading,
  postPageTitle,
  postPageVerdict,
  postThreadState,
  repliesLabel,
  visibleCommentCount,
} from "@openproduct-web/app/[slug]/posts/post-page";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PAGE = "[slug]/posts/[id]/page.tsx";
const THREAD = "[slug]/posts/post-thread.tsx";
const ROUTE = "[slug]/posts/[id]/comment/route.ts";
const FIELD = "[slug]/posts/post-comment-field.tsx";
const SHARE = "[slug]/posts/post-share.tsx";

const ID = `ppo_${"0".repeat(31)}1`;
const post = (over: Record<string, unknown> = {}): PublicProductPost =>
  ({
    id: ID,
    kind: "feature",
    product: { slug: "ackstack", name: "ackstack", stage: "stage", logo: null },
    author: null,
    blocks: [
      { block: "feature", value: "The state re-collection calendar" },
      { block: "what", value: "Policies re-send on each state's own cycle." },
    ],
    publishedAt: "2026-05-30T10:00:00.000Z",
    reactions: emptyReactionCounts(),
    commentCount: 2,
    threadId: "11111111-1111-4111-8111-111111111111",
    ...over,
  }) as PublicProductPost;

describe("what the address resolves to", () => {
  it("an unknown post, a draft and a removed one are all missing", () => {
    expect(postPageVerdict(null, "ackstack")).toEqual({ kind: "missing" });
    expect(postPageVerdict(undefined, "ackstack")).toEqual({ kind: "missing" });
    expect(postPageVerdict(post({ state: "draft", publishedAt: null }), "ackstack")).toEqual({ kind: "missing" });
    expect(postPageVerdict(post({ state: "removed" }), "ackstack")).toEqual({ kind: "missing" });
    expect(postPageVerdict(post({ publishedAt: "" }), "ackstack")).toEqual({ kind: "missing" });
  });

  it("a slug that is not the post's product redirects to the post's own address", () => {
    expect(postPageVerdict(post(), "old-name")).toEqual({ kind: "moved", to: productPostPagePath("ackstack", ID) });
    // A draft under the wrong slug is still missing: nothing about it is said.
    expect(postPageVerdict(post({ state: "draft" }), "old-name")).toEqual({ kind: "missing" });
  });

  it("the post's own address is the page", () => {
    const verdict = postPageVerdict(post(), "ackstack");
    expect(verdict.kind).toBe("here");
  });

  it("the page 404s through the site's not-found and redirects a stale slug", () => {
    const page = code(PAGE);
    expect(page).toContain('import { notFound, redirect } from "next/navigation";');
    expect(page).toContain("const verdict = postPageVerdict(await fetchProductPost(id), slug);");
    expect(page).toContain('if (verdict.kind === "missing") notFound();');
    expect(page).toContain('if (verdict.kind === "moved") redirect(verdict.to);');
    // The verdict comes before any other read: a missing post reads nothing more.
    expect(page.indexOf("notFound();")).toBeLessThan(page.indexOf("fetchThread(post.threadId)"));
    // Metadata never names a post that is not at this address.
    expect(page).toContain('if (verdict.kind !== "here") return { title: "Not found" };');
  });

  it("is static and cached like the other public pages", () => {
    const page = code(PAGE);
    expect(page).toContain("export const revalidate = 60;");
    expect(page).toContain("export async function generateStaticParams()");
    expect(page).not.toContain("searchParams");
    expect(page).toContain("alternates: { canonical: `${apex}${path}` }");
    expect(page).toContain('{ name: "Products", path: "/products" },');
  });
});

describe("the two anchors the cards link to", () => {
  it("are `comments` and `comment`, the fragments a card's footer uses", () => {
    expect(POST_COMMENTS_ID).toBe("comments");
    expect(POST_COMMENT_ID).toBe("comment");
    // A compact card's count links to `#comments`; the full card's footer
    // (`post-footer.tsx`) links its count there and its Comment to `#comment`.
    expect(code("posts/post-card.tsx")).toContain("href={`${page}#comments`}");
    const footer = code("posts/post-footer.tsx");
    // LR3: one icon link — to the thread when there are comments, to the
    // field when there are none.
    expect(footer).toContain("href={comments ? `${page}#comments` : `${page}#comment`}");
  });

  it("both exist on every post's page, whether or not anybody can comment", () => {
    const thread = code(THREAD);
    // The section is always drawn, with its id.
    expect(thread).toMatch(/<section\s+id=\{POST_COMMENTS_ID\}/);
    // The box carries `comment`; where there is no box, the line in its place does.
    expect(thread).toContain("<PostCommentField id={POST_COMMENT_ID}");
    expect(thread).toContain("<p id={POST_COMMENT_ID}");
    expect(thread.match(/id=\{POST_COMMENT_ID\}/g)).toHaveLength(2);
    expect(code(FIELD)).toContain("id={id}");
    // And the page always draws the thread, and its own Comment goes there.
    const page = code(PAGE);
    expect(page).toContain("<PostThread");
    expect(page).not.toMatch(/\? <PostThread|&& <PostThread/);
    expect(page).toContain("href={`#${POST_COMMENT_ID}`}");
  });

  it("the thread is open, closed, unread or absent", () => {
    expect(postThreadState(post({ threadId: null }), null)).toBe("none");
    expect(postThreadState(post(), null)).toBe("unread");
    expect(postThreadState(post(), { thread: { state: "open" } })).toBe("open");
    expect(postThreadState(post(), { thread: { state: "answered" } })).toBe("open");
    expect(postThreadState(post(), { thread: { state: "locked" } })).toBe("closed");
    expect(postThreadState(post(), { thread: { state: "removed" } })).toBe("closed");
  });
});

describe("nothing personal is in the post page's server render (I6)", () => {
  it("the page and the thread resolve no actor", () => {
    for (const file of [PAGE, THREAD, "[slug]/posts/post-page.ts"]) {
      const source = code(file);
      expect([file, /cookies\(|headers\(|SESSION_COOKIE|decodeSession|fetchOverlay|fetchFollowing|useCrewOf|useOverlay/.test(source)]).toEqual([file, false]);
      expect([file, source.includes('"use client"')]).toEqual([file, false]);
    }
  });

  it("the forms are the same forms for everybody; the route reads the session", () => {
    const thread = code(THREAD);
    expect(thread.match(/<form method="post" action=\{action\} data-live="post"/g)).toHaveLength(2);
    expect(thread).toContain('<input type="hidden" name="parentPostId" value={post.id} />');
    expect(thread).toContain("<CommentVote postId={post.id} votes={post.votes} returnTo={returnTo} />");
    const field = code(FIELD);
    expect(field).toContain('name="body"');
    // The draft and the route's answer are read after paint, in the browser.
    expect(field).toMatch(/React\.useEffect\(\(\) => \{[\s\S]*sessionStorage\.getItem\(draftKey\)/);
    expect(field).not.toMatch(/displayName|handle/);
  });

  it("Share copies the post's address, with no third party", () => {
    const share = code(SHARE);
    expect(share).toContain("navigator.clipboard.writeText(address)");
    expect(share).toContain("href={path}");
    expect(share).not.toMatch(/https?:\/\//);
    expect(code(PAGE)).toContain("<PostShare path={here} url={apex ? `${apex}${here}` : null} />");
  });
});

describe("a comment goes to the thread the post names", () => {
  it("the route takes the thread from the post's public read, never from the form", () => {
    const route = code(ROUTE);
    expect(route).toContain("const verdict = postPageVerdict(await fetchProductPost(id), slug);");
    expect(route).toContain("const threadId = verdict.post.threadId;");
    expect(route).toContain("createPost(session.accessToken, threadId, body, parentPostId)");
    expect(route).not.toMatch(/form\.get\("thread/);
    // A missing post is refused before the session is even read.
    expect(route.indexOf('verdict.kind !== "here"')).toBeLessThan(route.indexOf("decodeSession("));
    expect(route).toContain('const NO_STORE = { "cache-control": "no-store" } as const;');
    expect(postCommentPath("ackstack", ID)).toBe(`${productPostPagePath("ackstack", ID)}/comment`);
  });

  it("answers a form with a redirect back to the page and a script with JSON", () => {
    const route = code(ROUTE);
    expect(route).toContain("const json = wantsJson(request);");
    expect(route).toContain("{ status: 201, headers: NO_STORE }");
    expect(route).toContain("return back(parentPostId === null ? `#${POST_COMMENT_ID}` : `#post-${parentPostId}`);");
  });
});

describe("the page's words and its side column", () => {
  it("titles and describes the post from its own blocks", () => {
    expect(postPageTitle(post())).toBe("The state re-collection calendar · ackstack");
    expect(postPageHeading(post())).toBe("ackstack: The state re-collection calendar");
    expect(postPageDescription(post())).toBe("Policies re-send on each state's own cycle.");
    expect(postPageDescription(post({ blocks: [] }))).toBe("Feature shipped from ackstack.");
    expect(postPageDescription(post({ blocks: [{ block: "what", value: "x".repeat(400) }] })).length).toBeLessThanOrEqual(200);
  });

  it("the page has one h1: the post's headline, drawn where the card draws it", () => {
    // Not a hidden heading beside a visible `h3` saying the same words: the
    // card draws its headline at the level the page gives it.
    const page = code(PAGE);
    expect(page).not.toMatch(/<h1\b/);
    expect(page).not.toContain('className="sr-only"');
    expect(page.match(/headingLevel=\{1\}/g)).toHaveLength(1);
    expect(page).toMatch(/<PostCardBody[\s\S]*?headingLevel=\{1\}\s*\/>/);
    const card = code("posts/post-card.tsx");
    expect(card).toContain('const Tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";');
    // Every other heading on the page is below it.
    expect(code(THREAD)).not.toMatch(/<h1\b/);
    expect(page.match(/<h2\b/g)?.length ?? 0).toBeGreaterThan(0);
  });

  it("says Posted after Post, for the crew, after load", () => {
    // Publishing lands on `/{slug}/posts/{id}?notice=posted`. The line is
    // the crew's (read from the address in the browser, never on the
    // server: the page is cached and the same bytes for everyone).
    const page = code(PAGE);
    // A toast: a line that arrived in the page's flow after load would push
    // the post down.
    expect(page).toContain("<CrewNoticeLine slug={post.product.slug} toast />");
    expect(code("[slug]/maker/notice.tsx")).toContain("fixed bottom-6 left-1/2 z-40");
    expect(page).not.toMatch(/searchParams|useSearchParams/);
    expect(code("posts/crew-handler.ts")).toContain('posted: "Posted",');
  });

  it("More from the product leaves out this post and anything unpublished", () => {
    const other = (n: number, over: Record<string, unknown> = {}) => post({ id: `ppo_${String(n).padStart(32, "0")}`, ...over });
    const list = [post(), other(2), other(3, { state: "draft" }), other(4), other(5), other(6), other(7)];
    expect(morePostsOf(list, ID).map((p) => p.id)).toEqual([other(2).id, other(4).id, other(5).id, other(6).id]);
    expect(code(PAGE)).toContain("fetchProductPosts(post.product.slug)");
  });

  it("counts what a reader can see, and words the phone's toggle", () => {
    expect(visibleCommentCount([{ state: "visible" }, { state: "removed" }, { state: "visible" }])).toBe(2);
    expect(repliesLabel(1)).toBe("1 reply");
    expect(repliesLabel(2)).toBe("2 replies");
  });
});
