// One sentence, one address, four surfaces (openproduct-worldclass-v2 CF5).
import { describe, expect, it } from "vitest";

import { FEED_HOW_HREF } from "./feed.js";
import {
  LAUNCH_ACT_NOTE,
  LAUNCH_HOW_HREF,
  LAUNCH_STEP_LABEL,
  LAUNCH_STEP_NOTE,
  launchStepHref,
} from "./launch-act.js";

describe("the act, named", () => {
  it("is one sentence that names who launches", () => {
    expect(LAUNCH_ACT_NOTE.split(/(?<=[.!?])\s+/).filter(Boolean)).toHaveLength(1);
    expect(LAUNCH_ACT_NOTE).toMatch(/maintainer/);
    // Not the sweep's sentence. The sweep counts; a person launches.
    expect(LAUNCH_ACT_NOTE).not.toMatch(/sweep|counted/i);
  });

  it("links the sentence LC0 already published, and HB1's Today links the same one", () => {
    expect(LAUNCH_HOW_HREF).toBe("/docs#launching");
    expect(FEED_HOW_HREF).toBe(LAUNCH_HOW_HREF);
  });

  it("the checklist's last row is the plan's words and links the scheduler", () => {
    expect(LAUNCH_STEP_LABEL).toBe("Launch it");
    expect(launchStepHref("acme", "p 1")).toBe("/studio/acme/p%201/launches");
    // The note distinguishes the two acts W·05 found conflated.
    expect(LAUNCH_STEP_NOTE).toMatch(/Publishing/);
    expect(LAUNCH_STEP_NOTE).toMatch(/Launching/);
  });
});
