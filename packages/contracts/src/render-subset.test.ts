import { describe, expect, it } from "vitest";

import {
  LINK_REL,
  LINK_SCHEMES,
  MAX_POST_BODY,
  RENDER_NODES,
  linkHrefs,
  linkIsRenderable,
  nodeKinds,
  parseBody,
  plainText,
  type RenderNodeKind,
} from "./render-subset.js";

/**
 * THE INJECTION CORPUS.
 *
 * Every entry is something somebody has actually tried on a comment field
 * somewhere. The assertion is the same for all of them and is deliberately
 * strong: whatever comes out contains NO link the allowlist would refuse, and
 * NO node kind outside the closed set. "It did not throw" would pass for a
 * parser that emitted raw HTML, so it is not the assertion.
 */
const CORPUS: ReadonlyArray<{ name: string; body: string }> = [
  { name: "a script tag", body: "<script>alert(1)</script>" },
  { name: "an img with an onerror handler", body: `<img src=x onerror="alert(1)">` },
  { name: "an svg with an onload handler", body: `<svg onload=alert(1)>` },
  { name: "an iframe", body: `<iframe src="https://evil.example"></iframe>` },
  { name: "a javascript: link", body: "[click](javascript:alert(1))" },
  { name: "a javascript: link, shouting", body: "[click](JaVaScRiPt:alert(1))" },
  { name: "a javascript: link with padding", body: "[click](  javascript:alert(1))" },
  { name: "a javascript: link split by a newline", body: "[click](java\nscript:alert(1))" },
  { name: "a data: url", body: "[click](data:text/html;base64,PHNjcmlwdD4=)" },
  { name: "a vbscript: url", body: "[click](vbscript:msgbox(1))" },
  { name: "a blob: url", body: "[click](blob:https://evil.example/x)" },
  { name: "a relative path into our own studio", body: "[settings](/studio/reports)" },
  { name: "a protocol-relative url", body: "[click](//evil.example/x)" },
  { name: "an entity-encoded scheme", body: "[click](&#106;avascript:alert(1))" },
  { name: "a tab inside the scheme", body: "[click](java\tscript:alert(1))" },
  { name: "a null byte", body: "[click](java\0script:alert(1))" },
  { name: "an html comment hiding a tag", body: "<!--><script>alert(1)</script>-->" },
  { name: "a style block", body: "<style>body{display:none}</style>" },
  { name: "an unclosed anchor", body: `<a href="https://evil.example">` },
  { name: "markup inside a code fence", body: "```\n<script>alert(1)</script>\n```" },
  { name: "markup inside a code span", body: "`<script>alert(1)</script>`" },
  { name: "a link nested in emphasis", body: "*[click](javascript:alert(1))*" },
  { name: "an href that runs to the line end", body: "[click](https://ok.example \"onmouseover=alert(1)\")" },
  { name: "a very long body", body: "x".repeat(MAX_POST_BODY * 2) },
  { name: "nothing at all", body: "" },
  { name: "only whitespace", body: "   \n\n\t  " },
];

describe("the restricted render subset (openproduct-commons CB0)", () => {
  it.each(CORPUS)("$name produces no node outside the closed set", ({ body }) => {
    const kinds = nodeKinds(parseBody(body));
    for (const kind of kinds) {
      expect(RENDER_NODES).toContain(kind as RenderNodeKind);
    }
  });

  it.each(CORPUS)("$name produces no link the allowlist would refuse", ({ body }) => {
    for (const href of linkHrefs(parseBody(body))) {
      expect(linkIsRenderable(href)).toBe(true);
      const scheme = new URL(href).protocol.replace(/:$/, "");
      expect(LINK_SCHEMES).toContain(scheme as (typeof LINK_SCHEMES)[number]);
    }
  });

  it.each(CORPUS)("$name never loses the author's characters into markup", ({ body }) => {
    // The safety property stated the other way round: anything the parser did
    // not understand is still TEXT. A body that came out shorter than it went
    // in has had something silently swallowed, and silent swallowing is how a
    // reader ends up unable to judge what somebody actually wrote.
    const parsed = parseBody(body);
    const text = plainText(parsed);
    for (const fragment of ["script", "alert", "javascript", "onerror", "onload"]) {
      if (body.toLowerCase().includes(fragment)) {
        expect(text.toLowerCase()).toContain(fragment);
      }
    }
  });
});

describe("what a link may be", () => {
  it("takes https and http, and nothing else", () => {
    expect(linkIsRenderable("https://example.com/x")).toBe(true);
    expect(linkIsRenderable("http://example.com/x")).toBe(true);
    for (const bad of [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "data:text/html,<script>",
      "vbscript:x",
      "blob:https://x/y",
      "file:///etc/passwd",
      // No mailto: an address on a crawlable page is an address harvested (I3).
      "mailto:someone@example.com",
      "/studio/reports",
      "//evil.example",
      "",
      "not a url",
    ]) {
      expect(linkIsRenderable(bad)).toBe(false);
    }
  });

  it("parses rather than pattern-matches, so casing and padding cannot hide a scheme", () => {
    // A regex over a URL is how `  JaVaScRiPt:` gets through: every variant is
    // a different string and the same destination. `new URL()` answers the
    // question the browser will actually ask.
    expect(linkIsRenderable("  javascript:alert(1)")).toBe(false);
    expect(linkIsRenderable("\tjavascript:alert(1)")).toBe(false);
    expect(linkIsRenderable("JaVaScRiPt:alert(1)")).toBe(false);
  });

  it("says what every rendered link is, and does not vouch for it", () => {
    // Without ugc/nofollow, every post is an opportunity to borrow this
    // domain's ranking — the entire economics of comment spam.
    expect(LINK_REL.split(" ").sort()).toEqual(["noopener", "noreferrer", "nofollow", "ugc"].sort());
  });

  it("renders a refused link as the text it was, never as nothing", () => {
    const parsed = parseBody("see [this](javascript:alert(1)) please");
    expect(linkHrefs(parsed)).toEqual([]);
    // A reader who cannot see that something was there cannot judge the post.
    expect(plainText(parsed)).toContain("[this](javascript:alert(1))");
  });
});

describe("what the parser understands", () => {
  it("makes paragraphs, and drops nothing between them", () => {
    const parsed = parseBody("one\n\ntwo");
    expect(parsed.map((n) => n.kind)).toEqual(["paragraph", "paragraph"]);
    expect(plainText(parsed)).toBe("onetwo");
  });

  it("takes a fenced block verbatim, and parses nothing inside it", () => {
    // The point of showing code is that it is shown as written. A parser that
    // reached inside would let a snippet ABOUT links become one.
    const parsed = parseBody("```\n[a](https://x.example) **b**\n```");
    expect(parsed.map((n) => n.kind)).toEqual(["codeblock"]);
    expect(linkHrefs(parsed)).toEqual([]);
    expect(plainText(parsed)).toBe("[a](https://x.example) **b**");
  });

  it("takes a code span before every other mark", () => {
    const parsed = parseBody("`**not bold**`");
    expect(nodeKinds(parsed).has("strong")).toBe(false);
    expect(plainText(parsed)).toBe("**not bold**");
  });

  it("leaves a bare url as text — the renderer never decides what a link is", () => {
    const parsed = parseBody("see https://example.com for more");
    expect(linkHrefs(parsed)).toEqual([]);
    expect(plainText(parsed)).toContain("https://example.com");
  });

  it("makes lists, quotes, emphasis and strong", () => {
    expect(nodeKinds(parseBody("- one\n- two")).has("list")).toBe(true);
    expect(nodeKinds(parseBody("1. one\n2. two")).has("list")).toBe(true);
    expect(nodeKinds(parseBody("> quoted")).has("quote")).toBe(true);
    expect(nodeKinds(parseBody("*em*")).has("emphasis")).toBe(true);
    expect(nodeKinds(parseBody("**strong**")).has("strong")).toBe(true);
  });

  it("bounds the body it will parse at all", () => {
    const parsed = parseBody("x".repeat(MAX_POST_BODY * 3));
    expect(plainText(parsed).length).toBeLessThanOrEqual(MAX_POST_BODY);
  });

  it("has no node kind for an image, a heading, a table or raw html", () => {
    // Each was refused for its own reason — see the module header. The list is
    // pinned so adding one is a deliberate act with an argument attached.
    for (const absent of ["image", "heading", "table", "html"]) {
      expect(RENDER_NODES).not.toContain(absent as RenderNodeKind);
    }
  });
});
