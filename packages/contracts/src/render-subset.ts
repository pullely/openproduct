// What a stranger's text may become on a public page (openproduct-commons CB0).
//
// A post is a LINK-INJECTION AND XSS VECTOR BEFORE IT IS A CONVERSATION. It is
// free text, written by somebody you have never met, attached to somebody
// else's product, on a page that is anonymously readable, crawlable and
// permanent. Every decision in this file follows from that sentence.
//
// THE ONE STRUCTURAL DECISION: THIS PRODUCES A TYPED TREE, NEVER AN HTML
// STRING. A renderer that returns markup invites `dangerouslySetInnerHTML` at
// the call site, and then the safety of every post on the estate rests on one
// sanitiser being correct forever. Returning nodes means React renders them as
// elements, escaping is the framework's job rather than ours, and there is no
// call site that COULD inject even if somebody wanted to. The subset below is
// therefore a closed set of node kinds, not a list of allowed tags.
//
// BODIES ARE STORED AUTHORED, rendered on read. Storing rendered output would
// freeze today's subset into every old row: the day we discover something must
// come out, we could take it out of the renderer and every post written before
// that day would still carry it. Authored text is also what an author asked to
// edit, and what an appeal is about.
//
// WHAT IS ABSENT, AND WHY EACH ONE WAS REFUSED:
//
//   raw HTML     — the whole class. There is no safe subset of "some tags",
//                  because the attack is rarely the tag and usually the
//                  attribute.
//   images       — an <img src> is a beacon: it reports every reader's IP and
//                  user agent to whoever wrote the post, on a page we promise
//                  is anonymous (OPC-1). It also breaks the byte-identical
//                  read (I6) the moment anybody proxies it. A link to an image
//                  is a link, and says so.
//   headings     — a post is a reply, not a document. Headings in a thread are
//                  a way to shout, and they wreck the page's own outline for
//                  a screen reader that has just been told where it is.
//   tables       — no width behaves on a 390px column, and every attempt ends
//                  in a horizontal scrollbar inside somebody else's page.
//   autolinking  — a bare URL stays TEXT. Turning it into a link means the
//                  renderer decides what is a link, and a renderer that finds
//                  links inside text is a renderer that can be tricked about
//                  where one ends.
//
// CV3 ADDED `mention`, WHICH LOOKS LIKE AUTOLINKING AND IS NOT. The refusal
// above is about DESTINATIONS: a renderer that finds links in text decides
// where a reader goes, and a boundary it gets wrong is a boundary an author
// did not choose. A mention carries **a handle and no href at all**. Its
// destination is not in the text, is not the author's to supply, and is a
// single closed shape on this estate's own namespace — so the worst a
// mis-parsed boundary can produce is a handle that does not resolve, which
// renders as the text it was. That is a different risk from the one the
// paragraph above refuses, and it is why this one is allowed.

import { HANDLE_MAX, HANDLE_MIN } from "./handles.js";


// ---------------------------------------------------------------------------

// The subset, as data
// ---------------------------------------------------------------------------

/**
 * Every node a body may produce. Closed, and the test suite pins the list —
 * adding one is a deliberate act with an argument attached, not a side effect
 * of touching the parser.
 */
export const RENDER_NODES = [
  "paragraph",
  "text",
  "emphasis",
  "strong",
  "code",
  "codeblock",
  "link",
  "list",
  "listitem",
  // CV3 — `@handle`. Carries the handle; NEVER an href.
  "mention",
  "quote",
] as const;
export type RenderNodeKind = (typeof RENDER_NODES)[number];

/**
 * The only schemes a link may carry.
 *
 * `javascript:` and `data:` are the obvious two, but the list is an ALLOWLIST
 * rather than a denylist for the boring reason that denylists lose: `vbscript:`,
 * `blob:`, and whatever a browser ships next are all refused by a list that
 * names what is permitted instead of what is not.
 *
 * No `mailto:` — a mail link on a crawlable page is an address harvested, and
 * I3 says this estate does not put addresses on public surfaces at all.
 */
export const LINK_SCHEMES = ["https", "http"] as const;

/**
 * What every rendered link carries, without exception.
 *
 * `ugc` and `nofollow` say what the link is: content the estate hosts and does
 * not vouch for. Without them, every post is an opportunity to borrow this
 * domain's ranking, which is the entire economics of comment spam.
 *
 * `noopener noreferrer` because a link opened from here must not be able to
 * reach back through `window.opener`, and must not tell the destination which
 * listing's discussion the reader came from.
 */
export const LINK_REL = "nofollow ugc noopener noreferrer";

/** A body's ceiling. Long enough for a real design argument, short enough that
 *  one post cannot become the page. */
export const MAX_POST_BODY = 8000;
export const MAX_THREAD_TITLE = 160;

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

export type RenderNode =
  | { kind: "text"; value: string }
  | { kind: "emphasis"; children: RenderNode[] }
  | { kind: "strong"; children: RenderNode[] }
  | { kind: "code"; value: string }
  | { kind: "codeblock"; value: string }
  | { kind: "link"; href: string; children: RenderNode[] }
  | { kind: "paragraph"; children: RenderNode[] }
  | { kind: "quote"; children: RenderNode[] }
  | { kind: "list"; ordered: boolean; children: RenderNode[] }
  | { kind: "listitem"; children: RenderNode[] }
  /**
   * CV3 — a mention of a handle in this estate's own namespace.
   *
   * `claimed` IS NOT DECIDED HERE. The parser sees text; whether a handle
   * belongs to somebody who showed up is a fact about the namespace, read by
   * core and stamped on with `resolveMentions`. Until then it is `false`,
   * which is the safe default: an unclaimed mention renders as plain text,
   * so a parser that never learns the answer under-links rather than
   * inventing a person (OPC-5).
   */
  | { kind: "mention"; handle: string; claimed: boolean };

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/**
 * Is this a destination we will render as a link?
 *
 * PARSED, NOT PATTERN-MATCHED. A regex over a URL is how `java\nscript:` and
 * `JaVaScRiPt:` and `  javascript:` get through — every one of those is a
 * different string and the same destination. `new URL()` is the browser's own
 * answer to "what does this address mean", which is the question that matters.
 *
 * Relative links are refused too. A post cannot address the estate's own
 * routes: `/studio/...` in a stranger's post is a link that looks like ours.
 */
export function linkIsRenderable(href: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return false;
  }
  const scheme = parsed.protocol.replace(/:$/, "").toLowerCase();
  return (LINK_SCHEMES as readonly string[]).includes(scheme);
}

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

const FENCE = "```";

/**
 * Authored text → a tree of nodes from the closed set above.
 *
 * DELIBERATELY SMALL. This is not markdown and does not try to be: it is the
 * handful of marks people actually use in a technical discussion, and every
 * one of them was added because leaving it out made a real post worse. A full
 * markdown parser here would be a dependency whose attack surface we do not
 * control, rendering into a page we promise is safe.
 *
 * ANYTHING IT DOES NOT UNDERSTAND STAYS TEXT. That is the whole safety
 * property, and it is why the failure mode of this parser is "your asterisks
 * showed up" rather than "somebody's markup ran". A parser that guesses is a
 * parser that can be surprised.
 */
export function parseBody(source: string): RenderNode[] {
  const body = source.slice(0, MAX_POST_BODY).replace(/\r\n?/g, "\n");
  const lines = body.split("\n");
  const out: RenderNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;

    // A fenced block, taken VERBATIM to its closing fence. Nothing inside is
    // parsed — the point of showing code is that it is shown as written, and a
    // parser that reached inside would let a snippet about links become one.
    if (line.trimStart().startsWith(FENCE)) {
      const collected: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i]!.trimStart().startsWith(FENCE)) {
        collected.push(lines[i]!);
        i += 1;
      }
      // An unclosed fence runs to the end rather than falling back to inline
      // parsing: somebody who opened a fence meant everything after it as code.
      i += 1;
      out.push({ kind: "codeblock", value: collected.join("\n") });
      continue;
    }

    if (line.trim().length === 0) {
      i += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const collected: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i]!)) {
        collected.push(lines[i]!.replace(/^\s*>\s?/, ""));
        i += 1;
      }
      out.push({ kind: "quote", children: [{ kind: "paragraph", children: inline(collected.join(" ")) }] });
      continue;
    }

    const bullet = /^\s*[-*]\s+/;
    const numbered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = !bullet.test(line);
      const items: RenderNode[] = [];
      while (i < lines.length && (bullet.test(lines[i]!) || numbered.test(lines[i]!))) {
        const text = lines[i]!.replace(bullet, "").replace(numbered, "");
        items.push({ kind: "listitem", children: inline(text) });
        i += 1;
      }
      out.push({ kind: "list", ordered, children: items });
      continue;
    }

    // A paragraph runs to the next blank line or block opener.
    const collected: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim().length > 0 &&
      !lines[i]!.trimStart().startsWith(FENCE) &&
      !/^\s*>\s?/.test(lines[i]!) &&
      !bullet.test(lines[i]!) &&
      !numbered.test(lines[i]!)
    ) {
      collected.push(lines[i]!);
      i += 1;
    }
    out.push({ kind: "paragraph", children: inline(collected.join(" ")) });
  }

  return out;
}

/**
 * The inline marks, in one pass, longest-opener first.
 *
 * `code` IS TAKEN BEFORE EVERYTHING ELSE, because a backtick span means "show
 * this as written" and a parser that found emphasis inside one would be
 * reformatting somebody's code. It is also the escape hatch a person reaches
 * for when they want to show the marks themselves.
 */
function inline(source: string): RenderNode[] {
  const out: RenderNode[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer.length > 0) {
      out.push({ kind: "text", value: buffer });
      buffer = "";
    }
  };

  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);

    const codeSpan = /^`([^`]+)`/.exec(rest);
    if (codeSpan) {
      flush();
      out.push({ kind: "code", value: codeSpan[1]! });
      i += codeSpan[0].length;
      continue;
    }

    // `[label](href)` — the ONLY way a link is made. The label may not contain
    // a bracket and the href may not contain a paren or whitespace, which
    // keeps the match unambiguous: an href that could swallow the rest of the
    // line is an href that can be pointed somewhere the author did not mean.
    const link = /^\[([^\]\n]{1,200})\]\(([^()\s]{1,500})\)/.exec(rest);
    if (link) {
      const href = link[2]!;
      flush();
      if (linkIsRenderable(href)) {
        out.push({ kind: "link", href, children: [{ kind: "text", value: link[1]! }] });
      } else {
        // REFUSED LINKS RENDER AS THE TEXT THEY WERE, never silently vanish.
        // A reader who cannot see that something was there cannot judge the
        // post, and an author whose link disappeared learns nothing.
        out.push({ kind: "text", value: link[0]! });
      }
      i += link[0].length;
      continue;
    }

    // CV3 — `@handle`, in this estate's own namespace and nowhere else.
    //
    // THE GRAMMAR IS THE HANDLE'S OWN (`HANDLE_PATTERN`), spelled inline
    // because this match runs mid-string and the shared pattern is anchored.
    // A trailing dash is excluded by the same rule that excludes it from a
    // handle, so `@ada-` mentions `ada` and leaves the dash as text.
    //
    // NOT PRECEDED BY A WORD CHARACTER: an email address in a post
    // (`ada@example.com`) is not a mention of `example`, and neither is
    // `foo@bar`. The check looks BEHIND rather than trying to recognise an
    // email, because recognising an email is the guessing this file refuses.
    const mention = /^@([a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?)/.exec(rest);
    if (mention && !/[A-Za-z0-9]/.test(source[i - 1] ?? "")) {
      const handle = mention[1]!;
      // AND THE RUN MUST END WHERE THE HANDLE DOES. The pattern caps at 32
      // characters, so a longer run of name characters would otherwise match
      // its first 32 and mention SOMEBODY ELSE — a different handle from the
      // one that was typed, which is worse than not linking at all. A
      // following dash is fine: `@ada-` is `@ada` and a dash, because a
      // handle cannot end in one anyway.
      const runsOn = /^[a-z0-9]/.test(rest.slice(mention[0].length));
      if (!runsOn && handle.length >= HANDLE_MIN && handle.length <= HANDLE_MAX) {
        flush();
        out.push({ kind: "mention", handle, claimed: false });
        i += mention[0].length;
        continue;
      }
      // Not a handle. The `@` falls through to the text buffer and the rest
      // of the run parses as what it is — nothing vanishes.
    }

    const strong = /^\*\*([^*\n]+)\*\*/.exec(rest);
    if (strong) {
      flush();
      // CV3 — PARSED, not raw text. These children used to be a single text
      // node, so `**@ada**` produced no mention and nobody was told. The
      // recursion is bounded by construction: the captured content contains
      // no `*` (the pattern forbids it), so it cannot re-enter this branch,
      // and every step consumes at least one character.
      out.push({ kind: "strong", children: inline(strong[1]!) });
      i += strong[0].length;
      continue;
    }

    const emphasis = /^\*([^*\n]+)\*/.exec(rest);
    if (emphasis) {
      flush();
      out.push({ kind: "emphasis", children: inline(emphasis[1]!) });
      i += emphasis[0].length;
      continue;
    }

    buffer += source[i];
    i += 1;
  }

  flush();
  return out;
}

/**
 * Every node kind a tree actually contains — the assertion an injection
 * corpus needs, because "it did not throw" is not the same as "it produced
 * nothing dangerous".
 */
export function nodeKinds(nodes: RenderNode[]): Set<RenderNodeKind> {
  const found = new Set<RenderNodeKind>();
  const walk = (list: RenderNode[]) => {
    for (const node of list) {
      found.add(node.kind);
      if ("children" in node) walk(node.children);
    }
  };
  walk(nodes);
  return found;
}

/** Every href a tree would render. What a link-safety test asserts over. */
export function linkHrefs(nodes: RenderNode[]): string[] {
  const hrefs: string[] = [];
  const walk = (list: RenderNode[]) => {
    for (const node of list) {
      if (node.kind === "link") hrefs.push(node.href);
      if ("children" in node) walk(node.children);
    }
  };
  walk(nodes);
  return hrefs;
}

/** All rendered text, for a test that needs to prove nothing was LOST. */
export function plainText(nodes: RenderNode[]): string {
  let out = "";
  const walk = (list: RenderNode[]) => {
    for (const node of list) {
      if (node.kind === "text" || node.kind === "code" || node.kind === "codeblock") out += node.value;
      // CV3 — a mention is text with a link's clothes on. Whatever reads a
      // body as a string (search, the digest, a length check) must see the
      // name that was written, or a post naming somebody would read as a post
      // with a hole in it.
      if (node.kind === "mention") out += `@${node.handle}`;
      if ("children" in node) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

// ---------------------------------------------------------------------------
// CV3 — mentions
// ---------------------------------------------------------------------------

/**
 * Every handle mentioned in a body, deduplicated, in the order they appear.
 *
 * The caller resolves them against the namespace in ONE read and hands the
 * answer back to `resolveMentions`. Deduplicated because a post that names
 * somebody four times is one mention of one person — for the read, and for
 * the notification.
 */
export function mentionedHandles(nodes: readonly RenderNode[]): string[] {
  const seen = new Set<string>();
  const walk = (list: readonly RenderNode[]): void => {
    for (const node of list) {
      if (node.kind === "mention") seen.add(node.handle);
      else if ("children" in node) walk(node.children);
    }
  };
  walk(nodes);
  return [...seen];
}

/**
 * Stamp each mention with whether its handle belongs to somebody.
 *
 * OPC-5 IN ONE FUNCTION. A handle nobody claimed renders as text, never as a
 * link to a person who never showed up — and the decision is made from a read
 * of the namespace rather than from the shape of the string, because every
 * well-formed handle looks claimable.
 *
 * Returns a NEW tree. The parsed body is shared with `plainText` and the
 * notification path, and a function that mutated it would leave whichever
 * caller ran second looking at somebody else's answer.
 */
export function resolveMentions(
  nodes: readonly RenderNode[],
  claimed: ReadonlySet<string>,
): RenderNode[] {
  return nodes.map((node) => {
    if (node.kind === "mention") return { ...node, claimed: claimed.has(node.handle) };
    if ("children" in node) return { ...node, children: resolveMentions(node.children, claimed) };
    return node;
  });
}
