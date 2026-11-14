// The post templates: every kind's blocks, and the one validator
// (openproduct-redesign OPR-3, design §6.2).
//
// A FILE OF ITS OWN, beside `product-posts.ts`, for one reason: weight. The
// catalogue and its validator are what the post builder and a card's body
// read; the ids, kinds, reactions and addresses in `product-posts.ts` are
// what every page's shell reads. A bundler keeps or drops a module whole, so
// while the two lived in one file every page carried the templates. The
// barrel exports both, and nothing that imports from `@openproduct/contracts`
// can tell the difference.

import { PRODUCT_POST_KIND_LABELS, type ProductPostKind } from "./product-posts.js";

/**
 * What a block holds.
 *
 *   line   one line of text
 *   text   a short paragraph; line breaks allowed
 *   lines  a list, one entry per line
 *   url    one absolute http(s) address
 *
 * A VALUE IS ALWAYS A STRING. A `lines` block is its entries joined by a line
 * break, and its limit counts the whole of it; `postBlockLines` splits it.
 */
export const POST_BLOCK_TYPES = ["line", "text", "lines", "url"] as const;
export type PostBlockType = (typeof POST_BLOCK_TYPES)[number];

export interface PostBlockSpec {
  readonly id: string;
  readonly label: string;
  readonly required: boolean;
  readonly type: PostBlockType;
  /** The most characters the value may hold. */
  readonly limit: number;
}

const block = (
  id: string,
  label: string,
  required: boolean,
  type: PostBlockType,
  limit: number,
): PostBlockSpec => ({ id, label, required, type, limit });

/** Every kind's blocks, in the order they are written and drawn. */
export const POST_BLOCK_CATALOGUE: Record<ProductPostKind, readonly PostBlockSpec[]> = {
  feature: [
    block("feature", "Feature", true, "line", 60),
    block("what", "What it does", true, "text", 200),
    block("try", "Try it", true, "url", 200),
    block("for", "For", false, "line", 60),
    block("milestone", "Milestone", false, "line", 20),
    block("screenshot", "Screenshot", false, "url", 200),
    block("demo", "Demo", false, "url", 200),
  ],
  version: [
    block("version", "Version", true, "line", 20),
    block("added", "Added", true, "lines", 300),
    block("changed", "Changed", false, "lines", 300),
    block("fixed", "Fixed", false, "lines", 300),
    block("security", "Security", false, "lines", 300),
    block("breaking", "Breaking change", false, "text", 200),
  ],
  idea: [
    block("problem", "Problem", true, "text", 200),
    block("who", "Who has it", true, "line", 80),
    block("why-now", "Why now", false, "text", 200),
    block("detail", "More detail", false, "text", 400),
    block("seats", "Seats needed", false, "line", 80),
    block("evidence", "Evidence", false, "url", 200),
  ],
  seat: [
    block("role", "Role", true, "line", 60),
    block("what", "What you'd do", true, "text", 200),
    block("time", "Time", false, "line", 40),
    block("return", "In return", false, "line", 80),
    block("skills", "Skills", false, "line", 80),
  ],
  demo: [
    block("title", "Title", false, "line", 80),
    block("note", "Note", false, "text", 200),
  ],
};

export function postBlocksOf(kind: ProductPostKind): readonly PostBlockSpec[] {
  return POST_BLOCK_CATALOGUE[kind];
}

export function postBlockSpec(kind: ProductPostKind, blockId: string): PostBlockSpec | null {
  return POST_BLOCK_CATALOGUE[kind].find((spec) => spec.id === blockId) ?? null;
}

/** One block of a post, as stored and as sent. */
export interface ProductPostBlock {
  block: string;
  value: string;
}

export const PRODUCT_POST_BLOCK_KEYS = ["block", "value"] as const;

/** The value of one block of a post, or null when the post does not carry it. */
export function postBlockValue(blocks: readonly ProductPostBlock[], blockId: string): string | null {
  return blocks.find((entry) => entry.block === blockId)?.value ?? null;
}

/** A `lines` block's entries: one per line, blank lines dropped. */
export function postBlockLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** An absolute http(s) address, normalised; null for anything else. */
export function postUrl(value: string): string | null {
  const text = value.trim();
  if (text.length === 0 || /\s/.test(text)) return null;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const POST_BLOCK_ERROR_CODES = [
  "unknown_block",
  "out_of_order",
  "duplicate",
  "over_limit",
  "required",
  "invalid_value",
] as const;
export type PostBlockErrorCode = (typeof POST_BLOCK_ERROR_CODES)[number];

export interface PostBlockError {
  /** The block the error is about: its id, as sent. */
  block: string;
  code: PostBlockErrorCode;
  message: string;
}

export interface ValidatePostBlocksOptions {
  /**
   * `publish` (the default) is the whole rule. `draft` is the same rule less
   * one line: a required block may be empty or absent, because a draft is a
   * post somebody has not finished.
   */
  mode?: "publish" | "draft";
}

/** A post never holds more blocks than its kind has. */
export const POST_BLOCKS_MAX = 8;

/**
 * Read `blocks` from an untrusted body: a list of `{block, value}` with string
 * members, or null. Values are trimmed and line endings normalised, so a limit
 * counts what a reader sees.
 */
export function parsePostBlocks(raw: unknown): ProductPostBlock[] | null {
  if (!Array.isArray(raw) || raw.length > POST_BLOCKS_MAX * 2) return null;
  const out: ProductPostBlock[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const { block: id, value } = entry as { block?: unknown; value?: unknown };
    if (typeof id !== "string" || typeof value !== "string") return null;
    out.push({ block: id, value: value.replace(/\r\n?/g, "\n").trim() });
  }
  return out;
}

/**
 * Check a post's blocks against its kind's catalogue.
 *
 * PURE, and the one validator: the builder calls it to enable Post, core calls
 * it before every write. An empty list is "nothing to say"; each entry names
 * the block it is about.
 *
 *   unknown_block  the kind has no such block
 *   duplicate      the block appears twice
 *   out_of_order   the block comes before one the catalogue puts ahead of it
 *   over_limit     the value is longer than the block allows
 *   invalid_value  a line holding a line break, or a url that is not http(s)
 *   required       (publish only) a required block is absent or empty
 */
export function validatePostBlocks(
  kind: ProductPostKind,
  blocks: readonly ProductPostBlock[],
  options: ValidatePostBlocksOptions = {},
): PostBlockError[] {
  const mode = options.mode ?? "publish";
  const specs = POST_BLOCK_CATALOGUE[kind];
  const errors: PostBlockError[] = [];
  const seen = new Set<string>();
  let lastIndex = -1;

  for (const entry of blocks) {
    const index = specs.findIndex((spec) => spec.id === entry.block);
    const spec = specs[index];
    if (!spec) {
      errors.push({ block: entry.block, code: "unknown_block", message: `${PRODUCT_POST_KIND_LABELS[kind]} has no such block` });
      continue;
    }
    if (seen.has(spec.id)) {
      errors.push({ block: spec.id, code: "duplicate", message: `${spec.label} appears twice` });
      continue;
    }
    seen.add(spec.id);
    if (index < lastIndex) {
      errors.push({ block: spec.id, code: "out_of_order", message: `${spec.label} is out of order` });
    } else {
      lastIndex = index;
    }
    const value = entry.value;
    if (value.length > spec.limit) {
      errors.push({ block: spec.id, code: "over_limit", message: `${spec.label} is at most ${spec.limit} characters` });
    }
    if (value.length === 0) continue;
    if (spec.type === "line" && /[\r\n]/.test(value)) {
      errors.push({ block: spec.id, code: "invalid_value", message: `${spec.label} is one line` });
    }
    if (spec.type === "url" && postUrl(value) === null) {
      errors.push({ block: spec.id, code: "invalid_value", message: `${spec.label} must be an http(s) address` });
    }
  }

  if (mode === "publish") {
    for (const spec of specs) {
      if (!spec.required) continue;
      const value = postBlockValue(blocks, spec.id);
      if (value === null || value.trim().length === 0) {
        errors.push({ block: spec.id, code: "required", message: `${spec.label} is required` });
      }
    }
  }
  return errors;
}

/** Whether Post may be pressed. */
export function postBlocksPublishable(kind: ProductPostKind, blocks: readonly ProductPostBlock[]): boolean {
  return validatePostBlocks(kind, blocks).length === 0;
}

/**
 * The blocks a published post stores: an optional block left empty is not
 * part of the post, so it is dropped; a url is stored normalised.
 */
export function publishedPostBlocks(kind: ProductPostKind, blocks: readonly ProductPostBlock[]): ProductPostBlock[] {
  const out: ProductPostBlock[] = [];
  for (const entry of blocks) {
    const spec = postBlockSpec(kind, entry.block);
    if (!spec || entry.value.length === 0) continue;
    out.push({ block: spec.id, value: spec.type === "url" ? (postUrl(entry.value) ?? entry.value) : entry.value });
  }
  return out;
}

/**
 * Build a post's blocks from what something else already holds (a milestone,
 * a role opening, a listing): catalogue order, empty values dropped, each
 * value cut to its block's limit so the draft it makes is always storable.
 */
export function prefilledPostBlocks(
  kind: ProductPostKind,
  values: Readonly<Record<string, string | null | undefined>>,
): ProductPostBlock[] {
  const out: ProductPostBlock[] = [];
  for (const spec of POST_BLOCK_CATALOGUE[kind]) {
    const raw = values[spec.id];
    if (typeof raw !== "string") continue;
    let value = raw.replace(/\r\n?/g, "\n").trim();
    if (spec.type === "line") value = value.replace(/\s*\n\s*/g, " ");
    if (spec.type === "url") {
      const url = postUrl(value);
      if (url === null || url.length > spec.limit) continue;
      value = url;
    }
    value = value.slice(0, spec.limit).trim();
    if (value.length > 0) out.push({ block: spec.id, value });
  }
  return out;
}
