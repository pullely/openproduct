// A page from the build before this one (openproduct-open-builds OB8).
//
// ─── THE PEOPLE INDEX'S "SOMETHING FAILED HERE", FOUND ────────────────────
//
// `/people` rendered *Something failed here* on prod while its server render
// answered 200. The cause was not the page: every deploy replaces the
// worker's static assets, so the previous build's hashed chunks 404 from the
// moment the new one is live — and a document from the previous build still
// reaches readers for a while (the edge's stale window, `expireTime: 300`;
// a tab that loaded before the deploy and navigates after it). That document
// asks for `app/people/(index)/page-<old hash>.js`, the chunk is gone, the
// webpack runtime throws `ChunkLoadError`, and the nearest error boundary —
// `people/error.tsx` — caught it, threw the error away, and offered *Try
// again*, which re-renders the same tree and asks for the same missing chunk.
// Reproduced by 404ing the page chunk under a real browser
// (`tests/web/src/stale-deploy.test.ts` pins the recovery).
//
// ─── THE REMEDY ───────────────────────────────────────────────────────────
//
// A chunk that failed to load because its build is gone is fixed by exactly
// one thing: loading the page again, from the current build. So an error
// boundary that catches one reloads — ONCE per address per minute, recorded
// in session storage, so a chunk that is genuinely broken in the CURRENT
// build shows the failure panel instead of reloading forever.
//
// PURE, so the test lane holds every branch: the recogniser, and the
// once-per-window rule against an injected storage and clock.

/** Where the last reload is recorded: `${path} ${epochMs}`. */
export const STALE_DEPLOY_RELOAD_KEY = "op.stale-deploy.reload";

/** How long one reload covers an address. A second failure inside it is real. */
export const STALE_DEPLOY_WINDOW_MS = 60_000;

/** What the boundary says while the page reloads. */
export const STALE_DEPLOY_NOTE = "openproduct was just updated. Loading the latest version…";

/**
 * Whether an error is a chunk that could not be loaded — the signature of a
 * page from a build that is no longer deployed. Webpack names it
 * `ChunkLoadError`; a CSS chunk and a native dynamic import fail with their
 * own messages, and all three mean the same thing here.
 */
export function isStaleDeployError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === "ChunkLoadError") return true;
  return (
    typeof message === "string" &&
    /Loading chunk [\w-]+ failed|Loading CSS chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
      message,
    )
  );
}

export type ReloadStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * Whether to reload `path` now, recording the reload if so. False when this
 * address already reloaded inside the window — the failure is not a stale
 * build, and the panel must be shown — or when there is no storage to record
 * it in (reloading without a record could loop).
 */
export function claimReload(storage: ReloadStorage | null, path: string, now: number): boolean {
  if (!storage) return false;
  try {
    const last = storage.getItem(STALE_DEPLOY_RELOAD_KEY);
    if (last) {
      const space = last.lastIndexOf(" ");
      const at = Number(last.slice(space + 1));
      if (last.slice(0, space) === path && Number.isFinite(at) && now - at < STALE_DEPLOY_WINDOW_MS) return false;
    }
    storage.setItem(STALE_DEPLOY_RELOAD_KEY, `${path} ${now}`);
    return true;
  } catch {
    return false;
  }
}
