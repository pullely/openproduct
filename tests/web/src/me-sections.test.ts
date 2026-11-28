// Your own pages, after openproduct-redesign OPR1 (boards `Me`, `Settings`).
//
// The redesign made three pages one: `/me` is the profile card and a switcher
// between its sections, the form `/me` used to be is `/me/settings`, and the
// saved list and the applications are sections. What is pinned here is what
// that move must not lose:
//
//   - a section is an ADDRESS — `/me?section=saved` — and anything that is
//     not a section lands on the first one rather than on an error
//   - the old addresses (`/me/saved`, `/me/applications`) arrive at their
//     sections, signed in or out, and the acts that returned to them return
//     to the sections
//   - a section is listed only when today's data can fill it, and one whose
//     read failed says so rather than showing an empty list
//   - settings holds exactly the settings that existed, and Save / Discard
//     are the form's own submit and reset
//   - red is danger only: nothing on these pages is red while there is
//     nothing dangerous on them, and a delete control, when one exists, is
//     red and confirmed
//   - none of it is cacheable by anybody but the person it is about

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fetchMyListings } from "@openproduct-web/app/me/listings";
import {
  draftProgress,
  draftTitle,
  editableDrafts,
  fetchMyDrafts,
  manageHref,
  standingLine,
  standingOf,
} from "@openproduct-web/app/me/products";
import {
  ME_DEFAULT_SECTION,
  ME_SECTION_KEYS,
  meSectionHref,
  meSectionOf,
  signInFor,
} from "@openproduct-web/app/me/section";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");

/** The file with its comments removed. A guard about markup must not read
 *  prose: the comment above a decision names the thing it rejected. */
const markupOf = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** Every file under a directory of the app, relative to the app. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(APP_DIR, full).replace(/\\/g, "/"));
    }
  };
  walk(resolve(APP_DIR, dir));
  return out.sort();
}

const OWN_FILES = [...filesUnder("me"), ...filesUnder("activity")];
const OWN_PAGES = OWN_FILES.filter((f) => f.endsWith("page.tsx"));
const OWN_ROUTES = OWN_FILES.filter((f) => f.endsWith("route.ts"));

describe("a section of /me is an address", () => {
  it("the first section is the page itself, and the others are a query on it", () => {
    expect(ME_DEFAULT_SECTION).toBe("products");
    expect(meSectionHref("products")).toBe("/me");
    expect(meSectionHref("saved")).toBe("/me?section=saved");
    expect(meSectionHref("seats")).toBe("/me?section=seats");
  });

  it("reads the section back from the address, and every key round-trips", () => {
    for (const key of ME_SECTION_KEYS) {
      const query = new URL(`https://openproduct.live${meSectionHref(key)}`).searchParams.get("section");
      expect(meSectionOf(query ?? undefined)).toBe(key);
    }
    // The first section also answers to its own name.
    expect(meSectionOf("products")).toBe("products");
  });

  it("lands anything that is not a section on the first one — never a 404", () => {
    for (const stray of [undefined, "", "nope", "SAVED", "draft", "followers", "applications"]) {
      expect(meSectionOf(stray)).toBe("products");
    }
    // A repeated parameter is read once.
    expect(meSectionOf(["seats", "saved"])).toBe("seats");
    expect(meSectionOf([])).toBe("products");
  });

  it("sends a signed-out reader to sign in and back to the SECTION they asked for", () => {
    expect(signInFor("/me")).toBe("/signin?return_to=%2Fme");
    expect(signInFor(meSectionHref("saved"))).toBe("/signin?return_to=%2Fme%3Fsection%3Dsaved");
    const page = markupOf("me/page.tsx");
    expect(page).toContain("const section = meSectionOf(params.section);");
    expect(page).toContain("const here = meSectionHref(section);");
    expect(page).toContain("if (!session) redirect(signInFor(here));");
  });

  it("is switched by links a server render answers, with the current one marked", () => {
    const nav = markupOf("me/nav.tsx");
    expect(nav).toContain("href={meSectionHref(section.key)}");
    expect(nav).toContain('{ "aria-current": "page" as const }');
    expect(nav).not.toContain('"use client"');
    // The page marks which section it drew — what the signed-in walk reads.
    expect(markupOf("me/page.tsx")).toContain("data-me-section={section}");
  });

  it("lists a section only when today's data can fill it", () => {
    // OPR1 listed three and left the board's other two out, because there
    // was no list of what somebody follows to read and no draft concept.
    // OPR-3 added both reads, so the board's five are here, in its order —
    // and each one still has a read behind it, which is the rule.
    expect([...ME_SECTION_KEYS]).toEqual(["products", "following", "saved", "seats", "drafts"]);
    const nav = markupOf("me/nav.tsx");
    for (const label of ['label: "Your products"', 'label: "Following"', 'label: "Saved"', 'label: "Seats"', 'label: "Drafts"']) {
      expect(nav).toContain(label);
    }
    const page = markupOf("me/page.tsx");
    expect(page).toContain("fetchMyListings(session.accessToken)");
    expect(page).toContain("fetchFollowing(session.accessToken)");
    expect(page).toContain("fetchSaved(session.accessToken)");
    expect(page).toContain("fetchMyApplications(session.accessToken)");
    // Drafts are the unpublished posts of the products you are on the crew
    // of: each product's `needs-you`, read with your own token.
    expect(page).toContain("fetchMyDrafts(session.accessToken, myListings)");
    expect(markupOf("me/products.ts")).toContain("fetchNeedsYou(token, { org: listing.orgId, profile: listing.id }, fetchImpl)");
  });

  it("tells a failed read apart from an empty section, and prints no count for it (OD5)", () => {
    const page = markupOf("me/page.tsx");
    for (const branch of [
      "<ProductsSection listings={myListings} standings={standings} pickerUrl={pickerUrl} />",
      "myFollowing ? <FollowingSection following={myFollowing} /> : <SectionUnavailable />",
      "myDrafts ? <DraftsSection drafts={myDrafts} /> : <SectionUnavailable />",
      "mySaved ? <SavedSection products={mySaved} /> : <SectionUnavailable />",
      "mySeats ? <SeatsSection applications={mySeats} /> : <SectionUnavailable />",
    ]) {
      expect(page).toContain(branch);
    }
    expect(page).toContain("products: myListings?.length ?? null,");
    // A null count draws nothing: a zero would be a claim.
    expect(markupOf("me/nav.tsx")).toContain("{count === null ? null : (");
    const sections = markupOf("me/sections.tsx");
    for (const empty of ["No products yet.", "Nothing saved.", "No seats requested."]) {
      expect(sections).toContain(empty);
    }
  });
});

describe("the old addresses arrive at their sections", () => {
  const config = readFileSync(resolve(APP_DIR, "../../next.config.mjs"), "utf-8");

  it.each([
    ["/me/saved", "saved"],
    ["/me/applications", "seats"],
  ] as const)("%s is redirected to its section from the edge, with a status a crawler can read", (from, section) => {
    // A real redirect, issued before the renderer is reached (SB0): the
    // section's own address, exactly as the switcher writes it.
    expect(config).toContain(`{ source: "${from}", destination: "${meSectionHref(section)}", permanent: true }`);
  });

  it("the page they arrive at is the one that reads the session, and sends a signed-out reader back to the SECTION", () => {
    const page = markupOf("me/page.tsx");
    expect(page).toContain("const here = meSectionHref(section);");
    expect(page).toContain("if (!session) redirect(signInFor(here));");
  });

  it("left no page behind at either address", () => {
    // The lists are `me/sections.tsx` and nowhere else. The old segments
    // held a page whose whole body was a redirect; the config entry replaced
    // them, so nothing is left to prerender, cache or drift.
    expect(existsSync(resolve(APP_DIR, "me/saved"))).toBe(false);
    expect(existsSync(resolve(APP_DIR, "me/applications"))).toBe(false);
  });

  it("a save and an unsave return to the Saved section, and say so when they failed", () => {
    for (const file of ["me/save/route.ts", "me/unsave/route.ts"]) {
      const route = markupOf(file);
      expect(route).toContain('const SAVED_SECTION = meSectionHref("saved");');
      expect(route).toContain('sanitizeReturnTo(params.get("return_to")) ?? SAVED_SECTION');
      expect(route).toContain("returnTo: `${SAVED_SECTION}&error=save_failed`");
      expect(route).not.toContain('"/me/saved');
    }
    const page = markupOf("me/page.tsx");
    expect(page).toContain('section === "saved" && params.error === "save_failed"');
  });

  it("nothing on these pages still links the old addresses", () => {
    for (const file of OWN_FILES.filter((f) => /\.tsx?$/.test(f))) {
      const src = markupOf(file);
      expect([file, /["'`]\/me\/(saved|applications)\b/.test(src)]).toEqual([file, false]);
      expect([file, src.includes("/me#digest")]).toEqual([file, false]);
    }
  });
});

describe("your products, read from this side of the wall", () => {
  const recording = (status: number, body: unknown) => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    return { fetchImpl, calls };
  };

  it("asks the studio's own read, with the bearer and nothing else, uncached", async () => {
    const { fetchImpl, calls } = recording(200, { data: { listings: [{ id: "p1", orgId: "o1", slug: "acme" }] } });
    const result = await fetchMyListings("tok", fetchImpl);
    expect(result.kind).toBe("ok");
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!.url).pathname).toBe("/v1/openproduct/me/listings");
    expect(calls[0]!.init?.method).toBe("GET");
    expect(calls[0]!.init?.cache).toBe("no-store");
    expect(calls[0]!.init?.headers).toEqual({ accept: "application/json", authorization: "Bearer tok" });
  });

  it("reads a dead token as signed out and every other failure as unavailable", async () => {
    expect((await fetchMyListings("t", recording(401, {}).fetchImpl)).kind).toBe("unauthorized");
    expect((await fetchMyListings("t", recording(403, {}).fetchImpl)).kind).toBe("unauthorized");
    expect((await fetchMyListings("t", recording(500, {}).fetchImpl)).kind).toBe("unavailable");
    // An answer without the list in it is a failed read, not an empty one.
    expect((await fetchMyListings("t", recording(200, { data: {} }).fetchImpl)).kind).toBe("unavailable");
    const throwing = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect((await fetchMyListings("t", throwing)).kind).toBe("unavailable");
  });

  it("sends Manage to the product's own page, and a draft to its settings", () => {
    // OPR-3 — the page is the dashboard (design §2.5), so Manage goes to the
    // product. A listing that is still a draft has no public page, and is
    // managed where it is set up.
    expect(manageHref({ slug: "kettle", visibility: "public", orgId: "org_1", id: "opp_1" })).toBe("/kettle");
    // …its settings page (OPR-3: the listing's base address only forwards).
    expect(manageHref({ slug: "kettle", visibility: "private", orgId: "org_1", id: "opp_1" })).toBe("/studio/org_1/opp_1/settings");
    const sections = markupOf("me/sections.tsx");
    expect(sections).toContain("const manage = manageHref(listing);");
    expect(sections).toMatch(/<AppLink href=\{manage\}[^>]*>\s*Manage\s*<\/AppLink>/);
    // Reached by address: the page does not pull the studio's module graph.
    for (const file of ["me/page.tsx", "me/sections.tsx", "me/listings.ts"]) {
      expect([file, /from\s+"[^"]*\bstudio\//.test(read(file))]).toEqual([file, false]);
    }
  });

  it("offers no Withdraw on a seat, because today's flow has none", () => {
    // The board draws it. No route under `/me` withdraws a request and
    // `me-api.ts` has no such call, so the row shows its status and — once
    // approved — the way into the workspace, as the applications page did.
    // ("Withdrawn" is a status the row can show; the ACT is what is absent.)
    expect(markupOf("me/sections.tsx")).not.toMatch(/\bWithdraw\b/);
    expect(OWN_ROUTES.some((f) => /withdraw|applications/.test(f))).toBe(false);
    expect(markupOf("me/sections.tsx")).toContain("Open your workspace");
  });
});

describe("settings holds the settings that existed", () => {
  const page = () => markupOf("me/settings/page.tsx");

  it("is where /me sends somebody to edit, and the profile no longer carries the form", () => {
    const me = markupOf("me/page.tsx");
    expect(me).toContain('<AppLink href="/me/settings"');
    expect(me).toContain("Edit profile");
    expect(me).not.toMatch(/<form\b|<input\b|<textarea\b/);
  });

  it("posts the profile form with exactly the fields the old one posted", () => {
    const src = page();
    expect(src).toContain('action="/me/profile"');
    const names = [...src.matchAll(/\bname="([^"]+)"/g)].map((m) => m[1]).sort();
    expect(names).toEqual(
      [
        // the profile form
        "bio",
        "currentHandle",
        "currentPublic",
        "displayName",
        "githubUrl",
        "handle",
        "siteUrl",
        // …and its two switches, which are the two checkboxes it always had
        "openToProject",
        "profilePublic",
        // the digest's own form
        "return_to",
        "subscribed",
      ].sort(),
    );
    // The switches post as checkboxes do: `on` when set, nothing when not.
    expect(src).toContain('<input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />');
  });

  it("returns every outcome of a save to this page", () => {
    const route = read("me/profile/route.ts");
    expect(route).toContain("new URL(`${SETTINGS_PATH}?saved=1`, request.url)");
    expect(route).toContain("/signin?return_to=%2Fme%2Fsettings");
    expect(read("me/profile/plan.ts")).toContain('export const SETTINGS_PATH = "/me/settings";');
    expect(page()).toContain('const HERE = "/me/settings";');
  });

  it("makes Save and Discard the form's own submit and reset, so it works with no script", () => {
    const bar = markupOf("me/settings/save-bar.tsx");
    expect(bar).toContain('<button type="reset" form={formId}');
    expect(bar).toMatch(/<button\s+type="submit"\s+form=\{formId\}/);
    // Save is spent only once the script has looked and found nothing
    // changed; until then (and without script) it is live.
    expect(bar).toContain("disabled={dirty === false}");
    expect(bar).toContain("useState<boolean | null>(null)");
    // "Changed" is measured against what the document arrived with.
    expect(bar).toContain("control.value !== control.defaultValue");
    expect(bar).toContain("control.checked !== control.defaultChecked");
    expect(bar).toContain('role="status"');
    expect(page()).toContain('<SaveBar formId={PROFILE_FORM} saved={notice?.kind === "saved"} />');
  });

  it("keeps the digest its own form, returning here", () => {
    const src = page();
    expect(src).toContain('<form method="post" action="/me/digest"');
    expect(src).toContain('<input type="hidden" name="return_to" value={HERE} />');
    expect(src).toContain('aria-pressed={subscribed}');
    expect(src).toContain('aria-label="Weekly digest"');
    // And a post that names no way back lands on settings, not the profile.
    expect(read("me/digest/route.ts")).toContain('?? "/me/settings";');
  });

  it("puts no line of explanation under a control (the owner's rule)", () => {
    const src = page();
    expect(src).not.toContain("aria-describedby");
    expect(src).not.toContain("Clearing it releases");
    expect(src).not.toContain("One email a week");
  });

  it("adds no setting the product does not have", () => {
    const src = page();
    // The board's photo, headline, per-kind notification switches and crew
    // invite have nothing behind them today.
    for (const absent of ["Change photo", "Headline", "Invite to crew", "New followers", "Seat requests", "Reactions"]) {
      expect(src).not.toContain(absent);
    }
    // The sections that are there, in the board's order.
    expect([...src.matchAll(/\{ id: "(\w+)", label: "/g)].map((m) => m[1])).toEqual([
      "profile",
      "notifications",
      "account",
    ]);
    expect(src).toContain('href="/auth/signout"');
  });
});

describe("red is danger only, and deleting is red and confirmed", () => {
  const DANGER = /\b(?:text|bg|border|ring)-destructive\b/;
  const DELETE = /Delete (?:your )?account|Delete account/;

  it("nothing on these pages is red while nothing on them is dangerous", () => {
    // A failed save is a warning tint, an unread row is amber, a seat is
    // teal. Red is spent on nothing here, so that the day a delete control
    // arrives it is the only red thing on the page.
    const withDelete = OWN_FILES.filter((f) => /\.tsx$/.test(f) && DELETE.test(markupOf(f)));
    for (const file of OWN_FILES.filter((f) => /\.tsx$/.test(f) && !withDelete.includes(f))) {
      expect([file, DANGER.test(markupOf(file))]).toEqual([file, false]);
    }
  });

  it("offers Delete account only when the product can do it — and then red, and confirmed", () => {
    const settings = markupOf("me/settings/page.tsx");
    const canDelete = /export function (deleteMe|deleteAccount)\b/.test(read("me/me-api.ts"));
    const offered = OWN_FILES.filter((f) => /\.tsx$/.test(f) && DELETE.test(markupOf(f)));
    if (!canDelete) {
      // TODAY: the site has no call that deletes an account, so the board's
      // control is not drawn anywhere — a button with nothing behind it is
      // worse than no button.
      expect(offered).toEqual([]);
      expect(settings).not.toContain("alertdialog");
      return;
    }
    // THE DAY IT EXISTS, this is what it must be (board `Settings`):
    expect(offered.length).toBeGreaterThan(0);
    for (const file of offered) {
      const src = markupOf(file);
      // in the danger colour, and nothing else about it borrowed from the
      // page's ordinary buttons;
      expect([file, DANGER.test(src)]).toEqual([file, true]);
      expect([file, /BTN_INK|BTN_PRIMARY/.test(src.slice(src.search(DELETE)))]).toEqual([file, false]);
      // behind a confirmation that names what goes and offers the way out;
      expect([file, src.includes('role="alertdialog"')]).toEqual([file, true]);
      expect([file, src.includes("Cancel")]).toEqual([file, true]);
      // and never a link: a GET must not delete anything.
      expect([file, /<a\b[^>]*>\s*Delete/.test(src)]).toEqual([file, false]);
    }
  });
});

describe("nothing here is cached for anybody else", () => {
  it("every page under /me and /activity is force-dynamic, with no revalidate and nothing prerendered", () => {
    expect([...OWN_PAGES].sort()).toEqual([
      "activity/page.tsx",
      "me/connect/page.tsx",
      "me/page.tsx",
      "me/settings/agents/page.tsx",
      "me/settings/page.tsx",
    ]);
    for (const file of OWN_PAGES) {
      const src = read(file);
      expect([file, /export const dynamic = "force-dynamic";/.test(src)]).toEqual([file, true]);
      expect([file, /export const revalidate\b/.test(src)]).toEqual([file, false]);
      expect([file, /generateStaticParams|"use cache"|unstable_cache/.test(src)]).toEqual([file, false]);
      // Each one reads the session itself: the gate is in the page.
      expect([file, src.includes("await readSession()")]).toEqual([file, true]);
    }
  });

  it("every read these pages make is uncached at the fetch", () => {
    // `me-api.ts` is the one client (and `listings.ts` its second caller of
    // one read): every request it sends says `no-store`, and none says
    // anything else.
    for (const file of ["me/me-api.ts", "me/listings.ts", "me/agents-api.ts"]) {
      const src = markupOf(file);
      expect([file, (src.match(/cache: "no-store"/g) ?? []).length > 0]).toEqual([file, true]);
      expect([file, /cache: "(?!no-store)|next: \{\s*revalidate/.test(src)]).toEqual([file, false]);
    }
    // No page here fetches around the client.
    for (const file of OWN_PAGES) {
      expect([file, /\bfetch\(/.test(markupOf(file))]).toEqual([file, false]);
    }
  });

  it("every route under /me that answers a body says no-store, and the rest only redirect", () => {
    expect(OWN_ROUTES.length).toBeGreaterThan(8);
    for (const file of OWN_ROUTES) {
      const src = markupOf(file);
      const answersBody = /new NextResponse\(|NextResponse\.json\(/.test(src);
      const viaAct = src.includes("actAnswer(");
      if (answersBody) {
        expect([file, /"cache-control": "no-store"|NO_STORE|"no-store"/.test(src)]).toEqual([file, true]);
      } else {
        // A redirect (or the shared act answer, whose JSON branch is
        // `no-store` in `act.ts`) and nothing else.
        expect([file, viaAct || src.includes("NextResponse.redirect(")]).toEqual([file, true]);
      }
      expect([file, /s-maxage|max-age=[1-9]|public,/.test(src)]).toEqual([file, false]);
    }
    expect(markupOf("me/act.ts")).toContain('const NO_STORE = { "cache-control": "no-store" } as const;');
  });

  it("no skeleton or boundary of these pages reads anything personal", () => {
    // A `loading.tsx` is the same bytes for everybody by construction: it
    // must stay that way, since it is what arrives before the session read.
    for (const file of OWN_FILES.filter((f) => /(loading|error)\.tsx$/.test(f))) {
      const src = markupOf(file);
      expect([file, /readSession|cookies\(|me-api|fetch\(/.test(src)]).toEqual([file, false]);
    }
    expect(existsSync(resolve(APP_DIR, "me/settings/loading.tsx"))).toBe(true);
  });
});

describe("OPR-3 — your products say where they stand, and your drafts are listed", () => {
  const draft = (over: Record<string, unknown> = {}) =>
    ({
      id: "ppo_00000000000000000000000000000001",
      kind: "version",
      state: "draft",
      blocks: [{ block: "version", value: "1.4.0" }],
      publishedAt: null,
      milestoneId: null,
      roleOpeningId: null,
      threadId: null,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-02T00:00:00.000Z",
      ...over,
    }) as never;

  it("reads a product's standing from its public document, and says only what is true", () => {
    expect(standingOf(null)).toBeNull();
    const onStage = standingOf({
      stage: "stage",
      milestoneCounts: { shipped: 3, total: 4 },
      roleOpenings: [{ status: "open" }, { status: "open" }, { status: "closed" }],
    } as never);
    expect(onStage).toEqual({ stage: "stage", milestoneCounts: { shipped: 3, total: 4 }, openSeats: 2 });
    expect(standingLine(onStage!)).toBe("On stage · 3 of 4 milestones · 2 open seats");
    // No milestones to count and no seat open: neither is said.
    expect(standingLine({ stage: "building", milestoneCounts: { shipped: 0, total: 0 }, openSeats: 0 })).toBe("Building");
    expect(standingLine({ stage: "production", milestoneCounts: { shipped: 2, total: 2 }, openSeats: 0 })).toBe(
      "In production · 2 of 2 milestones",
    );
    // A document that says a stage there no longer is has no standing.
    expect(standingOf({ stage: "shipping", milestoneCounts: null, roleOpenings: [] } as never)).toBeNull();
    expect(standingLine({ stage: "idea", milestoneCounts: null, openSeats: 1 })).toBe("Idea · 1 open seat");
    const sections = markupOf("me/sections.tsx");
    expect(sections).toContain("<MilestoneSegments counts={standing.milestoneCounts}");
    // A draft listing has no public page, so no standing is read for it.
    expect(markupOf("me/page.tsx")).toContain('.filter((listing) => listing.visibility === "public")');
  });

  it("names a draft by its kind and headline, counts its required blocks from the catalogue, and opens it in the builder", () => {
    expect(draftTitle(draft())).toEqual({ kind: "New version", headline: "1.4.0" });
    expect(draftTitle(draft({ blocks: [] }))).toEqual({ kind: "New version", headline: null });
    // New version requires Version and Added.
    expect(draftProgress(draft())).toBe("1 of 2 required");
    expect(draftProgress(draft({ blocks: [{ block: "version", value: "1" }, { block: "added", value: "x" }] }))).toBe("2 of 2 required");
    // Only what the builder can open: a draft, of an authored kind.
    expect(editableDrafts("kettle", [draft(), draft({ state: "published" }), draft({ kind: "demo" })])).toHaveLength(1);
    const sections = markupOf("me/sections.tsx");
    expect(sections).toContain("<AppLink href={composeDraftPath(slug, post.id)}");
    expect(sections).toContain("Continue");
  });

  it("reads the drafts of every product with the caller's token, and tells none-read from none", async () => {
    const listings = [
      { id: "opp_1", orgId: "org_1", slug: "kettle" },
      { id: "opp_2", orgId: "org_2", slug: "teapot" },
    ] as never;
    const seen: string[] = [];
    const answering = (async (url: string, init: { headers: Record<string, string> }) => {
      seen.push(`${init.headers.authorization} ${new URL(url).pathname}`);
      const ok = url.includes("org_1");
      return new Response(JSON.stringify(ok ? { data: { needsYou: { requests: [], drafts: [draft()] } } } : {}), {
        status: ok ? 200 : 503,
      });
    }) as unknown as typeof fetch;
    const drafts = await fetchMyDrafts("tok", listings, answering);
    expect(drafts?.map((entry) => entry.slug)).toEqual(["kettle"]);
    expect(seen.sort()).toEqual([
      "Bearer tok /v1/organizations/org_1/openproduct/profiles/opp_1/needs-you",
      "Bearer tok /v1/organizations/org_2/openproduct/profiles/opp_2/needs-you",
    ]);
    const failing = (async () => new Response("{}", { status: 503 })) as unknown as typeof fetch;
    expect(await fetchMyDrafts("tok", listings, failing)).toBeNull();
    expect(await fetchMyDrafts("tok", [], failing)).toEqual([]);
  });

  it("unfollows by a form that comes back to the section, for a product and for a person", () => {
    const sections = markupOf("me/sections.tsx");
    expect(sections).toContain('const back = encodeURIComponent("/me?section=following");');
    expect(sections).toContain("`/me/follow?kind=listing&value=${encodeURIComponent(product.slug)}&on=0&return_to=${back}`");
    expect(sections).toContain("`/me/follow?kind=person&value=${encodeURIComponent(person.handle)}&on=0&return_to=${back}`");
    expect(sections).toContain("You don’t follow anything yet.");
  });
});
