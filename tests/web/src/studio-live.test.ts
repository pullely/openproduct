// A studio act, without the reload (openproduct-performance OPP15).
//
// Every studio surface posted a form, took a `303`, and loaded itself again:
// two sequential round trips to a worker in front of a database in Singapore
// to change one field, and a discarded document at the end of it. OPP15 keeps
// the form and the `303` exactly as they were and adds a second transport for
// the same answer. What is pinned here is the four things that makes true or
// breaks:
//
//   1. ONE DECISION, TWO TRANSPORTS. Every `…/actions` route answers through
//      `studioAnswer`, so a redirect and a JSON answer cannot drift apart —
//      and a signed-out JSON caller gets an EMPTY 401 rather than a `303` to
//      a sign-in page that `fetch` would follow and read as success.
//   2. ONE VOCABULARY. Six surfaces had six copies of the same reading; the
//      island is the seventh reader and must say the same sentence.
//   3. THE FORMS DID NOT CHANGE. Same method, same action, same fields — the
//      no-JavaScript path is the one the island is layered over.
//   4. WHICH FORMS OPT IN, AND WHY THOSE. Only the four whose save changes
//      what the maintainer typed into what they typed — the ones where a
//      lost re-render leaves the page stale rather than wrong.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  APPEAL_REFUSALS,
  COLLECTION_REFUSALS,
  LAUNCH_REFUSALS,
  MODERATION_REFUSALS,
} from "@openproduct/contracts";
import {
  APPEAL_VOCABULARY,
  COLLECTION_VOCABULARY,
  DISCUSSION_VOCABULARY,
  LAUNCH_VOCABULARY,
  LISTING_ERRORS,
  LISTING_NOTICES,
  LISTING_VOCABULARY,
  NO_ACTS,
  REPORT_VOCABULARY,
  noticeFrom,
  noticeFromUrl,
  type StudioVocabulary,
} from "@openproduct-web/app/studio/notices";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(HERE, "../../../web/src/app");
const STUDIO = resolve(APP_DIR, "studio");
const read = (file: string) => readFileSync(resolve(STUDIO, file), "utf-8");
/** The file with its prose removed — a guard about code must not read the
 *  comment that names the thing the code rejects. */
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/** Every file under the studio, so "which routes answer acts" is a question
 *  about the directory rather than about a list somebody kept up to date. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(relative(STUDIO, full));
  }
  return out;
}
const STUDIO_FILES = walk(STUDIO);
const ACTION_ROUTES = STUDIO_FILES.filter((f) => f.endsWith("actions/route.ts"));
const PAGES = STUDIO_FILES.filter((f) => f.endsWith("page.tsx"));
/** The pages, plus the two files the editor's cards and rows live in
 *  (openproduct redesign): a Remove under an image and the lock on a thread
 *  are drawn once there and rendered by the overview and the step alike. */
const FORM_FILES = [...PAGES, "[org]/[profile]/sections.tsx", "[org]/[profile]/editor.tsx"];

describe("one decision, two transports", () => {
  it("finds every studio act route — six of them, and the census is the point", () => {
    // A seventh added without `studioAnswer` would be an act the save island
    // posts and cannot read: it would answer a `303`, `fetch` would follow it
    // to an HTML page, and the island would report success for a write it
    // never saw land. The count is asserted so that adding one fails here
    // rather than in a maintainer's browser.
    expect(ACTION_ROUTES.sort()).toEqual(
      [
        "[org]/[profile]/actions/route.ts",
        "[org]/[profile]/discussions/actions/route.ts",
        "[org]/[profile]/launches/actions/route.ts",
        "appeals/actions/route.ts",
        "collections/actions/route.ts",
        "reports/actions/route.ts",
      ].sort(),
    );
  });

  it("every one of them answers through `studioAnswer`", () => {
    for (const route of ACTION_ROUTES) {
      const src = code(route);
      expect([route, src.includes("studioAnswer(request)")]).toEqual([route, true]);
      expect([route, /answer\.back\(/.test(src)]).toEqual([route, true]);
      expect([route, /answer\.signIn\(/.test(src)]).toEqual([route, true]);
    }
  });

  it("and none of them still spells a sign-in redirect by hand", () => {
    // The one place that decides what a signed-out act gets is `answer.ts`,
    // because a `303` there is the bug: `fetch` follows redirects, so an
    // island would read the sign-in document as a successful save.
    for (const route of ACTION_ROUTES) {
      expect([route, code(route).includes("/signin?return_to=")]).toEqual([route, false]);
    }
  });

  it("the answer carries the address the redirect would have used, and nothing else", () => {
    const src = code("answer.ts");
    expect(src).toContain("NextResponse.json({ data: { to } }");
    expect(src).toContain("NextResponse.redirect(new URL(to, request.url), 303)");
    expect(src).toContain("new NextResponse(null, { status: 401");
    // A studio answer is personal and is never stored.
    expect(src).toContain('"cache-control": "no-store"');
    expect(src).toContain("wantsJson(request)");
  });
});

describe("one vocabulary, read the same way by a page and by the island", () => {
  it("a refusal beats an error beats a notice", () => {
    // XP3 — a refusal and a success cannot both be true of one post, and
    // rendering both leaves a maintainer to work out which described what.
    const both = noticeFrom({ notice: "saved", error: "slug_taken" }, LISTING_VOCABULARY);
    expect(both).toEqual({ kind: "refused", message: LISTING_ERRORS.slug_taken });
    const all = noticeFrom(
      { notice: "scheduled", error: "whatever", refused: "already-scheduled" },
      LAUNCH_VOCABULARY,
    );
    expect(all?.kind).toBe("refused");
    expect(all?.message).toBe(LAUNCH_REFUSALS["already-scheduled"]?.says);
  });

  it("says the listing's own words for a code it knows, and the fallback for one it does not", () => {
    expect(noticeFrom({ notice: "saved" }, LISTING_VOCABULARY)).toEqual({
      kind: "said",
      message: "Saved.",
    });
    expect(noticeFrom({ error: "slug_taken" }, LISTING_VOCABULARY)?.message).toBe(
      LISTING_ERRORS.slug_taken,
    );
    expect(noticeFrom({ error: "no-such-code" }, LISTING_VOCABULARY)?.message).toBe(
      LISTING_ERRORS.action_failed,
    );
    expect(noticeFrom({ notice: "no-such-code" }, LISTING_VOCABULARY)).toBeUndefined();
  });

  it("appends `why` only to a code the vocabulary KNOWS (PV2)", () => {
    // The specific sentence behind an install refusal comes from the
    // contract and travels in the query. Appending it to an unknown code
    // would let anybody with a link put arbitrary words on a maintainer's
    // own screen — which is the whole reason the codes are a closed set.
    const known = noticeFrom(
      { error: "install_refused", why: "Pipes are not accepted." },
      LISTING_VOCABULARY,
    );
    expect(known?.message).toBe(`${LISTING_ERRORS.install_refused} Pipes are not accepted.`);
    const unknown = noticeFrom({ error: "made-up", why: "ARBITRARY WORDS" }, LISTING_VOCABULARY);
    expect(unknown?.message).toBe(LISTING_ERRORS.action_failed);
    expect(unknown?.message).not.toContain("ARBITRARY");
  });

  it("never renders a refusal somebody put in the address", () => {
    for (const vocabulary of [
      LAUNCH_VOCABULARY,
      REPORT_VOCABULARY,
      COLLECTION_VOCABULARY,
      APPEAL_VOCABULARY,
    ] as StudioVocabulary[]) {
      const said = noticeFrom({ refused: "Your account has been closed." }, vocabulary)?.message;
      expect(said === undefined || said === APPEAL_REFUSALS["unknown-act"]?.says).toBe(true);
    }
  });

  it("keeps each surface's own reading of an unknown token", () => {
    // Three surfaces say nothing; the appeals queue answers, because an
    // appeal is filed against an act and "we do not recognise that act" is
    // the likeliest refusal there is. This preserved behaviour that differed
    // between the six copies before they became one.
    expect(noticeFrom({ refused: "nope" }, REPORT_VOCABULARY)).toBeUndefined();
    expect(noticeFrom({ refused: "nope" }, COLLECTION_VOCABULARY)).toBeUndefined();
    expect(noticeFrom({ refused: "nope" }, LAUNCH_VOCABULARY)).toBeUndefined();
    expect(noticeFrom({ refused: "nope" }, APPEAL_VOCABULARY)?.message).toBe(
      APPEAL_REFUSALS["unknown-act"]?.says,
    );
  });

  it("says nothing for an error on a surface that names none", () => {
    expect(noticeFrom({ error: "anything" }, REPORT_VOCABULARY)).toBeUndefined();
    expect(noticeFrom({ error: "anything" }, DISCUSSION_VOCABULARY)?.message).toBe(
      "That did not go through. Try again.",
    );
    expect(noticeFrom({ error: "anything" }, LAUNCH_VOCABULARY)?.message).toBe(
      "That did not go through. Try again in a moment.",
    );
  });

  it("a surface with no acts says nothing at all, and is not empty by accident", () => {
    expect(noticeFrom({ notice: "saved" }, NO_ACTS)).toBeUndefined();
    expect(Object.keys(NO_ACTS.notices)).toEqual([]);
  });

  it("carries the contract's refusals rather than a second copy of them", () => {
    expect(LAUNCH_VOCABULARY.refusals).toBe(LAUNCH_REFUSALS);
    expect(REPORT_VOCABULARY.refusals).toBe(MODERATION_REFUSALS);
    expect(COLLECTION_VOCABULARY.refusals).toBe(COLLECTION_REFUSALS);
    expect(APPEAL_VOCABULARY.refusals).toBe(APPEAL_REFUSALS);
  });

  it("has a sentence for every notice the routes can send", () => {
    // The listing editor's routes name these in their redirects; a code with
    // no sentence renders a page that says nothing happened.
    for (const notice of ["saved", "checked", "published", "unpublished", "media_added"]) {
      expect([notice, LISTING_NOTICES[notice]]).not.toEqual([notice, undefined]);
    }
  });
});

describe("the island reads the route's answer exactly as the page reads its address", () => {
  it("turns the answer's address back into the notice, the blockers and where to be", () => {
    const read = noticeFromUrl("/studio/acme/prf_1/details?notice=saved", LISTING_VOCABULARY);
    expect(read.notice).toEqual({ kind: "said", message: "Saved." });
    expect(read.blockers).toEqual([]);
    expect(read.pathname).toBe("/studio/acme/prf_1/details");
  });

  it("reads a publish refusal's blockers, in order", () => {
    const read = noticeFromUrl(
      "/studio/acme/prf_1?error=action_failed&blockers=needs_review,no_repo",
      LISTING_VOCABULARY,
    );
    expect(read.notice?.kind).toBe("refused");
    expect(read.blockers).toEqual(["needs_review", "no_repo"]);
  });

  it("reads a contract refusal token the same way the surface would", () => {
    const read = noticeFromUrl("/studio/collections?refused=not-yours", COLLECTION_VOCABULARY);
    expect(read.notice?.message).toBe(COLLECTION_REFUSALS["not-yours"]?.says);
  });

  it("reports the answer's own path, so an act that MOVES is followed", () => {
    // A created collection answers with its own address; the island pushes
    // there instead of refreshing the page the act was made from.
    const read = noticeFromUrl("/studio/collections?notice=created", COLLECTION_VOCABULARY);
    expect(read.pathname).toBe("/studio/collections");
    expect(read.notice?.kind).toBe("said");
  });

  it("survives an answer with no query at all", () => {
    const read = noticeFromUrl("/studio/acme/prf_1/launches", LAUNCH_VOCABULARY);
    expect(read.notice).toBeUndefined();
    expect(read.blockers).toEqual([]);
  });
});

describe("the forms did not change", () => {
  it("every studio form still posts to a route, with no client action", () => {
    for (const page of FORM_FILES) {
      const src = code(page);
      const forms = src.match(/<form\b[^>]*>/g) ?? [];
      for (const form of forms) {
        expect([page, form.includes('method="post"')]).toEqual([page, true]);
        expect([page, /action=/.test(form)]).toEqual([page, true]);
      }
    }
  });

  it("the pages that hold them are still server components", () => {
    // The island is ONE client component, mounted by the frame. A step page
    // that became one would put the session token's neighbourhood — and the
    // whole editor — in the browser (OX5b).
    //
    // The link receiver is the standing exception and always was: it reads a
    // grant out of the URL FRAGMENT, which never reaches a server, so there
    // is no server to read it. It posts to `/studio/link/submit` rather than
    // to an `…/actions` route, so the island never sees it either.
    const clients = PAGES.filter((page) => read(page).startsWith('"use client"'));
    expect(clients).toEqual(["link/page.tsx"]);
    expect(read("live-save.tsx").startsWith('"use client"')).toBe(true);
  });

  it("FOUR forms opt in, and they are the ones a lost re-render cannot break", () => {
    // The rule this milestone rests on. A save on these changes what the
    // maintainer just typed into what they typed, so the form is already
    // showing the truth when the answer lands: the page cannot be wrong, and
    // the advice beside it is at worst one act behind. Everything else — an
    // upload, a removal, a publish, a launch, a decision — changes the PAGE,
    // so it keeps the `303` that is correct by construction, because
    // `router.refresh()` is measured to drop about one answer in four.
    const stays: string[] = [];
    for (const page of FORM_FILES) {
      const src = code(page);
      for (const form of src.match(/<form[\s\S]{0,400}?>/g) ?? []) {
        if (form.includes('data-live="stay"')) stays.push(page);
      }
    }
    expect(stays.sort()).toEqual(
      [
        "[org]/[profile]/details/page.tsx",
        "[org]/[profile]/people/page.tsx",
        "[org]/[profile]/people/page.tsx",
        "[org]/[profile]/topics/page.tsx",
      ].sort(),
    );
  });

  it("the acts that change the page do NOT opt in", () => {
    // Named so that turning one of them into a background act is a decision
    // somebody has to make here first.
    for (const [page, intent] of [
      ["[org]/[profile]/media/page.tsx", "upload-media"],
      // The rows moved into the editor's shared file (openproduct redesign).
      ["[org]/[profile]/sections.tsx", "remove-media"],
      ["[org]/[profile]/editor.tsx", "unpublish"],
      ["[org]/[profile]/page.tsx", "publish"],
      ["[org]/[profile]/launches/page.tsx", "schedule"],
      ["[org]/[profile]/details/page.tsx", "repo-check"],
    ] as const) {
      const src = code(page);
      const at = src.indexOf(`value="${intent}"`);
      expect([page, intent, at >= 0]).toEqual([page, intent, true]);
      // The form tag that owns this intent is the nearest one above it.
      const form = src.lastIndexOf("<form", at);
      expect([page, intent, src.slice(form, at).includes('data-live="stay"')]).toEqual([
        page,
        intent,
        false,
      ]);
    }
  });

});

describe("the island itself", () => {
  const island = code("live-save.tsx");

  it("takes a submit only from a form posting to an act route", () => {
    expect(island).toContain('url.pathname.endsWith("/actions")');
    expect(island).toContain("url.origin === window.location.origin");
    expect(island).toContain("if (!isLiveAction(form.action)) return");
    expect(island).toContain("form.getAttribute(LIVE_ATTRIBUTE) !== LIVE_STAY) return");
  });

  it("posts the same form to the same action, asking for JSON, same-origin, uncached", () => {
    expect(island).toContain("fetch(form.action, {");
    expect(island).toContain('method: "POST"');
    expect(island).toContain("body: data");
    expect(island).toContain('headers: { accept: "application/json" }');
    expect(island).toContain('credentials: "same-origin"');
    expect(island).toContain('cache: "no-store"');
  });

  it("puts the submitter in the form data, for the fifth form that opts in", () => {
    expect(island).toContain("new FormData(form, submitter)");
    expect(island).toContain(
      "if (submitter?.name && !data.has(submitter.name)) data.append(submitter.name, submitter.value)",
    );
  });

  it("and twelve controls elsewhere in the studio are why that guard exists", () => {
    const named = FORM_FILES.flatMap((page) =>
      (code(page).match(/<button[^>]*type="submit"[^>]*name="[^"]+"/g) ?? []).map(
        (m) => `${page}: ${m.slice(0, 40)}`,
      ),
    );
    expect(named.length).toBe(12);
  });

  it("a stale session lets the plain form post, and never reads a followed redirect as success", () => {
    expect(island).toContain("if (res.status === 401)");
    expect(island).toContain("form.submit()");
    // The answer must carry an address; anything else is a refusal, never a
    // save reported to somebody whose edit did not land.
    expect(island).toContain('typeof to !== "string"');
  });

  it("stays where it is and asks for a catch-up, unless the route said to be elsewhere", () => {
    expect(island).toContain("read.pathname !== window.location.pathname");
    expect(island).toContain("router.push(to)");
    // Asked for from an effect — where React expects router work — and still
    // only best effort, which is why the opt-in set is what it is.
    expect(island).toContain("router.refresh()");
    expect(island).toContain("React.useEffect(");
  });

  it("cannot run two acts at once", () => {
    expect(island).toContain("if (busy)");
    expect(island).toContain("submitter.disabled = true");
  });

  it("renders the outcome where a screen reader hears it", () => {
    expect(island).toContain('role="status"');
    expect(island).toContain("data-studio-notice=");
  });

  it("reads nothing personal and holds no token", () => {
    expect(island).not.toMatch(/accessToken|op_session|document\.cookie|Bearer/);
  });
});

describe("the frame mounts it once, and every surface says which words it uses", () => {
  it("the frame renders the island around the surface", () => {
    const frame = code("frame.tsx");
    expect(frame).toContain("<StudioLive vocabulary={vocabulary} notice={notice} blockers={blockers}>");
    // The banner moved INTO the island — two banners would be two answers to
    // one act, and only one of them would update.
    expect(frame).not.toContain("function NoticeBanner");
  });

  it("every page that renders a frame passes a vocabulary", () => {
    // A listing's steps render their notice through `StudioLive` directly,
    // under the persistent layout (openproduct-studio OSD5); the rest through
    // the frame. Either way the words are named.
    const framed = PAGES.filter((page) => code(page).includes("<StudioFrame") || code(page).includes("<StudioLive"));
    expect(framed.length).toBeGreaterThanOrEqual(11);
    for (const page of framed) {
      expect([page, /vocabulary=\{[A-Z_]+\}/.test(code(page))]).toEqual([page, true]);
    }
  });

  it("and no surface still keeps a private copy of the words", () => {
    for (const page of PAGES) {
      expect([page, code(page).includes("const NOTICE_COPY")]).toEqual([page, false]);
      expect([page, code(page).includes("function noticeOf(")]).toEqual([page, false]);
    }
  });
});

describe("the media step reads once", () => {
  it("asks for the profile and the rows together, and the session only once", () => {
    // Two documents that do not depend on each other, awaited one after the
    // other, cost a page two round trips to Singapore for no reason (OPP7's
    // rule, applied to the one studio page that broke it).
    const media = code("[org]/[profile]/media/page.tsx");
    expect(media).toContain("loadListing(org, profileId, await props.searchParams, here, (token) =>");
    // Through the listing's cached read since openproduct-studio OSD4.
    expect(media).toContain("readMedia(token, org, profileId)");
    expect(media).not.toContain("readSession");
    expect(media).not.toContain("await fetchMedia");

    const shell = code("[org]/[profile]/listing-shell.tsx");
    expect(shell).toContain("await Promise.all([");
    expect(shell).toContain("also ? also(session.accessToken)");
  });

  it("no studio page awaits two reads in a row", () => {
    // The shape that caused it: `await` a loader, then `await` a fetch. A
    // page needing two documents hands the second to `loadListing`.
    for (const page of PAGES) {
      const src = code(page);
      const awaits = src.match(/await (fetch[A-Z]\w*|loadListing)\(/g) ?? [];
      expect([page, awaits.length <= 1]).toEqual([page, true]);
    }
  });
});

describe("the studio's own links report the click (OPP13's bar)", () => {
  it("the frame, the strip and the listings use AppLink", () => {
    for (const file of [
      "frame.tsx",
      "page.tsx",
      "[org]/[profile]/step-strip.tsx",
      "[org]/[profile]/page.tsx",
    ]) {
      const src = code(file);
      expect([file, src.includes("<AppLink")]).toEqual([file, true]);
      expect([file, src.includes('from "next/link"')]).toEqual([file, false]);
    }
  });

  it("with the ROUTER's prefetch policy, not a full personal render of every step", () => {
    // `prefetch={true}` on five steps would render one listing five times per
    // page view for pages nobody opened — the OPP0 defect `ui/link.tsx`
    // records. `"auto"` fetches the loading boundary and stops.
    for (const file of ["frame.tsx", "[org]/[profile]/step-strip.tsx"]) {
      expect([file, code(file).includes('prefetch="auto"')]).toEqual([file, true]);
      expect([file, code(file).includes("prefetch={true}")]).toEqual([file, false]);
    }
    // openproduct-studio OSD5: the strip warms the WHOLE step on intent — a
    // hover or a touch — and only then. One render per tab reached for.
    expect(code("[org]/[profile]/step-strip.tsx")).toContain('warm="intent"');
    const link = readFileSync(resolve(APP_DIR, "ui/link.tsx"), "utf-8");
    expect(link).toContain('prefetch={prefetch === "auto" ? null : prefetch}');
  });
});

// openproduct-studio OSD4 — the logo, edited where it is seen.
describe("the logo control", () => {
  const control = () => code("[org]/[profile]/logo-control.tsx");

  it("is the hero's tile, drawn by the layout every step shares", () => {
    expect(code("[org]/[profile]/layout.tsx")).toContain("<LogoControl");
    expect(code("[org]/[profile]/editor.tsx")).toContain("tile ?? (");
  });

  it("checks the shape with the server's own rule before a byte leaves", () => {
    expect(control()).toContain('mediaShapeRefusal("logo", dims.width, dims.height)');
    expect(control()).toContain("MEDIA_REFUSALS[shape]");
  });

  it("posts to the listing's own actions route in the background, with progress, and refreshes in place", () => {
    const src = control();
    expect(src).toContain('data.set("kind", "logo")');
    expect(src).toContain('setRequestHeader("accept", "application/json")');
    expect(src).toContain("xhr.upload.onprogress");
    expect(src).toContain("router.refresh()");
  });

  it("is a plain link to the media step until it hydrates", () => {
    expect(control()).toContain("<a href={mediaHref}");
  });
});

// openproduct-studio OSD6 — the media step, without the reloads.
describe("the upload island", () => {
  const island = () => code("[org]/[profile]/media/media-island.tsx");

  it("takes over the media step once it hydrates, and leaves the form as the no-script path", () => {
    const page = code("[org]/[profile]/media/page.tsx");
    expect(page).toContain("<MediaIsland media={media} action={action} apiBase={publicApiBase()}>");
    expect(page).toContain('name="intent" value="upload-media"');
    expect(island()).toContain("if (!scripted) return <>{children}</>;");
  });

  it("takes several files, checks each against the server's rule, and shows progress", () => {
    const src = island();
    expect(src).toContain("multiple");
    expect(src).toContain("mediaShapeRefusal(kind, width, height)");
    expect(src).toContain("xhr.upload.onprogress");
  });

  it("lists what the acts answered rather than waiting on a refresh", () => {
    const src = island();
    for (const intent of ["upload-media", "describe-media", "reorder-gallery", "remove-media"]) {
      expect([intent, src.includes(`"${intent}"`)]).toEqual([intent, true]);
    }
    expect(src).toContain("setRows(");
  });

  it("has a route intent for each in-place act", () => {
    const route = code("[org]/[profile]/actions/route.ts");
    expect(route).toContain('case "describe-media"');
    expect(route).toContain('case "reorder-gallery"');
  });
});
