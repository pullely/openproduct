// The handle namespace (openproduct-commons CG0).
//
// `openproduct.live/kettleworks` is a product. `openproduct.live/@ada` is a
// person. The `@` is part of the URL rather than decoration (OPC-B) — two flat
// namespaces at the root would need a shared uniqueness table, and every new
// reserved word would become a breaking change for whoever already held it.
//
// WHAT THIS MODULE IS FOR: there is exactly one place that decides whether a
// string can be a handle, and every refusal it produces has a REASON a person
// can act on. "Invalid handle" is the failure mode this file exists to
// prevent — a refusal that does not say which rule was broken makes the person
// guess, and the guesses are always the same three and always wrong.
//
// Nothing here renders anything. CG1 brings the profile page; CG0 ships the
// namespace and its rules, so the first person to claim a handle cannot be
// given one that later has to be taken back.

/** Why a handle cannot be claimed. Closed — a new reason is a deliberate act. */
export const HANDLE_REFUSALS = [
  "too-short",
  "too-long",
  "bad-characters",
  "edge-dash",
  "reserved",
  "taken",
  "released",
] as const;
export type HandleRefusal = (typeof HANDLE_REFUSALS)[number];

export const HANDLE_MIN = 2;
export const HANDLE_MAX = 32;

/**
 * The grammar, in one place and matching the migration's CHECK exactly.
 *
 * NOTE THERE IS NO OPTIONAL GROUP. An earlier spelling wrote the tail as
 * `([a-z0-9-]{0,30}[a-z0-9])?`, which reads as "2–32" and in fact admits a
 * ONE-character handle — so the CHECK silently enforced nothing about the
 * minimum, and only `parseHandle`'s separate length test was holding it. A
 * direct INSERT would have created `@a`. The db test that walks the grammar
 * against the live engine is what caught it.
 *
 * Duplicated deliberately rather than derived: the database enforces it
 * because this column is a URL segment and a segment only the application
 * validates is one a direct INSERT can break for every reader; the contract
 * enforces it because a refusal has to arrive with a REASON, and a constraint
 * violation is not one. A test asserts the two agree.
 */
export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;

/**
 * What a claim can answer. `ok` carries the CANONICAL form, because the
 * caller must store what this returns rather than what the person typed —
 * `Ada` and `ada` are the same handle, and a table holding both spellings has
 * two rows for one person.
 */
export type HandleCheck =
  | { readonly ok: true; readonly handle: string }
  | { readonly ok: false; readonly reason: HandleRefusal; readonly message: string };

/** One sentence per refusal, in the second person, naming the fix. */
export const HANDLE_REFUSAL_COPY: Record<HandleRefusal, string> = {
  "too-short": `Handles are at least ${HANDLE_MIN} characters.`,
  "too-long": `Handles are at most ${HANDLE_MAX} characters.`,
  "bad-characters": "Handles use lowercase letters, numbers and dashes — nothing else.",
  "edge-dash": "Handles cannot start or end with a dash.",
  reserved: "That handle is reserved, so nobody can claim it.",
  taken: "Somebody already has that handle.",
  // The one that surprises people, so it says WHY rather than just refusing.
  released:
    "That handle was used before and was released. Released handles are never re-issued, so that the person who had it cannot be impersonated by whoever claims it next.",
};

/**
 * Fold a typed handle to its canonical form, or refuse with a reason.
 *
 * SYNTAX ONLY. Whether a handle is reserved, taken or released is a question
 * for the database, and this function deliberately cannot answer it — a
 * validator that sometimes needs a connection is one that gets called without
 * one. `claimRefusal` composes the two halves.
 *
 * The order of checks is the order a person would want to be told: length
 * first (the commonest mistake), then the character set, then the edges.
 * Reporting `bad-characters` for a 40-character handle would be true and
 * useless.
 */
export function parseHandle(input: string): HandleCheck {
  const handle = input.trim().replace(/^@+/, "").toLowerCase();
  if (handle.length < HANDLE_MIN) return refuse("too-short");
  if (handle.length > HANDLE_MAX) return refuse("too-long");
  if (!/^[a-z0-9-]+$/.test(handle)) return refuse("bad-characters");
  if (handle.startsWith("-") || handle.endsWith("-")) return refuse("edge-dash");
  // Anything reaching here must satisfy the migration's CHECK; if the two ever
  // disagree the database wins and the person gets a constraint error instead
  // of a sentence, so a test pins them together.
  if (!HANDLE_PATTERN.test(handle)) return refuse("bad-characters");
  return { ok: true, handle };
}

function refuse(reason: HandleRefusal): HandleCheck {
  return { ok: false, reason, message: HANDLE_REFUSAL_COPY[reason] };
}

/** What the database found for a handle, if anything. */
export interface HandleState {
  /** Set when the row exists and nobody may ever hold it. */
  readonly reservedFor: string | null;
  /** The current holder, or null for a reserved or released handle. */
  readonly subjectId: string | null;
  readonly releasedAt: string | null;
}

/**
 * Given a syntactically valid handle and what the database holds for it,
 * decide whether THIS subject may claim it.
 *
 * A subject re-claiming the handle they already hold is `ok`, not `taken`:
 * the commonest way to hit this path is somebody re-submitting their own
 * form, and telling them their own handle is taken is both wrong and alarming.
 */
export function claimRefusal(
  handle: string,
  state: HandleState | null,
  subjectId: string,
): HandleCheck {
  if (!state) return { ok: true, handle };
  if (state.reservedFor !== null) return refuse("reserved");
  if (state.releasedAt !== null) return refuse("released");
  if (state.subjectId !== null && state.subjectId !== subjectId) return refuse("taken");
  return { ok: true, handle };
}

/** The public path a handle resolves to. The `@` is part of it (OPC-B). */
export function handlePath(handle: string): string {
  return `/@${handle}`;
}

/**
 * Read a handle out of a path, or null.
 *
 * The one function the router trusts. `/@ada` is a person; `/ada` is a
 * product slug and must NEVER resolve here, which is what keeps the two
 * namespaces from needing a shared uniqueness table.
 */
export function handleFromPath(pathname: string): string | null {
  const match = /^\/@([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  const parsed = parseHandle(decodeURIComponent(match[1]!));
  return parsed.ok ? parsed.handle : null;
}
