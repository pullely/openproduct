// The profile form's two pure decisions (OH2, CG1) — beside the route
// handler rather than in it, because a Next.js route module may export only
// its HTTP methods, and these are the two things about the save worth a test.
import type { MeWriteResult } from "../me-api";

export interface ProfileFormInput {
  displayName: string | null;
  bio: string | null;
  githubUrl: string | null;
  siteUrl: string | null;
  openToProject: boolean;
  handle: string | null;
  profilePublic: boolean;
  /** What the page rendered, so the handler writes only what CHANGED. */
  currentHandle: string | null;
  currentPublic: boolean;
}

export interface ProfileSavePlan {
  authored: {
    displayName: string | null;
    bio: string | null;
    githubUrl: string | null;
    siteUrl: string | null;
    openToProject: boolean;
  };
  /** `undefined` = unchanged; a string claims; null releases. */
  handle: string | null | undefined;
  /** `undefined` = unchanged. */
  profilePublic: boolean | undefined;
}

/**
 * What to write, from what was posted. Pure, so the two decisions worth a
 * test live outside the request:
 *
 * - A handle is written only when it DIFFERS from the one the page showed.
 *   Re-submitting the form must not re-claim (harmless, but a write) and,
 *   more to the point, an empty field on a form that never had a handle must
 *   not RELEASE — releasing is permanent (CG0), and "I left it blank" is not
 *   "take it away for ever". Clearing a handle you hold is that act, and the
 *   form says so beside the field.
 * - Visibility is written only when the checkbox differs from the rendered
 *   state, for the same reason: core refuses "on" without standing, and a
 *   no-op save must not surface a refusal about a thing nobody touched.
 */
export function planProfileSave(input: ProfileFormInput): ProfileSavePlan {
  const wantedHandle = input.handle === null ? null : input.handle.replace(/^@/, "").toLowerCase();
  const handle =
    wantedHandle === input.currentHandle
      ? undefined
      : wantedHandle === null && input.currentHandle === null
        ? undefined
        : wantedHandle;
  const profilePublic = input.profilePublic === input.currentPublic ? undefined : input.profilePublic;
  return {
    authored: {
      displayName: input.displayName,
      bio: input.bio,
      // An empty field CLEARS a link (core's contract: "" clears, undefined
      // leaves alone) — the form always shows both, so both are always sent.
      githubUrl: input.githubUrl,
      siteUrl: input.siteUrl,
      openToProject: input.openToProject,
    },
    handle,
    profilePublic,
  };
}

/** Where the profile form lives, and so where every outcome returns: the
 *  settings page, since openproduct-redesign OPR1 moved the form off `/me`. */
export const SETTINGS_PATH = "/me/settings";

/**
 * Where a write's outcome sends the person, or null to carry on. The three
 * non-success kinds land in three different places: a dead token at sign-in,
 * a refusal back on the form WITH the reason, an outage back on the form
 * with the generic "not saved".
 */
export function redirectFor(result: MeWriteResult<unknown>): string | null {
  switch (result.kind) {
    case "ok":
      return null;
    case "unauthorized":
      return "/signin?return_to=%2Fme%2Fsettings";
    case "refused": {
      const [field, messages] = Object.entries(result.fields)[0] ?? [];
      const message = messages?.[0] ?? result.message;
      const params = new URLSearchParams({ error: "refused", message });
      if (field) params.set("field", field);
      return `${SETTINGS_PATH}?${params.toString()}`;
    }
    case "unavailable":
      return `${SETTINGS_PATH}?error=save_failed`;
  }
}
