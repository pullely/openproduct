// A post's blocks, read for drawing (openproduct-redesign OPR-3, design §6.2).
//
// PURE. A card never knows a kind's blocks by heart: the catalogue in the
// contract (`POST_BLOCK_CATALOGUE`) is the one list, and these helpers read a
// post against it. A block the post does not carry is `null`, and a card
// draws only what is not null — a template's optional block is simply absent
// when the maker left it out.

import {
  POST_BLOCK_CATALOGUE,
  PRODUCT_POST_KIND_LABELS,
  postBlockLines,
  postBlockValue,
  postUrl,
  type PostBlockSpec,
  type ProductPostBlock,
  type ProductPostKind,
  type ProductStage,
  type PublicProductPost,
} from "@openproduct/contracts";

type Blocks = readonly ProductPostBlock[];

/** One block's text, trimmed; null when the post does not carry it or it is
 *  empty. */
export function blockText(blocks: Blocks, blockId: string): string | null {
  const value = postBlockValue(blocks, blockId);
  if (value === null) return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

/** A `lines` block's entries; empty when the post does not carry it. */
export function blockLines(blocks: Blocks, blockId: string): string[] {
  const value = postBlockValue(blocks, blockId);
  return value === null ? [] : postBlockLines(value);
}

/**
 * A `url` block's address, as a link may use it: absolute http(s) or null.
 * Checked again HERE, at the point of drawing, so nothing but an http(s)
 * address can ever become an `href` — whatever was stored.
 */
export function blockLink(blocks: Blocks, blockId: string): string | null {
  const value = postBlockValue(blocks, blockId);
  return value === null ? null : postUrl(value);
}

/** One block as a generic renderer draws it. */
export interface DrawnBlock {
  readonly spec: PostBlockSpec;
  /** `line` / `text`: the text. `url`: the checked address. `lines`: "". */
  readonly text: string;
  /** `lines` only: the entries. */
  readonly lines: readonly string[];
}

/**
 * The blocks a post carries, in CATALOGUE order, each with its spec — only
 * the ones that are present and usable. A block the kind does not have is
 * dropped, an empty one is dropped, and a `url` that is not http(s) is
 * dropped.
 */
export function drawnBlocks(kind: ProductPostKind, blocks: Blocks, skip: readonly string[] = []): DrawnBlock[] {
  const out: DrawnBlock[] = [];
  for (const spec of POST_BLOCK_CATALOGUE[kind]) {
    if (skip.includes(spec.id)) continue;
    if (spec.type === "lines") {
      const lines = blockLines(blocks, spec.id);
      if (lines.length > 0) out.push({ spec, text: "", lines });
    } else if (spec.type === "url") {
      const link = blockLink(blocks, spec.id);
      if (link) out.push({ spec, text: link, lines: [] });
    } else {
      const text = blockText(blocks, spec.id);
      if (text) out.push({ spec, text, lines: [] });
    }
  }
  return out;
}

/** The block that is each kind's headline. */
export const HEADLINE_BLOCK: Record<ProductPostKind, string> = {
  feature: "feature",
  version: "version",
  idea: "problem",
  seat: "role",
  demo: "title",
};

/**
 * A post's headline: the feature's name, the version, the idea's problem,
 * the seat's role, a demo's title. Falls back to the kind's own label, so a
 * page title or a link never comes out empty.
 */
export function postHeadline(post: Pick<PublicProductPost, "kind" | "blocks">): string {
  return blockText(post.blocks, HEADLINE_BLOCK[post.kind]) ?? PRODUCT_POST_KIND_LABELS[post.kind];
}

/** The block that is each kind's one-paragraph summary, when it has one. */
const SUMMARY_BLOCK: Partial<Record<ProductPostKind, string>> = {
  feature: "what",
  seat: "what",
  idea: "detail",
  demo: "note",
};

/** A post's summary paragraph, or null: for a description, a compact card. */
export function postSummary(post: Pick<PublicProductPost, "kind" | "blocks">): string | null {
  if (post.kind === "version") {
    const added = blockLines(post.blocks, "added");
    return added.length > 0 ? added.join("; ") : null;
  }
  const id = SUMMARY_BLOCK[post.kind];
  return id ? blockText(post.blocks, id) : null;
}

// `isPublishedPost` — the question every list and every card asks before it
// draws a post — is in `published.ts`: a list that only filters (the feed's)
// imports that file and not the block catalogue this one reads.
export { isPublishedPost } from "./published";

/**
 * Where a product's open seats are: "Take the seat" goes here.
 *
 * THE ADDRESS THE SEATS ARE AT, not one that forwards to it. A shipping
 * product's seats are on its Crew tab; an idea has one page and its seats
 * are on it. With no stage to go by, the Crew tab — which an idea's page
 * answers by sending the visitor to itself, fragment kept.
 */
export function productSeatsPath(slug: string, stage?: ProductStage | null): string {
  return stage === "idea" ? `/${slug}#people-wanted` : `/${slug}/crew#people-wanted`;
}

/** The DOM id a post's card wears, and the fragment that returns to it. */
export function postAnchor(postId: string): string {
  return `post-${postId}`;
}
