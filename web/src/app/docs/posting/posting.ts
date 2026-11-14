// The posting spec, as pure functions (openproduct-redesign OPR-3; board
// `Templates`).
//
// THE PAGE IS GENERATED FROM THE CATALOGUE. `/docs/posting` says which kinds
// of post there are, which blocks each has, which are required and how long
// each may be — and every one of those facts is read here from
// `POST_BLOCK_CATALOGUE`, the list the builder draws and core validates
// against. Nothing below names a block, a limit or "required" by hand, so the
// page cannot say something the validator does not enforce.
//
// What IS written here is one sentence per kind (when the kind is used) and
// one per block TYPE (what a `line` or a `url` is). Both are keyed by the
// contract's own closed lists, so a new kind or a new type does not compile
// until it has its sentence.

import {
  AUTHORED_PRODUCT_POST_KINDS,
  POST_BLOCK_CATALOGUE,
  PRODUCT_POST_KINDS,
  PRODUCT_POST_KIND_LABELS,
  type PostBlockSpec,
  type PostBlockType,
  type ProductPostKind,
} from "@openproduct/contracts";

/** What a block of each type holds, before its limit. */
export const BLOCK_TYPE_RULE: Record<PostBlockType, string> = {
  line: "one line",
  text: "a short paragraph",
  lines: "a list, one entry per line",
  url: "one http(s) address",
};

/** One block's rule, as the page prints it: its type and its limit, both from
 *  the spec — "one line, up to 60 characters". */
export function blockRule(spec: Pick<PostBlockSpec, "type" | "limit">): string {
  return `${BLOCK_TYPE_RULE[spec.type]}, up to ${spec.limit.toLocaleString("en-US")} characters`;
}

/** `Required` or `Optional`, from the spec. */
export function blockRequirement(spec: Pick<PostBlockSpec, "required">): "Required" | "Optional" {
  return spec.required ? "Required" : "Optional";
}

/** When each kind is used: one sentence a reader can hold a post against. */
export const KIND_WHEN: Record<ProductPostKind, string> = {
  feature: "Something new that people can use today.",
  version: "A numbered release with its changes listed.",
  demo: "A recorded run of the real product.",
  idea: "A problem worth building for, before any code.",
  seat: "An open seat on the crew.",
};

/** Whether a kind is written in the builder or made another way. Derived:
 *  the contract's own list of authored kinds decides. */
export function kindIsAuthored(kind: ProductPostKind): boolean {
  return (AUTHORED_PRODUCT_POST_KINDS as readonly string[]).includes(kind);
}

/** The mono line beside a kind's name. */
export function kindWho(kind: ProductPostKind): string {
  return kindIsAuthored(kind) ? "Posted by the crew" : "Recorded, not written";
}

export interface PostingField {
  readonly id: string;
  readonly name: string;
  readonly rule: string;
  readonly requirement: "Required" | "Optional";
  readonly required: boolean;
}

export interface PostingTemplate {
  readonly kind: ProductPostKind;
  readonly label: string;
  readonly who: string;
  readonly when: string;
  readonly authored: boolean;
  /** The kind's blocks, in the catalogue's order — the order they are
   *  written and drawn in. */
  readonly fields: readonly PostingField[];
}

/** One kind's template, read from the catalogue. */
export function postingTemplate(kind: ProductPostKind): PostingTemplate {
  return {
    kind,
    label: PRODUCT_POST_KIND_LABELS[kind],
    who: kindWho(kind),
    when: KIND_WHEN[kind],
    authored: kindIsAuthored(kind),
    fields: POST_BLOCK_CATALOGUE[kind].map((spec) => ({
      id: spec.id,
      name: spec.label,
      rule: blockRule(spec),
      requirement: blockRequirement(spec),
      required: spec.required,
    })),
  };
}

/** Every kind there is, in the contract's order. */
export function postingTemplates(): PostingTemplate[] {
  return PRODUCT_POST_KINDS.map(postingTemplate);
}

const NUMBER_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

/** The page's title. THE NUMBER IS COUNTED, not written: "Five kinds of post,
 *  and nothing else" for as long as the contract holds five. */
export function postingTitle(count: number = PRODUCT_POST_KINDS.length): string {
  const word = NUMBER_WORDS[count] ?? String(count);
  return `${word} ${count === 1 ? "kind" : "kinds"} of post, and nothing else`;
}
