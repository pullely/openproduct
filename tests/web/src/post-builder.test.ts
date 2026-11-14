// The post builder (openproduct-redesign OPR-3; boards `Compose`,
// `PhoneCompose`) — `/{slug}/new`.
//
// What is pinned here is what the builder must not lose:
//
//   - Post is lit by the SERVER'S rule: the builder's readiness is
//     `postBlocksPublishable` of exactly what it would send
//   - blocks are sent in CATALOGUE order whatever was added or removed in
//     whatever order, and nothing on the page can move one
//   - it is the crew's page and nobody else's: decided on the server by
//     core's own crew check, rendered per request, never cached
//   - it is a plain form first: one field per block, the act in the pressed
//     button, no id of the product anywhere in it
//   - only the four authored kinds are offered; a demo is recorded, not typed

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTHORED_PRODUCT_POST_KINDS,
  POST_BLOCK_CATALOGUE,
  postBlocksPublishable,
  validatePostBlocks,
  type AuthoredProductPostKind,
} from "@openproduct/contracts";
import {
  COMPOSE_KINDS,
  COMPOSE_PLACEHOLDER,
  addableBlocks,
  blockProblems,
  composeBlocks,
  composeDraftPath,
  composeKindOf,
  composeReadiness,
  composeTitle,
  counterText,
  initialPlaced,
  initialValues,
  isOverLimit,
  previewPost,
  readinessText,
  readinessTone,
  serverBlockErrors,
  withBlock,
  withoutBlock,
} from "@openproduct-web/app/[slug]/new/compose";
import { blockField, blocksFromFields } from "@openproduct-web/app/posts/crew-forms";
import { isPublishedPost } from "@openproduct-web/app/posts/blocks";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PAGE = "[slug]/new/page.tsx";
const COMPOSER = "[slug]/new/composer.tsx";

/** A filled value for a block of each type, within any limit. */
const sample = (type: string): string => (type === "url" ? "https://example.com/x" : type === "lines" ? "one\ntwo" : "words");

/** Every block of a kind, filled. */
const filledValues = (kind: AuthoredProductPostKind): Record<string, string> =>
  Object.fromEntries(POST_BLOCK_CATALOGUE[kind].map((spec) => [spec.id, sample(spec.type)]));

const allPlaced = (kind: AuthoredProductPostKind) => POST_BLOCK_CATALOGUE[kind].map((spec) => spec.id);

describe("the kinds the builder offers", () => {
  it("are the four authored kinds, in the contract's order — a demo is recorded, never typed", () => {
    expect([...COMPOSE_KINDS]).toEqual([...AUTHORED_PRODUCT_POST_KINDS]);
    expect([...COMPOSE_KINDS]).toEqual(["feature", "version", "idea", "seat"]);
    expect((COMPOSE_KINDS as readonly string[]).includes("demo")).toBe(false);
    // An address that names anything else — `demo` included — opens the default.
    expect(composeKindOf("version")).toBe("version");
    for (const stray of ["demo", "", "nonsense", undefined, null]) expect(composeKindOf(stray)).toBe("feature");
    expect(composeKindOf(["seat", "idea"])).toBe("seat");
    // The rail is drawn from that list and is links, so it works with no script.
    const composer = code(COMPOSER);
    expect(composer).toContain("{COMPOSE_KINDS.map((option) => {");
    expect(composer).toContain("href={composePostPagePath(slug, option)}");
    expect(composer).not.toMatch(/Record a demo|DemoFlow/);
  });

  it("every block of every kind has its hint, and no hint names a block the kind lacks", () => {
    for (const kind of COMPOSE_KINDS) {
      expect(Object.keys(COMPOSE_PLACEHOLDER[kind]).sort()).toEqual(POST_BLOCK_CATALOGUE[kind].map((spec) => spec.id).sort());
    }
  });
});

describe("the readiness rule is `postBlocksPublishable`", () => {
  /** A spread of states for every kind: empty, each required block missing
   *  in turn, everything filled, one block over its limit, a bad address. */
  const states = (kind: AuthoredProductPostKind): { values: Record<string, string>; placed: string[] }[] => {
    const specs = POST_BLOCK_CATALOGUE[kind];
    const required = specs.filter((spec) => spec.required).map((spec) => spec.id);
    const full = filledValues(kind);
    const out: { values: Record<string, string>; placed: string[] }[] = [
      { values: {}, placed: required },
      { values: full, placed: allPlaced(kind) },
      { values: full, placed: required },
      { values: Object.fromEntries(Object.entries(full).map(([id, value]) => [id, `  ${value}\r\n`])), placed: allPlaced(kind) },
    ];
    for (const id of required) out.push({ values: { ...full, [id]: "" }, placed: allPlaced(kind) });
    for (const id of required) out.push({ values: { ...full, [id]: "   " }, placed: required });
    for (const spec of specs) {
      out.push({ values: { ...full, [spec.id]: "x".repeat(spec.limit + 1) }, placed: allPlaced(kind) });
      out.push({ values: { ...full, [spec.id]: "x".repeat(spec.limit) }, placed: allPlaced(kind) });
      if (spec.type === "url") out.push({ values: { ...full, [spec.id]: "not an address" }, placed: allPlaced(kind) });
      if (spec.type === "line") out.push({ values: { ...full, [spec.id]: "two\nlines" }, placed: allPlaced(kind) });
    }
    return out;
  };

  it.each([...COMPOSE_KINDS])("%s: Post is lit exactly when the server would publish what is sent", (kind) => {
    let lit = 0;
    let dark = 0;
    for (const { values, placed } of states(kind)) {
      const sent = composeBlocks(kind, values, placed);
      const readiness = composeReadiness(kind, values, placed);
      expect(readiness.ready).toBe(postBlocksPublishable(kind, sent));
      expect(readiness.ready).toBe(validatePostBlocks(kind, sent).length === 0);
      if (readiness.ready) lit += 1;
      else dark += 1;
    }
    // Both answers were seen, so agreeing on one of them is not the whole test.
    expect(lit).toBeGreaterThan(0);
    expect(dark).toBeGreaterThan(0);
  });

  it("the page's button reads that rule and nothing else", () => {
    const composer = code(COMPOSER);
    expect(composer).toContain("const readiness = composeReadiness(kind, draft.values, draft.placed);");
    expect(composer).toContain("disabled={!readiness.ready || busy}");
    const compose = code("[slug]/new/compose.ts");
    expect(compose).toContain("ready: postBlocksPublishable(kind, blocks),");
    // No second idea of "ready" anywhere in the builder.
    expect(composer).not.toMatch(/postBlocksPublishable|validatePostBlocks/);
  });

  it("says where it stands: how many required are filled, a limit passed, or ready", () => {
    const kind = "feature";
    const required = ["feature", "what", "try"];
    const empty = composeReadiness(kind, {}, required);
    expect(empty).toMatchObject({ ready: false, required: 3, filled: 0, over: false });
    expect(readinessText(empty)).toBe("0 of 3 required");
    expect(readinessText(empty, "long")).toBe("0 of 3 required filled");
    expect(readinessTone(empty)).toBe("plain");
    const over = composeReadiness(kind, { ...filledValues(kind), feature: "x".repeat(61) }, required);
    expect(readinessText(over)).toBe("Something is too long");
    // Red is for a limit passed or a refused value — never for "not filled yet".
    expect(readinessTone(over)).toBe("danger");
    const bad = composeReadiness(kind, { ...filledValues(kind), try: "nope" }, required);
    expect(readinessText(bad)).toBe("Try it must be an http(s) address");
    expect(readinessTone(bad)).toBe("danger");
    const ready = composeReadiness(kind, filledValues(kind), required);
    expect(readinessText(ready)).toBe("Ready");
    expect(readinessText(ready, "long")).toBe("Ready to post");
    expect(readinessTone(ready)).toBe("ready");
  });
});

describe("blocks are in catalogue order, and cannot be reordered", () => {
  it.each([...COMPOSE_KINDS])("%s: whatever order blocks are added in, what is sent is the catalogue's order", (kind) => {
    const catalogue = POST_BLOCK_CATALOGUE[kind].map((spec) => spec.id);
    const optional = POST_BLOCK_CATALOGUE[kind].filter((spec) => !spec.required).map((spec) => spec.id);
    const values = filledValues(kind);
    // Add the optional blocks last-first, then in a rotated order.
    for (const order of [[...optional].reverse(), [...optional.slice(1), ...optional.slice(0, 1)]]) {
      let placed = initialPlaced(kind, []);
      for (const id of order) placed = withBlock(kind, placed, id);
      expect(placed).toEqual(catalogue);
      const sent = composeBlocks(kind, values, placed).map((entry) => entry.block);
      expect(sent).toEqual(catalogue);
      expect(validatePostBlocks(kind, composeBlocks(kind, values, placed)).some((error) => error.code === "out_of_order")).toBe(false);
    }
    // Even a `placed` list handed over shuffled sends the catalogue's order.
    expect(composeBlocks(kind, values, [...catalogue].reverse()).map((entry) => entry.block)).toEqual(catalogue);
    // Removing and adding back puts the block where the catalogue has it.
    if (optional.length > 1) {
      const without = withoutBlock(kind, catalogue, optional[0]!);
      expect(without).toEqual(catalogue.filter((id) => id !== optional[0]));
      expect(withBlock(kind, without, optional[0]!)).toEqual(catalogue);
    }
  });

  it("required blocks are on the card from the start and cannot be removed; optional ones are offered", () => {
    for (const kind of COMPOSE_KINDS) {
      const required = POST_BLOCK_CATALOGUE[kind].filter((spec) => spec.required).map((spec) => spec.id);
      expect(initialPlaced(kind, [])).toEqual(required);
      for (const id of required) expect(withoutBlock(kind, required, id)).toEqual(required);
      expect(addableBlocks(kind, required).map((spec) => spec.id)).toEqual(
        POST_BLOCK_CATALOGUE[kind].filter((spec) => !spec.required).map((spec) => spec.id),
      );
      // A block the kind does not have is never placed.
      expect(withBlock(kind, required, "zzz-not-a-block")).toEqual(required);
    }
    // A post that carries an optional block opens with it placed.
    expect(initialPlaced("feature", [{ block: "for", value: "HR teams" }])).toEqual(["feature", "what", "try", "for"]);
    expect(initialValues("feature", [{ block: "for", value: "HR teams" }, { block: "zzz", value: "x" }])).toEqual({ for: "HR teams" });
  });

  it("an empty block is not sent, and what is sent is trimmed as the server reads it", () => {
    expect(composeBlocks("idea", { problem: "  A problem \r\n", who: "   ", "why-now": "" }, ["problem", "who", "why-now"])).toEqual([
      { block: "problem", value: "A problem" },
    ]);
    // A block that is not on the card is not sent, whatever was typed in it.
    expect(composeBlocks("idea", { problem: "p", detail: "typed, then removed" }, ["problem", "who"])).toEqual([
      { block: "problem", value: "p" },
    ]);
  });

  it("the page has no control that moves a block, and the plain form is read back in catalogue order too", () => {
    const composer = code(COMPOSER);
    expect(composer).not.toMatch(/draggable|onDrag|Move .* (up|down)|moveBlock|reorder|aria-grabbed/i);
    // The only two things a maker does to the list of blocks.
    expect(composer).toContain("change({ placed: withBlock(kind, draft.placed, spec.id) })");
    expect(composer).toContain("change({ placed: withoutBlock(kind, draft.placed, spec.id) })");
    // The blocks are drawn by walking the catalogue.
    expect(composer).toMatch(/specs\s*\.filter\(\(spec\) => draft\.placed\.includes\(spec\.id\)\)\s*\.map\(/);
    // With no script the form's fields arrive in the DOM's order; the handler
    // sorts them by the catalogue (`blocksFromFields`).
    expect(
      blocksFromFields({ [blockField("try")]: "https://example.com", [blockField("for")]: "x", [blockField("feature")]: "f" }, "feature"),
    ).toEqual([
      { block: "feature", value: "f" },
      { block: "try", value: "https://example.com" },
      { block: "for", value: "x" },
    ]);
  });
});

describe("each block edits as its type, against its limit", () => {
  it("counts what is stored, and turns over only past the limit", () => {
    const spec = POST_BLOCK_CATALOGUE.feature[0]!;
    expect(spec.limit).toBe(60);
    expect(counterText(spec, "")).toBe("0/60");
    expect(counterText(spec, "  twelve chars  ")).toBe("12/60");
    expect(counterText(spec, "x".repeat(12), "left")).toBe("48 left");
    expect(counterText(spec, "x".repeat(63), "left")).toBe("3 over");
    expect(isOverLimit(spec, "x".repeat(60))).toBe(false);
    expect(isOverLimit(spec, "x".repeat(61))).toBe(true);
    const composer = code(COMPOSER);
    // The counter is red only when over (design §2.8).
    expect(composer).toContain('data-compose-counter={over ? "over" : "within"}');
    expect(composer).toMatch(/\$\{over \? "text-destructive" : "text-muted-foreground"\}/);
  });

  it("draws a textarea for `text` and `lines`, one line for `line`, an address field for `url`", () => {
    const composer = code(COMPOSER);
    expect(composer).toContain('{spec.type === "text" || spec.type === "lines" ? (');
    expect(composer).toContain(') : spec.type === "url" ? (');
    expect(composer).toContain('inputMode="url"');
    // Every field is named for its block, so the form works with no script.
    expect(composer).toContain("name: blockField(spec.id),");
    // A required block is marked until it is filled — in the kind's colour, not red.
    expect(composer).toContain("const marked = spec.required && !filled;");
    expect(composer).toContain('marked ? skin.mark : "md:bg-foreground/[0.025]"');
  });

  it("prints the validator's own sentence under a block, and the server's on the block it names", () => {
    expect(blockProblems("feature", { feature: "x".repeat(61), try: "nope" }, ["feature", "what", "try"])).toEqual({
      feature: ["Feature is at most 60 characters"],
      try: ["Try it must be an http(s) address"],
    });
    // An empty required block is a mark, not an error under the field.
    expect(blockProblems("feature", {}, ["feature", "what", "try"])).toEqual({});
    // An enhanced save gets the server's sentences, keyed `blocks.<id>`.
    expect(serverBlockErrors({ "blocks.try": ["Try it must be an http(s) address"], draft: ["ppo_x"], "blocks.zzz": ["?"] }, "feature")).toEqual({
      try: ["Try it must be an http(s) address"],
    });
    // A plain form's redirect names only WHICH fields; the sentence is the validator's.
    expect(serverBlockErrors(["blocks.what", "form"], "feature", [{ block: "feature", value: "f" }])).toEqual({
      what: ["What it does is required"],
    });
    const composer = code(COMPOSER);
    expect(composer).toContain("setRefused(serverBlockErrors(fields, kind));");
    expect(composer).toContain("data-compose-block-error");
  });
});

describe("the builder is the crew's page, decided on the server, and never cached", () => {
  const page = code(PAGE);

  it("is rendered per request: `force-dynamic`, which goes out no-store", () => {
    expect(page).toMatch(/^export const dynamic = "force-dynamic";$/m);
    expect(page).not.toMatch(/export const revalidate|generateStaticParams/);
    // A crew-only page is nobody's search result.
    expect(page).toContain("robots: { index: false, follow: false }");
  });

  it("asks core who is on the crew before it draws anything, and answers 404 to everybody else", () => {
    const session = page.indexOf("const session = await readSession();");
    const gate = page.indexOf("const crew = await resolveCrew(session.accessToken, slug);");
    const refuse = page.indexOf('if (crew.kind === "not-crew") notFound();');
    const draw = page.indexOf("<Composer");
    const firstRead = page.indexOf("listCrewMilestones(session.accessToken, ids)");
    expect(session).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(session);
    expect(refuse).toBeGreaterThan(gate);
    // Nothing of the product's is read, and nothing drawn, before the gate.
    expect(firstRead).toBeGreaterThan(refuse);
    expect(draw).toBeGreaterThan(refuse);
    // Signed out, or a dead session: through sign-in and back to this address.
    expect(page).toContain("if (!session) redirect(signIn);");
    expect(page).toContain('if (crew.kind === "unauthorized") redirect(signIn);');
    expect(page).toContain("const signIn = `/signin?return_to=${encodeURIComponent(here)}`;");
    // The crew check is core's own (the overlay's `crew`), not the cookie.
    expect(read("posts/crew-api.ts")).toContain("const crew = result.data.overlay?.crew;");
  });

  it("opens only a post of this product that the builder can edit", () => {
    expect(page).toContain("if (draftId !== null && !PRODUCT_POST_ID_RE.test(draftId)) notFound();");
    expect(page).toContain("if (!found || !isAuthoredProductPostKind(found.kind)) notFound();");
    expect(composeDraftPath("kettle", "ppo_1")).toBe("/kettle/new?draft=ppo_1");
    expect(composeTitle("new")).toBe("New post");
    expect(composeTitle("draft")).toBe("New post");
    expect(composeTitle("published")).toBe("Edit post");
  });

  it("no public page draws the builder, and the builder puts no id of the product in a form", () => {
    const composer = code(COMPOSER);
    // The handler resolves the workspace and the listing from the slug and
    // the session; the form names the kind, the post and the act.
    expect(composer).not.toMatch(/name="(org|profile|orgId|profileId)"/);
    expect(composer).not.toMatch(/crew\.org|crew\.profile|ids\.org|ids\.profile/);
    expect(composer).toContain("const action = `/${slug}/manage/posts`;");
    expect(composer).toContain('<input type="hidden" name="kind" value={kind} />');
    // The page hands the composer the product's public facts, never its ids.
    expect(page.slice(page.indexOf("<Composer"))).not.toMatch(/\bids\b|crew\./);
  });
});

describe("a plain form first", () => {
  const composer = code(COMPOSER);

  it("the act is the pressed button's own `intent`: save a draft, post, or remove", () => {
    expect(composer).toContain('method="post"');
    expect(composer).toContain("action={action}");
    expect(composer).toContain('const saveIntent = post ? "save" : "create";');
    expect(composer).toContain('value={published ? "save" : "publish"}');
    expect(composer).toContain('<input type="hidden" name="intent" value="remove" />');
    // The header's buttons belong to the card's form.
    expect(composer.match(/form=\{FORM_ID\}/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("with no script: the optional blocks open from a list, Post is a plain button, and the answer comes back here", () => {
    const fallback = composer.slice(composer.indexOf("<noscript>"), composer.indexOf("</noscript>"));
    expect(fallback).toContain("{addable.map((spec) => (");
    expect(fallback).toContain("name={blockField(spec.id)}");
    expect(fallback).toContain('value={published ? "save" : "publish"}');
    // The plain form returns to the builder, so a refusal lands on the form…
    expect(composer).toContain('<input type="hidden" name="return_to" value={here} />');
    // …and the page sends a post that went out on to its own page.
    const page = code(PAGE);
    expect(page).toContain('if (notice === "posted" && posted && PRODUCT_POST_ID_RE.test(posted)) {');
    expect(page).toContain("redirect(`${productPostPagePath(slug, posted)}?notice=posted`);");
    // The enhancements are off until the page is live.
    expect(composer).toContain("disabled={added || !live}");
  });

  it("with a script: the same fields go as JSON, Post lands on the post's page, and what was typed stays", () => {
    expect(composer).toContain('headers: { accept: "application/json", "content-type": "application/json" },');
    expect(composer).toContain("const blocks = composeBlocks(kind, draft.values, draft.placed);");
    expect(composer).toContain("window.location.assign(`${productPostPagePath(slug, saved.id)}?notice=posted`);");
    // A feature post names its milestone, a seat post its seat — on publish.
    expect(composer).toContain('if (intent === "publish" && kind === "feature" && draft.milestone) body.milestone = draft.milestone;');
    expect(composer).toContain('if (intent === "publish" && kind === "seat" && draft.opening) body.opening = draft.opening;');
    // Switching kind keeps each kind's text: one draft per kind, in state.
    expect(composer).toContain("setDrafts((all) => ({ ...all, [kind]: { ...all[kind], ...patch } }));");
  });

  it("removing a published post asks first, in red; a draft is deleted with one press", () => {
    const remove = composer.slice(composer.indexOf("function RemovePost"));
    expect(remove).toContain("Delete draft");
    expect(remove).toMatch(/<details[\s\S]*?Remove post[\s\S]*?Remove this post for everyone\?[\s\S]*?bg-destructive/);
    // Red is nowhere else on the controls: Post and Save draft are ink and soft.
    const controls = composer.slice(0, composer.indexOf("function RemovePost"));
    expect(controls).not.toMatch(/bg-destructive\b/);
  });
});

describe("the preview is the exact card", () => {
  it("is the post card fed what would be published, and nothing in it can be pressed", () => {
    const composer = code(COMPOSER);
    expect(composer).toMatch(/<div inert>\s*<ProductPostCard\s+post=\{previewPost\(kind, draft\.values, draft\.placed, product, props\.now\)\}/);
    // The editor wears the card's own shell.
    expect(composer).toContain("className={`${POST_CARD_SHELL[kind]} ");
    const product = { slug: "kettle", name: "kettle", stage: "shipping" as const, logo: null };
    const post = previewPost("feature", { feature: " Team seats ", what: "", try: "https://example.com" }, ["feature", "what", "try"], product, "2026-11-15T00:00:00.000Z");
    // The card draws it (it reads as a published post), with the blocks as
    // publishing stores them: empty ones dropped, an address normalised.
    expect(isPublishedPost(post)).toBe(true);
    expect(post.blocks).toEqual([
      { block: "feature", value: "Team seats" },
      { block: "try", value: "https://example.com/" },
    ]);
    expect(post.product).toEqual(product);
    expect(post.author).toBeNull();
  });
});
