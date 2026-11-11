// Open a build (openproduct-open-builds OB6).

import { describe, expect, it } from "vitest";

import { OPEN_BUILD_HEADING, OPEN_BUILD_REPO_WHY, isGithubRepoUrl } from "./open-build.js";

describe("Open a build", () => {
  it("is called what the header button calls it", () => {
    expect(OPEN_BUILD_HEADING).toBe("Open a build");
  });

  it("says why the repo is asked for, and that it is optional", () => {
    expect(OPEN_BUILD_REPO_WHY).toMatch(/Most active/);
    expect(OPEN_BUILD_REPO_WHY).toMatch(/later/);
  });

  it("takes a GitHub repository address and nothing else", () => {
    for (const ok of [
      "https://github.com/acme/thing",
      "https://github.com/acme/thing/",
      "https://github.com/acme/thing.git",
      "  https://github.com/a-b/c.d_e  ",
    ]) {
      expect([ok, isGithubRepoUrl(ok)]).toEqual([ok, true]);
    }
    for (const bad of [
      "",
      "github.com/acme/thing",
      "http://github.com/acme/thing",
      "https://gitlab.com/acme/thing",
      "https://github.com/acme",
      "https://github.com/acme/thing/tree/main",
      "https://github.com.evil.test/acme/thing",
      "javascript:alert(1)",
    ]) {
      expect([bad, isGithubRepoUrl(bad)]).toEqual([bad, false]);
    }
  });
});
