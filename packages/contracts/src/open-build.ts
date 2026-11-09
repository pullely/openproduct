// Open a build (openproduct-open-builds OB6, D4).
//
// `/submit` was *List your product in the open*: a launch site's form. It is
// *Open a build* now, and it asks for the one thing that makes a build a
// build here — the public repository — up front, optional, and with the
// reason beside the field rather than a requirement nobody explained.
//
// THE REPO DOES NOT CROSS TO THE CONSOLE. S10's hand-off carries name,
// tagline and pitch, pinned by tests on both sides; widening a cross-product
// contract for a field openproduct already owns would be the wrong trade. The
// repo waits in this origin's session storage (the tab survives the round
// trip to Orunbase and back) and the studio's Details step offers it when the
// maker lands there. Nothing is saved until the maker saves.

/** The page's title and the header control's words (OB1). */
export const OPEN_BUILD_HEADING = "Open a build";

/** The line under it: what a build is. */
export const OPEN_BUILD_SUBTITLE =
  "A build is a public repo and a public Orunbase workspace. Say what you are building; the workspace is set up next.";

export const OPEN_BUILD_REPO_LABEL = "Public repository";

/** Why the field is there — said beside it, because it is optional. */
export const OPEN_BUILD_REPO_WHY =
  "Every build is a public repo. Linking it now means its merged changes count toward Most active from the first sweep. You can add it later.";

/** Said when what was typed is not a public GitHub repository address. */
export const OPEN_BUILD_REPO_HINT = "A GitHub repository address, like https://github.com/owner/repo.";

/** The studio's note when it offers the repo typed on Open a build. */
export const OPEN_BUILD_REPO_CARRIED = "From Open a build. Save to keep it.";

/** Where the repo waits across the hand-off: this origin's session storage. */
export const OPEN_BUILD_REPO_KEY = "op.create.repo";

/** The longest address the field takes. */
export const OPEN_BUILD_REPO_MAX = 200;

const GITHUB_REPO = /^https:\/\/github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}\/?$/;

/**
 * Whether a typed address reads as a public GitHub repository, the one host
 * the ingestion sweep reads (S8). Syntax only: whether it is PUBLIC is
 * observed, by the repo check, never assumed from the shape of a URL.
 */
export function isGithubRepoUrl(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length <= OPEN_BUILD_REPO_MAX && GITHUB_REPO.test(trimmed.replace(/\.git$/, ""));
}
