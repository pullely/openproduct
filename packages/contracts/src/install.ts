// The install line (openproduct-worldclass PV2).
//
// One copyable command, where a maintainer has one to give:
// `npx create-kettle`, `docker run ghcr.io/acme/kettle`, `uvx kettle`.
//
// ─── IT IS AUTHORED, AND IT MAY NEVER BE DERIVED ─────────────────────────
//
// Every other fact on a listing has an observed or derived cousin, and this
// one must not. The estate could infer an install line — read `package.json`
// from a linked repository, find a `bin` entry, emit `npx <name>` — and it
// would be right most of the time.
//
// THE ASYMMETRY IS WHY NOT. A wrong observed licence is a wrong label beside
// a value; a reader loses a little trust and moves on. A wrong DERIVED SHELL
// COMMAND is something a person pastes into a terminal because this page
// presented it. The two failures are not comparable, and "right most of the
// time" is a sentence nobody should attach to a command they did not write.
//
// So the provenance is `authored`, by the maintainer, in their voice — and
// the frame says so, exactly as it does for a tagline. What this product
// vouches for is that a person typed it, which is a claim it can make.
//
// ─── ONE COMMAND. NOT A SCRIPT. ──────────────────────────────────────────
//
// A piped installer — `curl …/install.sh` into a shell — is a real and common
// way to ship software, and it is refused here. That is a product decision
// rather than a sanitisation: this estate's posture is that it does not ask a
// reader to trust something they cannot check, and a piped installer is
// precisely the command whose contents a reader cannot see before it runs. A
// maintainer who wants to distribute that way still can — on their own site,
// behind their own name. What this page will not do is hand it over as though
// somebody had checked it.
//
// The same rule takes out chaining and substitution, which is the shape a
// hostile line would take: `npm i thing; curl evil` reads as one innocuous
// command right up to the semicolon, at a glance, in a small box.
//
// NOTHING HERE IS EXECUTED BY US — the whole risk lands in the reader's
// terminal, which is exactly why presenting it is a responsibility rather
// than a convenience.

/** The ceiling. Long enough for a real `docker run` with a port and an image,
 *  short enough that the box stays one line at 375px. */
export const MAX_INSTALL_LINE = 160;

/**
 * What may never appear in an install line.
 *
 * Ordered by what each one buys an attacker, not alphabetically:
 *
 *   `|`       a pipe, which is the whole category above
 *   `;`       a second command, hiding after an innocuous first
 *   `&`       the same, plus backgrounding (covers `&&` without a second rule)
 *   backtick  and `$(` — substitution, which runs something to build the line
 *   newline   a script rather than a command
 *   `>` `<`   redirection, which writes files a reader did not expect
 */
export const FORBIDDEN_INSTALL = [
  { pattern: /[\r\n]/, why: "An install line is one command, not a script." },
  { pattern: /\|/, why: "A piped command hides what it runs — pipes are not accepted here." },
  { pattern: /;/, why: "A second command after a semicolon is not accepted." },
  { pattern: /&/, why: "Chained or backgrounded commands are not accepted." },
  { pattern: /[`]|\$\(/, why: "Command substitution is not accepted." },
  { pattern: /[<>]/, why: "Redirection is not accepted." },
] as const;

/**
 * Anything that renders as one thing and copies as another.
 *
 * The zero-width and bidirectional ranges are the interesting half. A
 * zero-width space between `npm` and `i` is invisible in the box and copies
 * into a terminal as a command nobody typed; a right-to-left override can
 * make a line read backwards from what it would run. Both are invisible to a
 * reviewer reading the studio field and to the maintainer who pasted it.
 */
const CONTROL = /[\u0000-\u001f\u007f\u00a0\u200b-\u200f\u202a-\u202e\u2028\u2029\u2066-\u2069\ufeff]/;

/**
 * Why this line cannot be published, or null.
 *
 * Returns the FIRST reason rather than all of them: unlike a gallery, where a
 * maintainer wants every problem at once, there is one field here, and one
 * fix at a time is how somebody edits one line.
 */
export function installLineRefusal(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return "An install line cannot be blank.";
  if (trimmed.length > MAX_INSTALL_LINE) {
    return `An install line is at most ${MAX_INSTALL_LINE} characters.`;
  }
  if (CONTROL.test(trimmed)) {
    return "An install line cannot contain control or invisible characters.";
  }
  for (const rule of FORBIDDEN_INSTALL) {
    if (rule.pattern.test(trimmed)) return rule.why;
  }
  return null;
}

/** The stored form: trimmed, inner whitespace collapsed. A line that copies
 *  differently from how it reads is the bug this prevents. */
export function normaliseInstallLine(line: string): string {
  return line.trim().replace(/[ \t]+/g, " ");
}

/** The label above the box. Names the act, not the field. */
export const INSTALL_HEADING = "Install";

/**
 * The note under the box.
 *
 * SAYS WHO WROTE IT, which is the whole provenance claim this field makes.
 * Not "verified", not "official" — a maintainer typed it, and that is a thing
 * this product can actually vouch for.
 */
export const INSTALL_NOTE = "Written by this listing's maintainers. Nothing here has run it.";

/** What the copy control says, and what it says after. */
export const INSTALL_COPY_LABEL = "Copy";
export const INSTALL_COPIED_LABEL = "Copied";
