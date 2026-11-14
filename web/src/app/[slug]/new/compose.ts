// The post builder, as pure functions (openproduct-redesign OPR-3; boards
// `Compose`, `PhoneCompose`).
//
// SEPARATE FROM THE COMPONENT for the reason `feed/products.ts` is: the web
// test lane has no JSX, so a rule that lives inside a `.tsx` is a rule no
// test can hold. What the builder shows, in which order, when Post may be
// pressed and what is sent are decided here and drawn in `composer.tsx`.
//
// NOTHING HERE IS A SECOND VALIDATOR. The catalogue (`POST_BLOCK_CATALOGUE`)
// is the one list of blocks and `validatePostBlocks` the one rule; this file
// only turns what is typed into the list that rule reads, and the rule's
// answer into the words the page prints.

import {
  AUTHORED_PRODUCT_POST_KINDS,
  POST_BLOCK_CATALOGUE,
  PRODUCT_POST_KIND_LABELS,
  isAuthoredProductPostKind,
  postBlocksPublishable,
  publishedPostBlocks,
  validatePostBlocks,
  type AuthoredProductPostKind,
  type PostBlockSpec,
  type MilestoneCounts,
  type ProductPostBlock,
  type ProductStage,
  type PublicProductPost,
  type MediaThumbnail,
} from "@openproduct/contracts";

/** What is typed into each block of one kind: block id → text. */
export type ComposeValues = Readonly<Record<string, string>>;

/** The kinds the builder offers, in the rail's order. Demo is not one: a demo
 *  is made by recording, never typed (`AUTHORED_PRODUCT_POST_KINDS`). */
export const COMPOSE_KINDS = AUTHORED_PRODUCT_POST_KINDS;

/** The kind the builder opens on when the address names none. */
export const DEFAULT_COMPOSE_KIND: AuthoredProductPostKind = "feature";

/** The one word under a kind's tile (boards `Compose`, `PhoneCompose`). */
export const COMPOSE_KIND_SHORT: Record<AuthoredProductPostKind, string> = {
  feature: "Feature",
  version: "Version",
  idea: "Idea",
  seat: "Seat",
};

/** The kind an address names (`?kind=`), or the default. Anything that is not
 *  an authored kind — `demo` included — is the default, never an error. */
export function composeKindOf(raw: string | string[] | undefined | null): AuthoredProductPostKind {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isAuthoredProductPostKind(value) ? value : DEFAULT_COMPOSE_KIND;
}

/** A kind's blocks, in the order they are written and drawn. */
export function composeSpecs(kind: AuthoredProductPostKind): readonly PostBlockSpec[] {
  return POST_BLOCK_CATALOGUE[kind];
}

/** What a field holds, as the server will read it: line endings normalised
 *  and the ends trimmed (`parsePostBlocks` does the same), so a counter
 *  counts what is stored. */
export function composeValue(raw: string | undefined): string {
  return (raw ?? "").replace(/\r\n?/g, "\n").trim();
}

/**
 * The blocks the card holds when it opens: every REQUIRED block, and each
 * optional block the post already carries. In catalogue order, always.
 */
export function initialPlaced(kind: AuthoredProductPostKind, blocks: readonly ProductPostBlock[]): string[] {
  const carried = new Set(blocks.filter((entry) => entry.value.length > 0).map((entry) => entry.block));
  return composeSpecs(kind)
    .filter((spec) => spec.required || carried.has(spec.id))
    .map((spec) => spec.id);
}

/** A post's blocks as the fields' starting text. A block the kind does not
 *  have is dropped. */
export function initialValues(kind: AuthoredProductPostKind, blocks: readonly ProductPostBlock[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const spec of composeSpecs(kind)) {
    const entry = blocks.find((candidate) => candidate.block === spec.id);
    if (entry) values[spec.id] = entry.value;
  }
  return values;
}

/**
 * Add an optional block to the card. THE RESULT IS IN CATALOGUE ORDER
 * whatever order blocks were added in: a maker adds and removes, and never
 * reorders (design §2.1). A block the kind does not have is not added.
 */
export function withBlock(kind: AuthoredProductPostKind, placed: readonly string[], blockId: string): string[] {
  const wanted = new Set([...placed, blockId]);
  return composeSpecs(kind)
    .filter((spec) => wanted.has(spec.id))
    .map((spec) => spec.id);
}

/** Remove an optional block. A required block cannot be removed. */
export function withoutBlock(kind: AuthoredProductPostKind, placed: readonly string[], blockId: string): string[] {
  const spec = composeSpecs(kind).find((candidate) => candidate.id === blockId);
  if (!spec || spec.required) return withBlock(kind, placed, blockId).filter((id) => placed.includes(id));
  return composeSpecs(kind)
    .filter((candidate) => candidate.id !== blockId && placed.includes(candidate.id))
    .map((candidate) => candidate.id);
}

/** The optional blocks not on the card: what "Add a block" offers. */
export function addableBlocks(kind: AuthoredProductPostKind, placed: readonly string[]): PostBlockSpec[] {
  return composeSpecs(kind).filter((spec) => !spec.required && !placed.includes(spec.id));
}

/**
 * WHAT IS SENT: the placed blocks that hold something, as `{block, value}`,
 * IN CATALOGUE ORDER. Built by walking the catalogue, so no sequence of adds,
 * removes or edits can produce another order; an empty block is left out,
 * which is how an optional block is removed and how a draft stays a draft.
 */
export function composeBlocks(
  kind: AuthoredProductPostKind,
  values: ComposeValues,
  placed: readonly string[],
): ProductPostBlock[] {
  const out: ProductPostBlock[] = [];
  for (const spec of composeSpecs(kind)) {
    if (!placed.includes(spec.id)) continue;
    const value = composeValue(values[spec.id]);
    if (value.length > 0) out.push({ block: spec.id, value });
  }
  return out;
}

/** Where the builder stands: may Post be pressed, and if not, why. */
export interface ComposeReadiness {
  /** Post may be pressed. EXACTLY `postBlocksPublishable` of what is sent. */
  readonly ready: boolean;
  /** How many blocks the kind requires, and how many of them are filled. */
  readonly required: number;
  readonly filled: number;
  /** A block holds more than its limit. */
  readonly over: boolean;
  /** Any other reason Post is refused (a line with a break, an address that
   *  is not http(s)): the validator's own sentence. */
  readonly problem: string | null;
}

/**
 * THE READINESS RULE IS THE VALIDATOR'S. `ready` is `postBlocksPublishable`
 * and nothing else — the same function core runs before it publishes — so the
 * button cannot be lit for a post the server would refuse, nor dark for one it
 * would take. The other members only say why.
 */
export function composeReadiness(
  kind: AuthoredProductPostKind,
  values: ComposeValues,
  placed: readonly string[],
): ComposeReadiness {
  const blocks = composeBlocks(kind, values, placed);
  const errors = validatePostBlocks(kind, blocks);
  const requiredSpecs = composeSpecs(kind).filter((spec) => spec.required);
  const missing = errors.filter((error) => error.code === "required").length;
  const other = errors.find((error) => error.code !== "required" && error.code !== "over_limit");
  return {
    ready: postBlocksPublishable(kind, blocks),
    required: requiredSpecs.length,
    filled: requiredSpecs.length - missing,
    over: errors.some((error) => error.code === "over_limit"),
    problem: other ? other.message : null,
  };
}

/**
 * The readiness line. The header's is short (board `Compose`: "Ready",
 * "2 of 3 required"); the phone's footer says a little more (board
 * `PhoneCompose`: "Ready to post", "2 of 3 required filled").
 */
export function readinessText(readiness: ComposeReadiness, form: "short" | "long" = "short"): string {
  if (readiness.over) return "Something is too long";
  if (readiness.filled < readiness.required) {
    return `${readiness.filled} of ${readiness.required} required${form === "long" ? " filled" : ""}`;
  }
  if (readiness.problem) return readiness.problem;
  return form === "long" ? "Ready to post" : "Ready";
}

/** The tone of that line: red only when a limit is passed or a value is
 *  refused (design §2.8), green when ready, plain otherwise. */
export function readinessTone(readiness: ComposeReadiness): "ready" | "danger" | "plain" {
  if (readiness.ready) return "ready";
  if (readiness.over || (readiness.filled === readiness.required && readiness.problem !== null)) return "danger";
  return "plain";
}

/** A block's counter against its limit: `12/60` beside the label on a desktop
 *  (board `Compose`), `48 left` / `3 over` on a phone (board `PhoneCompose`). */
export function counterText(spec: PostBlockSpec, raw: string | undefined, form: "ratio" | "left" = "ratio"): string {
  const length = composeValue(raw).length;
  if (form === "ratio") return `${length}/${spec.limit}`;
  const left = spec.limit - length;
  return left < 0 ? `${-left} over` : `${left} left`;
}

/** Whether a block holds more than its limit: the counter turns red. */
export function isOverLimit(spec: PostBlockSpec, raw: string | undefined): boolean {
  return composeValue(raw).length > spec.limit;
}

/** Whether a block holds anything: a required block is marked until it does. */
export function isFilled(raw: string | undefined): boolean {
  return composeValue(raw).length > 0;
}

/**
 * What is wrong with each block, by block id, as the validator says it. Run
 * in `draft` mode: an empty required block is not an error to print under a
 * field — it is the mark the block wears until it is filled.
 */
export function blockProblems(
  kind: AuthoredProductPostKind,
  values: ComposeValues,
  placed: readonly string[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const error of validatePostBlocks(kind, composeBlocks(kind, values, placed), { mode: "draft" })) {
    (out[error.block] ??= []).push(error.message);
  }
  return out;
}

/** The prefix core's field errors wear for a block: `blocks.<id>`. */
export const SERVER_BLOCK_FIELD_PREFIX = "blocks.";

/**
 * The server's field errors, by block id. An enhanced save gets the sentences
 * (`{"blocks.try": ["Try it must be an http(s) address"]}`); a plain form's
 * redirect can carry only WHICH fields (`?fields=blocks.try,blocks.what`), so
 * those get the validator's own sentence for the block, or a plain one.
 */
export function serverBlockErrors(
  fields: Readonly<Record<string, readonly string[]>> | readonly string[],
  kind: AuthoredProductPostKind,
  blocks: readonly ProductPostBlock[] = [],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const known = new Set(composeSpecs(kind).map((spec) => spec.id));
  if (Array.isArray(fields)) {
    const said = validatePostBlocks(kind, blocks);
    for (const name of fields as readonly string[]) {
      if (!name.startsWith(SERVER_BLOCK_FIELD_PREFIX)) continue;
      const id = name.slice(SERVER_BLOCK_FIELD_PREFIX.length);
      if (!known.has(id)) continue;
      const messages = said.filter((error) => error.block === id).map((error) => error.message);
      out[id] = messages.length > 0 ? messages : ["This block needs another look"];
    }
    return out;
  }
  for (const [name, messages] of Object.entries(fields as Readonly<Record<string, readonly string[]>>)) {
    if (!name.startsWith(SERVER_BLOCK_FIELD_PREFIX)) continue;
    const id = name.slice(SERVER_BLOCK_FIELD_PREFIX.length);
    if (!known.has(id)) continue;
    out[id] = messages.length > 0 ? [...messages] : ["This block needs another look"];
  }
  return out;
}

/** The hint inside an empty field (board `PhoneCompose`), by kind and block. */
export const COMPOSE_PLACEHOLDER: Record<AuthoredProductPostKind, Readonly<Record<string, string>>> = {
  feature: {
    feature: "What shipped",
    what: "One or two sentences",
    try: "https://",
    for: "Who it is for",
    milestone: "For example AS3",
    screenshot: "https://",
    demo: "https://",
  },
  version: {
    version: "For example 1.3.0",
    added: "One change per line",
    changed: "One change per line",
    fixed: "One fix per line",
    security: "One item per line",
    breaking: "What people must do",
  },
  idea: {
    problem: "The problem in one or two sentences",
    who: "The people who feel it",
    "why-now": "What changed",
    detail: "Anything else",
    seats: "Roles you need",
    evidence: "https://",
  },
  seat: {
    role: "Name of the seat",
    what: "The work, plainly",
    time: "Hours a week",
    return: "What the person gets",
    skills: "Helpful skills",
  },
};

/** The builder's own address for a post that exists: `/{slug}/new?draft=<id>`. */
export function composeDraftPath(slug: string, postId: string): string {
  return `/${slug}/new?draft=${encodeURIComponent(postId)}`;
}

/** The page's title: a new post, a draft carried on, or a published post
 *  being edited. */
export function composeTitle(state: "new" | "draft" | "published"): string {
  return state === "published" ? "Edit post" : "New post";
}

/** The product the preview draws the card for. */
export interface ComposeProduct {
  readonly slug: string;
  readonly name: string;
  readonly stage: ProductStage;
  readonly logo: MediaThumbnail | null;
  readonly milestoneCounts: MilestoneCounts;
}

/** The id the preview's card wears. Not a post's id: nothing can be read,
 *  reacted to or linked by it. */
export const PREVIEW_POST_ID = "ppo_preview";

/**
 * The card a reader would see, from what is typed so far: the blocks exactly
 * as publishing stores them (`publishedPostBlocks`), on the product's own
 * row. `at` is the moment the page was rendered, handed in so the server and
 * the browser draw the same date.
 */
export function previewPost(
  kind: AuthoredProductPostKind,
  values: ComposeValues,
  placed: readonly string[],
  product: ComposeProduct,
  at: string,
): PublicProductPost {
  return {
    id: PREVIEW_POST_ID,
    kind,
    product: {
      slug: product.slug,
      name: product.name,
      stage: product.stage,
      logo: product.logo,
      milestoneCounts: product.milestoneCounts,
    },
    author: null,
    blocks: publishedPostBlocks(kind, composeBlocks(kind, values, placed)),
    publishedAt: at,
    reactions: { useful: 0, would_use: 0, impressive: 0, curious: 0 },
    commentCount: 0,
    threadId: null,
  };
}

/** The kind's own name, for the badge on the card and the page's title. */
export function composeKindLabel(kind: AuthoredProductPostKind): string {
  return PRODUCT_POST_KIND_LABELS[kind];
}
