// Change stage and Where it runs (openproduct-stages-crew SC-2, design §1;
// boards `Product`, `Stage`, `PhoneStage`).
//
// What is pinned: the popup's rules are the contract's (which stages can be
// picked, which fields a step asks for, "n of m required", Move locked until
// the request is whole); the popup is a dialog that behaves like one; the
// Stage row lives inside Edit details and nowhere else; Where it runs says
// each row in the board's words; "Try it" becomes "Open it" in production;
// and the crew's route passes the step through to core and core's refusal
// back. The lane is module-level, so the components are pinned from source.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { NO_WHERE_IT_RUNS, PRODUCT_POST_API, type WhereItRuns } from "@openproduct/contracts";

import {
  CHANGE_STAGE_TITLE,
  canMove,
  defaultTarget,
  fieldHint,
  initialStageValues,
  liveFieldError,
  moveLabel,
  nextStageLine,
  requiredProgress,
  stageFormFields,
  stageOptions,
  stageRequestOf,
} from "@openproduct-web/app/[slug]/maker/stage-form";
import {
  NOT_IN_PRODUCTION,
  NOT_ON_STAGE,
  liveAction,
  setByLine,
  shownAddress,
  stageStartOf,
  whereItRunsRows,
} from "@openproduct-web/app/[slug]/where-it-runs";
import { readStageChange } from "@openproduct-web/app/posts/crew-forms";
import { CREW_NOTICES, handleStageWrite, type CrewCall } from "@openproduct-web/app/posts/crew-handler";
import { STAGE_TONE } from "@openproduct-web/app/ui/stage-tone";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const NOW = new Date("2026-11-15T12:00:00.000Z");

const START = stageStartOf({ stage: "stage", repoUrl: "https://github.com/acme/thing", tryUrl: "https://stage.acme.dev/" });

describe("the popup's rules are the contract's (design §1.2–§1.3)", () => {
  it("draws the four stages, the current one marked, only the next and the previous pickable", () => {
    expect(stageOptions("stage").map((o) => [o.stage, o.sub, o.pickable])).toEqual([
      ["idea", "A problem worth building for", false],
      ["building", "Move back", true],
      ["stage", "Now", false],
      ["production", "Real people use it", true],
    ]);
    expect(stageOptions("idea").map((o) => o.sub)).toEqual(["Now", "Code and a first milestone", "After building", "After on stage"]);
    expect(defaultTarget("idea")).toBe("building");
    expect(defaultTarget("production")).toBe("stage");
  });

  it("asks each step for its own fields, required ones marked, and no comment or post box", () => {
    expect(stageFormFields("idea", "building").map((f) => [f.label, f.required])).toEqual([
      ["Repository", true],
      ["First milestone", true],
    ]);
    expect(stageFormFields("building", "stage").map((f) => [f.label, f.required])).toEqual([
      ["Stage link", true],
      ["What people can try", true],
    ]);
    expect(stageFormFields("stage", "production").map((f) => [f.name, f.required])).toEqual([
      ["productionUrl", true],
      ["liveSince", true],
      ["version", false],
      ["access", true],
    ]);
    expect(stageFormFields("production", "stage").map((f) => f.label)).toEqual(["Why it moves back"]);
    expect(stageFormFields("idea", "stage")).toEqual([]);
    expect(stageFormFields("stage", "production").find((f) => f.name === "access")?.options?.map((o) => o.label)).toEqual([
      "Open to everyone",
      "Waitlist",
      "Invite only",
    ]);
  });

  it("starts from the crew's own words, and says n of m required until the step is whole", () => {
    const values = initialStageValues(START);
    expect(values).toMatchObject({ repository: "https://github.com/acme/thing", stageUrl: "https://stage.acme.dev/", access: "everyone" });
    const production = stageFormFields("stage", "production");
    expect(requiredProgress(production, values, NOW).label).toBe("1 of 3 required");
    expect(canMove("stage", "production", values, NOW)).toBe(false);
    const filled = { ...values, productionUrl: "https://acme.app", liveSince: "2026-11-12" };
    expect(requiredProgress(production, filled, NOW)).toMatchObject({ done: 3, total: 3, label: "3 of 3 required" });
    expect(canMove("stage", "production", filled, NOW)).toBe(true);
    // An optional field that is wrong still locks Move.
    expect(canMove("stage", "production", { ...filled, version: "v".repeat(41) }, NOW)).toBe(false);
    // A day in the future is not "live since".
    expect(canMove("stage", "production", { ...filled, liveSince: "2026-11-16" }, NOW)).toBe(false);
    expect(canMove("stage", null, filled, NOW)).toBe(false);
  });

  it("says what is wrong only once there is something there, and counts the limited fields", () => {
    const [link, note] = stageFormFields("building", "stage");
    expect(liveFieldError(link!, "", NOW)).toBeNull();
    expect(liveFieldError(link!, "http://acme.dev", NOW)).toMatch(/https/);
    expect(fieldHint(note!, "Send a policy")).toBe("13 / 280");
    const version = stageFormFields("stage", "production").find((f) => f.name === "version")!;
    expect(fieldHint(version, "")).toBe("0 / 40 · Optional");
  });

  it("sends `to` and the step's own fields, never posting", () => {
    const fields = stageFormFields("idea", "building");
    expect(stageRequestOf("building", fields, { repository: " https://github.com/a/b ", firstMilestone: "First", tryWhat: "x" })).toEqual({
      to: "building",
      post: false,
      repository: "https://github.com/a/b",
      firstMilestone: "First",
    });
  });

  it("words the Move button and the Stage row as the boards do", () => {
    expect(moveLabel("stage", "production")).toBe("Move to in production");
    expect(moveLabel("stage", "building")).toBe("Move back to building");
    expect(moveLabel("stage", null)).toBe("Pick a stage");
    expect(nextStageLine("stage")).toBe("Next: in production");
    expect(nextStageLine("production")).toBeNull();
    expect(CHANGE_STAGE_TITLE).toBe("Change stage");
  });
});

describe("the popup is a dialog that behaves like one", () => {
  const dialog = code("[slug]/maker/stage-dialog.tsx");

  it("is named, modal, closed by Escape, ✕, Cancel and the scrim, and keeps and returns focus", () => {
    expect(dialog).toContain('role="dialog"');
    expect(dialog).toContain('aria-modal="true"');
    expect(dialog).toContain("aria-labelledby={titleId}");
    expect(dialog).toContain('if (event.key === "Escape") {');
    expect(dialog).toContain('aria-label="Close"');
    expect(dialog).toMatch(/onClick=\{onClose\}[\s\S]*?Cancel/);
    expect(dialog).toContain("if (event.target === event.currentTarget) onClose();");
    // The trap: Tab and Shift+Tab wrap inside it…
    expect(dialog).toContain("if (event.shiftKey && document.activeElement === head) {");
    expect(dialog).toContain("} else if (!event.shiftKey && document.activeElement === tail) {");
    // …and focus goes back to Change stage when it closes.
    expect(dialog).toContain("opener?.focus();");
    expect(dialog).toContain("createPortal(");
  });

  it("is centred over a scrim on a desktop and the whole screen on a phone, stages stacked, footer pinned", () => {
    expect(dialog).toContain("fixed inset-0 z-50 grid place-items-center bg-scrim/45");
    expect(dialog).toContain("max-sm:h-[100dvh]");
    expect(dialog).toContain("grid grid-cols-2 gap-2 max-sm:grid-cols-1");
    expect(dialog).toContain("sticky bottom-0");
  });

  it("locks Move until the contract says the request is whole, and draws a refusal under its field", () => {
    expect(dialog).toContain("const movable = !busy && canMove(from, target, values, now);");
    expect(dialog).toContain("disabled={!movable}");
    expect(dialog).toContain("{progress.label}");
    expect(dialog).toContain('crewWrite<{ stage: ProductStage }>(slug, "stage"');
    expect(dialog).toContain("error={fieldError(errors, field.name) ?? liveFieldError(");
    expect(dialog).toContain("aria-disabled={!option.pickable}");
    // Required is said with `*` and to a screen reader in words.
    expect(dialog).toContain('<span className="sr-only"> (required)</span>');
    // No post box: there is no post kind for a stage change yet.
    expect(dialog).not.toMatch(/Post it to the feed/);
  });
});

describe("Change stage lives inside Edit details, and nowhere else (design §1.4)", () => {
  it("the Stage row is in the form: the badge, Next, and Change stage opening the popup", () => {
    const form = code("[slug]/maker/details-form.tsx");
    expect(form).toContain("<StageRow slug={slug} start={start} look={look} />");
    const row = code("[slug]/maker/stage-row.tsx");
    expect(row).toContain("<StageBadge stage={stage} />");
    expect(row).toContain('{next ?? "The last stage"}');
    expect(row).toContain('aria-haspopup="dialog"');
    expect(row).toContain('React.lazy(() => import("./stage-dialog")');
    expect(row).toContain("router.refresh();");
  });

  it("the page carries no stage button of its own", () => {
    const page = code("[slug]/product-page.tsx");
    expect(page).not.toMatch(/Change stage|StageRow|StageDialog/);
  });

  it("each stage wears its own colour, and none of them is red", () => {
    expect(STAGE_TONE).toEqual({
      idea: { ink: "text-idea", dot: "bg-idea", soft: "bg-idea-soft" },
      building: { ink: "text-amber-ink", dot: "bg-amber", soft: "bg-amber-soft" },
      stage: { ink: "text-version", dot: "bg-version", soft: "bg-version-soft" },
      production: { ink: "text-success", dot: "bg-success", soft: "bg-success-soft" },
    });
    expect(JSON.stringify(STAGE_TONE)).not.toMatch(/destructive|danger/);
  });
});

describe("Where it runs (design §1.5)", () => {
  const where: WhereItRuns = {
    stage: { url: "https://stage.acme.dev/", note: "Send a policy", setBy: null, at: null },
    production: {
      url: "https://acme.app/",
      since: "2026-11-12",
      version: "1.0.0",
      access: "waitlist",
      setBy: { kind: "crew", name: "Ada Iyer", handle: "ada" },
      at: "2026-11-15T10:00:00.000Z",
    },
  };

  it("draws a STAGE row and a PRODUCTION row, each with its address and who set it and when", () => {
    expect(whereItRunsRows(where)).toEqual([
      { env: "stage", label: "STAGE", url: "https://stage.acme.dev/", shown: "stage.acme.dev", meta: "Send a policy" },
      {
        env: "production",
        label: "PRODUCTION",
        url: "https://acme.app/",
        shown: "acme.app",
        meta: "1.0.0 · Waitlist · live since Nov 12, 2026 · Link set by Ada Iyer · Nov 15, 2026",
      },
    ]);
  });

  it("says Not on stage yet and Not in production yet until it is", () => {
    expect(whereItRunsRows(NO_WHERE_IT_RUNS).map((row) => [row.label, row.url, row.meta])).toEqual([
      ["STAGE", null, NOT_ON_STAGE],
      ["PRODUCTION", null, NOT_IN_PRODUCTION],
    ]);
    expect([NOT_ON_STAGE, NOT_IN_PRODUCTION]).toEqual(["Not on stage yet", "Not in production yet"]);
  });

  it("names a crew member off the public roster as the crew, and nobody when nobody is recorded", () => {
    expect(setByLine({ kind: "crew", name: null, handle: null }, null)).toBe("Link set by the crew");
    expect(setByLine({ kind: "crew", name: null, handle: "ada" }, null)).toBe("Link set by @ada");
    expect(setByLine(null, "2026-11-15T10:00:00.000Z")).toBeNull();
    expect(shownAddress("https://acme.app/try/")).toBe("acme.app/try");
  });

  it("Try it is the stage link; in production the button is Open it, to the production link", () => {
    expect(liveAction({ stage: "stage", tryUrl: "https://stage.acme.dev/", whereItRuns: where })).toEqual({
      label: "Try it",
      href: "https://stage.acme.dev/",
    });
    expect(liveAction({ stage: "production", tryUrl: "https://stage.acme.dev/", whereItRuns: where })).toEqual({
      label: "Open it",
      href: "https://acme.app/",
    });
    expect(liveAction({ stage: "idea", tryUrl: null })).toBeNull();
  });
});

describe("POST /{slug}/manage/stage passes the step to core and core's answer back", () => {
  function gateway(stageAnswer: { status?: number; body: unknown }) {
    const calls: Array<{ method: string; path: string; body: unknown }> = [];
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const parsed = new URL(String(url));
      calls.push({ method: init?.method ?? "GET", path: parsed.pathname, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
      const said =
        parsed.pathname === "/v1/openproduct/me/overlay"
          ? { body: { data: { overlay: { crew: [{ slug: "ackstack", org: "org_9", profile: "opp_9" }] } } } }
          : parsed.pathname === PRODUCT_POST_API.crewStage("org_9", "opp_9") && init?.method === "PUT"
            ? stageAnswer
            : { status: 404, body: { error: { code: "not_found", message: "Not found" } } };
      return new Response(JSON.stringify(said.body), { status: said.status ?? 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    return { calls, fetchImpl };
  }
  const call = (over: Partial<CrewCall> & { fetchImpl: typeof fetch }): CrewCall => ({
    slug: "ackstack",
    token: "tok",
    fields: {},
    json: true,
    ...over,
  });

  it("reads only `to`, the step's own fields and `post`, and refuses a stage that is not one", () => {
    expect(readStageChange({ to: "production", productionUrl: "https://acme.app", org: "org_x", post: "false", extra: 1 })).toEqual({
      to: "production",
      productionUrl: "https://acme.app",
      post: false,
    });
    expect(readStageChange({ to: "shipping" })).toEqual({ kind: "invalid", fields: { to: ["Pick a stage"] } });
  });

  it("sends the step to core with the ids it resolved, and answers core's data", async () => {
    const g = gateway({ body: { data: { stage: "building", milestone: null, posted: false } } });
    const answer = await handleStageWrite(
      call({ fetchImpl: g.fetchImpl, fields: { to: "building", repository: "https://github.com/a/b", firstMilestone: "First" } }),
    );
    expect(answer).toEqual({ kind: "json", status: 200, body: { data: { stage: "building", milestone: null, posted: false } } });
    expect(g.calls.at(-1)).toEqual({
      method: "PUT",
      path: "/v1/organizations/org_9/openproduct/profiles/opp_9/stage",
      body: { to: "building", repository: "https://github.com/a/b", firstMilestone: "First" },
    });
  });

  it("passes core's refusal back with its field errors, and a form gets a 303 with its notice", async () => {
    const refused = gateway({ status: 422, body: { error: { code: "validation_failed", message: "Validation failed", details: { fields: { to: ["A stage moves one step at a time"] } } } } });
    expect(await handleStageWrite(call({ fetchImpl: refused.fetchImpl, fields: { to: "production" } }))).toEqual({
      kind: "json",
      status: 422,
      body: { error: { code: "validation_failed", message: "Validation failed", fields: { to: ["A stage moves one step at a time"] } } },
    });
    const ok = gateway({ body: { data: { stage: "idea", milestone: null, posted: false } } });
    expect(await handleStageWrite(call({ fetchImpl: ok.fetchImpl, json: false, fields: { to: "idea", reason: "paused" } }))).toEqual({
      kind: "redirect",
      to: "/ackstack?notice=stage-moved",
    });
    expect(CREW_NOTICES["stage-moved"]).toBe("Stage changed");
    // Signed out: through sign-in, and nothing was asked.
    const none = gateway({ body: {} });
    expect(await handleStageWrite(call({ fetchImpl: none.fetchImpl, token: null, fields: { to: "idea" } }))).toEqual({
      kind: "signin",
      returnTo: "/ackstack",
    });
    expect(none.calls).toEqual([]);
  });
});
