import { describe, expect, it } from "vitest";

import {
  SHARE_INTENT_ORIGINS,
  SHARE_LABEL,
  SHARE_NOTE,
  shareIntents,
  shareText,
  shareUrl,
} from "./share.js";

describe("what a share points at", () => {
  it("is the canonical address", () => {
    expect(shareUrl("https://openproduct.live", "my-product")).toBe(
      "https://openproduct.live/my-product",
    );
  });

  it("is nothing without a canonical origin", () => {
    // Sharing a preview host is sharing the wrong page, permanently, in
    // somebody else's timeline.
    expect(shareUrl(null, "my-product")).toBeNull();
  });
});

describe("what a share says", () => {
  it("is the name and the maintainer's own sentence", () => {
    expect(shareText("my-product", "A tiny CLI")).toBe("my-product — A tiny CLI");
  });

  it("is the name alone where there is no tagline", () => {
    // Honest and short, and better than a sentence we invented to fill the
    // space.
    expect(shareText("my-product", null)).toBe("my-product");
  });

  it("adds no adjective of ours", () => {
    // A share that editorialises on somebody else's product puts our words in
    // their mouth in front of their audience.
    const text = shareText("my-product", "A tiny CLI");
    expect(text).not.toMatch(/check out|awesome|great|#\d|rank/i);
    expect(text).toBe("my-product — A tiny CLI");
  });
});

describe("the intents are links and nothing else", () => {
  const url = "https://openproduct.live/my-product";
  const intents = shareIntents(url, "my-product — A tiny CLI");

  it("names three destinations, and the list is short on purpose", () => {
    // Every extra row is another logo this page has to carry and another
    // reader wondering why theirs is missing. Anywhere else is served by the
    // address itself, which is why `Copy` is the first control rather than an
    // afterthought.
    expect(intents.map((i) => i.id)).toEqual(["x", "bluesky", "linkedin"]);
  });

  it("points only at the origins it declares", () => {
    for (const intent of intents) {
      expect(SHARE_INTENT_ORIGINS.some((origin) => intent.href.startsWith(origin))).toBe(true);
    }
  });

  it("escapes what it puts in a query string", () => {
    const [x] = shareIntents("https://openproduct.live/a b", "a & b");
    expect(x!.href).toContain("%20");
    expect(x!.href).toContain("%26");
    expect(x!.href).not.toMatch(/text=a & b/);
  });

  it("carries the address in every one of them", () => {
    // A share with the text and no link is a share that cannot be followed.
    for (const intent of intents) {
      expect(decodeURIComponent(intent.href)).toContain(url);
    }
  });

  it("offers no Mastodon intent, and the omission is the interesting one", () => {
    // There is no such thing as THE Mastodon, so an intent needs the reader's
    // own instance — which means either a form nobody fills in or a
    // third-party redirector, and the redirector is the third-party request
    // this whole milestone exists to avoid. Copy works, and works everywhere.
    expect(intents.map((i) => i.id)).not.toContain("mastodon");
    expect(SHARE_INTENT_ORIGINS.join(" ")).not.toMatch(/mastodon/i);
  });
});

describe("the page says what it is doing", () => {
  it("tells a reader these are links rather than widgets", () => {
    // A reader clicking one is leaving, and a page that hands somebody to
    // another site without saying so decided for them.
    expect(SHARE_NOTE).toMatch(/links, not widgets/);
    expect(SHARE_NOTE).toMatch(/nothing knows you looked/);
  });

  it("has one word for the control, read by the button and its label", () => {
    expect(SHARE_LABEL).toBe("Share");
  });
});
