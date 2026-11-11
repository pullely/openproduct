// The credential store, dormant (openproduct-launch AC0).
//
// Nothing here is reachable yet. AC0 ships the vocabulary and the rules so
// that AC1 (sign-up and verification), AC2 (sign-in) and AC3 (reset) fit a
// shape that was agreed before any of them had a route — the posture CT0, SN0,
// CB0 and OPA1 each took, and for the same reason: a rule invented alongside
// the handler that needs it is a rule shaped by that handler's convenience.
//
// ─── THE ONE THING TO KNOW ABOUT THIS MILESTONE ──────────────────────────
//
// THERE IS NO ADDRESS ANYWHERE IN IT — not in the schema, not in these types,
// not for a moment between sign-up and verification.
//
// The implementation plan asked for `openproduct.credentials (subject, email,
// argon2id verifier, verified_at)`, and R1's binding text allowed an address
// column until `verified_at` was set. Both are leftovers from before R1 was
// settled, and both lose to I3 as actually written — *"No email column exists
// anywhere in the `openproduct` schema"* — which is not a claim somebody
// checks per table but an `information_schema` query that refuses any column
// matching `%email%`, written that way so it covers every table added from
// here on without anyone remembering to extend it.
//
// They also lose to R1's own decision (a): *"The platform keeps the address
// against the subject id and openproduct asks it to send, holding nothing."*
//
// HOW THE GAP IS CROSSED. At sign-up there is no subject id yet, so something
// must carry the address from "somebody typed it" to "somebody proved they
// read the mail". The TOKEN carries it and the PLATFORM holds it: openproduct
// stores only the token's hash beside the waiting verifier, hands the platform
// the address and the token together — exactly as CB4 hands it a subject id
// and a kind — and on return receives a SUBJECT ID rather than the address.
//
// Two things fall out, and both are stronger than the rule they replace:
//
//   ENUMERATION BECOMES STRUCTURAL. AC1 must "answer identically for a known
//   and an unknown address". openproduct cannot tell the difference, so this
//   is not a rule anybody can break by forgetting.
//
//   THERE IS NO WINDOW. "Held only until verification" still means held: a row
//   that never holds an address cannot leak one in that window, cannot carry
//   one into a backup taken inside it, and cannot put one in a log line
//   written during it.
//
// WHAT IT COSTS, said plainly: the platform is in the loop on every SIGN-IN,
// not only on verification and reset, because openproduct has no address to
// match a typed one against. R1 already accepted exactly that cost for the
// reset path on exactly this reasoning; AC0 extends it rather than inventing
// it. A round trip on the sign-in path is the price of an app that cannot leak
// an address it does not have.

// ---------------------------------------------------------------------------
// The two one-time tokens
// ---------------------------------------------------------------------------

/**
 * What a token is for.
 *
 * `verify` — a sign-up. A hashed password waits behind it; no subject exists
 *            yet, because the subject is minted when the token is consumed.
 * `reset`  — a forgotten password. The subject exists; no password waits,
 *            because the new one is typed on the page the token opens.
 */
export const CREDENTIAL_TOKEN_PURPOSES = ["verify", "reset"] as const;
export type CredentialTokenPurpose = (typeof CREDENTIAL_TOKEN_PURPOSES)[number];

export function isCredentialTokenPurpose(value: string): value is CredentialTokenPurpose {
  return (CREDENTIAL_TOKEN_PURPOSES as readonly string[]).includes(value);
}

/**
 * How long each kind of token lives, and they are deliberately different.
 *
 * A VERIFY TOKEN IS GENEROUS (24 hours) because the cost of it expiring is
 * that somebody who meant to sign up has to start again, and mail is slow,
 * filtered and read on a commute.
 *
 * A RESET TOKEN IS SHORT (30 minutes) because it is the more dangerous of the
 * two: it takes over an account that already exists and already has things in
 * it. A verify token that leaks creates an account nobody wanted; a reset
 * token that leaks takes one somebody has.
 *
 * These are separate constants rather than one because a single default would
 * quietly give them the same window, and the day somebody widened it for mail
 * latency they would have widened the dangerous one too.
 */
export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export function credentialTokenTtlMs(purpose: CredentialTokenPurpose): number {
  return purpose === "verify" ? VERIFY_TOKEN_TTL_MS : RESET_TOKEN_TTL_MS;
}

/** When a token issued at `now` stops working. */
export function credentialTokenExpiry(purpose: CredentialTokenPurpose, now: number): string {
  return new Date(now + credentialTokenTtlMs(purpose)).toISOString();
}

/**
 * Is this token still usable?
 *
 * BOTH CONDITIONS, ALWAYS, and this function exists so that no caller can
 * check one and forget the other. Expiry without single-use lets a leaked link
 * be replayed for a day; single-use without expiry lets one that was never
 * clicked sit valid forever.
 *
 * This decides nothing about WHETHER TO SAY SO. A consumed token and an
 * expired one and one that never existed all get the same answer from the
 * route — see `AUTH_AMBIGUOUS_ANSWER`.
 */
export function credentialTokenUsable(
  token: { expiresAt: string; consumedAt: string | null },
  now: number,
): boolean {
  if (token.consumedAt !== null) return false;
  const expires = Date.parse(token.expiresAt);
  return Number.isFinite(expires) && expires > now;
}

/**
 * How many bytes of entropy a token carries.
 *
 * 32 bytes, base64url — the same order as a session id, and enough that
 * guessing is not a strategy against any rate limit anybody would set. Named
 * here rather than at the call site so a future second issuer cannot pick a
 * shorter one and have nothing to disagree with.
 */
export const CREDENTIAL_TOKEN_BYTES = 32;

// ---------------------------------------------------------------------------
// The password itself
// ---------------------------------------------------------------------------

/**
 * The rules, and the absence of the rules people expect.
 *
 * A LENGTH FLOOR AND NOTHING ELSE. No "must contain a digit", no "must contain
 * a symbol", no forced rotation. Composition rules push people towards
 * `Password1!` and away from the long passphrase that is actually strong; this
 * is settled guidance (NIST SP 800-63B) and the reason it is worth writing
 * down is that a future reviewer WILL ask for the digit.
 *
 * A CEILING TOO, and it is not about strength. argon2id is deliberately
 * expensive, so an unbounded input is a CPU exhaustion vector: a megabyte
 * password is a denial of service with a login form in front of it. 256 is far
 * past any real passphrase.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 256;

/** What the form says BEFORE somebody types, so the floor is never a
 *  surprise discovered by being refused. */
export const PASSWORD_RULE_NOTE = `At least ${PASSWORD_MIN_LENGTH} characters. Length is the only rule — a phrase you can remember is stronger than something short and complicated.`;

/** The one refusal a password can earn, and it names the rule rather than
 *  the failure. Never echoes what was typed. */
export const PASSWORD_REFUSAL = `That password is too short — ${PASSWORD_MIN_LENGTH} characters or more, please.`;

/**
 * Whether a typed password may be hashed at all.
 *
 * MEASURED IN CODE POINTS, not UTF-16 units, so an emoji or an accented
 * character counts once rather than twice — a floor that counted surrogate
 * pairs as two would quietly let a shorter password through for anybody not
 * typing ASCII.
 */
export function passwordAcceptable(password: string): boolean {
  const points = [...password].length;
  return points >= PASSWORD_MIN_LENGTH && points <= PASSWORD_MAX_LENGTH;
}

/**
 * The argon2id parameters, published rather than passed.
 *
 * WHY THEY ARE A CONSTANT AND NOT AN ARGUMENT: the parameters are the part of
 * a password store that DECAYS. Hardware gets faster, the numbers that were
 * expensive stop being expensive, and the only way to notice is to compare
 * what a stored row was hashed with against what today's rule says. A verifier
 * encodes its own parameters, so a sign-in can read them, compare them to
 * these, and rehash in place when they are behind — without asking anybody to
 * reset anything.
 *
 * The values follow OWASP's argon2id guidance (19 MiB, t=2, p=1), which is the
 * second of its listed configurations — chosen over the 46 MiB one because
 * this runs on a Worker, where memory per invocation is the binding
 * constraint and a parameter set that cannot execute is not a stronger one.
 * That trade is exactly the kind of thing that needs to be written down beside
 * the number rather than remembered.
 */
export const ARGON2ID_PARAMS = {
  memoryKiB: 19_456,
  iterations: 2,
  parallelism: 1,
} as const;

/** Whether a stored verifier was made with today's parameters. False means
 *  rehash on next successful sign-in — not refuse, and not force a reset. */
export function verifierIsCurrent(encoded: string): boolean {
  const m = /\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(encoded);
  if (!m) return false;
  return (
    Number(m[1]) >= ARGON2ID_PARAMS.memoryKiB &&
    Number(m[2]) >= ARGON2ID_PARAMS.iterations &&
    Number(m[3]) >= ARGON2ID_PARAMS.parallelism
  );
}

// ---------------------------------------------------------------------------
// What every auth endpoint says
// ---------------------------------------------------------------------------

/**
 * THE ONE ANSWER, for every outcome an attacker would like to tell apart.
 *
 * A sign-up for an address that already has an account, a reset for one that
 * has none, a token that expired, a token that was already used, a token that
 * never existed: all of these get this, with a 202.
 *
 * Here that is nearly free, because openproduct STRUCTURALLY cannot tell most
 * of them apart — it never learns which addresses exist. The residue this
 * constant exists for is the part that is not structural: the token outcomes,
 * which openproduct CAN distinguish and must not.
 *
 * ONE STRING RATHER THAN A SENTENCE PER HANDLER is the point. Three handlers
 * writing three sympathetic messages is how the difference leaks — not through
 * a status code somebody audited, but through wording nobody thought of as an
 * oracle.
 */
export const AUTH_AMBIGUOUS_ANSWER =
  "If that address needs an email from us, it is on its way. Check your inbox, and your spam folder.";

/**
 * The refusal for a wrong password on sign-in.
 *
 * SAYS NEITHER WHICH HALF WAS WRONG. "No account with that address" tells a
 * stranger which addresses are registered here; "wrong password" tells them
 * they have found one.
 */
export const SIGN_IN_REFUSAL = "That email and password do not match an account here.";

/**
 * What a person is told when they follow a link that no longer works.
 *
 * ONE SENTENCE FOR THREE CAUSES — expired, already used, never existed —
 * because telling them apart is an oracle, and because the ACTION is the same
 * in all three: ask for a new one. A message that distinguished them would be
 * more informative and no more useful.
 */
export const TOKEN_SPENT_NOTE =
  "That link no longer works. Links expire, and each one can be used once — ask for a new one and we will send it.";

// ---------------------------------------------------------------------------
// AC1 — sign-up and verification, and the seam they ride
// ---------------------------------------------------------------------------

/**
 * WHAT AC1 DISCOVERED, AND HOW IT CHANGED AC0'S PLAN FOR THE BETTER.
 *
 * AC0 designed a seam capability openproduct would ask the platform for: hold
 * this address against this token, send, and give me a subject id back. Then
 * AC1 went looking for where to add it and found it already there.
 *
 * The platform's identity worker has magic-link login:
 *
 *   POST /v1/auth/login/start     { email }                → { challengeId, … }
 *   POST /v1/auth/login/complete  { challengeId, code }    → { token, user }
 *
 * It already holds the address, already sends the mail, and already mints or
 * finds the subject. openproduct needs NO new platform endpoint at all — it
 * needs to USE the estate's own account-creation path.
 *
 * AND THAT SETTLES OL-7'S HARDEST REQUIREMENT FOR FREE. "One subject id per
 * person, whichever door they used" was going to need a merge rule keyed on a
 * verified address — the one piece of state openproduct refuses to hold. It
 * does not need one: the platform is the only thing on this estate that ever
 * creates a subject, so somebody who signs up here with a password and later
 * continues with Orunbase arrives at the same subject because there was only
 * ever one path to making it.
 *
 * ─── WHAT OPENPRODUCT'S OWN ROW IS FOR ───────────────────────────────────
 *
 * A BINDING, NOT A CREDENTIAL. The platform's challenge proves the address;
 * openproduct's row remembers which password was waiting for that challenge.
 * The row alone authorises nothing — consuming it requires completing the
 * platform's challenge with the code from the mail, which openproduct never
 * sees until somebody types it back.
 *
 * SO `token_hash` HOLDS THE HASH OF A CHALLENGE ID, and that is a refinement
 * of AC0's column rather than the use AC0 wrote for it. AC0's comment says
 * "the hash, never the token", meaning a stored secret. A challenge id is not
 * secret — the platform's own code says so — so that sentence is still true
 * here and no longer load-bearing. What carries the weight instead is that the
 * row is not a credential: reading it gets you a hashed password you cannot
 * attach to anybody without the code.
 *
 * The alternative was for openproduct to mint its own secret and require it
 * back at verification, which is stronger against a stolen code and breaks the
 * ordinary case: people read mail on their phone and finish on their laptop. A
 * scheme that only works on one device is a scheme people route around.
 *
 * ─── THE ADDRESS EXISTS ONLY INSIDE ONE REQUEST, IN ONE WORKER ───────────
 *
 * Only the GATEWAY can reach the platform's API — core holds a database
 * binding and nothing else, which is an existing boundary on this estate and
 * not one AC1 invented. So the address is typed, forwarded to the platform,
 * and gone when the request ends. Core never receives it. The database has
 * nowhere to put it (AC0). That is I3 held by architecture rather than by
 * care.
 */

/** The platform's magic-link endpoints, named here so both halves of
 *  openproduct agree about them and neither hardcodes a path. */
export const PLATFORM_LOGIN_START_PATH = "/v1/auth/login/start";
export const PLATFORM_LOGIN_COMPLETE_PATH = "/v1/auth/login/complete";

/** openproduct's own two, on the PUBLIC plane: somebody signing up has no
 *  subject yet, so there is no actor to authenticate. */
export const SIGN_UP_PATH = "/v1/openproduct/auth/sign-up";
export const VERIFY_PATH = "/v1/openproduct/auth/verify";

/**
 * What the platform hands back when a challenge completes.
 *
 * READ NARROWLY, AND THE NARROWING IS THE POINT. The real response carries
 * `user.email` — openproduct asked for a subject and the platform, which has
 * no reason to know openproduct's rules, sends the address along with it. So
 * this type is the shape openproduct KEEPS, and `narrowCompletion` below is
 * the one place the rest is dropped.
 *
 * `deliverDigests` already applies exactly this discipline to the outbound
 * half — "anything more in the body is ignored rather than logged, because the
 * only shapes it could take that we do not already have are facts about how
 * people are reached". This is the inbound counterpart.
 */
export interface PlatformCompletion {
  readonly subjectId: string;
}

/**
 * Take a subject id out of the platform's answer and leave everything else.
 *
 * A FUNCTION RATHER THAN A DESTRUCTURE AT THE CALL SITE, so there is one place
 * to look and one place to test. A destructure is the same code until somebody
 * adds a second call site and spreads the object.
 */
export function narrowCompletion(body: unknown): PlatformCompletion | null {
  if (!body || typeof body !== "object") return null;
  const data = "data" in body ? (body as { data: unknown }).data : body;
  if (!data || typeof data !== "object") return null;
  const user = (data as { user?: unknown }).user;
  if (!user || typeof user !== "object") return null;
  const id = (user as { id?: unknown }).id;
  if (typeof id !== "string" || id.length === 0) return null;
  return { subjectId: id };
}

/**
 * How fast somebody may try, and it is TIGHTER THAN THE READ PLANE on purpose.
 *
 * R1 asked for "its own velocity rules, by address and by IP, tighter than the
 * read plane". By IP is what the gateway can enforce without holding anything;
 * BY ADDRESS IT CANNOT, because it would have to remember addresses to count
 * them — which is the whole thing openproduct refuses to do.
 *
 * That is not a gap, it is where the limit belongs: the PLATFORM holds the
 * address, so the platform is the only side that can rate-limit by it, and it
 * already does for its own magic-link flow. openproduct limits what openproduct
 * can see. Written down because "by address" is in R1 and a reader should not
 * have to work out why it is absent here.
 */
export const SIGN_UP_PER_IP_PER_HOUR = 10;
export const VERIFY_PER_IP_PER_HOUR = 30;

/** What a sign-up is refused with when it is going too fast. Deliberately the
 *  same shape as every other refusal here: it names no address and reveals no
 *  outcome. */
export const AUTH_TOO_FAST =
  "Too many attempts from here. Wait a little and try again.";

/** Is this a plausible address to hand the platform?
 *
 *  DELIBERATELY LOOSE. openproduct is not the authority on what an address is
 *  — the platform is, and it validates again. A stricter rule here would
 *  reject somebody the platform would have accepted, and the failure would be
 *  openproduct's to explain and nobody's to fix. This exists only to keep the
 *  obviously-not-an-address out of a network call. */
export function plausibleAddress(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 3 && trimmed.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

// ---------------------------------------------------------------------------
// AC3 — linking, and the reset that was already built
// ---------------------------------------------------------------------------

/**
 * WHY THERE IS NO RESET FLOW HERE, AND WHY THAT IS THE MILESTONE RATHER THAN
 * A GAP IN IT.
 *
 * AC0's header says "AC1 opens sign-up and verification, AC2 sign-in, AC3
 * reset", and a reader arriving at AC3 expecting a third flow is arriving at
 * the right place with the wrong shape in mind. Write out what a reset would
 * have to do, step by step:
 *
 *   somebody types their address → openproduct asks the platform to send a
 *   code → they type the code back → the platform says which subject that
 *   address is → openproduct writes a new password against that subject.
 *
 * That is `sign-up` and `verify`, unchanged, in that order. Not "similar to":
 * the same two handlers, the same two seam calls, the same ambiguous answer,
 * the same token row. The only difference a separate flow could have is
 * WHERE the new password is typed — before the code rather than after it —
 * and `writeCredential` is an UPSERT precisely so that the earlier ordering
 * works for somebody who already has a password:
 *
 *   "the conflict case is a real one rather than defensive padding: somebody
 *    who signed up, forgot, and signed up again with a new password lands
 *    here twice. The LAST verified password wins."
 *
 * So a reset flow would be a second copy of a working path, differing in a
 * button label, doubling the surface that must stay ambiguous, and adding a
 * second way to write a credential where AC3's whole other half is proving
 * there is exactly one. It is not built.
 *
 * ─── WHICH LEAVES THE `reset` PURPOSE UNUSED, DELIBERATELY ───────────────
 *
 * `CREDENTIAL_TOKEN_PURPOSES` still has both members, `RESET_TOKEN_TTL_MS` is
 * still 30 minutes, and the check constraint in the schema still admits both.
 * Nothing issues a `reset` token and nothing consumes one.
 *
 * The vocabulary stays for two reasons, and neither is sentiment. It is what
 * makes `consumeCredentialToken(hash, "verify", at)` a REAL guard — a purpose
 * column with one legal value cannot refuse anything, and the db lane's *"a
 * reset link cannot set a sign-up's password"* becomes a test of nothing. And
 * dropping it is a migration against a check constraint to delete a value no
 * row has ever held, which buys a shorter enum and costs a schema change.
 *
 * ─── WHAT AC3 SHIPS INSTEAD: THE SENTENCE ────────────────────────────────
 *
 * A path that exists and cannot be found is not a path. Somebody who forgot
 * their password will look for the words "forgot" and will not guess that
 * "Create account" is where a reset lives. So the reset is a piece of COPY on
 * the surface that has the two tabs, and this is that copy — here rather than
 * in the component, because it states a rule of the system (one door, and the
 * mail is what proves you) rather than a piece of modal chrome.
 *
 * It says what happens BEFORE it happens. "Create the account again" reads as
 * a warning about losing what you have, so the sentence answers that in the
 * same breath: the account is the same one, and only the password moves.
 */
export const PASSWORD_RESET_NOTE =
  "Use Create account with the same address. It is the same account — the code we email you sets a new password, and your profile, upvotes and comments stay where they are.";

/** The control that reaches it, named here so the modal and the test that
 *  pins the modal cannot drift apart on the one word somebody searches for. */
export const PASSWORD_RESET_PROMPT = "Forgot your password?";
