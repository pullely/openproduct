import { describe, expect, it } from "vitest";

import {
  MAX_PRODUCT_LINKS,
  parseProductLinks,
  productLinksFromText,
  productLinksToText,
} from "./product-links.js";

describe("a product's own links (LR-8)", () => {
  it("accepts a label and an absolute http(s) address, trimmed and normalised", () => {
    expect(parseProductLinks([{ label: "  Docs  ", url: "https://docs.example.com" }])).toEqual({
      links: [{ label: "Docs", url: "https://docs.example.com/" }],
    });
    expect(parseProductLinks([])).toEqual({ links: [] });
  });

  it("refuses what is not a list, too many, a missing label and a bad address, by name", () => {
    expect(parseProductLinks("x")).toEqual({ error: "Links must be a list" });
    const many = Array.from({ length: MAX_PRODUCT_LINKS + 1 }, (_, i) => ({ label: `L${i}`, url: "https://a.example" }));
    expect(parseProductLinks(many)).toEqual({ error: `At most ${MAX_PRODUCT_LINKS} links` });
    expect(parseProductLinks([{ label: " ", url: "https://a.example" }])).toEqual({ error: "Link 1 needs a label" });
    expect(parseProductLinks([{ label: "x".repeat(41), url: "https://a.example" }])).toEqual({
      error: "Link 1: the label is at most 40 characters",
    });
    for (const url of ["javascript:alert(1)", "/relative", "ftp://a.example", "not a url", `https://a.example/${"x".repeat(200)}`]) {
      expect([url, "error" in parseProductLinks([{ label: "Docs", url }])]).toEqual([url, true]);
    }
    expect(parseProductLinks([null])).toEqual({ error: "Link 1 must be a label and an address" });
  });

  it("reads the form's lines and writes them back the same", () => {
    const text = "Docs | https://docs.example.com/\n\n  Demo|https://demo.example.com/  \nhttps://bare.example.com/";
    expect(productLinksFromText(text)).toEqual([
      { label: "Docs", url: "https://docs.example.com/" },
      { label: "Demo", url: "https://demo.example.com/" },
      { label: "", url: "https://bare.example.com/" },
    ]);
    const links = [
      { label: "Docs", url: "https://docs.example.com/" },
      { label: "A | B", url: "https://ab.example.com/" },
    ];
    expect(productLinksFromText(productLinksToText(links))).toEqual(links);
    expect(productLinksToText([])).toBe("");
  });
});
