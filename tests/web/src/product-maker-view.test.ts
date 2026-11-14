// The maker view on a product page (openproduct-redesign OPR-3, design §4;
// boards `Product`, `ProductIdea` in their `view: 'maker'` state).
//
// A product page is public and cached: the same bytes for every visitor. Its
// crew sees more on the same address — the Manage / Visitor switch, Edit
// details, New post, Needs you, the milestone manager, Edit post, Add a seat
// — and every one of those arrives AFTER load, in the crew's own browser.
// What is pinned:
//
//   - no maker element is in any server render: the maker components are
//     client components, each gated on `useMaker(slug)`, which is the one
//     caller of `useCrewOf(slug)`; the page hands them only public values
//   - "Visitor" hides every maker element
//   - a seat request is reviewed on Orunbase: no Accept, no Decline
//   - the milestone form's fields and limits are the contract's
//   - Edit details edits the pitch and the Try it address, never the name
//
// This lane does not compile JSX, so the rules are called where they are
// plain functions (`[slug]/maker/model.ts`) and read from source otherwise.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTHORED_PRODUCT_POST_KINDS,
  MILESTONE_CODE_MAX,
  MILESTONE_SUMMARY_MAX,
  MILESTONE_TITLE_MAX,
  type CrewNeedsYou,
  type CrewProductPost,
  type OverlayCrew,
} from "@openproduct/contracts";

import {
  MILESTONE_ACTS,
  MILESTONE_FIELDS,
  NEEDS_YOU_ARIA,
  NEEDS_YOU_LABEL,
  OFFERED_POST_LABEL,
  PROFILE_FORM_FIELDS,
  SEAT_REQUEST_ACTION,
  TAGLINE_LIMIT,
  VIEW_MODES,
  VIEW_MODE_LABELS,
  VIEW_SWITCH_LABEL,
  VIEW_SWITCH_SLOT_ID,
  canSaveDetails,
  continuePostPath,
  draftLine,
  draftsOf,
  isManaging,
  manageRoute,
  movedOrder,
  needsYouEmpty,
  newPostKinds,
  seatRequestReviewHref,
  seatRequestText,
  seatRequesterName,
  studioSeatsPath,
  taglineCount,
  viewModeKey,
  viewModeOf,
} from "@openproduct-web/app/[slug]/maker/model";
import { MILESTONE_INTENTS } from "@openproduct-web/app/posts/crew-forms";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = resolve(__dirname, "../../../web/src/app");
const REPO = resolve(__dirname, "../../..");
const read = (file: string) => readFileSync(resolve(APP, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const MAKER_DIR = "[slug]/maker";
const PAGE = "[slug]/product-page.tsx";
/** Every component in the maker folder. */
const COMPONENTS = readdirSync(resolve(APP, MAKER_DIR)).filter((file) => file.endsWith(".tsx"));
/** The server files a product page is rendered from. */
const SERVER_FILES = [
  PAGE,
  "[slug]/page.tsx",
  "[slug]/about/page.tsx",
  "[slug]/crew/page.tsx",
  "[slug]/talk/page.tsx",
  "[slug]/updates/[cursor]/page.tsx",
];

const CREW: OverlayCrew = { slug: "ackstack", org: "org_1", profile: "opp_1" };

describe("no maker element is in any server render", () => {
  it("finds the maker components, so an empty folder cannot read as a pass", () => {
    expect(COMPONENTS.sort()).toEqual([
      "details.tsx",
      "milestones.tsx",
      "needs-you.tsx",
      "new-post.tsx",
      "notice.tsx",
      "seats.tsx",
      "view-switch.tsx",
    ]);
  });

  it("makes every one of them a client component gated on useMaker", () => {
    for (const file of COMPONENTS) {
      const source = read(`${MAKER_DIR}/${file}`);
      expect([file, source.startsWith('"use client";')]).toEqual([file, true]);
      expect([file, code(`${MAKER_DIR}/${file}`).includes("useMaker(slug)")]).toEqual([file, true]);
    }
  });

  it("has ONE caller of useCrewOf on the page: the gate itself", () => {
    const gate = code(`${MAKER_DIR}/use-maker.ts`);
    expect(read(`${MAKER_DIR}/use-maker.ts`).startsWith('"use client";')).toBe(true);
    expect(gate).toContain("const crew = useCrewOf(slug);");
    expect(gate).toContain("const managing = isManaging(crew, mode);");
    // Nothing touches the browser's storage until the overlay has said
    // "crew": the server and everybody else get the visitor's answer.
    expect(gate).toContain('const mode: ViewMode = crew === null ? "manage" : storedMode(slug);');
    for (const file of COMPONENTS) {
      expect([file, code(`${MAKER_DIR}/${file}`).includes("useCrewOf(")]).toEqual([file, false]);
    }
    // And the overlay's server snapshot is "pending" — so `crew` is null in
    // every server render.
    const overlay = code("ui/use-overlay.ts");
    expect(overlay).toContain("return OVERLAY_PENDING;");
    expect(overlay).toContain("return crewOf(useOverlay(ids), slug);");
  });

  it("draws each maker element only when managing — and nothing otherwise", () => {
    const gates: Record<string, string[]> = {
      "view-switch.tsx": ["if (crew === null || slot === null) return null;"],
      "needs-you.tsx": ["if (!managing || needsYouEmpty(needsYou)) return null;"],
      "new-post.tsx": ["if (!managing) return null;"],
      "milestones.tsx": ["if (!managing || milestones === null) return null;"],
      "seats.tsx": ["if (!managing || crew === null) return null;", "if (managing && crew !== null) {"],
      "notice.tsx": ["if (!isCrew || line === null) return null;"],
      "details.tsx": ["if (!managing || editing) return null;", "if (editing) {"],
    };
    for (const [file, wanted] of Object.entries(gates)) {
      const source = code(`${MAKER_DIR}/${file}`);
      for (const gate of wanted) {
        expect([file, gate, source.includes(gate)]).toEqual([file, gate, true]);
      }
    }
    // `editing` is only ever true while managing.
    expect(code(`${MAKER_DIR}/use-maker.ts`)).toContain("editing: managing && editing.has(slug),");
    // Both "Edit post" and "New post" are behind the same gate.
    expect(code(`${MAKER_DIR}/new-post.tsx`).split("if (!managing) return null;").length - 1).toBe(2);
  });

  it("keeps every word of the maker view out of the server files", () => {
    // A string in a server component is in the HTML (or in the payload) for
    // everybody. These exist only inside the client components.
    const words = [
      "Edit details",
      "New post",
      "Needs you",
      "NEEDS YOU",
      "Review on Orunbase",
      "Edit post",
      "Edit seat",
      "Add a seat",
      "Add a milestone",
      "Manage milestones",
      "Mark shipped",
      "Draft post ready",
      "Draft:",
      "Visitor view",
      "/manage/",
      "/studio/",
    ];
    for (const file of SERVER_FILES) {
      const source = code(file);
      for (const word of words) {
        expect([file, word, source.includes(word)]).toEqual([file, word, false]);
      }
      // And the server files neither read the overlay nor are client files.
      expect([file, /useMaker|useCrewOf|useOverlay|"use client"/.test(source)]).toEqual([file, false]);
    }
  });

  it("hands the maker components only public values — never children, never an id", () => {
    const page = code(PAGE);
    // A child passed to a client component is serialised into the page even
    // when the component does not draw it. So no maker component takes
    // children; each is drawn from its own code.
    for (const [component, props] of [
      ["ViewSwitch", "slug={slug}"],
      ["CrewNoticeLine", "slug={slug}"],
      ["NeedsYou", "slug={slug}"],
      ["NewPostRow", "slug={slug}"],
      ["AddSeatLink", "slug={slug}"],
    ] as const) {
      const uses = page.match(new RegExp(`<${component}\\b[^>]*>`, "g")) ?? [];
      expect([component, uses.length > 0]).toEqual([component, true]);
      for (const use of uses) {
        expect([component, use]).toEqual([component, `<${component} ${props} />`]);
      }
    }
    expect(page).toMatch(/<MakerHeaderActions slug=\{slug\} look="(shipping|idea)" \/>/);
    // The milestone manager is on the About tab, and on an idea's page —
    // where the crew ships the first milestone and the idea becomes a
    // shipping product.
    expect(page.match(/<MilestonesManager\b[^>]*>/g)).toEqual([
      "<MilestonesManager slug={profile.slug} />",
      "<MilestonesManager slug={slug} standalone />",
    ]);
    expect(page).toContain("<EditPostLink slug={slug} postId={post.id} />");
    expect(page).toContain(
      '<ProductPitch slug={slug} tagline={profile.tagline} tryUrl={profile.tryUrl} look="shipping" />',
    );
    // The one wrapper that does take children wraps what a VISITOR sees
    // (Follow, Take a seat) and only hides it for the crew.
    const details = code(`${MAKER_DIR}/details.tsx`);
    expect(details).toContain("return managing ? null : <>{children}</>;");
    // The workspace and listing ids come from the overlay, in the browser.
    expect(page).not.toMatch(/\borg_|\bopp_|crew\.org|crew\.profile/);
  });

  it("draws the pitch for everybody and the form for the crew, from one component", () => {
    const details = code(`${MAKER_DIR}/details.tsx`);
    const pitch = details.slice(details.indexOf("export function ProductPitch("), details.indexOf("function DetailsForm("));
    // Not editing — the server, every visitor, the crew on Visitor — is the
    // paragraph.
    expect(pitch).toContain("const shown = savedTagline === undefined ? tagline : savedTagline;");
    expect(pitch).toContain("if (!shown) return null;");
    expect(pitch).toContain("<p data-product-pitch className={PITCH_CLASS[look]}>");
    expect(code(`${MAKER_DIR}/use-maker.ts`)).toContain("savedTagline: crew === null ? undefined : savedTaglines.get(slug),");
  });
});

describe("the Manage / Visitor switch", () => {
  it("is two views, Manage first, and Manage is the crew's default", () => {
    expect([...VIEW_MODES]).toEqual(["manage", "visitor"]);
    expect(VIEW_MODE_LABELS).toEqual({ manage: "Manage", visitor: "Visitor" });
    expect(VIEW_SWITCH_LABEL).toBe("View this page as");
    expect(viewModeOf(null)).toBe("manage");
    expect(viewModeOf("")).toBe("manage");
    expect(viewModeOf("anything")).toBe("manage");
    expect(viewModeOf("visitor")).toBe("visitor");
  });

  it("hides every maker element on Visitor: managing needs the crew AND Manage", () => {
    expect(isManaging(CREW, "manage")).toBe(true);
    expect(isManaging(CREW, "visitor")).toBe(false);
    // Not on the crew: no view shows anything, whatever was stored.
    expect(isManaging(null, "manage")).toBe(false);
    expect(isManaging(null, "visitor")).toBe(false);
  });

  it("remembers the choice per product, for the session", () => {
    expect(viewModeKey("ackstack")).toBe("openproduct.view.ackstack");
    expect(viewModeKey("beacon24")).not.toBe(viewModeKey("ackstack"));
    const gate = code(`${MAKER_DIR}/use-maker.ts`);
    expect(gate).toContain("window.sessionStorage.getItem(viewModeKey(slug))");
    expect(gate).toContain("window.sessionStorage.setItem(viewModeKey(slug), mode);");
    expect(gate).not.toContain("localStorage");
    // Leaving Manage closes the edit form: Visitor is the public page.
    expect(gate).toContain('if (mode === "visitor") editing.delete(slug);');
  });

  it("is drawn into the header's one named slot, left of the search, by the crew's browser", () => {
    const panel = code("shell/top-panel.tsx");
    expect(VIEW_SWITCH_SLOT_ID).toBe("page-view-switch");
    // The slot is empty and takes no room for everybody else.
    expect(panel).toContain(`<div id="${VIEW_SWITCH_SLOT_ID}" data-header-slot="view-switch" className="contents" />`);
    expect(panel.indexOf(`id="${VIEW_SWITCH_SLOT_ID}"`)).toBeLessThan(panel.indexOf("<HeaderSearch />"));
    // The header knows nothing about crews or products.
    expect(panel).not.toMatch(/useCrewOf|useMaker|ViewSwitch|\[slug\]/);
    const view = code(`${MAKER_DIR}/view-switch.tsx`);
    expect(view).toContain("setSlot(document.getElementById(VIEW_SWITCH_SLOT_ID));");
    expect(view).toContain("return createPortal(");
    expect(view).toContain("onClick={() => setViewMode(slug, option)}");
    expect(view).toContain("aria-pressed={on}");
  });

  it("is a segmented control on desktop and two 44px icon buttons on a phone", () => {
    const view = code(`${MAKER_DIR}/view-switch.tsx`);
    expect(view).toContain("h-[34px]");
    expect(view).toContain("max-sm:h-[44px] max-sm:w-[44px]");
    // The word on desktop, the glyph (a pencil, an eye) on a phone — and a
    // name either way.
    expect(view).toContain('<span className="max-sm:hidden">{VIEW_MODE_LABELS[option]}</span>');
    expect(view).toContain('className="sm:hidden"');
    expect(view).toContain("aria-label={");
  });
});

describe("Needs you: a seat request is reviewed on Orunbase", () => {
  const request = {
    id: "app_1",
    roleOpeningId: "opr_1",
    roleTitle: "Frontend contributor",
    requestRef: "jrq_1",
    requester: { handle: "ada", displayName: "Ada" },
    createdAt: "2026-11-01T00:00:00.000Z",
  };
  const draft = (over: Partial<CrewProductPost> = {}): CrewProductPost => ({
    id: "ppo_00000000000000000000000000000001",
    kind: "feature",
    state: "draft",
    blocks: [{ block: "feature", value: "The state calendar" }],
    publishedAt: null,
    milestoneId: null,
    roleOpeningId: null,
    threadId: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...over,
  });

  it("offers one control on a request, and it is a link to Orunbase", () => {
    expect(SEAT_REQUEST_ACTION).toBe("Review on Orunbase");
    expect(seatRequestReviewHref("https://console.example/", request)).toBe("https://console.example/orgs?request=jrq_1");
    // Nothing to link to: no link, rather than one that goes nowhere.
    expect(seatRequestReviewHref("", request)).toBeNull();
    expect(seatRequestReviewHref("https://console.example", { requestRef: null })).toBeNull();
  });

  it("has no Accept and no Decline anywhere on the product page", () => {
    // A request is a join request of the workspace behind the listing; this
    // site holds a snapshot of it and cannot decide one. A button that
    // cannot work is not drawn.
    const files = [PAGE, ...readdirSync(resolve(APP, MAKER_DIR)).map((file) => `${MAKER_DIR}/${file}`)];
    for (const file of files) {
      const source = code(file);
      expect([file, /\b(Accept|Decline|Approve|Deny|Reject)\b/.test(source)]).toEqual([file, false]);
    }
    const needs = code(`${MAKER_DIR}/needs-you.tsx`);
    expect(needs).toContain("{SEAT_REQUEST_ACTION}");
    expect(needs).toContain("const review = seatRequestReviewHref(origin, request);");
    // And it writes nothing: the block only reads.
    expect(needs).not.toMatch(/crewWrite|method="post"|<form|<button/);
  });

  it("says who asked and for which seat", () => {
    expect(seatRequesterName(request)).toBe("Ada");
    expect(seatRequesterName({ requester: { handle: "ada", displayName: null } })).toBe("ada");
    expect(seatRequesterName({ requester: { handle: null, displayName: " " } })).toBe("Somebody");
    expect(seatRequestText(request)).toBe("wants the Frontend contributor seat");
    // The seat has since been deleted.
    expect(seatRequestText({ roleTitle: null })).toBe("wants a seat");
  });

  it("lists each draft with Continue, to the builder on that draft", () => {
    expect(draftLine(draft())).toBe("Draft: The state calendar");
    // A draft with no headline yet says its kind.
    expect(draftLine(draft({ blocks: [] }))).toBe("Draft: Feature shipped");
    expect(continuePostPath("ackstack", "ppo_1")).toBe("/ackstack/new?draft=ppo_1");
    const needs = code(`${MAKER_DIR}/needs-you.tsx`);
    expect(needs).toContain("href={continuePostPath(slug, draft.id)}");
    expect(needs).toContain("Continue");
    // A published post is not a draft, whatever the answer carries.
    const mixed: CrewNeedsYou = { requests: [], drafts: [draft(), draft({ id: "ppo_2", state: "published" })] };
    expect(draftsOf(mixed).map((post) => post.id)).toEqual(["ppo_00000000000000000000000000000001"]);
  });

  it("is absent when nothing waits, and is read only for the crew on Manage", () => {
    expect(needsYouEmpty(null)).toBe(true);
    expect(needsYouEmpty({ requests: [], drafts: [] })).toBe(true);
    expect(needsYouEmpty({ requests: [], drafts: [draft({ state: "published" })] })).toBe(true);
    expect(needsYouEmpty({ requests: [request], drafts: [] })).toBe(false);
    expect(needsYouEmpty({ requests: [], drafts: [draft()] })).toBe(false);
    const needs = code(`${MAKER_DIR}/needs-you.tsx`);
    // No fetch before the gate opens.
    expect(needs).toMatch(/React\.useEffect\(\(\) => \{\s*if \(!managing\) return;/);
    expect(needs).toContain('crewRead<{ needsYou?: CrewNeedsYou }>(slug, "needs-you")');
    expect(manageRoute("ackstack", "needs-you")).toBe("/ackstack/manage/needs-you");
    // Marked as the crew's own: a lock, a mono label, and a name that says so.
    expect(NEEDS_YOU_LABEL).toBe("Needs you");
    expect(NEEDS_YOU_ARIA).toBe("Needs you, visible to the crew only");
    expect(needs).toContain("<LockGlyph />");
    // The crew read is never cached.
    const act = code(`${MAKER_DIR}/act.ts`);
    expect(act.split('cache: "no-store"').length - 1).toBe(2);
    expect(act.split('credentials: "same-origin"').length - 1).toBe(2);
  });
});

describe("Edit details: the pitch and the Try it address, never the name", () => {
  it("sends the tagline and tryUrl, and no slug", () => {
    expect([...PROFILE_FORM_FIELDS]).toEqual(["tagline", "tryUrl"]);
    const details = code(`${MAKER_DIR}/details.tsx`);
    expect(details).toContain('crewWrite<unknown>(slug, "profile", { tagline: pitch.trim(), tryUrl: address.trim() })');
    expect(details).toContain('action={manageRoute(slug, "profile")}');
    expect(details).toContain('name="tagline"');
    expect(details).toContain('name="tryUrl"');
    // A rename changes the product's address: it is not offered here.
    expect(details).not.toMatch(/name="slug"|>\s*Name\s*<|slug: (?!string)/);
    expect(manageRoute("ackstack", "profile")).toBe("/ackstack/manage/profile");
  });

  it("counts the pitch down from core's limit and will not save past it", () => {
    expect(TAGLINE_LIMIT).toBe(200);
    // The same number core enforces.
    expect(readFileSync(resolve(REPO, "core/src/handlers/profiles.ts"), "utf-8")).toContain(
      `const MAX_TAGLINE = ${TAGLINE_LIMIT};`,
    );
    expect(taglineCount("")).toEqual({ label: "200 left", over: false });
    expect(taglineCount("x".repeat(200))).toEqual({ label: "0 left", over: false });
    expect(taglineCount("x".repeat(203))).toEqual({ label: "3 over", over: true });
    expect(canSaveDetails("A pitch")).toBe(true);
    expect(canSaveDetails("   ")).toBe(false);
    expect(canSaveDetails("x".repeat(201))).toBe(false);
  });

  it("has Save and Cancel, shows a refused field in red, and shows the saved pitch at once", () => {
    const details = code(`${MAKER_DIR}/details.tsx`);
    expect(details).toMatch(/>\s*Save\s*<\/button>/);
    expect(details).toMatch(/>\s*Cancel\s*<\/button>/);
    expect(details).toContain("disabled={busy || !canSaveDetails(pitch)}");
    expect(details).toContain('const pitchError = fieldError(errors, "tagline");');
    expect(details).toContain('const addressError = fieldError(errors, "tryUrl");');
    expect(details).toContain('<span role="alert" className="text-[13px] leading-[1.4] text-destructive">');
    // After a save: the form closes, the page shows the new pitch, the
    // router refreshes. The public cache purge is the gateway's.
    const order = ["rememberTagline(slug, pitch.trim());", "setEditing(slug, false);", "router.refresh();"].map((step) =>
      details.indexOf(step),
    );
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe("New post: five kind pills", () => {
  it("links four kinds to the builder and draws Demo disabled until demos exist", () => {
    const kinds = newPostKinds("ackstack");
    expect(kinds.map((entry) => entry.label)).toEqual(["Feature shipped", "New version", "Demo", "New idea", "Help wanted"]);
    expect(kinds.map((entry) => entry.href)).toEqual([
      "/ackstack/new?kind=feature",
      "/ackstack/new?kind=version",
      null,
      "/ackstack/new?kind=idea",
      "/ackstack/new?kind=seat",
    ]);
    // Every kind a maker can write has a pill.
    expect(kinds.filter((entry) => entry.href !== null).map((entry) => entry.kind).sort()).toEqual(
      [...AUTHORED_PRODUCT_POST_KINDS].sort(),
    );
    const row = code(`${MAKER_DIR}/new-post.tsx`);
    expect(row).toContain('aria-disabled="true"');
    expect(row).toContain('id="post"');
  });
});

describe("milestones, managed", () => {
  it("has three fields with the contract's limits, code and title required", () => {
    expect(MILESTONE_FIELDS).toEqual([
      { name: "code", label: "Code", max: MILESTONE_CODE_MAX, required: true },
      { name: "title", label: "Title", max: MILESTONE_TITLE_MAX, required: true },
      { name: "summary", label: "Summary", max: MILESTONE_SUMMARY_MAX, required: false },
    ]);
    expect([MILESTONE_CODE_MAX, MILESTONE_TITLE_MAX, MILESTONE_SUMMARY_MAX]).toEqual([20, 60, 200]);
    const manager = code(`${MAKER_DIR}/milestones.tsx`);
    // The limit is the field's own `maxLength`, and it is counted.
    expect(manager).toContain("maxLength: field.max,");
    expect(manager).toContain("required: field.required,");
    expect(manager).toContain("{value.length}/{field.max}");
    // A refused field says why, in red, under the field.
    expect(manager).toContain("const error = fieldError(errors, field.name);");
    expect(manager).toContain('className="text-[13px] leading-[1.4] text-destructive"');
  });

  it("can add, edit, reorder, delete and ship — the handler's six intents, and no other", () => {
    expect([...MILESTONE_ACTS]).toEqual([...MILESTONE_INTENTS]);
    const manager = code(`${MAKER_DIR}/milestones.tsx`);
    for (const intent of ['intent: "create"', 'intent: "update"', 'intent: "reorder"', 'intent: "delete"']) {
      expect([intent, manager.includes(intent)]).toEqual([intent, true]);
    }
    expect(manager).toContain('intent: shipped ? "unship" : "ship"');
    expect(manager).toContain('{shipped ? "Mark not shipped" : "Mark shipped"}');
    expect(manager).toContain('crewWrite<{ offeredPost?: CrewProductPost | null }>(slug, "milestones", fields)');
    expect(manager).toContain('crewRead<{ milestones?: CrewMilestone[] }>(slug, "milestones")');
    expect(manageRoute("ackstack", "milestones")).toBe("/ackstack/manage/milestones");
  });

  it("moves a milestone one place at a time and sends every id in the new order", () => {
    expect(movedOrder(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(movedOrder(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    // At an end, or unknown: unchanged — and always every id, once.
    expect(movedOrder(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(movedOrder(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    expect(movedOrder(["a", "b", "c"], "z", 1)).toEqual(["a", "b", "c"]);
  });

  it("asks before it deletes", () => {
    const manager = code(`${MAKER_DIR}/milestones.tsx`);
    // Delete only arms the confirm; the act is behind the second press.
    expect(manager).toContain("<SmallButton disabled={busy} onClick={() => setConfirming(milestone.id)}>");
    expect(manager).toMatch(/confirming === milestone\.id \? \([\s\S]*?intent: "delete", milestone: milestone\.id/);
    expect(manager).toContain("Keep");
  });

  it("offers the draft post shipping prepared, with a link to continue it", () => {
    expect(OFFERED_POST_LABEL).toBe("Draft post ready");
    const manager = code(`${MAKER_DIR}/milestones.tsx`);
    expect(manager).toContain('if (fields.intent === "ship") setOffered(result.data.offeredPost ?? null);');
    expect(manager).toContain("{OFFERED_POST_LABEL}");
    expect(manager).toContain("href={continuePostPath(slug, offered.id)}");
    // The same offer when a plain form came back with `?offered=`.
    const notice = code(`${MAKER_DIR}/notice.tsx`);
    expect(notice).toContain('offered: params.get("offered")');
    expect(notice).toContain("href={continuePostPath(slug, offered)}");
  });
});

describe("seats and the quiet line", () => {
  it("sends Add a seat and Edit seat to the studio's People step, with the overlay's ids", () => {
    expect(studioSeatsPath(CREW)).toBe("/studio/org_1/opp_1/people");
    const seats = code(`${MAKER_DIR}/seats.tsx`);
    expect(seats.split("href={studioSeatsPath(crew)}").length - 1).toBe(2);
    expect(seats).toContain("Add a seat");
  });

  it("turns ?notice= and ?error= into one sentence from the handlers' vocabulary, in the browser", () => {
    const notice = code(`${MAKER_DIR}/notice.tsx`);
    expect(notice).toContain("new URLSearchParams(window.location.search)");
    expect(notice).toContain("notice: crewNotice(asked.notice),");
    expect(notice).toContain("error: crewError(asked.error),");
    // The query's own text is never printed.
    expect(notice).not.toMatch(/\{asked\.|\{params\./);
    // And never read on the server: that would make the page uncacheable.
    expect(notice).not.toContain("useSearchParams");
    expect(notice).toContain("data-crew-notice");
  });
});
