// The post cards (openproduct-redesign OPR-3; boards `Feed`, `PhoneFeed`).
//
// This lane does not compile JSX, so what is pinned is the cards' pure half
// (`posts/blocks.ts`, `posts/reactions.ts`, `ui/stage.ts`) by calling it, and
// the components' SHAPE from source:
//
//   - the kind is the card's shape, never a label a reader sees
//   - a draft is never drawn, by any card, on any page
//   - a count is shown only above zero
//   - ONE Follow per card, and it follows the PRODUCT (`kind="listing"`)
//   - nothing personal is in the server render: my reaction, the crew's
//     controls and "You" arrive after load, or not at all

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  POST_BLOCK_CATALOGUE,
  PRODUCT_POST_KINDS,
  PRODUCT_POST_KIND_LABELS,
  PRODUCT_POST_REACTIONS,
  PRODUCT_POST_REACTION_LABELS,
  emptyReactionCounts,
  type ProductPostKind,
  type PublicProductPost,
} from "@openproduct/contracts";

import {
  HEADLINE_BLOCK,
  blockLines,
  blockLink,
  blockText,
  drawnBlocks,
  isPublishedPost,
  postAnchor,
  postHeadline,
  postSummary,
  productSeatsPath,
} from "@openproduct-web/app/posts/blocks";
import {
  commentCountLine,
  countsWith,
  reactionCountKey,
  reactionCountLine,
  reactionSummaryText,
  reactionTotal,
  safeCounts,
  shownCounts,
  topReactions,
} from "@openproduct-web/app/posts/reactions";
import {
  IDEA_MARK,
  IDEA_NEEDS_BUILDER,
  milestoneProgress,
  progressSegments,
  stageLine,
  stageMarkText,
  stageWord,
  stageWordOf,
  usableCounts,
} from "@openproduct-web/app/ui/stage";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
/** A file's code with its prose removed (JSX comments included). */
const code = (file: string) =>
  read(file)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const CARD = "posts/post-card.tsx";
const CONTROL = "posts/reaction-control.tsx";

/** One function's body out of the card file, bounded by the next one. */
function part(name: string, file = CARD): string {
  const source = code(file);
  const start = source.search(new RegExp(`(export )?function ${name}\\(`));
  expect(`${name}: ${start >= 0}`).toBe(`${name}: true`);
  const after = source.slice(start + 1).search(/\n(export )?(function|const) /);
  return after === -1 ? source.slice(start) : source.slice(start, start + 1 + after);
}

const post = (kind: ProductPostKind, blocks: Array<[string, string]>, over: Partial<PublicProductPost> = {}): PublicProductPost => ({
  id: `ppo_${"0".repeat(31)}1`,
  kind,
  product: { slug: "ackstack", name: "ackstack", stage: "shipping", logo: null },
  author: { handle: "ada", displayName: "Ada Lovelace" },
  blocks: blocks.map(([block, value]) => ({ block, value })),
  publishedAt: "2026-05-30T10:00:00.000Z",
  reactions: emptyReactionCounts(),
  commentCount: 0,
  threadId: null,
  ...over,
});

describe("one card per kind, and the kind is the card's shape", () => {
  it("the switch has a branch for every kind in the vocabulary, demo included", () => {
    const body = part("PostBody");
    for (const kind of PRODUCT_POST_KINDS) {
      expect([kind, body.includes(`case "${kind}":`)]).toEqual([kind, true]);
    }
    // Exhaustive by type: there is no default that could swallow a new kind.
    expect(body).not.toContain("default:");
    // And a shell per kind.
    const shells = code(CARD).slice(code(CARD).indexOf("export const POST_CARD_SHELL"));
    for (const kind of PRODUCT_POST_KINDS) expect(shells).toMatch(new RegExp(`\\n  ${kind}:`));
  });

  it("each shape is its own: the glow, the panel, the note, the ticket", () => {
    const src = code(CARD);
    const shell = (kind: string) => new RegExp(`\\n  ${kind}:\\s*"([^"]*)"`).exec(src)?.[1] ?? "";
    // Feature shipped: the amber glow from the corner, on a card.
    expect(shell("feature")).toContain("bg-[radial-gradient(520px_200px_at_100%_0%,oklch(var(--brand-amber-inverted)/0.22),transparent_70%)]");
    // New idea: the lavender note with one square corner.
    expect(shell("idea")).toContain("rounded-[4px_16px_16px_16px]");
    expect(shell("idea")).toContain("bg-idea-wash");
    // Help wanted: the ticket does NOT clip, because its notches sit outside it.
    expect(shell("seat")).not.toContain("overflow-hidden");
    expect(src).toContain('{post.kind === "seat" ? <TicketNotches /> : null}');
    expect(part("TicketNotches")).toContain("-left-3");
    expect(part("TicketNotches")).toContain("-right-3");
    expect(part("TicketNotches")).toContain("bg-background");

    // Feature: the check badge, the name, what it does, the bars, Try it.
    const feature = part("FeatureBody");
    expect(feature).toContain("<CheckBadge />");
    expect(feature).toContain('blockText(post.blocks, "what")');
    expect(feature).toContain("<MilestoneSegments counts={milestoneCounts} />");
    expect(feature).toContain("data-post-try");
    expect(feature).toMatch(/Try it\s*<svg/);

    // Version: the release-notes panel, the version big and mono, a row per line.
    const version = part("VersionBody");
    expect(version).toContain("data-release-notes");
    expect(version).toContain("bg-version-soft");
    expect(version).toMatch(/font-mono text-\[30px\] font-medium/);
    expect(version).toContain("blockLines(post.blocks, group.block)");
    expect(src).toMatch(/\{ block: "added", label: "Added", glyph: "\+" \}/);
    expect(src).toContain('{ block: "changed", label: "Changed"');
    expect(src).toContain('{ block: "fixed", label: "Fixed"');

    // Idea: the mono mark, and the problem as a serif italic quote.
    const idea = part("IdeaBody");
    expect(idea).toContain("{IDEA_MARK}");
    expect(idea).toMatch(/<blockquote[\s\S]*?font-serif text-\[22px\] italic/);
    expect(IDEA_MARK).toBe("An idea, not built yet");

    // Seat: the dashed empty seat and the way onto the crew.
    const seat = part("SeatBody");
    expect(seat).toContain("data-empty-seat");
    expect(seat).toContain("SEAT_RING");
    expect(seat).toContain("Take the seat");
    expect(seat).toContain("seatHref ?? productSeatsPath(post.product.slug)");
    expect(productSeatsPath("ackstack")).toBe("/ackstack#people-wanted");
    // The anchor it points at is on the product page.
    expect(read("[slug]/page.tsx")).toContain('id="people-wanted"');
  });

  it("says the kind to a screen reader and never prints it on the card", () => {
    const card = part("ProductPostCard");
    expect(card).toContain("aria-label={`${PRODUCT_POST_KIND_LABELS[post.kind]}: ${postHeadline(post)}`}");
    // The labels are used nowhere else in the file: no card wears its kind as text.
    expect(code(CARD).match(/PRODUCT_POST_KIND_LABELS/g)?.length).toBe(2);
    for (const label of Object.values(PRODUCT_POST_KIND_LABELS)) {
      expect([label, new RegExp(`>\\s*${label}\\s*<`).test(code(CARD))]).toEqual([label, false]);
    }
  });

  it("a demo draws plainly and cannot throw: a title, whatever else it carries", () => {
    const demo = part("DemoBody");
    expect(demo).toContain('drawnBlocks("demo", post.blocks, ["title"])');
    const empty = post("demo", []);
    expect(postHeadline(empty)).toBe("Demo");
    expect(drawnBlocks("demo", empty.blocks)).toEqual([]);
    expect(postSummary(empty)).toBeNull();
  });

  it("the deploy strip is not on the version card yet", () => {
    expect(code(CARD)).not.toMatch(/Deployment|View run|LIVE ON/i);
  });
});

describe("a draft is never drawn", () => {
  it("the switch draws nothing for anything that is not a published post", () => {
    const card = part("ProductPostCard");
    // The first thing it does, before any markup.
    expect(card).toMatch(/const \{ post, variant = "feed" \} = props;\s*if \(!isPublishedPost\(post\)\) return null;/);
  });

  it("a crew post in draft, a removed one, and a post with no publication date are all refused", () => {
    const published = post("feature", [["feature", "Exports"]]);
    expect(isPublishedPost(published)).toBe(true);
    // A crew post that IS published carries `state: "published"`.
    expect(isPublishedPost({ ...published, state: "published" })).toBe(true);
    expect(isPublishedPost({ ...published, state: "draft", publishedAt: null })).toBe(false);
    // Even a draft that somehow carries a date.
    expect(isPublishedPost({ ...published, state: "draft" })).toBe(false);
    expect(isPublishedPost({ ...published, state: "removed" })).toBe(false);
    expect(isPublishedPost({ ...published, publishedAt: null })).toBe(false);
    expect(isPublishedPost({ ...published, publishedAt: "" })).toBe(false);
    expect(isPublishedPost(null)).toBe(false);
    expect(isPublishedPost("ppo_1")).toBe(false);
  });

  it("no card reads a crew route or a crew type", () => {
    for (const file of [CARD, CONTROL, "posts/blocks.ts", "posts/reactions.ts"]) {
      expect([file, /crew-api|CrewProductPost|needs-you|listCrewPosts/.test(code(file))]).toEqual([file, false]);
    }
  });
});

describe("a post's blocks are read against the catalogue", () => {
  const feature = post("feature", [
    ["feature", "  The re-collection calendar  "],
    ["what", "Policies re-send."],
    ["try", "https://example.com/try"],
    ["for", ""],
    ["screenshot", "javascript:alert(1)"],
  ]);

  it("a block is its text, or null when absent or empty", () => {
    expect(blockText(feature.blocks, "feature")).toBe("The re-collection calendar");
    expect(blockText(feature.blocks, "for")).toBeNull();
    expect(blockText(feature.blocks, "milestone")).toBeNull();
  });

  it("an address becomes a link only when it is http(s)", () => {
    expect(blockLink(feature.blocks, "try")).toBe("https://example.com/try");
    expect(blockLink(feature.blocks, "screenshot")).toBeNull();
    expect(blockLink(feature.blocks, "demo")).toBeNull();
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "//evil.example", "/relative", "ftp://x", "https://a b"]) {
      expect([bad, blockLink([{ block: "try", value: bad }], "try")]).toEqual([bad, null]);
    }
    // Every `href` a card writes from a block comes through that check.
    const src = code(CARD);
    expect(src.match(/href=\{(tryLink|screenshot|demo|evidence|entry\.text)\}/g)?.length).toBeGreaterThanOrEqual(5);
    for (const name of ["tryLink", "screenshot", "demo", "evidence"]) {
      expect(src).toMatch(new RegExp(`const ${name} = (post\\.kind === "feature" \\? )?blockLink\\(`));
    }
    expect(src).not.toMatch(/href=\{blockText\(/);
    // An outbound link is never followed on our word.
    expect(src.match(/rel="nofollow noopener"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(src).not.toContain("dangerouslySetInnerHTML");
  });

  it("a lines block is its entries, one per line, blanks dropped", () => {
    const version = post("version", [["version", "v1"], ["added", "One\n\n  Two  \r\nThree"]]);
    expect(blockLines(version.blocks, "added")).toEqual(["One", "Two", "Three"]);
    expect(blockLines(version.blocks, "fixed")).toEqual([]);
    // And is drawn as a list.
    expect(part("VersionBody")).toMatch(/<ul[\s\S]*?rows\.map\(/);
    expect(part("PostBlocks")).toMatch(/entry\.spec\.type === "lines" \? \(\s*<ul/);
  });

  it("draws only the blocks present, in catalogue order, whatever order they were stored in", () => {
    const shuffled = post("feature", [
      ["try", "https://example.com"],
      ["mystery", "not in the catalogue"],
      ["feature", "Exports"],
      ["for", "   "],
      ["demo", "not a url"],
    ]);
    expect(drawnBlocks("feature", shuffled.blocks).map((b) => b.spec.id)).toEqual(["feature", "try"]);
    expect(drawnBlocks("feature", shuffled.blocks, ["feature"]).map((b) => b.spec.id)).toEqual(["try"]);
    // Every kind's headline block is one its catalogue really has.
    for (const kind of PRODUCT_POST_KINDS) {
      expect([kind, POST_BLOCK_CATALOGUE[kind].some((spec) => spec.id === HEADLINE_BLOCK[kind])]).toEqual([kind, true]);
    }
  });

  it("a headline is never empty", () => {
    expect(postHeadline(feature)).toBe("The re-collection calendar");
    expect(postHeadline(post("version", [["version", "v0.3.0"]]))).toBe("v0.3.0");
    expect(postHeadline(post("idea", [["problem", "Nobody can."]]))).toBe("Nobody can.");
    expect(postHeadline(post("seat", [["role", "Advisor"]]))).toBe("Advisor");
    expect(postHeadline(post("seat", []))).toBe("Help wanted");
    expect(postSummary(post("version", [["added", "One\nTwo"]]))).toBe("One; Two");
    expect(postAnchor("ppo_1")).toBe("post-ppo_1");
  });
});

describe("the product row: one Follow, and it follows the product", () => {
  const head = part("PostHead");

  it("links the tile and the name to the product, and the author to their page when there is one", () => {
    expect(head).toContain("const href = `/${post.product.slug}`;");
    expect(head).toContain("<ProductTile slug={post.product.slug} thumbnail={post.product.logo} size={44} />");
    expect(head).toContain("{post.product.name}");
    // The name/link rule lives in the one shared component.
    const byline = part("Byline");
    expect(byline).toContain("if (!post.author) return null;");
    expect(byline).toContain("<PersonName");
    expect(byline).toContain("handle={post.author.handle}");
    expect(head).toContain("<time dateTime={post.publishedAt}>{postDate(post.publishedAt)}</time>");
  });

  it('is the existing follow button with kind="listing", once per card', () => {
    expect(head).toMatch(/<FollowButton\s+kind="listing"\s+value=\{post\.product\.slug\}/);
    expect(head).toContain("returnTo={returnTo}");
    // The count is the product page's to show, not every card's.
    expect(head).toContain("countHidden");
    const src = code(CARD);
    expect(src.match(/<FollowButton\b/g)?.length).toBe(1);
    // Nobody is followed from a card: not the author, not a topic.
    expect(src).not.toMatch(/kind="person"|kind="topic"/);
    expect(src).toContain('import { FollowButton } from "../ui/follow-button";');
    // The compact variants have no product row, so no Follow at all.
    expect(part("ProductPostCard")).toContain("{compact ? null : <PostHead post={post} returnTo={props.returnTo} />}");
  });

  it("prints an absolute date, so a cached page never says how long ago", () => {
    expect(part("postDate")).toContain("absoluteOf(iso)");
    expect(code(CARD)).not.toMatch(/agoOf|Date\.now\(\)|new Date\(\)/);
  });
});

describe("counts are shown only above zero", () => {
  const none = emptyReactionCounts();

  it("no reactions is no summary at all: no marks, no 0", () => {
    expect(reactionSummaryText(none, null)).toBe("");
    expect(topReactions(none)).toEqual([]);
    expect(shownCounts(none)).toEqual([]);
    expect(reactionCountLine(none)).toBeNull();
    expect(part("ReactionSummary", CONTROL)).toContain("if (text.length === 0) return null;");
  });

  it("draws a mark only for a reaction somebody holds, most-held first, three at most", () => {
    expect(topReactions({ useful: 0, would_use: 2, impressive: 0, curious: 5 })).toEqual(["curious", "would_use"]);
    expect(topReactions({ useful: 1, would_use: 1, impressive: 1, curious: 1 })).toEqual(["useful", "would_use", "impressive"]);
    expect(shownCounts({ useful: 0, would_use: 2, impressive: 0, curious: 5 })).toEqual([
      { reaction: "would_use", label: PRODUCT_POST_REACTION_LABELS.would_use, count: 2 },
      { reaction: "curious", label: PRODUCT_POST_REACTION_LABELS.curious, count: 5 },
    ]);
  });

  it("says the number, or You, or You and the others", () => {
    const five = { useful: 3, would_use: 2, impressive: 0, curious: 0 };
    expect(reactionTotal(five)).toBe(5);
    expect(reactionSummaryText(five, null)).toBe("5");
    expect(reactionSummaryText(five, "useful")).toBe("You and 4 others");
    expect(reactionSummaryText({ ...none, useful: 2 }, "useful")).toBe("You and 1 other");
    expect(reactionSummaryText({ ...none, useful: 1 }, "useful")).toBe("You");
    // A cached count from before I reacted: nobody is subtracted who was never added.
    expect(reactionSummaryText({ ...none, curious: 2 }, "useful")).toBe("You and 2 others");
    expect(reactionSummaryText(none, "useful")).toBe("You");
  });

  it("a comment count is a line above zero and nothing at zero", () => {
    expect(commentCountLine(0)).toBeNull();
    expect(commentCountLine(-1)).toBeNull();
    expect(commentCountLine(Number.NaN)).toBeNull();
    expect(commentCountLine(1)).toBe("1 comment");
    expect(commentCountLine(5)).toBe("5 comments");
    expect(reactionCountLine({ ...none, useful: 1 })).toBe("1 reaction");
    expect(reactionCountLine({ useful: 3, would_use: 2, impressive: 0, curious: 0 })).toBe("5 reactions");
    const footer = part("PostFooter");
    expect(footer).toContain("const comments = commentCountLine(post.commentCount);");
    expect(footer).toMatch(/\{comments \? \(\s*<AppLink/);
    // With nothing to say the row takes no room.
    expect(footer).toContain("empty:hidden");
    expect(part("CompactFooter")).toContain("const reactions = reactionCountLine(safeCounts(post.reactions));");
  });

  it("the comment count links to the post's own page", () => {
    const footer = part("PostFooter");
    expect(footer).toContain("const page = productPostPagePath(post.product.slug, post.id);");
    expect(footer).toContain("href={`${page}#comments`}");
    expect(part("CompactFooter")).toContain("href={`${page}#comments`}");
  });

  it("makes the counts safe before anything is drawn from them", () => {
    expect(safeCounts({ useful: 2.9, would_use: -1, impressive: Number.NaN, curious: "4" as unknown as number })).toEqual({
      useful: 2,
      would_use: 0,
      impressive: 0,
      curious: 0,
    });
    expect(safeCounts(null)).toEqual(none);
    // My own move in this browser, on top of the cached count; never below zero.
    expect(countsWith({ ...none, useful: 1 }, { useful: -1, curious: 1 })).toEqual({ ...none, curious: 1 });
    expect(countsWith(none, { useful: -1 })).toEqual(none);
    expect(reactionCountKey("ppo_1", "useful")).toBe("reaction:ppo_1:useful");
  });
});

describe("the reaction control", () => {
  const control = code(CONTROL);

  it("offers the four reactions from the contract, by their labels", () => {
    expect(PRODUCT_POST_REACTIONS).toHaveLength(4);
    const picker = part("ReactionPicker", CONTROL);
    expect(picker).toContain("{PRODUCT_POST_REACTIONS.map((reaction) => (");
    expect(picker).toContain("aria-label={PRODUCT_POST_REACTION_LABELS[reaction]}");
    expect(picker).toContain("aria-pressed={mine === reaction}");
    // The labels are the contract's; none is typed here.
    for (const label of Object.values(PRODUCT_POST_REACTION_LABELS)) {
      expect([label, control.includes(`"${label}"`)]).toEqual([label, false]);
    }
  });

  it("is a form that posts, so it works with no JavaScript and bounces a signed-out press through sign-in", () => {
    const picker = part("ReactionPicker", CONTROL);
    expect(picker).toContain('method="post"');
    expect(picker).toContain("<details");
    expect(picker).toContain('type="submit"');
    // Pressing the one that is mine clears it; any other sets it.
    expect(picker).toContain("formAction={reactPath(postId, mine === reaction ? null : reaction, target)}");
    // Signed out, or unknown and not hinted: the plain form posts.
    expect(picker).toContain('if (status === "absent" || (status === "pending" && !hintedSignedIn()) || pending) return;');
    // Sign-in returns to this control, on the page it is on.
    expect(picker).toContain("const target = `${returnTo}#${reactAnchor(postId)}`;");
    expect(picker).toContain("id={reactAnchor(postId)}");
  });

  it("moves at once and puts itself back on anything but success, quietly", () => {
    const picker = part("ReactionPicker", CONTROL);
    expect(picker).toContain('const revert = status === "ready" ? setReaction(postId, next) : () => {};');
    expect(picker).toContain('headers: { accept: "application/json" }');
    // A stale hint: undo, and let the form carry the reaction through sign-in.
    expect(picker).toMatch(/if \(res\.status === 401\) \{[\s\S]*?undo\(\);\s*form\.action = action;\s*form\.submit\(\);/);
    // Everything else that is not ok — your own post's 409 included — reverts
    // and shows nothing: there is no error state in this control at all.
    expect(picker).toMatch(/if \(!res\.ok\) \{\s*undo\(\);\s*return;\s*\}/);
    expect(control).not.toMatch(/role="alert"|text-destructive|setError|Something went wrong|cannot react/i);
    expect(picker).toContain('if (status !== "ready") deferReaction(postId, next);');
  });

  it("reads my reaction from the overlay and nowhere else", () => {
    expect(control).toContain('"use client"');
    expect(control).toContain("const mine = useReaction(postId);");
    expect(control).not.toMatch(/cookies\(|headers\(|op_session|SESSION_COOKIE|document\.cookie|localStorage/);
  });
});

describe("nothing personal is in a server render", () => {
  it("the card is a server component with three islands and no state of its own", () => {
    const raw = read(CARD);
    expect(raw).not.toMatch(/^"use client";/m);
    const src = code(CARD);
    expect(src).not.toMatch(/\buse(State|Effect|Ref|SyncExternalStore|Overlay|Reaction|CrewOf|Toggle)\(/);
    expect(src).not.toMatch(/from "\.\.\/ui\/(overlay|use-overlay|use-toggle)"/);
    expect(src).not.toMatch(/cookies\(|headers\(|op_session|SESSION_COOKIE|readSession|decodeSession/);
    expect(src).not.toMatch(/from ["'][^"']*\/auth\//);
    // The only client pieces it draws: Follow, the summary, the picker.
    expect(src).toContain('import { ReactionPicker, ReactionSummary } from "./reaction-control";');
  });

  it("carries no maker control: Edit, drafts and Needs you are the page's, after load", () => {
    const src = code(CARD);
    expect(src).not.toMatch(/Edit post|Needs you|Manage|Draft|Continue/);
    // A page may hand a compact card its own controls; the card draws what it is given.
    expect(part("CompactFooter")).toContain("{actions}");
  });

  it("the anonymous reaction summary is a number and never 'You'", () => {
    // What the server renders: `useReaction` over a pending overlay is null.
    const summary = part("ReactionSummary", CONTROL);
    expect(summary).toContain("const mine = useReaction(postId);");
    for (const counts of [emptyReactionCounts(), { useful: 3, would_use: 2, impressive: 0, curious: 0 }]) {
      expect(reactionSummaryText(counts, null)).not.toContain("You");
    }
    // And the picker's resting label is the same word for everybody.
    expect(part("ReactionPicker", CONTROL)).toContain('{mine ? PRODUCT_POST_REACTION_LABELS[mine] : "React"}');
  });

  it("the three variants are a prop, and only the full card carries the islands", () => {
    const card = part("ProductPostCard");
    expect(code(CARD)).toContain('export type PostCardVariant = "feed" | "product" | "person";');
    expect(card).toContain('const compact = variant !== "feed";');
    expect(card).toContain("<PostFooter post={post} returnTo={props.returnTo} />");
    // A compact card says its counts in words and has no reaction control.
    expect(part("CompactFooter")).not.toMatch(/ReactionPicker|ReactionSummary/);
    // On a person's list a card names the product it is for.
    expect(part("CompactMeta")).toMatch(/variant === "person" \? \([\s\S]*?for\{" "\}/);
    expect(part("SeatBody")).toContain('variant === "person" ? `Open seat · ${post.product.name}` : "Open seat"');
  });
});

describe("the stage pieces lists share", () => {
  it("say the stage in the contract's words", () => {
    expect(stageWord("shipping")).toBe("Shipping");
    expect(stageWord("idea")).toBe("Idea");
    expect(stageWordOf("shipping")).toBe("Shipping");
    expect(stageWordOf(null)).toBeNull();
    expect(stageWordOf("beta")).toBeNull();
  });

  it("write the mono mark: SHIPPING · 3 OF 4, or an idea, not built yet", () => {
    // Sentence case in the string; the mark's class uppercases it.
    expect(stageMarkText("shipping", { shipped: 3, total: 4 })).toBe("Shipping · 3 of 4");
    expect(stageMarkText("shipping", { shipped: 0, total: 0 })).toBe("Shipping");
    expect(stageMarkText("shipping", null)).toBe("Shipping");
    expect(stageMarkText("idea", { shipped: 0, total: 2 })).toBe("An idea, not built yet");
    expect(stageMarkText("idea", null, { short: true })).toBe("Idea");
    expect(stageLine("shipping", { shipped: 3, total: 4 })).toBe("shipping, 3 of 4");
    expect(stageLine("idea", { shipped: 0, total: 2 })).toBe("idea");
    expect(IDEA_NEEDS_BUILDER).toBe("Needs a first builder");
    const mark = read("ui/stage-mark.tsx");
    expect(mark).toContain("font-mono text-mono-label uppercase");
    expect(mark).toContain("{stageMarkText(stage, counts, { short })}");
  });

  it("draw one segment per milestone, the shipped ones first, and nothing with nothing to count", () => {
    expect(progressSegments({ shipped: 3, total: 4 })).toEqual([true, true, true, false]);
    expect(progressSegments({ shipped: 0, total: 2 })).toEqual([false, false]);
    expect(progressSegments({ shipped: 0, total: 0 })).toEqual([]);
    expect(progressSegments(null)).toEqual([]);
    expect(milestoneProgress({ shipped: 3, total: 4 })).toBe("3 of 4");
    expect(milestoneProgress({ shipped: 0, total: 0 })).toBeNull();
    // A count that is not a count draws nothing; one past its total is capped.
    expect(usableCounts({ shipped: 5, total: 4 })).toEqual({ shipped: 4, total: 4 });
    expect(usableCounts({ shipped: -1, total: 4 })).toBeNull();
    expect(usableCounts({ shipped: 1.5, total: 4 })).toBeNull();
    const segments = read("ui/stage-mark.tsx");
    expect(segments).toContain("if (!usable) return null;");
    // The bars are a picture; the words beside them carry the fact.
    expect(segments).toContain('role="img"');
    expect(segments).toContain("aria-label={label}");
  });

  it("are server-safe and free of the two files the page agents own", () => {
    for (const file of ["ui/stage.ts", "ui/stage-mark.tsx"]) {
      const src = code(file);
      expect([file, /^"use client";/m.test(read(file))]).toEqual([file, false]);
      expect([file, /feed\/product-card|help-wanted\/seat-card/.test(src)]).toEqual([file, false]);
    }
    // The pure half holds no JSX, so the header search's row model can use it.
    expect(code("ui/stage.ts")).not.toMatch(/from "react"|<\w+[\s>]/);
    expect(code("shell/palette-rows.ts")).toContain('import { stageWordOf } from "../ui/stage";');
  });
});
