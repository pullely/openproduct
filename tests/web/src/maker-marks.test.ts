// A person's marks on the page and the card (openproduct-worldclass-v2 PE2).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const code = (file: string) =>
  readFileSync(resolve(APP_DIR, file), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("no mark renders without its formula's inputs", () => {
  const view = code("people/[handle]/maker-view.tsx");

  it("derives the marks from the wire's inputs with the contract, and nowhere else", () => {
    expect(view).toContain("makerMarks(doc.marks)");
    expect(view).not.toMatch(/"First launch"|"Clean vote"|Maintains \$\{/);
  });

  it("links each mark to its formula and carries its input in words", () => {
    expect(view).toContain("href={formulaHref(mark.formula)}");
    expect(view).toContain("title={mark.input}");
  });

  it("the card carries the durable mark", () => {
    expect(code("og/maker/[handle]/route.tsx")).toContain("makerCardMark(doc.marks)");
    expect(view).toContain("makerCardMark(doc.marks)).alt");
  });
});
