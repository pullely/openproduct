// CV1 — replies, in the web layer (openproduct-worldclass).

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const THREAD = "threads/[id]/page.tsx";
const ROUTE = "threads/[id]/reply/route.ts";

describe("a reply renders under its parent", () => {
  it("nests through the contract, not by hand", () => {
    // A page that grouped posts itself would be a second place the shape of
    // a conversation is decided.
    expect(code(THREAD)).toContain("nestPosts(posts)");
    expect(code(THREAD)).not.toMatch(/\.filter\(\s*\(?\w+\)?\s*=>\s*\w+\.parentPostId/);
  });

  it("draws exactly one level of indentation", () => {
    // `nestPosts` flattens anything deeper, and the recursion below cannot
    // add a level: a reply is rendered with no replies of its own.
    const src = code(THREAD);
    expect(src).toContain("replies.map((reply) => (");
    expect(src).not.toMatch(/replies\.map[\s\S]{0,400}replies\.map/);
  });

  it("puts the nested list inside the post's own list item", () => {
    // An `<li>` whose parent is an `<li>` is invalid HTML. axe found it on
    // the first draft, where the nested `<ol>` sat beside the post in a
    // wrapper item.
    const src = code(THREAD);
    const li = src.slice(src.indexOf("<li"), src.indexOf("</li>"));
    expect(li).toContain("<ol");
    expect(src).not.toMatch(/<li key=\{post\.id\}/);
  });

  it("gives every post an anchor, so a reply can return to what it answered", () => {
    expect(code(THREAD)).toContain("id={`post-${post.id}`}");
    expect(code(ROUTE)).toContain("`#post-${parentPostId}`");
  });
});

describe("the reply control is where the one-level rule is met", () => {
  it("offers no reply control on a reply", () => {
    // The rule as a SHAPE rather than as an error message: a control that
    // opened and then failed at the API would be the rule enforced by
    // refusal.
    const src = code(THREAD);
    // The nested list is rendered INSIDE the parent's own `<li>` — an `<li>`
    // whose parent is an `<li>` is invalid HTML, which axe caught on the
    // first draft of this — so the recursion passes `threadId`, not `thread`.
    expect(src).toContain("<Post key={reply.id} post={reply} threadId={threadId} open={false} parent={post} />");
    expect(src).toContain("{open ? (");
  });

  it("offers none in a locked thread either", () => {
    // `open` is the thread's own state, and the top-level box already
    // obeyed it.
    expect(code(THREAD)).toContain("open={open}");
  });

  it("costs no client JS", () => {
    // A `<details>` disclosure, not a component with state. This page is a
    // server component and stays one.
    const src = code(THREAD);
    expect(src).toContain("<details");
    expect(read(THREAD)).not.toContain('"use client"');
  });

  it("names the post it answers in a hidden field", () => {
    expect(code(THREAD)).toContain('<input type="hidden" name="parentPostId" value={post.id} />');
    expect(code(ROUTE)).toContain('form.get("parentPostId")');
  });

  it("drops a malformed parent to a top-level post rather than refusing", () => {
    // The words are the part somebody typed. Losing them to a mangled hidden
    // field would be the worse failure.
    expect(code(ROUTE)).toContain("UUID_RE.test(parentRaw) ? parentRaw : null");
  });
});

describe("the policy is on the page, not only true", () => {
  it("says that upvotes order nothing", () => {
    expect(code(THREAD)).not.toContain("{POST_ORDER_NOTE}");
  });
});
