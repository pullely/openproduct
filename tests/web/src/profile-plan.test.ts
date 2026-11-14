// The profile form's save plan (openproduct-home OH2, CG1).
//
// Two decisions the route handler makes before it writes anything, and the
// reason each is worth pinning is that getting it wrong is PERMANENT in one
// case (a released handle is a tombstone — CG0) and misleading in the other
// (a refusal about a toggle nobody touched).

import { planProfileSave, redirectFor, type ProfileFormInput } from "@openproduct-web/app/me/profile/plan";

function posted(overrides: Partial<ProfileFormInput> = {}): ProfileFormInput {
  return {
    displayName: "Ada",
    bio: null,
    githubUrl: null,
    siteUrl: null,
    openToProject: false,
    handle: null,
    profilePublic: false,
    currentHandle: null,
    currentPublic: false,
    ...overrides,
  };
}

describe("the handle is written only when it changes", () => {
  it("an empty field on a form that never had a handle is NOT a release", () => {
    expect(planProfileSave(posted({ handle: null, currentHandle: null })).handle).toBeUndefined();
  });

  it("re-submitting the handle you already hold writes nothing", () => {
    expect(planProfileSave(posted({ handle: "ada", currentHandle: "ada" })).handle).toBeUndefined();
    // Case and a leading `@` are presentation, not a different handle.
    expect(planProfileSave(posted({ handle: "@Ada", currentHandle: "ada" })).handle).toBeUndefined();
  });

  it("a new handle claims, and clearing one you hold releases", () => {
    expect(planProfileSave(posted({ handle: "ada", currentHandle: null })).handle).toBe("ada");
    expect(planProfileSave(posted({ handle: "grace", currentHandle: "ada" })).handle).toBe("grace");
    expect(planProfileSave(posted({ handle: null, currentHandle: "ada" })).handle).toBeNull();
  });
});

describe("visibility is written only when the checkbox differs from what rendered", () => {
  it("a no-op save never surfaces a refusal about an untouched toggle", () => {
    expect(planProfileSave(posted({ profilePublic: false, currentPublic: false })).profilePublic).toBeUndefined();
    expect(planProfileSave(posted({ profilePublic: true, currentPublic: true })).profilePublic).toBeUndefined();
  });

  it("a change writes the new state", () => {
    expect(planProfileSave(posted({ profilePublic: true, currentPublic: false })).profilePublic).toBe(true);
    expect(planProfileSave(posted({ profilePublic: false, currentPublic: true })).profilePublic).toBe(false);
  });
});

describe("the authored fields are always sent in full", () => {
  it("an empty link CLEARS it — the form shows both links, so both travel", () => {
    expect(planProfileSave(posted({ githubUrl: null, siteUrl: "https://ada.dev" })).authored).toEqual({
      displayName: "Ada",
      bio: null,
      githubUrl: null,
      siteUrl: "https://ada.dev",
      openToProject: false,
    });
  });
});

describe("where each outcome lands", () => {
  it("ok carries on; a dead token goes to sign-in; an outage says 'not saved'", () => {
    expect(redirectFor({ kind: "ok", data: {} })).toBeNull();
    // The form is on `/me/settings` since openproduct-redesign OPR1, so
    // that is where every outcome lands — never the profile it left.
    expect(redirectFor({ kind: "unauthorized" })).toBe("/signin?return_to=%2Fme%2Fsettings");
    expect(redirectFor({ kind: "unavailable" })).toBe("/me/settings?error=save_failed");
  });

  it("a refusal goes back to the form WITH the field's reason", () => {
    const url = redirectFor({
      kind: "refused",
      status: 422,
      message: "Validation failed",
      fields: { handle: ["That handle is taken."] },
    });
    expect(url?.startsWith("/me/settings?")).toBe(true);
    const params = new URL(`https://openproduct.live${url}`).searchParams;
    expect(params.get("error")).toBe("refused");
    expect(params.get("field")).toBe("handle");
    expect(params.get("message")).toBe("That handle is taken.");
  });

  it("a refusal with no field falls back to the envelope's own message", () => {
    const url = redirectFor({ kind: "refused", status: 400, message: "No.", fields: {} });
    const params = new URL(`https://openproduct.live${url}`).searchParams;
    expect(params.get("message")).toBe("No.");
    expect(params.get("field")).toBeNull();
  });
});
