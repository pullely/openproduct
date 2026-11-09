// The Follow control, in the web layer (openproduct-launch FL0).
//
// The KEYS and the COPY are tested in packages/contracts and the ACT in
// tests/core. What is pinned here is what the web layer owns:
//
//   - the count is public and the state is not, and the markup shows it
//   - the control is the SAME component on a topic page and a maker page
//   - the overlay asks a SECOND bounded question, and never an open one
//   - nothing anywhere renders a follower list
//   - the accent is not spent on it (XP-1)

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { overlayPath } from "@openproduct-web/app/ui/overlay";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");

/** The file with its comments removed — a guard about markup must not read
 *  prose, because the comment above a decision names what it rejected. */
const markupOf = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("the overlay's second question", () => {
  it("sends `follows` beside `ids`, both bounded by what the page rendered", () => {
    expect(overlayPath([], [])).toBe("/me/overlay");
    expect(overlayPath(["a-thing"], [])).toBe("/me/overlay?ids=a-thing");
    expect(overlayPath([], ["topic:dev-tools"])).toBe("/me/overlay?follows=topic%3Adev-tools");
    expect(overlayPath(["a-thing"], ["person:ada"])).toBe(
      "/me/overlay?ids=a-thing&follows=person%3Aada",
    );
  });

  it("keeps the two lists SEPARATE, because a slug and a topic value can collide", () => {
    // One list holding both would make the answer's meaning depend on which
    // kind of page happened to ask.
    const store = markupOf("ui/overlay.ts");
    expect(store).toContain("wantedFollows");
    expect(store).toContain("coveredFollows");
  });
});

describe("the control", () => {
  it("is ONE component, drawn by a topic page and a maker page alike", () => {
    // One act, one table, one route, one overlay key — carried through to the
    // surface. Two components would be two things to keep in step.
    for (const file of [
      "topics/page.tsx",
      "topics/[topic]/page.tsx",
      // MP0 moved the maker page's header into a body shared by its three
      // tabs. The control did not change; the file it sits in did.
      "people/[handle]/maker-view.tsx",
      // PP1 — the listing, the one social object the page lacked.
      "[slug]/page.tsx",
    ]) {
      expect([file, read(file).includes("<FollowButton")]).toEqual([file, true]);
    }
  });

  it("renders `Follow` on the SERVER and changes only after hydration (I6)", () => {
    // The anonymous render is what every visitor's HTML holds. The visitor's
    // own state arrives from the overlay after paint and is in nobody else's
    // document.
    const control = markupOf("ui/follow-button.tsx");
    expect(control).toContain("isFollowing(state, key)");
    expect(control).toContain("useOverlay(");
  });

  it("posts a form, so the act survives being signed out (XP2)", () => {
    // Signed out the handler bounces through sign-in and returns by fragment,
    // so the intent survives the round trip.
    const control = markupOf("ui/follow-button.tsx");
    expect(control).toContain('method="post"');
    expect(control).toContain("/me/follow?kind=");
    expect(control).toContain("return_to=");
  });

  it("addresses a person by HANDLE, never by a subject id", () => {
    expect(read("people/[handle]/maker-view.tsx")).toContain("value={person.handle}");
  });

  it("fills on `--secondary` once followed, never in the accent (CP-R1)", () => {
    // The prototype painted a followed thing in the accent's soft wash, the
    // voted box's. openproduct-calm-pages CP1 keeps the accent for the upvote
    // alone (XP-1, CL-R8): followed is the neutral fill on a strong hairline,
    // at rest the card on a hairline — the state still reads, by its word and
    // its fill, without spending the colour an upvote means.
    const control = markupOf("ui/follow-button.tsx");
    expect(control).toMatch(/following\s*\n?\s*\?\s*"border-border-strong bg-secondary text-foreground"/);
    expect(control).toMatch(/:\s*"border-border-strong bg-card text-foreground/);
    expect(control).not.toMatch(/endorse/);
  });

  it("keeps the count OUTSIDE the button", () => {
    // The button's label changes with the visitor and the number does not.
    // Putting the number inside would make a public figure look like part of a
    // personal state.
    const control = markupOf("ui/follow-button.tsx");
    const button = control.slice(control.indexOf("<button"), control.indexOf("</button>"));
    expect(button).not.toContain("followerLine");
    // `+ delta` since OPP2: the visitor's own follow moves the public number
    // the moment they make it, and the base still comes from the document.
    expect(control).toContain("followerLine(followers + delta)");
  });
});

describe("no follower lists, anywhere", () => {
  it("no surface renders one, and no fetcher asks for one", () => {
    // There is no read on this estate that answers "who follows this", and
    // this is the guard that keeps it that way as pages are added.
    for (const file of [
      "ui/follow-button.tsx",
      "topics/page.tsx",
      "topics/[topic]/page.tsx",
      "people/[handle]/page.tsx",
      "public-api.ts",
    ]) {
      const src = markupOf(file);
      expect([file, /followerList|listFollowers|followers\.map|followers\[/.test(src)]).toEqual([
        file,
        false,
      ]);
    }
  });

  it("the count is a NUMBER on every projection that carries it", () => {
    expect(read("public-api.ts")).toContain("followers: number");
  });
});

describe("the write route", () => {
  it("is ONE route for both directions, unlike endorse and unendorse", () => {
    // That pair is two routes because endorsing and withdrawing are two acts
    // over an append-only row with different meanings to the integrity model.
    // Following and unfollowing are one control's two positions.
    const route = markupOf("me/follow/route.ts");
    expect(route).toContain('params.get("on") === "1"');
    expect(route).toContain("setFollow(");
  });

  it("checks only the OUTER bound, and lets core resolve the target", () => {
    // Core answers 404 for a target that does not exist; this refuses only
    // what could never be a topic or a handle.
    const route = markupOf("me/follow/route.ts");
    expect(route).toContain("FOLLOW_VALUE_RE.test(value)");
    expect(route).toContain("FOLLOW_KINDS");
  });

  it("bounces a signed-out visitor through sign-in rather than dropping the click", () => {
    // Behind `me/act.ts` since OPP2 — one place builds the redirect, and
    // `routes.test.ts` pins that it is the only one.
    expect(markupOf("me/follow/route.ts")).toContain('actAnswer(request, "signin"');
  });
});
