// The studio after openproduct-redesign OPR-3 (design §5): what moved, and
// what did not.
//
// The design moves a maker's work onto the product's own page. This
// milestone's product page edits the tagline and the Try it address in place
// and holds the milestones, the posts and "Needs you". It does NOT upload
// media, set topics, manage the roster or the role openings, check the
// repository, publish or unpublish, link the workspace, schedule a launch or
// moderate a discussion — so each step that does one of those KEEPS WORKING,
// at its own address, and only the studio's landing moved:
//
//   /studio                              → /me  (the list is "Your products")
//   /studio/{org}/{profile}              kept: publish, unpublish, review,
//                                        repository check, link the workspace —
//                                        and the only page a DRAFT listing has
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
  { page: "studio/[org]/[profile]/page.tsx", why: "publish", proof: ["studio/[org]/[profile]/page.tsx", 'name="intent" value="publish"'] },
  { page: "studio/[org]/[profile]/page.tsx", why: "repository check", proof: ["studio/[org]/[profile]/page.tsx", 'name="intent" value="repo-check"'] },
  { page: "studio/[org]/[profile]/details/page.tsx", why: "the live address and install line", proof: ["studio/[org]/[profile]/details/page.tsx", 'name="installLine"'] },
  { page: "studio/[org]/[profile]/media/page.tsx", why: "media upload", proof: ["studio/[org]/[profile]/media/page.tsx", 'name="intent" value="upload-media"'] },
  { page: "studio/[org]/[profile]/topics/page.tsx", why: "topics", proof: ["studio/[org]/[profile]/topics/page.tsx", 'name="intent" value="update-topics"'] },
  { page: "studio/[org]/[profile]/people/page.tsx", why: "the roster", proof: ["studio/[org]/[profile]/people/page.tsx", 'name="intent" value="maintainers"'] },
  { page: "studio/[org]/[profile]/people/page.tsx", why: "role openings", proof: ["studio/[org]/[profile]/people/page.tsx", 'name="intent" value="opening-save"'] },
  { page: "studio/[org]/[profile]/launches/page.tsx", why: "scheduling a launch", proof: ["studio/[org]/[profile]/launches/page.tsx", 'name="intent" value="schedule"'] },
  { page: "studio/[org]/[profile]/discussions/page.tsx", why: "moderating a discussion", proof: ["studio/[org]/[profile]/discussions/actions/route.ts", 'intent === "lock"'] },
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
      "studio/[org]/[profile]/discussions/page.tsx",
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

  it("the only studio redirect is the landing's", () => {
    // No `route.ts` under the studio redirects except the landing's; the
    // others are the act handlers they always were.
    expect(code("studio/route.ts")).toContain("NextResponse.redirect(new URL(STUDIO_MOVED_TO, request.url), 308)");
    const config = readFileSync(resolve(APP_DIR, "../../next.config.mjs"), "utf-8");
    expect(config).not.toMatch(/source: "\/studio\/:org/);
  });

  it("a published listing's settings link back to its page, and Manage on /me goes to the page", () => {
    expect(code("studio/[org]/[profile]/editor.tsx")).toContain("View public page");
    expect(code("me/products.ts")).toContain('return listing.visibility === "public"');
  });
});
