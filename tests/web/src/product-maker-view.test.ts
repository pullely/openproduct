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
  PRODUCT_TAGLINE_MAX,
  ROLE_OPENING_TITLE_MAX,
  type CrewNeedsYou,
  type CrewProductPost,
  type OverlayCrew,
  CREW_PRIVATE_THREAD_NOTICE_KEYS,
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
  PRIVATE_THREAD_FROM,
  PRIVATE_THREAD_STARTED,
  privateThreadsPath,
  newPostKinds,
  seatRequestReviewHref,
  seatRequestText,
  seatRequesterName,
  SEAT_FIELDS,
  canSaveSeat,
  moreSettingsLinks,
  MAKER_SLOTS,
  makerReserveBoot,
  makerReserveKey,
  makerSlotProperty,
  parseMakerReserve,
  seatFormPath,
  seatValuesOf,
  taglineCount,
  viewModeKey,
  viewModeOf,
} from "@openproduct-web/app/[slug]/maker/model";
import { consoleWorkspaceViewUrl } from "@openproduct-web/app/[slug]/workspace-view";
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
      // The form "Edit details" opens, fetched when it is opened.
      "details-form.tsx",
      "details.tsx",
      // The gates a visitor's bundle carries for the crew-only pieces.
      "lazy.tsx",
      "milestones.tsx",
      "needs-you.tsx",
      "new-post.tsx",
      "notice.tsx",
      // Keeps the room the maker view takes true (`gate.ts`).
      "reserve.tsx",
      // The seat form and the crew's seats card, fetched for the crew.
      "seat-form.tsx",
      "seats.tsx",
      // SC-2 — the Change stage popup and the Stage row inside Edit
      // details, both fetched only once the form is open.
      "stage-dialog.tsx",
      "stage-row.tsx",
      "view-switch.tsx",
    ]);
  });

  it("a visitor's bundle carries the gates and never the pieces: each crew-only piece is fetched for the crew", () => {
    const page = code(PAGE);
    // The page takes the crew-only pieces through the gates…
    expect(page).toContain('import { EditPostLink, MilestonesManager, NeedsYou, NewPostRow, ViewSwitch } from "./maker/lazy";');
    for (const file of ["view-switch", "needs-you", "new-post", "milestones", "details-form", "seat-form", "model", "act"]) {
      expect([file, new RegExp(`from "\\./maker/${file}"`).test(page)]).toEqual([file, false]);
    }
    // …and each gate asks `useMaker` before it fetches anything.
    const gates = code(`${MAKER_DIR}/lazy.tsx`);
    expect(gates.match(/React\.lazy\(\(\) =>\s*import\("\.\/(view-switch|needs-you|new-post|milestones)"\)/g)).toHaveLength(5);
    expect(gates).not.toMatch(/^import .* from "\.\/(view-switch|needs-you|new-post|milestones|model|act)";$/m);
    expect(gates.match(/if \(!managing\) return null;/g)).toHaveLength(4);
    expect(gates).toContain("if (crew === null) return null;");
    expect(gates.match(/<React\.Suspense fallback=\{null\}>/g)).toHaveLength(5);
    // The two files that draw something for a visitor as well (the pitch,
    // "Take the seat") fetch their crew-only halves the same way.
    expect(code(`${MAKER_DIR}/details.tsx`)).toContain('React.lazy(() => import("./details-form")');
    expect(code(`${MAKER_DIR}/seats.tsx`).match(/React\.lazy\(\(\) => import\("\.\/seat-form"\)/g)).toHaveLength(2);
    // What every visitor's bundle imports of the maker view's rules is the
    // small file, not the whole of them.
    for (const eager of ["use-maker.ts", "notice.tsx", "seats.tsx", "details.tsx", "lazy.tsx", "reserve.tsx"]) {
      expect([eager, /from "\.\/(model|act)"/.test(code(`${MAKER_DIR}/${eager}`))]).toEqual([eager, false]);
    }
    expect(code(`${MAKER_DIR}/model.ts`)).toContain('export * from "./gate";');
    expect(code(`${MAKER_DIR}/gate.ts`)).not.toMatch(/from "\.\/|from "\.\.\//);
  });

  it("holds the maker view's room from the first paint on a later visit, and gives it back when it is not the crew's page", () => {
    // The slots: empty in every visitor's page, around the pieces that push
    // what is under them down.
    expect([...MAKER_SLOTS]).toEqual(["needs-you", "post", "milestones"]);
    const page = code(PAGE);
    expect(page.match(/<MakerSlot name="(needs-you|post|milestones)">/g)).toEqual([
      '<MakerSlot name="needs-you">',
      '<MakerSlot name="post">',
      '<MakerSlot name="milestones">',
      '<MakerSlot name="needs-you">',
      '<MakerSlot name="milestones">',
    ]);
    expect(page).toContain('<div data-maker-slot={name} className="maker-slot" style={{ minHeight: `var(${makerSlotProperty(name)}, 0px)` }}>');
    expect(makerSlotProperty("needs-you")).toBe("--maker-needs-you");
    const css = readFileSync(resolve(APP, "../styles/globals.css"), "utf-8");
    expect(css).toMatch(/\.maker-slot:empty \{\s*display: none;\s*\}/);
    expect(css).toMatch(/:root\[data-maker-reserved\] \.maker-slot:empty \{\s*display: block;\s*\}/);

    // The memory: this browser's own, per product, the known slots only.
    expect(makerReserveKey("ackstack")).toBe("openproduct.maker.ackstack");
    expect(parseMakerReserve('{"needs-you":164.4,"post":68,"milestones":0,"other":900,"x":"y"}')).toEqual({ "needs-you": 164, post: 68 });
    expect(parseMakerReserve('{"post":99999}')).toEqual({});
    for (const junk of [null, undefined, "", "not json", "[]", "7"]) expect(parseMakerReserve(junk)).toEqual({});

    // The boot script: the same text for every visitor of a product's page,
    // which sets nothing unless the session hint says signed in — and holds
    // no `<`, so nothing in it can close the tag it is written into.
    const boot = makerReserveBoot("ackstack");
    expect(boot).toContain('localStorage.getItem("openproduct.maker.ackstack")');
    expect(boot).toContain('r.classList.contains("op-signed-in")');
    expect(boot).toContain('r.setAttribute("data-maker-reserved","ackstack")');
    expect(boot).not.toContain("<");
    expect(() => new Function(boot)).not.toThrow();
    // Run against a root that is signed in and has a memory: the room is held.
    const run = (signedIn: boolean, stored: string | null) => {
      const props: Record<string, string> = {};
      const attrs: Record<string, string> = {};
      const root = {
        classList: { contains: (name: string) => signedIn && name === "op-signed-in" },
        style: { setProperty: (name: string, value: string) => void (props[name] = value) },
        setAttribute: (name: string, value: string) => void (attrs[name] = value),
      };
      new Function("document", "localStorage", boot)({ documentElement: root }, { getItem: () => stored });
      return { props, attrs };
    };
    expect(run(true, '{"needs-you":164,"post":68}')).toEqual({
      props: { "--maker-needs-you": "164px", "--maker-post": "68px" },
      attrs: { "data-maker-reserved": "ackstack" },
    });
    // A visitor (no hint), a browser with no memory, and a memory that is
    // not one: nothing is set.
    expect(run(false, '{"needs-you":164}')).toEqual({ props: {}, attrs: {} });
    expect(run(true, null)).toEqual({ props: {}, attrs: {} });
    expect(run(true, '{"needs-you":"tall","evil":50,"post":-4}')).toEqual({ props: {}, attrs: {} });
    expect(run(true, "{{{")).toEqual({ props: {}, attrs: {} });
    // The script is drawn by a server component of its own, for a slug only.
    const bootFile = code("[slug]/reserve-boot.tsx");
    expect(bootFile).not.toContain('"use client"');
    expect(bootFile).toContain("if (!/^[A-Za-z0-9-]{1,64}$/.test(slug)) return null;");
    expect(bootFile).toContain("dangerouslySetInnerHTML={{ __html: makerReserveBoot(slug) }}");
    expect(page).toContain("<MakerReserveBoot slug={slug} />");

    // The sync: nothing is touched until the overlay has answered; anybody
    // but the crew on Manage has the memory forgotten and the room released.
    const sync = code(`${MAKER_DIR}/reserve.tsx`);
    expect(sync).toContain('const answered = useOverlay(ids).status !== "pending";');
    expect(sync).toContain("if (!answered) return;");
    expect(sync).toMatch(/if \(!managing\) \{\s*remember\(slug, \{\}\);\s*release\(root\);\s*return;\s*\}/);
    expect(sync).toContain("return () => release(document.documentElement);");
    expect(page).toContain("<MakerReserve slug={slug} />");
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
      // Add a seat, the seat's form, the starter card — and "Edit seat",
      // which replaces the visitor's control only for the crew.
      "seats.tsx": ["if (!managing) return null;", "if (managing) {"],
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
    // `seatForm` (which seat's form is open) likewise.
    expect(code(`${MAKER_DIR}/use-maker.ts`)).toContain("seatForm: managing ? (seatForms.get(slug) ?? null) : null,");
    expect(code(`${MAKER_DIR}/seats.tsx`).split("if (!managing) return null;").length - 1).toBe(3);
    expect(code(`${MAKER_DIR}/seat-form.tsx`).split("if (!managing) return null;").length - 1).toBe(2);
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
      ["SeatsStarter", "slug={slug}"],
    ] as const) {
      const uses = page.match(new RegExp(`<${component}\\b[^>]*>`, "g")) ?? [];
      expect([component, uses.length > 0]).toEqual([component, true]);
      for (const use of uses) {
        expect([component, use]).toEqual([component, `<${component} ${props} />`]);
      }
    }
    // "Add a seat": the slug, and — from the side card — the public address
    // of the seats, which is on the page for every visitor anyway.
    expect(page.match(/<AddSeatLink\b[^>]*>/g)).toEqual([
      '<AddSeatLink slug={slug} href={idea ? "#people-wanted" : `/${slug}/crew#people-wanted`} />',
      "<AddSeatLink slug={slug} />",
    ]);
    // The seat form's slot: the seat's own public words (the row beside it
    // draws the same ones), and never the workspace's or the listing's id.
    for (const use of page.match(/<SeatFormSlot\b[\s\S]*?\/>/g) ?? []) {
      expect([use, /org|profile\b|crew\./.test(use)]).toEqual([use, false]);
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
      '<ProductPitch slug={slug} tagline={profile.tagline} tryUrl={profile.tryUrl} start={stageStartOf(profile)} look="shipping" />',
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
    const pitch = details.slice(details.indexOf("export function ProductPitch("), details.indexOf("export function MakerHeaderActions("));
    // Not editing — the server, every visitor, the crew on Visitor — is the
    // paragraph (or nothing, for a product with no pitch).
    expect(pitch).toContain("const shown = savedTagline === undefined ? tagline : savedTagline;");
    expect(pitch).toMatch(/const pitch = shown \? \(\s*<p data-product-pitch className=\{PITCH_CLASS\[look\]\}>/);
    expect(pitch).toMatch(/\) : null;\s*if \(editing\) \{/);
    expect(pitch.trimEnd().endsWith("return pitch;\n}")).toBe(true);
    // Editing: the form, fetched when it is opened — and the pitch stays
    // where it is until the form has arrived.
    expect(pitch).toContain("<React.Suspense fallback={pitch}>");
    expect(pitch).toContain('<DetailsForm slug={slug} tagline={shown ?? ""} tryUrl={tryUrl ?? ""} start={start} look={look} />');
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
    // …and the seat form with it.
    expect(gate).toMatch(/if \(mode === "visitor"\) \{\s*editing\.delete\(slug\);\s*seatForms\.delete\(slug\);\s*\}/);
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
    // WHERE IT LANDS: the product's workspace on the console —
    // `{console}/view/{org}?from=openproduct`, the landing the seam pins
    // (edge S12). Not `/orgs?request=…`: the console has no route that opens
    // one join request and ignores that query, so the link promised a place
    // it did not go to.
    expect(seatRequestReviewHref("https://console.example/", { org: "org_abc123" })).toBe(
      "https://console.example/view/org_abc123?from=openproduct",
    );
    expect(seatRequestReviewHref("https://console.example", { org: "org_abc123" })).toBe(
      consoleWorkspaceViewUrl("https://console.example", "org_abc123"),
    );
    const model = code(`${MAKER_DIR}/model.ts`);
    expect(model).toContain("return consoleWorkspaceViewUrl(origin, crew.org);");
    expect(model).not.toContain("/orgs?");
    // Nothing to link to: no link, rather than one that goes nowhere.
    expect(seatRequestReviewHref("", { org: "org_abc123" })).toBeNull();
    expect(seatRequestReviewHref("https://console.example", null)).toBeNull();
    expect(seatRequestReviewHref("https://console.example", { org: "not a ref" })).toBeNull();
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
    expect(needs).toContain("const review = seatRequestReviewHref(origin, crew);");
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
    const mixed: CrewNeedsYou = { requests: [], drafts: [draft(), draft({ id: "ppo_2", state: "published" })], threads: [] };
    expect(draftsOf(mixed).map((post) => post.id)).toEqual(["ppo_00000000000000000000000000000001"]);
  });

  it("is absent when nothing waits, and is read only for the crew on Manage", () => {
    expect(needsYouEmpty(null)).toBe(true);
    expect(needsYouEmpty({ requests: [], drafts: [], threads: [] })).toBe(true);
    expect(needsYouEmpty({ requests: [], drafts: [draft({ state: "published" })], threads: [] })).toBe(true);
    expect(needsYouEmpty({ requests: [request], drafts: [], threads: [] })).toBe(false);
    expect(needsYouEmpty({ requests: [], drafts: [draft()], threads: [] })).toBe(false);
    // OPR-4 — a private thread the crew has not answered waits on them too.
    const waiting = { id: "0b0b0b0b-0000-4000-8000-000000000001", authorHandle: "lin", authorName: "Lin", createdAt: "2026-11-15T09:00:00.000Z" };
    expect(needsYouEmpty({ requests: [], drafts: [], threads: [waiting] })).toBe(false);
    // An answer from before the key existed has none: nothing waits.
    expect(needsYouEmpty({ requests: [], drafts: [] } as unknown as CrewNeedsYou)).toBe(true);
    const needs = code(`${MAKER_DIR}/needs-you.tsx`);
    // OPR-4 — the private thread's row is the boards' sentence and one link,
    // to Talk on its Private filter. It names who started the thread and
    // never what it says: the answer it is drawn from has no title in it.
    expect(PRIVATE_THREAD_STARTED).toBe("started a private thread");
    expect(PRIVATE_THREAD_FROM).toBe("Private thread from");
    expect(privateThreadsPath("ackstack")).toBe("/ackstack/talk#private");
    expect(needs).toContain("href={privateThreadsPath(slug)}");
    expect(needs).not.toMatch(/thread\.title|thread\.body/);
    expect([...CREW_PRIVATE_THREAD_NOTICE_KEYS]).toEqual(["authorHandle", "authorName", "createdAt", "id"]);
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
    const details = code(`${MAKER_DIR}/details-form.tsx`);
    expect(details).toContain('crewWrite<unknown>(slug, "profile", { tagline: pitch.trim(), tryUrl: address.trim() })');
    expect(details).toContain('action={manageRoute(slug, "profile")}');
    expect(details).toContain('name="tagline"');
    expect(details).toContain('name="tryUrl"');
    // A rename changes the product's address: it is not offered here.
    expect(details).not.toMatch(/name="slug"|>\s*Name\s*<|slug: (?!string)/);
    expect(manageRoute("ackstack", "profile")).toBe("/ackstack/manage/profile");
  });

  it("counts the pitch down from core's limit and will not save past it", () => {
    // ONE NUMBER, in the contract: core refuses by it and this counter counts
    // down from it. 200 — core's limit, kept, because taglines written before
    // the redesign run past the board's 120.
    expect(PRODUCT_TAGLINE_MAX).toBe(200);
    expect(TAGLINE_LIMIT).toBe(PRODUCT_TAGLINE_MAX);
    expect(code(`${MAKER_DIR}/model.ts`)).toContain("export const TAGLINE_LIMIT = PRODUCT_TAGLINE_MAX;");
    const core = readFileSync(resolve(REPO, "core/src/handlers/profiles.ts"), "utf-8");
    expect(core).toContain("const MAX_TAGLINE = PRODUCT_TAGLINE_MAX;");
    // Neither side keeps a literal of its own to drift.
    expect(core).not.toMatch(/const MAX_TAGLINE = \d/);
    expect(code(`${MAKER_DIR}/model.ts`)).not.toMatch(/TAGLINE_LIMIT = \d/);
    expect(taglineCount("")).toEqual({ label: "200 left", over: false });
    expect(taglineCount("x".repeat(200))).toEqual({ label: "0 left", over: false });
    expect(taglineCount("x".repeat(203))).toEqual({ label: "3 over", over: true });
    expect(canSaveDetails("A pitch")).toBe(true);
    expect(canSaveDetails("   ")).toBe(false);
    expect(canSaveDetails("x".repeat(201))).toBe(false);
  });

  it("has Save and Cancel, shows a refused field in red, and shows the saved pitch at once", () => {
    const details = code(`${MAKER_DIR}/details-form.tsx`);
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
  it("Add a seat and Edit seat open the seat's form in place, on the Crew tab", () => {
    // The controls (and the visitor's own) are in `seats.tsx`; the form they
    // open is fetched for the crew from `seat-form.tsx`.
    const seats = code(`${MAKER_DIR}/seats.tsx`) + code(`${MAKER_DIR}/seat-form.tsx`);
    // A seat is a role opening: a role, what they'd do, the time. Not the
    // Help wanted post's fields.
    expect(SEAT_FIELDS.map((field) => [field.name, field.label, field.required])).toEqual([
      ["title", "Role", true],
      ["description", "What they'd do", false],
      ["commitment", "Time", false],
    ]);
    expect(SEAT_FIELDS[0]!.max).toBe(ROLE_OPENING_TITLE_MAX);
    expect(seatValuesOf(null)).toEqual({ title: "", description: "", commitment: "" });
    expect(seatValuesOf({ title: "Advisor", description: null, commitment: "2h a week" })).toEqual({
      title: "Advisor",
      description: "",
      commitment: "2h a week",
    });
    expect(canSaveSeat({ title: "Advisor", description: "", commitment: "" })).toBe(true);
    expect(canSaveSeat({ title: "  ", description: "x", commitment: "" })).toBe(false);
    expect(canSaveSeat({ title: "x".repeat(ROLE_OPENING_TITLE_MAX + 1), description: "", commitment: "" })).toBe(false);

    // The two controls open the form (a store the header's switch shares),
    // and nothing here goes to the studio any more.
    expect(seats).toContain("onClick={() => setSeatForm(slug, NEW_SEAT)}");
    expect(seats).toContain("onClick={() => setSeatForm(slug, openingId)}");
    expect(seats).not.toContain("/studio");
    expect(seats).toContain("Add a seat");
    expect(seats).toContain("Edit seat");
    // The form is a real form on the crew's own route, and every act goes
    // through it: add, edit, close, delete.
    expect(manageRoute("ackstack", "seats")).toBe("/ackstack/manage/seats");
    expect(seats).toContain('action={manageRoute(slug, "seats")}');
    expect(seats).toContain('crewWrite<RoleOpeningWriteAnswer | { deleted: boolean }>(slug, "seats", fields)');
    expect(seats).toContain('{ intent: "create", ...trimmed(values) }');
    expect(seats).toContain('{ intent: "update", seat: seat.id, ...trimmed(values), status: "open" }');
    expect(seats).toContain('{ intent: "update", seat: seat.id, ...trimmed(values), status: "closed" }');
    expect(seats).toContain('{ intent: "delete", seat: seat.id }');
    // Delete is behind a confirm, and it is the form's one red control.
    expect(seats).toMatch(/confirming \? \([\s\S]*?bg-destructive[\s\S]*?Delete seat/);
    // No id of the product is sent: the handler resolves both from the slug.
    expect(seats).not.toMatch(/crew\.org|crew\.profile|name="org"|name="profile"/);
    // Crew only, on Manage: every piece returns nothing otherwise.
    for (const piece of ["AddSeatLink", "SeatFormSlot", "SeatsStarter", "SeatFormSlotBody", "SeatsStarterBody"]) {
      const source = seats.slice(seats.indexOf(`export function ${piece}(`));
      expect([piece, /if \(!managing\) return null;/.test(source.slice(0, 900))]).toEqual([piece, true]);
    }
  });

  it("opening a seat says the draft Help wanted post is ready, with the link to continue it", () => {
    const seats = code(`${MAKER_DIR}/seat-form.tsx`);
    expect(seats).toContain('offered: "offeredPostId" in answer ? answer.offeredPostId : null');
    expect(seats).toContain("{OFFERED_POST_LABEL}");
    expect(seats).toContain("href={continuePostPath(slug, done.offered)}");
  });

  it("the form is where the seats are: the Crew tab, or an idea's one page; other pages link there and open it", () => {
    expect(seatFormPath("ackstack", false)).toBe("/ackstack/crew#people-wanted");
    expect(seatFormPath("beacon24", true)).toBe("/beacon24#people-wanted");
    const page = code(PAGE);
    // Under each seat's own row, and once at the end of the card for a new one.
    expect(page).toContain("seat={{ id: role.id, title: role.title, description: role.description, commitment: role.commitment }}");
    expect(page).toContain("<SeatFormSlot slug={slug} seat={null} idea={idea} />");
    // The side card's "Add a seat" and "Edit" are links to it.
    expect(page).toContain('<AddSeatLink slug={slug} href={idea ? "#people-wanted" : `/${slug}/crew#people-wanted`} />');
    expect(code(`${MAKER_DIR}/seats.tsx`)).toContain("href={seatFormPath(slug, idea)}");
    // A page with no open seat has no public card; the crew still gets one.
    expect(page).toContain("if (openRoles.length === 0 && !always) return <SeatsStarter slug={slug} />;");
  });

  it("More settings is one entry, closed until pressed, built in the crew's browser from the overlay's ids", () => {
    expect(moreSettingsLinks(CREW)).toEqual([
      { label: "Settings", href: "/studio/org_1/opp_1/settings" },
      { label: "Details", href: "/studio/org_1/opp_1/details" },
      { label: "Media", href: "/studio/org_1/opp_1/media" },
      { label: "Topics", href: "/studio/org_1/opp_1/topics" },
      { label: "People", href: "/studio/org_1/opp_1/people" },
      { label: "Launches", href: "/studio/org_1/opp_1/launches" },
    ]);
    // OPR-4 — no Discussions entry: that address is Talk now, and Talk is
    // this page's own tab.
    expect(moreSettingsLinks(CREW).some((link) => /discussions/i.test(link.label + link.href))).toBe(false);
    const model = code(`${MAKER_DIR}/model.ts`);
    expect(model).toContain("const base = listingBasePath(crew.org, crew.profile);");
    // No literal studio address in the page's source: the routes suite
    // forbids one on a public page, and the ids are the overlay's.
    expect(model).not.toMatch(/["`]\/studio/);
    const details = code(`${MAKER_DIR}/details-form.tsx`);
    expect(details).toContain("More settings");
    expect(details).toContain("aria-expanded={open}");
    expect(details).toContain("if (crew === null) return null;");
    expect(details).toContain("{open ? (");
    expect(details).toContain("moreSettingsLinks(crew).map((link) => (");
    expect(details.match(/<MoreSettings slug=\{slug\} \/>/g)).toHaveLength(1);
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
