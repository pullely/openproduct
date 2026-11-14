// Open a build, the studio, the maker page (openproduct-open-builds OB6).
//
// What is pinned: `/submit` asks for the public repo up front, optional and
// with why; the repo waits in this origin's session storage across the
// console hand-off (S10 does not carry it) and the studio's Details step
// offers it without saving it; the studio's strip ends before Launches and
// calls the people step *People and roles*; and a maker page's default tab is
// one Builds list.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LISTING_STEPS, OPEN_BUILD_REPO_KEY, STRIP_STEPS } from "@openproduct/contracts";

import { clearRepoStash, handoffUrl, readRepoStash, writeRepoStash } from "@openproduct-web/app/submit/handoff";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const code = (file: string) =>
  readFileSync(resolve(APP_DIR, file), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** A session storage that is a Map. */
function memory() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

describe("Open a build asks for the repo up front", () => {
  it("is an optional field that says what it takes only when what was typed is wrong", () => {
    // Was: the field's reason sat under it (`OPEN_BUILD_REPO_WHY`). OPR1
    // allows no explainer under a control (design.md §2 rule 9): the label
    // says it is optional, and the one line that can appear is the error —
    // what the field takes — in the danger ink, tied to the field.
    const page = code("submit/page.tsx");
    expect(page).toContain("{OPEN_BUILD_REPO_LABEL}");
    expect(page).toContain("(optional)");
    expect(page).toContain('type="url"');
    expect(page).not.toContain("OPEN_BUILD_REPO_WHY");
    expect(page).not.toContain("OPEN_BUILD_SUBTITLE");
    // A typed address must be a GitHub repository; an empty one is fine.
    expect(page).toContain("const repoOk = !repoTyped || isGithubRepoUrl(repo);");
    expect(page).toMatch(/\{repoOk \? null : \(\s*<span id="repo-hint"[^>]*text-destructive[^>]*>\s*\{OPEN_BUILD_REPO_HINT\}/);
    expect(page).toContain('aria-describedby={repoOk ? undefined : "repo-hint"}');
    expect(page).toContain("aria-invalid={repoOk ? undefined : true}");
    // The way back names the feed, which is what `/` is.
    expect(page).toMatch(/<AppLink\s+href="\/"[\s\S]{0,200}Back to the feed/);
  });

  it("wears the new look: one h1, the form on a flat card, 44px fields, a pill act (OPR1)", () => {
    const page = code("submit/page.tsx");
    expect(page.match(/<h1\b/g)).toHaveLength(1);
    expect(page).toContain("<h1 className={PAGE_TITLE}>{OPEN_BUILD_HEADING}</h1>");
    expect(page).toMatch(/<form onSubmit=\{onSubmit\} className="[^"]*rounded-\[16px\] bg-card[^"]*">/);
    expect(page).not.toMatch(/border border-border|shadow-/);
    // Every single-line field is the design's 44px field; the pitch its textarea.
    expect(page.match(/className=\{FIELD\}/g)).toHaveLength(3);
    expect(page).toContain("className={`${TEXTAREA} leading-[1.6]`}");
    // The act is the ink pill, 44px on a phone.
    expect(page).toContain("className={`${BTN_PRIMARY} max-sm:h-[44px] disabled:cursor-not-allowed disabled:opacity-50`}");
    // The preview's head is a mono label, like every head over a card.
    expect(page).toMatch(/<h2 id="preview-heading" className=\{`[^`]*\$\{EYEBROW\}`\}>/);
  });

  it("keeps the repo for the studio on submit, and never sends it to the console", () => {
    const page = code("submit/page.tsx");
    expect(page).toContain("writeRepoStash(storage(), repo);");
    // S10's hand-off is name, tagline and pitch, pinned on both sides.
    const url = handoffUrl("https://console.test", { name: "Acme", tagline: "", pitch: "" });
    expect(url).not.toContain("repo");
  });

  it("stores only a GitHub repository address, and forgets an empty field", () => {
    const store = memory();
    writeRepoStash(store, "  https://github.com/acme/thing ");
    expect(store.map.get(OPEN_BUILD_REPO_KEY)).toBe("https://github.com/acme/thing");
    expect(readRepoStash(store)).toBe("https://github.com/acme/thing");
    writeRepoStash(store, "");
    expect(readRepoStash(store)).toBeNull();
    store.setItem(OPEN_BUILD_REPO_KEY, "javascript:alert(1)");
    expect(readRepoStash(store)).toBeNull();
    writeRepoStash(store, "https://github.com/acme/thing");
    clearRepoStash(store);
    expect(store.map.size).toBe(0);
    // No storage at all is a field the maker types again, not a crash.
    expect(readRepoStash(null)).toBeNull();
  });
});

describe("the studio offers it, and saves nothing on its own", () => {
  it("prefills Details only while no repository is saved, and says where it came from", () => {
    expect(code("studio/[org]/[profile]/details/page.tsx")).toContain(
      "<RepoUrlField saved={profile.repoUrl ?? null} />",
    );
    const field = code("studio/[org]/[profile]/details/repo-url-field.tsx");
    expect(field).toContain('"use client"');
    // The same form input the save already reads.
    expect(field).toContain('name="repoUrl"');
    // A saved repository spends the stash.
    expect(field).toMatch(/if \(saved\) \{\s*clearRepoStash\(storage\);/);
    expect(field).toContain("{OPEN_BUILD_REPO_CARRIED}");
    expect(field).not.toMatch(/fetch\(|action=/);
  });
});

describe("the studio's strip is the path to Publish", () => {
  it("leaves Launches out of the strip, and keeps its page addressable", () => {
    expect(STRIP_STEPS.map((s) => s.id)).toEqual(["details", "media", "topics", "people"]);
    expect(LISTING_STEPS.find((s) => s.id === "schedule")?.segment).toBe("launches");
    expect(code("studio/[org]/[profile]/step-strip.tsx")).toContain("STRIP_STEPS.map");
    expect(code("studio/[org]/[profile]/step-strip.tsx")).not.toContain("LISTING_STEPS");
  });

  it("calls the people step People and roles", () => {
    expect(LISTING_STEPS.find((s) => s.id === "people")?.label).toBe("People and roles");
  });
});

describe("a maker page's default tab is one Builds list", () => {
  it("draws the listings they run in the tab, and no second Maintains list", () => {
    const page = code("people/[handle]/page.tsx");
    expect(page).toContain("builds={");
    expect(page).not.toContain('aria-label="Maintains"');
    const view = code("people/[handle]/maker-view.tsx");
    expect(view).toContain('doc.tab === "launched" && builds !== undefined ? (');
  });
});
