// The feed at `/` (openproduct-redesign OPR-3; boards `Feed`, `PhoneFeed`).
//
// This lane does not compile JSX, so what is pinned is the feed's pure half
// (`feed/feed-copy.ts`, `feed/feed-suggest.ts`) by calling it, and the
// components' SHAPE from source:
//
//   - the feed never draws a draft
//   - Follow on a card follows the PRODUCT
//   - "Worth following" lists products only, never people
//   - a feed nobody has posted to says so, and a failed read is a different page
//   - nothing personal is in the server render
//   - *Show more* is a real link that appends in place
//   - "focus as you scroll" moves no layout and respects reduced motion

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { POSTING_DOCS_PATH, emptyReactionCounts, type PublicProductPost, type PublicProfileCard } from "@openproduct/contracts";

import {
  FEED_CARD_ATTRIBUTE,
  FEED_EMPTY_LINKS,
  FEED_FOCUS_CSS,
  FEED_MINE_PATH,
  feedPageDataPath,
  feedPagePath,
  feedPosts,
  followingCount,
  openSeatsLine,
  parseFeedMine,
} from "@openproduct-web/app/feed/feed-copy";
import { WORTH_FOLLOWING_LIMIT, openSeatProducts, worthFollowing } from "@openproduct-web/app/feed/feed-suggest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
/** A file's code with its prose removed (JSX comments included). */
const code = (file: string) =>
  read(file)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PAGE = "page.tsx";
const VIEW = "feed/feed-view.tsx";
const LIST = "feed/feed-posts.tsx";
const YOU = "feed/feed-you.tsx";
const MINE = "feed/mine/route.ts";
const CONTINUED = "feed/[cursor]/page.tsx";
const DATA = "feed/[cursor]/posts/route.ts";

const post = (n: number, over: Record<string, unknown> = {}): PublicProductPost =>
  ({
    id: `ppo_${String(n).padStart(32, "0")}`,
    kind: "feature",
    product: { slug: `product-${n}`, name: `product-${n}`, stage: "shipping", logo: null },
    author: null,
    blocks: [{ block: "feature", value: "Something" }],
    publishedAt: "2026-05-30T10:00:00.000Z",
    reactions: emptyReactionCounts(),
    commentCount: 0,
    threadId: null,
    ...over,
  }) as PublicProductPost;

const card = (slug: string, over: Record<string, unknown> = {}): PublicProfileCard =>
  ({
    slug,
    tagline: `What ${slug} does`,
    category: "developer-tools",
    metrics: [],
    publishedAt: "2026-09-01T00:00:00.000Z",
    roleOpeningCount: 0,
    thumbnail: null,
    stage: "shipping",
    ...over,
  }) as unknown as PublicProfileCard;

describe("the feed never draws a draft", () => {
  it("keeps published posts only, each once", () => {
    const draft = post(2, { state: "draft", publishedAt: null });
    const removed = post(3, { state: "removed" });
    const unpublished = post(4, { publishedAt: "" });
    expect(feedPosts([post(1), draft, removed, unpublished]).map((p) => p.id)).toEqual([post(1).id]);
    // An appended page is held to the same rule, and a post that arrived
    // twice is drawn once.
    expect(feedPosts([post(1)], [post(1), draft, post(5)]).map((p) => p.id)).toEqual([post(1).id, post(5).id]);
  });

  it("every list of the feed goes through that filter, and the card draws nothing else", () => {
    expect(code(VIEW)).toContain("const posts = feedPosts(page.posts);");
    expect(code(LIST)).toContain("feedPosts(posts, more)");
    expect(code(CONTINUED)).toContain("const posts = feedPosts(page.posts);");
    expect(code(DATA)).toContain("{ posts: feedPosts(page.posts), next: page.next }");
    expect(code(LIST)).toContain('<ProductPostCard post={post} variant="feed" returnTo={returnTo} />');
    expect(code("posts/post-card.tsx")).toContain("if (!isPublishedPost(post)) return null;");
    // The feed reads the PUBLIC feed and no crew route: a draft is in no
    // read this page makes.
    for (const file of [PAGE, VIEW, LIST, CONTINUED, DATA]) {
      expect([file, /crew-api|crewPosts|fetchCrew|needs-you/.test(code(file))]).toEqual([file, false]);
    }
  });
});

describe("Follow follows the product", () => {
  it("a card's one Follow is the product's", () => {
    const head = code("posts/post-card.tsx");
    expect(head).toMatch(/<FollowButton\s+kind="listing"\s+value=\{post\.product\.slug\}/);
    expect(head.match(/<FollowButton\b/g)).toHaveLength(1);
  });

  it("no feed file follows a person", () => {
    for (const file of [VIEW, LIST, YOU, "feed/feed-suggest.ts"]) {
      expect([file, /kind="person"|kind: "person"|person:/.test(code(file).replace(/`person:\$\{person\.handle\}`/g, ""))]).toEqual([file, false]);
    }
    expect(code(VIEW)).toContain('<FollowButton kind="listing" value={product.slug}');
  });
});

describe('"Worth following" lists products only', () => {
  it("is built from directory cards, in the directory's order, leaving out what is already on the page", () => {
    const cards = ["a", "b", "c", "d", "e", "f"].map((slug) => card(slug));
    const rows = worthFollowing(cards, ["b"]);
    expect(rows).toHaveLength(WORTH_FOLLOWING_LIMIT);
    expect(rows.map((row) => row.slug)).not.toContain("b");
    for (const row of rows) {
      // A row is a product: a slug, a line that says so, a logo. Nothing a
      // person has.
      expect(Object.keys(row).sort()).toEqual(["line", "slug", "thumbnail"]);
      expect(row.line.startsWith("Product")).toBe(true);
    }
    // Below the floor is not suggested (the directory's own rule).
    expect(worthFollowing([card("bare", { tagline: null })])).toEqual([]);
  });

  it("the card reads nothing about people", () => {
    const suggest = code("feed/feed-suggest.ts");
    expect(suggest).not.toMatch(/handle|maker|person|contributor/i);
    const view = code(VIEW);
    const section = view.slice(view.indexOf("data-worth-following"), view.indexOf("<FeedFollowing />"));
    expect(section).toContain("href={`/${product.slug}`}");
    expect(section).not.toMatch(/@\$\{|makerPath|handle/);
    expect(code(PAGE)).not.toMatch(/fetchPublicPeople|fetchContributorsDirectory/);
  });

  it("open seats name products with a seat open", () => {
    expect(openSeatProducts([card("a"), card("b", { roleOpeningCount: 2 })])).toEqual([{ slug: "b", seats: 2 }]);
    expect(openSeatsLine(1)).toBe("1 open seat");
    expect(openSeatsLine(2)).toBe("2 open seats");
  });
});

describe("an empty feed and a failed read are different pages", () => {
  it("nobody has posted yet: the page says so and points at Products and the posting docs", () => {
    const view = code(VIEW);
    expect(view).toMatch(/posts\.length > 0 \? \(\s*<FeedPosts/);
    expect(view).toContain("data-feed-empty");
    expect(view).toContain("{FEED_EMPTY_TITLE}");
    expect(FEED_EMPTY_LINKS.map((link) => link.href)).toEqual(["/products", POSTING_DOCS_PATH]);
    expect(existsSync(resolve(APP_DIR, "products/page.tsx"))).toBe(true);
  });

  it("a feed that could not be read is the shared failure panel", () => {
    const page = code(PAGE);
    expect(page).toMatch(/if \(page === null\) \{\s*return <FailurePanel kind="unavailable"/);
    // The directory failing costs the side cards, never the feed.
    expect(page).toContain("directory={directory?.projects ?? null}");
  });

  it("the page has one h1, and the board draws no visible title", () => {
    expect(code(VIEW).match(/<h1\b/g)).toHaveLength(1);
    expect(code(VIEW)).toMatch(/<h1 id="feed-title" className="sr-only">/);
    expect(code(PAGE)).not.toMatch(/<h1\b/);
  });
});

describe("nothing personal is in the feed's server render (I6)", () => {
  it("the page, its view and its continued page resolve no actor", () => {
    for (const file of [PAGE, VIEW, CONTINUED, DATA, "feed/feed-copy.ts", "feed/feed-suggest.ts"]) {
      const source = code(file);
      expect([file, /cookies\(|headers\(|SESSION_COOKIE|decodeSession|fetchFollowing|fetchMyListings|fetchOverlay/.test(source)]).toEqual([file, false]);
      expect([file, source.includes('"use client"')]).toEqual([file, false]);
    }
    expect(code(PAGE)).toContain("export const revalidate = 60;");
    expect(code(CONTINUED)).toContain("export const revalidate = 60;");
    expect(code(PAGE)).not.toContain("searchParams");
    expect(code(CONTINUED)).not.toContain("searchParams");
  });

  it("the personal columns draw nothing until the signed-in read answers", () => {
    const you = code(YOU);
    expect(you.startsWith('"use client";')).toBe(true);
    // The server snapshot is "nothing", and both components return null on it.
    expect(you).toContain("useSyncExternalStore(subscribe, current, nothing)");
    expect(you).toContain("const nothing = (): FeedMine | null => null;");
    expect(you.match(/if \(!data\) return null;/g)).toHaveLength(2);
    // Asked only when the pre-paint hint says there is a session.
    expect(you).toMatch(/if \(hintedSignedIn\(\) && window\.matchMedia\(COLUMNS_QUERY\)\.matches\) ask\(\);/);
    expect(you.match(/fetch\(/g)).toHaveLength(1);
    expect(you).toContain("fetch(FEED_MINE_PATH");
    expect(FEED_MINE_PATH).toBe("/feed/mine");
  });

  it("what the server sends in the left column is the same card for everybody", () => {
    const view = code(VIEW);
    expect(view).toContain('data-auth-branch="anonymous"');
    expect(view).toContain("<FeedYou />");
    expect(view).not.toMatch(/displayName|overlay|useVisitor/);
  });

  it("the signed-in read is never cached, and signed out is the same answer as failed", () => {
    const mine = code(MINE);
    expect(mine).toContain('const NO_STORE = { "cache-control": "no-store" } as const;');
    expect(mine).toContain("if (!session) return absent();");
    expect(mine).toContain('if (following.kind !== "ok") return absent();');
    expect(mine).toContain("new NextResponse(null, { status: 204, headers: NO_STORE })");
    expect(mine).toContain("NextResponse.json({ data }, { headers: NO_STORE })");
    // Only products with a public page are drawn: Manage opens that page.
    expect(mine).toContain('.filter((listing) => listing.visibility === "public")');
  });

  it("a body that is not the shape reads as nothing personal", () => {
    expect(parseFeedMine(null)).toBeNull();
    expect(parseFeedMine({ data: { products: "x", following: {} } })).toBeNull();
    const parsed = parseFeedMine({
      data: {
        products: [
          { slug: "ackstack", stage: "shipping", milestoneCounts: { shipped: 3, total: 4 }, logo: null, openSeats: 2 },
          { slug: "nostage" },
          { slug: "idea-one", stage: "idea", milestoneCounts: { shipped: 0, total: 0 }, openSeats: -1 },
        ],
        following: {
          products: [{ slug: "meterwise", name: "meterwise", stage: "shipping", tagline: null, logo: null }, { name: "no slug" }],
          people: [{ handle: "ada", displayName: "Ada Lovelace" }, { displayName: "nobody" }],
        },
      },
    });
    expect(parsed?.products.map((p) => p.slug)).toEqual(["ackstack", "idea-one"]);
    expect(parsed?.products[0]?.milestoneCounts).toEqual({ shipped: 3, total: 4 });
    expect(parsed?.products[1]).toMatchObject({ milestoneCounts: null, openSeats: 0 });
    expect(parsed?.following.products.map((p) => p.slug)).toEqual(["meterwise"]);
    expect(parsed?.following.people.map((p) => p.handle)).toEqual(["ada"]);
    expect(parsed ? followingCount(parsed) : -1).toBe(2);
  });

  it("Manage opens the product's page", () => {
    const you = code(YOU);
    expect(you).toMatch(/href=\{`\/\$\{product\.slug\}`\}\s+aria-label=\{`Manage \$\{product\.slug\}`\}/);
    expect(you).toContain("<StageMark stage={product.stage} counts={product.milestoneCounts} short />");
    expect(you).not.toContain("/studio");
  });
});

describe("Show more is a link that appends in place", () => {
  it("links to the next page's own address and reads the same page as JSON when pressed", () => {
    expect(feedPagePath("abc def")).toBe("/feed/abc%20def");
    expect(feedPageDataPath("abc")).toBe("/feed/abc/posts");
    const list = code(LIST);
    expect(list.startsWith('"use client";')).toBe(true);
    expect(list).toContain("href={feedPagePath(cursor)}");
    expect(list.match(/fetch\(/g)).toHaveLength(1);
    expect(list).toContain("fetch(feedPageDataPath(cursor)");
    expect(existsSync(resolve(APP_DIR, CONTINUED))).toBe(true);
    expect(existsSync(resolve(APP_DIR, DATA))).toBe(true);
  });

  it("a cursor the feed did not issue is the site's not-found", () => {
    expect(code(CONTINUED)).toContain("if (page === null) notFound();");
    expect(code(DATA)).toContain("{ status: 404 }");
  });
});

describe("focus as you scroll", () => {
  it("is a scroll-driven transform inside @supports, off for reduced motion, and dims nothing", () => {
    expect(FEED_FOCUS_CSS).toContain("@supports (animation-timeline: view())");
    expect(FEED_FOCUS_CSS.startsWith("@media (prefers-reduced-motion: no-preference){")).toBe(true);
    expect(FEED_FOCUS_CSS).toContain("scale(.985)");
    expect(FEED_FOCUS_CSS).toContain(`[${FEED_CARD_ATTRIBUTE}]`);
    // No layout property, no blur, and no opacity: muted text is at AA only
    // at full opacity.
    expect(FEED_FOCUS_CSS).not.toMatch(/opacity|filter|blur|margin|width|height|top:|left:/);
    expect(code(VIEW)).toContain("<style>{FEED_FOCUS_CSS}</style>");
    expect(code(VIEW)).not.toContain("dangerouslySetInnerHTML");
    expect(code(LIST)).toContain("{...{ [FEED_CARD_ATTRIBUTE]: post.kind }}");
  });
});
