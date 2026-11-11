// The runner reads its project from SUPABASE_PROJECT_REF (design §11), and a
// missing or blank value fails the apply instead of reaching the Management
// API with an empty ref.

import { describe, expect, it } from "vitest";

import { loadProjectRef } from "./secrets.js";

describe("loadProjectRef", () => {
  it("returns the ref, trimmed", () => {
    expect(loadProjectRef({ SUPABASE_PROJECT_REF: " abcdefghijklmnopqrst\n" })).toBe(
      "abcdefghijklmnopqrst",
    );
  });

  it("throws when the secret is not wired", () => {
    expect(() => loadProjectRef({})).toThrow(/SUPABASE_PROJECT_REF is not set/);
  });

  it("throws when the secret is blank", () => {
    expect(() => loadProjectRef({ SUPABASE_PROJECT_REF: "  " })).toThrow(
      /SUPABASE_PROJECT_REF is not set/,
    );
  });
});
