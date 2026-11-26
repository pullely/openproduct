// The studio after openproduct-redesign OPR-3 (design §5): what moved, and
// what did not.
//
// The design moves a maker's work onto the product's own page. This
// milestone's product page edits the tagline and the Try it address in place
// and holds the milestones, the posts, the seats (a seat is added, edited,
// closed and deleted on the Crew tab) and "Needs you". It does NOT upload
// media, set topics, manage the roster, check the
// repository, publish or unpublish, link the workspace, schedule a launch or
// moderate a discussion — so each step that does one of those KEEPS WORKING,
// at its own address. Two addresses moved:
//
//   /studio                              → /me  (the list is "Your products")
//   /studio/{org}/{profile}              FORWARDS (a route handler, 307):
//                                          a published listing → /{slug}, the
//                                          product's page, which is its
//                                          dashboard now
//                                          a draft → …/settings (a draft has
//                                          no public page)
//   …/settings                           what the overview did, unchanged:
//                                        publish, unpublish, review, the
//                                        repository check, link the workspace
//   …/details                            kept: live address, install line,
//                                        repository, beyond tagline and pitch
//   …/media                              kept: upload, describe, reorder, remove
//   …/topics                             kept: the stack and the facets
//   …/people                             kept: the roster and the role openings
//   …/launches                           kept: schedule, reschedule, cancel a
//                                        dated launch (a New version post is
//                                        not a scheduled launch)
//   …/discussions                        kept: lock, unlock, mark an answer
//                                        (Talk on the product page is OPR3)
//   /studio/reports, appeals,            kept: moderation is not a maker's
//   collections, link                    dashboard
//
// A step is redirected only when the product page can really do its job. The
// table below is the decision, and this suite holds every row of it.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LISTING_SETTINGS_SEGMENT, listingBasePath, listingSettingsPath } from "@openproduct/contracts";

import { moreSettingsLinks } from "@openproduct-web/app/[slug]/maker/model";
import { LISTING_BASE_STATUS, listingBaseDestination, listingDiscussionsDestination } from "@openproduct-web/app/studio/moved";
import { GET, STUDIO_MOVED_TO } from "@openproduct-web/app/studio/route";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** Each studio step that stays, and the act only it can do (its form's
 *  `intent`, or the handler that takes it). */
const KEPT: readonly { page: string; why: string; proof: readonly [file: string, needle: string] }[] = [
  { page: "studio/[org]/[profile]/settings/page.tsx", why: "publish", proof: ["studio/[org]/[profile]/settings/page.tsx", 'name="intent" value="publish"'] },
  { page: "studio/[org]/[profile]/settings/page.tsx", why: "repository check", proof: ["studio/[org]/[profile]/settings/page.tsx", 'name="intent" value="repo-check"'] },
  { page: "studio/[org]/[profile]/details/page.tsx", why: "the live address and install line", proof: ["studio/[org]/[profile]/details/page.tsx", 'name="installLine"'] },
  { page: "studio/[org]/[profile]/media/page.tsx", why: "media upload", proof: ["studio/[org]/[profile]/media/page.tsx", 'name="intent" value="upload-media"'] },
  { page: "studio/[org]/[profile]/topics/page.tsx", why: "topics", proof: ["studio/[org]/[profile]/topics/page.tsx", 'name="intent" value="update-topics"'] },
  { page: "studio/[org]/[profile]/people/page.tsx", why: "the roster", proof: ["studio/[org]/[profile]/people/page.tsx", 'name="intent" value="maintainers"'] },
  { page: "studio/[org]/[profile]/people/page.tsx", why: "role openings", proof: ["studio/[org]/[profile]/people/page.tsx", 'name="intent" value="opening-save"'] },
  { page: "studio/[org]/[profile]/launches/page.tsx", why: "scheduling a launch", proof: ["studio/[org]/[profile]/launches/page.tsx", 'name="intent" value="schedule"'] },
  // OPR-4 — the discussions page forwards to Talk (below). Locking a thread
  // is still the studio's: the Discussions card on the settings page.
  { page: "studio/[org]/[profile]/settings/page.tsx", why: "moderating a discussion", proof: ["studio/[org]/[profile]/discussions/actions/route.ts", 'intent === "lock"'] },
  { page: "studio/reports/page.tsx", why: "moderation", proof: ["studio/reports/page.tsx", "<StudioFrame"] },
  { page: "studio/appeals/page.tsx", why: "moderation", proof: ["studio/appeals/page.tsx", "<StudioFrame"] },
  { page: "studio/collections/page.tsx", why: "curation", proof: ["studio/collections/page.tsx", "<StudioFrame"] },
  { page: "studio/link/page.tsx", why: "linking a workspace", proof: ["studio/link/page.tsx", "consoleWorkspacePickerUrl"] },
];

describe("`/studio` is \"Your products\" on `/me`", () => {
  it("answers 308 to /me from a route handler — a status line, not a prerendered page", () => {
    expect(STUDIO_MOVED_TO).toBe("/me");
    const response = GET({ url: "https://openproduct.live/studio" } as never);
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://openproduct.live/me");
    expect(response.headers.get("cache-control")).toBe("no-store");
    // The page form of a redirect deploys as a 200 (SB0's lesson): there is
    // no page at this address, only the handler, and it is never prerendered.
    expect(existsSync(resolve(APP_DIR, "studio/page.tsx"))).toBe(false);
    expect(code("studio/route.ts")).toMatch(/^export const dynamic = "force-dynamic";$/m);
    expect(code("studio/route.ts")).not.toMatch(/permanentRedirect|from "next\/navigation"/);
  });

  it("the list it was is the first section of /me, with the same read and the same two doors", () => {
    expect(code("me/page.tsx")).toContain("fetchMyListings(session.accessToken)");
    const sections = code("me/sections.tsx");
    expect(sections).toContain("data-me-products");
    expect(sections).toContain("{LINK_WORKSPACE_LABEL}");
    expect(sections).toContain('<AppLink href="/submit"');
    // A draft listing still says what stands between it and publishing.
    expect(sections).toContain('"needs workspace link"');
    expect(sections).toContain('"awaiting review"');
  });

  it("nothing in the studio still points at the old landing: the way back is Your products", () => {
    for (const file of [
      "studio/frame.tsx",
      "studio/error.tsx",
      "studio/[org]/[profile]/layout.tsx",
      "studio/[org]/[profile]/listing-shell.tsx",
      "studio/[org]/[profile]/launches/page.tsx",
      "studio/[org]/[profile]/discussions/route.ts",
      "studio/reports/page.tsx",
      "studio/appeals/page.tsx",
      "studio/collections/page.tsx",
    ]) {
      expect([file, /href(=|: )"\/studio"/.test(code(file))]).toEqual([file, false]);
    }
    expect(code("studio/[org]/[profile]/layout.tsx")).toContain('back={{ href: "/me", label: "Your products" }}');
    expect(code("studio/frame.tsx")).toContain('{ label: "Your products", href: "/me", live: true }');
  });
});

describe("a step is redirected only when the product page can do its job", () => {
  it.each(KEPT.map((row) => [row.page, row.why, row.proof] as const))(
    "%s stays, because the product page cannot do: %s",
    (page, _why, proof) => {
      // The step is still a page…
      expect(existsSync(resolve(APP_DIR, page))).toBe(true);
      // …that still does the act (a redirect would have neither).
      expect(code(proof[0])).toContain(proof[1]);
      expect(code(page)).not.toMatch(/\bpermanentRedirect\(|redirect\(`\/\$\{/);
    },
  );

  it("the studio has two forwards, each a route handler: the landing's and the listing's base address", () => {
    expect(code("studio/route.ts")).toContain("NextResponse.redirect(new URL(STUDIO_MOVED_TO, request.url), 308)");
    expect(code("studio/[org]/[profile]/route.ts")).toContain(
      "NextResponse.redirect(new URL(to, request.url), LISTING_BASE_STATUS)",
    );
    // Neither is a `redirects()` entry: the listing's depends on its state.
    const config = readFileSync(resolve(APP_DIR, "../../next.config.mjs"), "utf-8");
    expect(config).not.toMatch(/source: "\/studio\/:org/);
  });

  it("a listing's discussions address goes to Talk; a draft's to the Discussions card on its settings (OPR-4)", () => {
    // Published and shipping: the Talk tab. An idea has no tabs: its section.
    expect(listingDiscussionsDestination("org_1", "opp_1", { visibility: "public", slug: "ackstack", stage: "shipping" })).toBe("/ackstack/talk");
    expect(listingDiscussionsDestination("org_1", "opp_1", { visibility: "public", slug: "ackstack" })).toBe("/ackstack/talk");
    expect(listingDiscussionsDestination("org_1", "opp_1", { visibility: "public", slug: "kettle", stage: "idea" })).toBe("/kettle#talk");
    // A draft, or anything unreadable: the settings page's Discussions card.
    expect(listingDiscussionsDestination("org_1", "opp_1", { visibility: "private", slug: "kettle" }, "?notice=locked")).toBe(
      "/studio/org_1/opp_1/settings?notice=locked#discussions",
    );
    expect(listingDiscussionsDestination("org_1", "opp_1", null)).toBe("/studio/org_1/opp_1/settings#discussions");
    expect(listingDiscussionsDestination("org_1", "opp_1", { visibility: "public", slug: "../evil" })).toBe(
      "/studio/org_1/opp_1/settings#discussions",
    );
    // A route handler with a real status line, like the other two forwards;
    // there is no page at the address any more, and no skeleton above it.
    const route = code("studio/[org]/[profile]/discussions/route.ts");
    expect(route).toMatch(/^export const dynamic = "force-dynamic";$/m);
    expect(route).toContain("NextResponse.redirect(new URL(to, request.url), LISTING_BASE_STATUS)");
    expect(route).toContain('response.headers.set("cache-control", "no-store");');
    expect(route).not.toMatch(/permanentRedirect|from "next\/navigation"/);
    expect(existsSync(resolve(APP_DIR, "studio/[org]/[profile]/discussions/page.tsx"))).toBe(false);
    expect(existsSync(resolve(APP_DIR, "studio/[org]/[profile]/discussions/loading.tsx"))).toBe(false);
    // The acts the page offered still post to `./actions` and come back to
    // the card that draws them.
    expect(code("studio/[org]/[profile]/discussions/actions/route.ts")).toContain("#discussions");
    expect(code("studio/[org]/[profile]/settings/page.tsx")).toContain("<DiscussionsCard");
    // Nothing offers the address as a place to go: not the strip, not
    // "More settings".
    expect(code("studio/[org]/[profile]/step-strip.tsx")).not.toContain("/discussions");
    expect(
      moreSettingsLinks({ org: "org_1", profile: "opp_1" }).map((link) => link.label),
    ).toEqual(["Settings", "Details", "Media", "Category and stack", "People", "Launches"]);
  });

  it("a published listing's base address goes to its product page; a draft's to its settings", () => {
    const base = listingBasePath("org_1", "opp_1");
    expect(base).toBe("/studio/org_1/opp_1");
    expect(LISTING_SETTINGS_SEGMENT).toBe("settings");
    expect(listingSettingsPath("org_1", "opp_1")).toBe("/studio/org_1/opp_1/settings");
    // Published: the product's own page is the dashboard (design §2.5).
    expect(listingBaseDestination("org_1", "opp_1", { visibility: "public", slug: "ackstack" })).toBe("/ackstack");
    // …and the query stays behind: the public page is cached and reads none.
    expect(listingBaseDestination("org_1", "opp_1", { visibility: "public", slug: "ackstack" }, "?notice=saved")).toBe("/ackstack");
    // A draft has no public page: its overview is the settings page.
    expect(listingBaseDestination("org_1", "opp_1", { visibility: "private", slug: "kettle" })).toBe("/studio/org_1/opp_1/settings");
    expect(listingBaseDestination("org_1", "opp_1", { visibility: "draft", slug: "kettle" }, "?notice=created")).toBe(
      "/studio/org_1/opp_1/settings?notice=created",
    );
    // Signed out, not theirs, the service down — all unreadable, and all go
    // to the settings page, which already answers each (sign-in, the hiding
    // 404, "try again"). The forward never says which.
    expect(listingBaseDestination("org_1", "opp_1", null)).toBe("/studio/org_1/opp_1/settings");
    // A slug that is not one is never put in an address.
    expect(listingBaseDestination("org_1", "opp_1", { visibility: "public", slug: "../evil" })).toBe("/studio/org_1/opp_1/settings");
  });

  it("the forward is a route handler that answers 307, never cached, and never a page", () => {
    // 307, not 308: where it goes depends on whether the listing is
    // published TODAY, and a browser keeps a permanent redirect.
    expect(LISTING_BASE_STATUS).toBe(307);
    const route = code("studio/[org]/[profile]/route.ts");
    expect(route).toMatch(/^export const dynamic = "force-dynamic";$/m);
    expect(route).toContain('response.headers.set("cache-control", "no-store");');
    expect(route).not.toMatch(/permanentRedirect|from "next\/navigation"/);
    // The page form of a redirect deploys as a 200 under a loading boundary
    // (SB0's lesson): there is no page at this address, only the handler.
    expect(existsSync(resolve(APP_DIR, "studio/[org]/[profile]/page.tsx"))).toBe(false);
    expect(existsSync(resolve(APP_DIR, "studio/[org]/[profile]/settings/page.tsx"))).toBe(true);
    // It reads the listing as its maintainer does, with the caller's own
    // token, so only somebody who maintains it learns where it is published.
    expect(route).toContain("decodeSession(request.cookies.get(SESSION_COOKIE)?.value)");
    expect(route).toContain("await fetchProfile(session.accessToken, org, profile)");
    expect(route).toContain("listingBaseDestination(org, profile, listing, request.nextUrl.search)");
    // The decision itself never touches a request, which is why it is
    // asserted directly above.
    expect(code("studio/moved.ts")).not.toContain("next/server");
  });

  it("everything in the studio that named the overview names the settings page — no hop through the forward", () => {
    expect(code("studio/[org]/[profile]/editor.tsx")).toContain("overview: listingSettingsPath(org, profileId),");
    expect(code("studio/[org]/[profile]/listing-shell.tsx")).toContain("href: listingSettingsPath(org, profileId)");
    expect(code("studio/[org]/[profile]/layout.tsx")).toContain("listingSettingsPath(org, profileId)");
    expect(code("studio/[org]/[profile]/settings/page.tsx")).toContain("const here = listingSettingsPath(org, profileId);");
    // An act made on the settings page (publish, unpublish, review, the
    // repository check) comes back to it with its notice.
    expect(code("studio/[org]/[profile]/actions/route.ts")).toContain("`${editor}/${LISTING_SETTINGS_SEGMENT}`");
    // Linking a workspace lands on the settings page too.
    const link = code("studio/link/submit/route.ts");
    expect(link).toContain("/settings?notice=created`");
    expect(link).toContain("/settings?notice=linked`");
    expect(link).not.toMatch(/\)\}\?notice=/);
    // And a draft's "Manage" on /me.
    expect(code("me/products.ts")).toContain("listingSettingsPath(listing.orgId, listing.id)");
  });

  it("a published listing's settings link back to its page, and Manage on /me goes to the page", () => {
    expect(code("studio/[org]/[profile]/editor.tsx")).toContain("View public page");
    expect(code("me/products.ts")).toContain('return listing.visibility === "public"');
  });
});
