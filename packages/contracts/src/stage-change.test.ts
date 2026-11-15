import { describe, expect, it } from "vitest";

import { PRODUCT_STAGES, PRODUCT_STAGE_LABELS, PRODUCT_STAGE_MARKS, nextStage, previousStage } from "./product-posts.js";
import {
  WHERE_IT_RUNS_KEYS,
  WHERE_IT_RUNS_PRODUCTION_KEYS,
  WHERE_IT_RUNS_STAGE_KEYS,
  WHERE_IT_RUNS_STAGE_SOURCE_KEYS,
  WHERE_IT_RUNS_PRODUCTION_SOURCE_KEYS,
  effectiveValue,
  reachableStages,
  stageLinkOf,
  stageStepFields,
  validateStageChange,
  whereItRunsOf,
} from "./stage-change.js";

const NOW = new Date("2026-11-15T12:00:00.000Z");

const fieldsOf = (result: ReturnType<typeof validateStageChange>) => (result.ok ? {} : result.fields);

describe("the four stages (design §1.1)", () => {
  it("are idea, building, stage and production, in order, with the board's words", () => {
    expect([...PRODUCT_STAGES]).toEqual(["idea", "building", "stage", "production"]);
    expect(PRODUCT_STAGES.map((s) => PRODUCT_STAGE_MARKS[s])).toEqual(["IDEA", "BUILDING", "ON STAGE", "IN PRODUCTION"]);
    expect(PRODUCT_STAGE_LABELS.stage).toBe("On stage");
    expect(nextStage("idea")).toBe("building");
    expect(nextStage("production")).toBeNull();
    expect(previousStage("idea")).toBeNull();
    expect(previousStage("production")).toBe("stage");
  });

  it("reach only the next and the previous stage", () => {
    expect(reachableStages("idea")).toEqual(["building"]);
    expect(reachableStages("building")).toEqual(["idea", "stage"]);
    expect(reachableStages("production")).toEqual(["stage"]);
  });
});

describe("validateStageChange (design §1.2–§1.3)", () => {
  it("refuses a skipped step, a step to where it is, and a stage that is not one", () => {
    expect(fieldsOf(validateStageChange("idea", { to: "stage" }, NOW)).to?.[0]).toMatch(/one step at a time/);
    expect(fieldsOf(validateStageChange("production", { to: "building", reason: "paused" }, NOW)).to).toBeDefined();
    expect(fieldsOf(validateStageChange("stage", { to: "stage" }, NOW)).to?.[0]).toMatch(/already/);
    expect(fieldsOf(validateStageChange("idea", { to: "shipping" }, NOW)).to).toBeDefined();
    expect(fieldsOf(validateStageChange("idea", null, NOW)).to).toBeDefined();
  });

  it("→ building needs an https repository and a first milestone of at most 60", () => {
    expect(fieldsOf(validateStageChange("idea", { to: "building" }, NOW))).toEqual({
      repository: ["Required"],
      firstMilestone: ["Required"],
    });
    const bad = fieldsOf(
      validateStageChange("idea", { to: "building", repository: "http://github.com/a/b", firstMilestone: "x".repeat(61) }, NOW),
    );
    expect(Object.keys(bad).sort()).toEqual(["firstMilestone", "repository"]);
    const ok = validateStageChange(
      "idea",
      { to: "building", repository: " https://github.com/acme/thing ", firstMilestone: " The register ", comment: "" },
      NOW,
    );
    expect(ok).toEqual({
      ok: true,
      change: {
        from: "idea",
        direction: "forward",
        to: "building",
        repository: "https://github.com/acme/thing",
        firstMilestone: "The register",
        comment: null,
        post: true,
      },
    });
  });

  it("→ stage needs an https stage link and what people can try (1–280)", () => {
    expect(Object.keys(fieldsOf(validateStageChange("building", { to: "stage" }, NOW))).sort()).toEqual(["stageUrl", "tryWhat"]);
    expect(
      fieldsOf(validateStageChange("building", { to: "stage", stageUrl: "https://localhost", tryWhat: "x".repeat(281) }, NOW)),
    ).toEqual({ stageUrl: [expect.stringMatching(/https/)], tryWhat: ["At most 280 characters"] });
    const ok = validateStageChange(
      "building",
      { to: "stage", stageUrl: "https://acme-stage.example.dev", tryWhat: "Sign up and send a policy", post: false },
      NOW,
    );
    expect(ok.ok && ok.change).toMatchObject({ to: "stage", stageUrl: "https://acme-stage.example.dev/", post: false });
  });

  it("→ production needs a link, a live-since day not in the future and who can use it; the version is optional", () => {
    expect(Object.keys(fieldsOf(validateStageChange("stage", { to: "production" }, NOW))).sort()).toEqual([
      "access",
      "liveSince",
      "productionUrl",
    ]);
    const future = fieldsOf(
      validateStageChange(
        "stage",
        { to: "production", productionUrl: "https://acme.app", liveSince: "2026-11-16", access: "everyone" },
        NOW,
      ),
    );
    expect(future).toEqual({ liveSince: ["A date, today or earlier"] });
    expect(
      fieldsOf(
        validateStageChange(
          "stage",
          { to: "production", productionUrl: "https://acme.app", liveSince: "2026-02-30", access: "all", version: "v".repeat(41) },
          NOW,
        ),
      ),
    ).toEqual({
      liveSince: ["A date, today or earlier"],
      access: ["Everyone, waitlist or invite"],
      version: ["One line of at most 40 characters"],
    });
    const ok = validateStageChange(
      "stage",
      { to: "production", productionUrl: "https://acme.app", liveSince: "2026-11-15", access: "waitlist" },
      NOW,
    );
    expect(ok.ok && ok.change).toMatchObject({ to: "production", liveSince: "2026-11-15", access: "waitlist", version: null });
  });

  it("← back one step needs a reason, and takes the optional comment", () => {
    expect(fieldsOf(validateStageChange("stage", { to: "building" }, NOW))).toEqual({ reason: ["Required"] });
    expect(fieldsOf(validateStageChange("stage", { to: "building", reason: "bored" }, NOW)).reason).toBeDefined();
    const ok = validateStageChange("building", { to: "idea", reason: "moved", comment: "Now at a new home" }, NOW);
    expect(ok).toEqual({
      ok: true,
      change: { from: "building", direction: "back", to: "idea", reason: "moved", comment: "Now at a new home", post: true },
    });
  });

  it("bounds the comment at 280 and post to a boolean", () => {
    const fields = fieldsOf(
      validateStageChange("stage", { to: "building", reason: "paused", comment: "x".repeat(281), post: "yes" }, NOW),
    );
    expect(Object.keys(fields).sort()).toEqual(["comment", "post"]);
  });

  it("names each step's fields, required first-class", () => {
    expect(stageStepFields("idea", "building").filter((f) => f.required).map((f) => f.name)).toEqual(["repository", "firstMilestone"]);
    expect(stageStepFields("stage", "production").filter((f) => f.required)).toHaveLength(3);
    expect(stageStepFields("production", "stage").map((f) => f.name)).toEqual(["reason", "comment"]);
    expect(stageStepFields("idea", "production")).toEqual([]);
  });

  it("a stage link is https with a real host and no credentials", () => {
    expect(stageLinkOf("https://acme.app/path")).toBe("https://acme.app/path");
    expect(stageLinkOf("http://acme.app")).toBeNull();
    expect(stageLinkOf("https://acme")).toBeNull();
    expect(stageLinkOf("https://user:pw@acme.app")).toBeNull();
    expect(stageLinkOf("https://acme.app/a b")).toBeNull();
    expect(stageLinkOf(`https://acme.app/${"x".repeat(200)}`)).toBeNull();
  });
});

describe("whereItRunsOf (design §1.5)", () => {
  const roster = (id: string) => (id === "usr_ada" ? { name: "Ada", handle: "ada" } : null);

  it("shows the stage row while on stage, with who set it", () => {
    const where = whereItRunsOf(
      { stage: "stage", tryUrl: "https://s.acme.app/", stageNote: "Send a policy", stageChangedAt: "2026-11-15T10:00:00.000Z", stageChangedBy: "usr_ada" },
      roster,
    );
    expect(where).toEqual({
      stage: {
        url: "https://s.acme.app/",
        note: "Send a policy",
        version: null,
        source: { url: "crew" },
        setBy: { kind: "crew", name: "Ada", handle: "ada" },
        at: "2026-11-15T10:00:00.000Z",
      },
      production: null,
    });
    expect(Object.keys(where).sort()).toEqual([...WHERE_IT_RUNS_KEYS]);
    expect(Object.keys(where.stage!).sort()).toEqual([...WHERE_IT_RUNS_STAGE_KEYS]);
  });

  it("in production, the change belongs to the production row; a person off the roster is not named", () => {
    const where = whereItRunsOf(
      {
        stage: "production",
        tryUrl: "https://s.acme.app/",
        productionUrl: "https://acme.app/",
        productionSince: "2026-11-12",
        productionVersion: "1.0.0",
        productionAccess: "invite",
        stageChangedAt: "2026-11-15T10:00:00.000Z",
        stageChangedBy: "usr_private",
      },
      roster,
    );
    expect(where.stage).toMatchObject({ url: "https://s.acme.app/", setBy: null, at: null });
    expect(where.production).toEqual({
      url: "https://acme.app/",
      since: "2026-11-12",
      version: "1.0.0",
      access: "invite",
      source: { url: "crew", since: "crew", version: "crew" },
      setBy: { kind: "crew", name: null, handle: null },
      at: "2026-11-15T10:00:00.000Z",
    });
    expect(Object.keys(where.production!).sort()).toEqual([...WHERE_IT_RUNS_PRODUCTION_KEYS]);
  });

  describe("SC3 — the crew's value ?? the synced one (design §3.3)", () => {
    const deploys = {
      stage: { url: "https://stage.acme.app/", version: "v1.5.0-rc1", deployedAt: "2026-11-15T08:00:00.000Z", firstDeployedAt: "2026-11-01T08:00:00.000Z" },
      production: { url: "https://acme.app/", version: "v1.4.0", deployedAt: "2026-11-14T09:05:00.000Z", firstDeployedAt: "2026-11-02T09:05:00.000Z" },
    };

    it("with no crew values, the rows read the deploys, deployed by Orun, each field marked synced", () => {
      const where = whereItRunsOf({ stage: "production", tryUrl: null, productionAccess: "everyone", stageChangedBy: "usr_ada", stageChangedAt: "2026-11-15T10:00:00.000Z", deploys }, roster);
      expect(where.stage).toEqual({
        url: "https://stage.acme.app/",
        note: null,
        version: "v1.5.0-rc1",
        source: { url: "synced" },
        setBy: { kind: "orun", name: null, handle: null },
        at: "2026-11-15T08:00:00.000Z",
      });
      expect(where.production).toEqual({
        url: "https://acme.app/",
        since: "2026-11-02",
        version: "v1.4.0",
        access: "everyone",
        source: { url: "synced", since: "synced", version: "synced" },
        setBy: { kind: "orun", name: null, handle: null },
        at: "2026-11-14T09:05:00.000Z",
      });
      expect(Object.keys(where.stage!.source)).toEqual([...WHERE_IT_RUNS_STAGE_SOURCE_KEYS]);
      expect(Object.keys(where.production!.source).sort()).toEqual([...WHERE_IT_RUNS_PRODUCTION_SOURCE_KEYS]);
    });

    it("a crew value wins field by field, and the link set by a person names them", () => {
      const where = whereItRunsOf(
        {
          stage: "production",
          tryUrl: "https://try.acme.app/",
          productionUrl: "https://www.acme.app/",
          productionSince: null,
          productionVersion: "1.0.0",
          productionAccess: "invite",
          stageChangedBy: "usr_ada",
          stageChangedAt: "2026-11-15T10:00:00.000Z",
          deploys,
        },
        roster,
      );
      expect(where.stage).toMatchObject({ url: "https://try.acme.app/", version: "v1.5.0-rc1", source: { url: "crew" }, setBy: null });
      expect(where.production).toMatchObject({
        url: "https://www.acme.app/",
        since: "2026-11-02",
        version: "1.0.0",
        source: { url: "crew", since: "synced", version: "crew" },
        setBy: { kind: "crew", name: "Ada", handle: "ada" },
        at: "2026-11-15T10:00:00.000Z",
      });
    });

    it("a crew value equal to the synced one reads as synced", () => {
      expect(effectiveValue("https://acme.app/", "https://acme.app/")).toEqual({ value: "https://acme.app/", source: "synced" });
      expect(effectiveValue("https://b.app/", "https://acme.app/")).toEqual({ value: "https://b.app/", source: "crew" });
      expect(effectiveValue(null, null)).toEqual({ value: null, source: "crew" });
    });

    it("a deploy with no address (every deploy today) fills the version and the day, never a row of its own", () => {
      const noUrl = { stage: { ...deploys.stage, url: null }, production: { ...deploys.production, url: null } };
      const onStage = whereItRunsOf({ stage: "stage", tryUrl: null, deploys: noUrl }, roster);
      expect(onStage).toEqual({ stage: null, production: null });
      const live = whereItRunsOf(
        { stage: "production", tryUrl: "https://try.acme.app/", productionUrl: "https://acme.app/", productionAccess: "everyone", deploys: noUrl },
        roster,
      );
      expect(live.production).toMatchObject({ since: "2026-11-02", version: "v1.4.0", source: { url: "crew", since: "synced", version: "synced" } });
    });

    it("a deploy does not move the stage: an idea runs nowhere even with deploys", () => {
      expect(whereItRunsOf({ stage: "idea", tryUrl: null, deploys }, roster)).toEqual({ stage: null, production: null });
    });
  });

  it("an idea or a building product runs nowhere, whatever was stored", () => {
    expect(whereItRunsOf({ stage: "building", tryUrl: "https://s.acme.app/", productionUrl: "https://acme.app/" }, roster)).toEqual({
      stage: null,
      production: null,
    });
  });
});
