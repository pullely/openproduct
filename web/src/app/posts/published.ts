import type { PublicProductPost } from "@openproduct/contracts";

// One question, in a file of its own (openproduct-redesign OPR-3).
//
// `blocks.ts` reads the block catalogue, and a module that imports anything
// from it carries the catalogue with it. The feed's list only needs to ask
// this — the cards that read blocks are drawn on the server — so it lives
// here, and `blocks.ts` re-exports it for everybody who already imports it
// from there.

/**
 * IS THIS A PUBLISHED POST? The public reads only ever send published posts,
 * and `PublicProductPost` has no `state`. A crew post (`CrewProductPost`) has
 * one — and a draft handed to a card by mistake must draw NOTHING, on any
 * page, for anybody. So the card asks: a `state` that is not `published`, or
 * no publication date, is not drawn.
 */
export function isPublishedPost(post: unknown): post is PublicProductPost {
  if (typeof post !== "object" || post === null) return false;
  const candidate = post as { state?: unknown; publishedAt?: unknown };
  if (candidate.state !== undefined && candidate.state !== "published") return false;
  return typeof candidate.publishedAt === "string" && candidate.publishedAt.length > 0;
}
