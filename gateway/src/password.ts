// argon2id, and the one place a password is ever in the clear (AC1).
//
// ─── WHY THIS IS A DEPENDENCY AND NOT WEBCRYPTO ──────────────────────────
//
// workerd's WebCrypto has PBKDF2 and no argon2, so using only what is already
// here would have meant PBKDF2 — which is genuinely weaker against the attack
// that matters for a password store. PBKDF2 is cheap to parallelise on a GPU;
// argon2id is memory-hard specifically so it is not. R1 named argon2id and AC0
// published its parameters, and quietly substituting a weaker primitive under
// the same label would be the worst available outcome: the documents would
// still say argon2id.
//
// So: one WASM dependency, `hash-wasm`, measured before it was adopted rather
// than after.
//
//   82ms per hash at AC0's parameters (19 MiB, t=2, p=1)
//   the encoded output is `$argon2id$v=19$m=19456,t=2,p=1$…`, which is
//   exactly the shape `verifierIsCurrent` parses
//
// 82ms is inside a Worker's CPU budget with a great deal of room, and it lands
// on a request that is already waiting on a network round trip to the
// platform. It is also, deliberately, expensive: that is the entire point of
// the algorithm, and it is why `passwordAcceptable` caps the input length —
// an unbounded password would turn this into a denial of service with a login
// form in front of it.
//
// ─── THE SALT IS PER PASSWORD AND THE PARAMETERS TRAVEL WITH IT ──────────
//
// The encoded form carries its own salt and parameters, which is what lets
// `verifierIsCurrent` notice a verifier hashed cheaply years ago and rehash it
// on the next successful sign-in — without asking anybody to reset a password
// they still know.

import { argon2id, argon2Verify } from "hash-wasm";

import { ARGON2ID_PARAMS } from "@openproduct/contracts";

/** How many bytes of salt. 16 is the argon2 recommendation and what every
 *  reference implementation uses; there is no reason to be clever here. */
const SALT_BYTES = 16;

/**
 * Hash a password for storage.
 *
 * THE PLAINTEXT ENDS HERE. It arrives on one gateway request, becomes an
 * encoded verifier, and the verifier is what crosses to core. Nothing
 * downstream — no handler, no row, no log line — ever holds what somebody
 * typed.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return argon2id({
    password: plaintext,
    salt: crypto.getRandomValues(new Uint8Array(SALT_BYTES)),
    parallelism: ARGON2ID_PARAMS.parallelism,
    memorySize: ARGON2ID_PARAMS.memoryKiB,
    iterations: ARGON2ID_PARAMS.iterations,
    hashLength: 32,
    outputType: "encoded",
  });
}

/**
 * Check a typed password against a stored verifier (AC2's read, shipped here).
 *
 * SWALLOWS ITS OWN FAILURES INTO `false`. A malformed verifier, an algorithm
 * the library does not know, a truncated row: all of them mean "this password
 * does not open this account", and none of them should reach a caller as a
 * distinguishable error. A sign-in path that answered differently for "wrong
 * password" and "corrupt row" would be telling a stranger which accounts have
 * something interesting wrong with them.
 *
 * The comparison inside is constant-time; that is the library's job and the
 * reason not to hand-roll it.
 */
export async function verifyPassword(plaintext: string, encoded: string): Promise<boolean> {
  try {
    return await argon2Verify({ password: plaintext, hash: encoded });
  } catch {
    return false;
  }
}
