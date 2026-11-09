// CV2 — the maintainer badge, in the web layer (openproduct-worldclass).
//
// "One component with one rule, asserted by test" is the done-when, and the
// interesting half is the rule: it used to be a comparison written inline on
// one page, over handles, and it was wrong.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MAINTAINER_BADGE, MAINTAINER_BADGE_NOTE, PUBLIC_POST_KEYS } from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const BADGE = "ui/maintainer-badge.tsx";
const SURFACES = ["[slug]/comments.tsx", "threads/[id]/page.tsx"] as const;

describe("one component", () => {
  it("every surface a post appears on renders the same one", () => {
    for (const surface of SURFACES) {
      const src = code(surface);
      expect([surface, src.includes("<MaintainerBadge />")]).toEqual([surface, true]);
      expect([surface, src.includes("maintainer-badge")]).toEqual([surface, true]);
    }
  });

  it("no surface draws its own", () => {
    // The badge's geometry exists once. A second span with the same tint
    // would be a second badge that drifts. openproduct-calm-pages CP1 moved
    // the tint from the accent to `--secondary` (CP-R1: the accent is the
    // upvote's), so both spellings are watched.
    for (const surface of SURFACES) {
      expect([surface, /bg-(endorse-soft|secondary)[^"]*text-\[11px\][^"]*>?\s*\{?MAINTAINER/.test(code(surface))]).toEqual([
        surface,
        false,
      ]);
    }
    expect(code(BADGE)).toContain("bg-secondary");
    expect(code(BADGE)).not.toMatch(/endorse/);
  });

  it("takes its word and its sentence from the contract", () => {
    const src = code(BADGE);
    expect(src).toContain("{MAINTAINER_BADGE}");
    expect(src).toContain("title={MAINTAINER_BADGE_NOTE}");
    expect(src).not.toContain('"Maker"');
    expect(MAINTAINER_BADGE).toBe("Maintainer");
    // The word alone invites a bigger reading than it deserves, so the rule
    // rides with it: not "trust this", not a moderator, not staff.
    expect(MAINTAINER_BADGE_NOTE).toContain("published maintainer roster");
    expect(MAINTAINER_BADGE_NOTE).toContain("Both sides confirmed");
  });
});

describe("one rule, and it is not in the web layer", () => {
  it("renders what the projection said", () => {
    for (const surface of SURFACES) {
      expect([surface, code(surface).includes("post.authorIsMaintainer")]).toEqual([surface, true]);
    }
    expect(PUBLIC_POST_KEYS).toContain("authorIsMaintainer");
  });

  it("compares no handles anywhere", () => {
    // THE DEFECT. `makerHandles.includes(post.authorHandle)` decided the badge
    // from a PUBLIC PROFILE somebody opted into, so a maintainer who never
    // published one was silently un-badged — an opt-in reported as a status,
    // which is the opposite of what OPC-5 is for.
    for (const surface of [...SURFACES, "[slug]/page.tsx"]) {
      const src = code(surface);
      expect([surface, src.includes("makerHandles")]).toEqual([surface, false]);
      expect([surface, /maintainers.*\.handle/.test(src) && src.includes("includes(")]).toEqual([
        surface,
        false,
      ]);
    }
  });

  it("keeps the subject id out of the projection", () => {
    // I3 — the id the rule was decided from never crosses. Only the answer.
    expect(PUBLIC_POST_KEYS).not.toContain("authorSubjectId");
  });
});
