// A product's own links (openproduct-left-rail LR-8).
//
// The crew writes them from Edit details: docs, a demo, a changelog, a
// community. Each is a label and an address and nothing else — no stage, no
// observation. They show in the product's header card, after where it runs,
// its repository and its workspace.
//
// ONE PARSER, HERE, so the form that reads a line, the route that receives
// it and core that stores it cannot disagree about what a link is.

import { postUrl } from "./product-post-blocks.js";

/** One link the crew wrote: what it is called and where it goes. */
export interface ProductLink {
  label: string;
  url: string;
}

/** A product holds at most six: a row of tiles, not a directory. */
export const MAX_PRODUCT_LINKS = 6;
/** A tile's label is a word or three. */
export const MAX_PRODUCT_LINK_LABEL = 40;
/** The Try it address's own bound. */
export const MAX_PRODUCT_LINK_URL = 200;

/** What the form says under the field. */
export const PRODUCT_LINKS_HINT = `One per line, as "Label | https://address". Up to ${MAX_PRODUCT_LINKS}.`;

/**
 * Links from a request body, validated: an array of at most six `{ label,
 * url }`, each label 1 to 40 characters once trimmed, each address an
 * absolute http(s) URL of at most 200. Anything else is refused with one
 * sentence that names the first thing wrong — never silently dropped, since
 * a link that vanishes on save is a bug report nobody can write.
 */
export function parseProductLinks(value: unknown): { links: ProductLink[] } | { error: string } {
  if (!Array.isArray(value)) return { error: "Links must be a list" };
  if (value.length > MAX_PRODUCT_LINKS) return { error: `At most ${MAX_PRODUCT_LINKS} links` };
  const links: ProductLink[] = [];
  for (const [index, entry] of value.entries()) {
    const at = `Link ${index + 1}`;
    if (!entry || typeof entry !== "object") return { error: `${at} must be a label and an address` };
    const { label, url } = entry as { label?: unknown; url?: unknown };
    const name = typeof label === "string" ? label.trim().replace(/\s+/g, " ") : "";
    if (name.length === 0) return { error: `${at} needs a label` };
    if (name.length > MAX_PRODUCT_LINK_LABEL) return { error: `${at}: the label is at most ${MAX_PRODUCT_LINK_LABEL} characters` };
    const address = typeof url === "string" ? postUrl(url) : null;
    if (address === null || address.length > MAX_PRODUCT_LINK_URL) {
      return { error: `${at}: the address must be an absolute http(s) URL of at most ${MAX_PRODUCT_LINK_URL} characters` };
    }
    links.push({ label: name, url: address });
  }
  return { links };
}

/**
 * The form's text, as the raw list `parseProductLinks` judges: one link per
 * non-empty line, the label before the LAST ` | ` or `|` and the address
 * after it. A line with no bar is an address with no label, which the parser
 * refuses by name — the form does not guess a label from a host.
 */
export function productLinksFromText(text: string): Array<{ label: string; url: string }> {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const bar = line.lastIndexOf("|");
      return bar === -1 ? { label: "", url: line } : { label: line.slice(0, bar).trim(), url: line.slice(bar + 1).trim() };
    });
}

/** Stored links, as the form's text: what `productLinksFromText` reads back. */
export function productLinksToText(links: readonly ProductLink[]): string {
  return links.map((link) => `${link.label} | ${link.url}`).join("\n");
}
