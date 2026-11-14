// What a crew form says, read into an act (openproduct-redesign OPR-3).
//
// PURE. The browser posts a form (or the same fields as JSON) to one of the
// `/{slug}/manage/…` handlers; this module turns those fields into a typed
// act or a field error, with no request object and no network. The handler
// (`crew-handler.ts`) runs the act; the route file only adapts the transport.
//
// NO ID OF THE PRODUCT IS EVER READ FROM A FORM. `org` and `profile` are not
// fields here and a form that sends them is ignored: the handler resolves
// both from the slug in its own address and the caller's token. What a form
// may name is a post (`ppo_…`), a milestone (`pms_…`) or a seat (`opr_…`) OF
// that product, and core checks each belongs to it.

import {
  MILESTONE_ID_RE,
  ME_OVERLAY_OPENING_ID_RE,
  POST_BLOCK_CATALOGUE,
  PRODUCT_POST_ID_RE,
  isAuthoredProductPostKind,
  isProductPostKind,
  parsePostBlocks,
  type AuthoredProductPostKind,
  type MilestoneRequest,
  type ProductPostBlock,
  type ProductPostKind,
} from "@openproduct/contracts";

import type { CrewProfilePatch } from "./crew-api";

/** A form's fields, or a JSON body's members: strings from a form, anything
 *  from JSON. Every reader below checks the type of what it takes. */
export type Fields = Readonly<Record<string, unknown>>;

/** What a form got wrong, in the API's own shape: field → sentences. */
export interface FormError {
  kind: "invalid";
  fields: Record<string, string[]>;
}

const invalid = (field: string, message: string): FormError => ({ kind: "invalid", fields: { [field]: [message] } });

const text = (fields: Fields, name: string): string | null => {
  const value = fields[name];
  return typeof value === "string" ? value : null;
};

/** The prefix a block's field wears in a form: `block.feature`, `block.try`. */
export const BLOCK_FIELD_PREFIX = "block.";

/** The form field that holds one block of a post. */
export function blockField(blockId: string): string {
  return `${BLOCK_FIELD_PREFIX}${blockId}`;
}

/**
 * A post's blocks, out of a form.
 *
 * TWO SPELLINGS, ONE RESULT. A plain form posts one field per block
 * (`block.<id>`); an enhanced caller may post `blocks` as the wire's own
 * list (`[{block, value}]`, or that list as a JSON string). Either way the
 * answer is in CATALOGUE ORDER when `kind` is known — a form's field order is
 * the DOM's, and a maker never reorders (design §2.1) — and a block left
 * empty is left out, which is how an optional block is removed.
 *
 * Null when `blocks` is present and is not a list of `{block, value}`.
 */
export function blocksFromFields(fields: Fields, kind: ProductPostKind | null): ProductPostBlock[] | null {
  let listed: ProductPostBlock[] | null = null;
  const raw = fields.blocks;
  if (raw !== undefined && raw !== null && raw !== "") {
    let parsed: unknown = raw;
    if (typeof raw === "string") {
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
    }
    listed = parsePostBlocks(parsed);
    if (listed === null) return null;
  }
  const values = new Map<string, string>();
  const order: string[] = [];
  const put = (id: string, value: string) => {
    if (!values.has(id)) order.push(id);
    values.set(id, value);
  };
  for (const entry of listed ?? []) put(entry.block, entry.value);
  for (const [name, value] of Object.entries(fields)) {
    if (!name.startsWith(BLOCK_FIELD_PREFIX) || typeof value !== "string") continue;
    put(name.slice(BLOCK_FIELD_PREFIX.length), value.replace(/\r\n?/g, "\n").trim());
  }
  const present = order.filter((id) => (values.get(id) ?? "").length > 0);
  if (kind === null) return present.map((id) => ({ block: id, value: values.get(id)! }));
  const known = POST_BLOCK_CATALOGUE[kind].map((spec) => spec.id);
  // Catalogue order first; a block the kind does not have stays, last, so
  // core names it (`unknown_block`) instead of this dropping it silently.
  const sorted = [...known.filter((id) => present.includes(id)), ...present.filter((id) => !known.includes(id))];
  return sorted.map((id) => ({ block: id, value: values.get(id)! }));
}

// ─── posts ─────────────────────────────────────────────────────────────────

export const POST_INTENTS = ["create", "save", "publish", "remove"] as const;
export type PostIntent = (typeof POST_INTENTS)[number];

export type PostAct =
  /** Start a draft. */
  | { intent: "create"; kind: AuthoredProductPostKind; blocks: ProductPostBlock[] }
  /** Save a post's blocks. */
  | { intent: "save"; postId: string; blocks: ProductPostBlock[] }
  /** Publish a draft — or, with no `postId`, write one and publish it in the
   *  same act (the builder's Post, pressed before anything was saved). */
  | {
      intent: "publish";
      postId: string | null;
      kind: AuthoredProductPostKind | null;
      blocks: ProductPostBlock[] | null;
      milestoneId: string | null;
      roleOpeningId: string | null;
    }
  | { intent: "remove"; postId: string };

/**
 * Fields: `intent` (create | save | publish | remove), `post` (a `ppo_…`),
 * `kind`, the blocks (`block.<id>` each, or `blocks`), and on publish
 * `milestone` (`pms_…`) and `opening` (`opr_…`).
 */
export function readPostAct(fields: Fields): PostAct | FormError {
  const intent = text(fields, "intent");
  if (!(POST_INTENTS as readonly string[]).includes(intent ?? "")) return invalid("intent", "Unknown action");
  const postId = text(fields, "post");
  if (postId !== null && postId !== "" && !PRODUCT_POST_ID_RE.test(postId)) return invalid("post", "Not a post");
  const post = postId && postId.length > 0 ? postId : null;
  const kindText = text(fields, "kind");
  const kind = isProductPostKind(kindText) ? kindText : null;

  if (intent === "remove") {
    return post ? { intent: "remove", postId: post } : invalid("post", "Name the post");
  }

  const blocks = blocksFromFields(fields, kind);
  if (blocks === null) return invalid("blocks", "Blocks must be a list of {block, value}");

  if (intent === "create") {
    if (!isAuthoredProductPostKind(kindText)) return invalid("kind", "Choose a kind of post");
    return { intent: "create", kind: kindText, blocks };
  }
  if (intent === "save") {
    return post ? { intent: "save", postId: post, blocks } : invalid("post", "Name the post");
  }

  // publish
  const milestone = text(fields, "milestone");
  if (milestone !== null && milestone !== "" && !MILESTONE_ID_RE.test(milestone)) {
    return invalid("milestone", "Not a milestone");
  }
  const opening = text(fields, "opening");
  if (opening !== null && opening !== "" && !ME_OVERLAY_OPENING_ID_RE.test(opening)) {
    return invalid("opening", "Not a seat");
  }
  if (post === null && !isAuthoredProductPostKind(kindText)) return invalid("kind", "Choose a kind of post");
  const sentBlocks = fields.blocks !== undefined || Object.keys(fields).some((name) => name.startsWith(BLOCK_FIELD_PREFIX));
  return {
    intent: "publish",
    postId: post,
    kind: isAuthoredProductPostKind(kindText) ? kindText : null,
    // A publish that sent no blocks publishes the draft as it stands.
    blocks: sentBlocks || post === null ? blocks : null,
    milestoneId: milestone && milestone.length > 0 ? milestone : null,
    roleOpeningId: opening && opening.length > 0 ? opening : null,
  };
}

// ─── milestones ────────────────────────────────────────────────────────────

export const MILESTONE_INTENTS = ["create", "update", "reorder", "delete", "ship", "unship"] as const;
export type MilestoneIntent = (typeof MILESTONE_INTENTS)[number];

export type MilestoneAct =
  | { intent: "create"; body: MilestoneRequest }
  | { intent: "update"; milestoneId: string; body: Partial<MilestoneRequest> }
  | { intent: "reorder"; order: string[] }
  | { intent: "delete"; milestoneId: string }
  | { intent: "ship"; milestoneId: string }
  | { intent: "unship"; milestoneId: string };

function milestoneBody(fields: Fields): Partial<MilestoneRequest> {
  const body: Partial<MilestoneRequest> = {};
  const code = text(fields, "code");
  if (code !== null) body.code = code.trim();
  const title = text(fields, "title");
  if (title !== null) body.title = title.trim();
  const summary = fields.summary;
  if (typeof summary === "string") body.summary = summary.trim().length > 0 ? summary.trim() : null;
  else if (summary === null) body.summary = null;
  return body;
}

/** `order` as a form sends it (ids joined by commas) or as JSON (a list). */
function orderOf(raw: unknown): string[] | null {
  const parts = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : null;
  if (parts === null) return null;
  const ids = parts.map((part) => (typeof part === "string" ? part.trim() : "")).filter((id) => id.length > 0);
  if (ids.length === 0 || ids.some((id) => !MILESTONE_ID_RE.test(id))) return null;
  return new Set(ids).size === ids.length ? ids : null;
}

/**
 * Fields: `intent` (create | update | reorder | delete | ship | unship),
 * `milestone` (a `pms_…`), `code`, `title`, `summary`, and for reorder
 * `order` (every milestone id, comma-separated, in the new order).
 *
 * The limits are core's to enforce; this checks only that the act is
 * well-formed, and core's field errors come back verbatim.
 */
export function readMilestoneAct(fields: Fields): MilestoneAct | FormError {
  const intent = text(fields, "intent");
  if (!(MILESTONE_INTENTS as readonly string[]).includes(intent ?? "")) return invalid("intent", "Unknown action");
  if (intent === "create") {
    const body = milestoneBody(fields);
    if (!body.code) return invalid("code", "A milestone needs a code");
    if (!body.title) return invalid("title", "A milestone needs a title");
    return { intent: "create", body: { code: body.code, title: body.title, ...("summary" in body ? { summary: body.summary } : {}) } };
  }
  if (intent === "reorder") {
    const order = orderOf(fields.order);
    return order ? { intent: "reorder", order } : invalid("order", "Send every milestone once, in the new order");
  }
  const milestoneId = text(fields, "milestone");
  if (!milestoneId || !MILESTONE_ID_RE.test(milestoneId)) return invalid("milestone", "Name the milestone");
  if (intent === "update") return { intent: "update", milestoneId, body: milestoneBody(fields) };
  return { intent: intent as "delete" | "ship" | "unship", milestoneId };
}

// ─── the listing's own fields ──────────────────────────────────────────────

/**
 * Fields: any of `tryUrl`, `tagline`, `pitch`, `slug`. Only a field the form
 * SENT is in the patch — an absent field is left as it is, and an empty
 * `tryUrl`, `tagline` or `pitch` clears it. `slug` is the product's name and
 * its address; an empty one is refused here rather than sent.
 */
export function readProfilePatch(fields: Fields): CrewProfilePatch | FormError {
  const patch: CrewProfilePatch = {};
  for (const name of ["tryUrl", "tagline", "pitch"] as const) {
    const value = fields[name];
    if (typeof value === "string") patch[name] = value.trim().length > 0 ? value.trim() : null;
    else if (value === null) patch[name] = null;
  }
  const slug = text(fields, "slug");
  if (slug !== null) {
    if (slug.trim().length === 0) return invalid("slug", "A product needs a name");
    patch.slug = slug.trim();
  }
  if (Object.keys(patch).length === 0) return invalid("form", "Nothing to change");
  return patch;
}
