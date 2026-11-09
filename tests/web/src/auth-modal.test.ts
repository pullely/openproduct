// The design's modal, and the three flows it is the door for (AC2c).
//
// The web lane is module-level — no DOM — so a `.tsx` component is tested
// the way this lane has always tested one: by reading it. That is thinner
// than rendering it, and it is exactly right for what actually matters here,
// which is not "does the button click" but "does this surface say anything
// the layers underneath refused to say".
//
// The session vocabulary underneath IS exercised for real, because it is
// pure: `sessionKind`, `accessTokenStale` and `decodeSession` are the three
// functions the password door bends, and bending them wrongly is how a
// visitor gets signed out or sent down an OAuth refresh with a token no
// authorization server has heard of.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTH_AMBIGUOUS_ANSWER,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RESET_NOTE,
  PASSWORD_RESET_PROMPT,
  SIGN_IN_PATH,
} from "@openproduct/contracts";
import {
  accessTokenStale,
  decodeSession,
  encodeSession,
  sessionKind,
  type OpenproductSession,
} from "@openproduct-web/app/auth/auth";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(HERE, "../../../web/src");
const read = (file: string) => readFileSync(join(WEB_SRC, file), "utf-8");

const MODAL = read("app/shell/auth-modal.tsx");
const CHIP = read("app/shell/account-chip.tsx");
const ROUTE = read("app/auth/password/route.ts");

function session(over: Partial<OpenproductSession> = {}): OpenproductSession {
  return {
    subjectId: "usr_0123456789abcdef0123456789abcdef",
    displayName: "Ada",
    accessToken: "tok_platform",
    expiresAt: Date.now() + 60_000,
    ...over,
  };
}

describe("AC2c — the session knows which door it came through", () => {
  it("reads a cookie written before AC2c as the platform's", () => {
    // Every cookie in every browser right now has no `kind`. Reading a
    // missing field as the older meaning is the whole of why this ships
    // without signing anybody out.
    expect(sessionKind(session())).toBe("platform");
    expect(sessionKind(session({ kind: "platform" }))).toBe("platform");
    expect(sessionKind(session({ kind: "openproduct" }))).toBe("openproduct");
  });

  it("never calls an openproduct session STALE, because there is nothing to refresh", () => {
    // `accessTokenStale` sends `/auth/session` down the OAuth refresh path.
    // An `ops_` token has no authorization server behind it, so a true here
    // would mean asking a stranger to refresh something they never issued.
    const expired = { expiresAt: Date.now() - 60_000 };
    expect(accessTokenStale(session(expired))).toBe(true);
    expect(accessTokenStale(session({ ...expired, kind: "openproduct" }))).toBe(false);
  });

  it("ends an openproduct session at its expiry, with no refresh to save it", () => {
    // A platform session survives an expired access token when it carries a
    // refresh token. An openproduct one has no such second chance: past its
    // expiry the cookie is dead here, and the row in core says so too.
    const dead = { expiresAt: Date.now() - 1000 };
    expect(decodeSession(encodeSession(session({ ...dead, refreshToken: "r" })))).not.toBeNull();
    expect(
      decodeSession(encodeSession(session({ ...dead, kind: "openproduct", refreshToken: "r" }))),
    ).toBeNull();
  });

  it("refuses a cookie claiming a kind that does not exist", () => {
    const forged = { ...session(), kind: "admin" } as unknown as OpenproductSession;
    expect(decodeSession(encodeSession(forged))).toBeNull();
  });

  it("round-trips the kind, so a session does not change doors on a re-read", () => {
    const ours = session({ kind: "openproduct", accessToken: "ops_abc" });
    expect(decodeSession(encodeSession(ours))?.kind).toBe("openproduct");
  });
});

describe("AC2c — the modal is a door for three flows, not one", () => {
  it("offers sign in, create account, and the platform", () => {
    expect(MODAL).toContain('"sign-in"');
    expect(MODAL).toContain('"sign-up"');
    expect(MODAL).toContain('"verify"');
    expect(MODAL).toContain("Continue with Orunbase");
    expect(MODAL).toContain("/auth/start");
  });

  it("HAS NO NAME FIELD, which the design draws and this app cannot keep", () => {
    // SB0's finding, in a second place: what ships is what is real. A name
    // typed here has nowhere to go — openproduct stores no user record, and
    // AC1's seam contract carries `{ email, password }`. Collecting it to
    // discard it is R6's "fake" in its purest form.
    expect(MODAL).not.toMatch(/autoComplete="name"|placeholder="Ada/);
    // The closing line that pointed at /me was cut with the rest of the card's explanatory copy.
  });

  it("renders the gateway's sentence and never composes its own refusal", () => {
    // Every way a sign-in fails was collapsed into one sentence on purpose,
    // two layers down. A modal that wrote its own would be a second place
    // for the ambiguity to leak.
    expect(MODAL).toContain("SIGN_IN_REFUSAL");
    expect(MODAL).toContain("AUTH_AMBIGUOUS_ANSWER");
    expect(MODAL).not.toMatch(/No account with|Wrong password|not found/i);
  });

  it("advances to the code screen whether or not the address was known", () => {
    // The ambiguity has to survive the UI. A modal that only showed the code
    // step for real accounts would undo AC1's whole design with a branch.
    const signUp = /act: "sign-up"[\s\S]*?setStage\("code"\)/.exec(MODAL);
    expect(signUp).not.toBeNull();
    expect(signUp![0]).not.toMatch(/if \(/);
    expect(AUTH_AMBIGUOUS_ANSWER).toMatch(/check|inbox|email/i);
  });

  it("publishes the password floor where somebody is about to choose one", () => {
    // The rule note was replaced by a short hint built from the contract's minimum.
    expect(MODAL).toContain("At least {PASSWORD_MIN_LENGTH} characters.");
    expect(MODAL).toContain("PASSWORD_MIN_LENGTH");
    expect(PASSWORD_MIN_LENGTH).toBeGreaterThanOrEqual(10);
  });

  it("is a dialog a keyboard can leave", () => {
    // The card is now BOTH surfaces — the modal here and the whole of
    // `/signin` — so the dialog role is conditional on there being something
    // to close rather than baked in. A page you navigated to is not a dialog,
    // and announcing one that cannot be escaped is worse than announcing none.
    expect(MODAL).toContain('role: "dialog"');
    expect(MODAL).toContain('"aria-modal": "true"');
    expect(MODAL).toContain('event.key === "Escape"');
    expect(MODAL).toContain("firstField.current?.focus()");
    // A refusal that appears without the page moving has to be announced.
    expect(MODAL).toContain('aria-live="polite"');
  });

  it("is ONE card, so the page and the modal cannot drift apart", () => {
    // THE BUG THAT SPLIT IT. Signed-out acts bounced to `/auth/start`, which
    // is the first step of the OAuth handshake and not a door: pressing
    // `Post` under a comment produced an Orunbase consent card, and the
    // openproduct account somebody may have had was only reachable through
    // this modal, which they were never shown. The card is a page now too,
    // and both render the same component.
    expect(MODAL).toContain("export function AuthPanel");
    expect(MODAL).toContain("export function AuthModal");
    expect(MODAL).toMatch(/AuthModal[\s\S]*?<AuthPanel/);
    const page = read("app/signin/sign-in-card.tsx");
    expect(page).toContain('from "../shell/auth-modal"');
    expect(page).toContain("<AuthPanel");
    // And the page draws no dismiss: nothing is passed that would make it one.
    expect(page).not.toContain("onClose");
  });
});

describe("the door itself — `/signin`", () => {
  const PAGE = read("app/signin/page.tsx");

  it("resolves no actor, so the sign-in page is one document like every other", () => {
    // I6 applies here as much as to the launches. A page that redirected an
    // already-signed-in visitor would have to know who was asking.
    expect(PAGE).not.toMatch(/readSession|decodeSession|SESSION_COOKIE|cookies\(/);
    expect(PAGE).not.toContain("redirect(");
  });

  it("sanitizes the destination before it reaches an href", () => {
    // The value arrives in the query string and leaves on an anchor. Same-host
    // relative only, and the same function the handshake's own routes use.
    expect(PAGE).toContain("sanitizeReturnTo");
    expect(PAGE).toContain("return_to");
  });

  it("is a step and not a page a crawler should hold", () => {
    expect(PAGE).toContain("robots");
    expect(PAGE).toContain("index: false");
  });
});

describe("AC2c — I6 survives the modal", () => {
  it("keeps the sign-in control an ANCHOR, so the cached HTML does not vary", () => {
    // The one property the whole shell is built around: an anonymous page
    // renders byte-identically signed in and signed out. A button here would
    // have changed the markup; an anchor whose click is intercepted does not.
    //
    // RE-AIMED WHEN THE FLICKER FIX LANDED, and the property got stronger
    // rather than weaker. The branch used to be reached by an early return on
    // React state (`state.kind === "anonymous"`), which is what this scanned
    // for; now BOTH branches are always rendered and a class on `<html>`
    // decides which is displayed. So the anonymous markup is no longer merely
    // the same for every visitor — it is present for every visitor, signed in
    // or not, and `session-hint.test.ts` pins that half.
    const anonymous = /data-auth-branch="anonymous"[\s\S]*?<\/span>/m.exec(CHIP)?.[0] ?? "";
    expect(anonymous).toContain("<a");
    expect(anonymous).toContain("href={signInHref(returnTo)}");
    // The account chip's own trigger is a button, and it lives in the OTHER
    // branch — so this half of the markup still has none.
    expect(anonymous).not.toContain("<button");
  });

  it("lets a modified click through, so the link still behaves like one", () => {
    expect(CHIP).toContain("event.metaKey || event.ctrlKey || event.shiftKey");
  });
});

describe("AC2c — the browser never talks to the gateway", () => {
  it("proxies through this host, so no auth endpoint needs CORS", () => {
    expect(MODAL).toContain('"/auth/password"');
    expect(MODAL).not.toContain("openproductApiBase");
    expect(ROUTE).toContain("openproductApiBase()");
    // THE SYMBOL, not the literal — the third time this lane has learned the
    // lesson today. The route imports `SIGN_IN_PATH` from the contract, which
    // is the point: the address lives in one place and both sides read it
    // from there. A test scanning for the string would demand a hard-coded
    // path to pass, which is the opposite of what it should want.
    expect(ROUTE).toContain("SIGN_IN_PATH");
    expect(SIGN_IN_PATH).toBe("/v1/openproduct/auth/sign-in");
  });

  it("forwards field by field, so a client cannot widen the gateway's contract", () => {
    // A spread of whatever arrived would let a caller post keys the gateway
    // never agreed to read. Three shapes, named.
    expect(ROUTE).toContain('email: String(body.email ?? "")');
    expect(ROUTE).toContain('challengeId: String(body.challengeId ?? "")');
    expect(ROUTE).not.toMatch(/\.\.\.body/);
  });

  it("sets the cookie here and marks the door it came through", () => {
    expect(ROUTE).toContain("SESSION_COOKIE");
    expect(ROUTE).toContain("SESSION_TOKEN_PREFIX");
    expect(ROUTE).toContain('kind: "openproduct" as const');
  });

  it("writes no identity into the cookie it cannot have resolved", () => {
    // The sign-in answer is a token and an expiry, deliberately. Inventing a
    // subject id here would be the app asserting something nothing told it.
    expect(ROUTE).toContain('subjectId: ""');
    expect(ROUTE).toContain("displayName: null");
  });
});

describe("AC3 — the reset, on the surface that has the two tabs", () => {
  it("offers the words somebody who forgot will actually look for", () => {
    // The path existed before this milestone and could not be found. A person
    // who forgot their password searches a sign-in form for "forgot"; nobody
    // guesses that the tab marked Create account is the reset.
    expect(PASSWORD_RESET_PROMPT.toLowerCase()).toContain("forgot");
    expect(MODAL).toContain("PASSWORD_RESET_PROMPT");
  });

  it("switches to the tab that IS the reset rather than routing anywhere", () => {
    // The whole implementation, and the assertion is that it is that small:
    // set the tab, say why. A route, a token or a third stage here would be a
    // second way to write a credential, which is what AC3's other half spends
    // a file proving does not exist.
    const body = MODAL.slice(MODAL.indexOf("function offerReset"));
    const fn = body.slice(0, body.indexOf("\n  }") + 4);
    expect(fn).toContain('setTab("create")');
    expect(fn).toContain("setNote(PASSWORD_RESET_NOTE)");
    expect(fn).not.toMatch(/fetch\(|post\(|assign\(|href/);
  });

  it("shows it on the sign-in tab only, where the failure it answers happens", () => {
    // On the create tab the same spot carries the password rule, which is the
    // thing somebody typing a NEW password needs. Offering a reset to
    // somebody already creating an account is an answer to a question they
    // did not ask.
    // The create tab carries the short length hint (PASSWORD_MIN_LENGTH) rather than PASSWORD_RULE_NOTE.
    expect(MODAL).toMatch(/\{creating \? \([\s\S]{0,400}PASSWORD_MIN_LENGTH\} characters[\s\S]{0,400}\) : \([\s\S]{0,400}PASSWORD_RESET_PROMPT/);
  });

  it("promises the account survives, because 'create it again' does not read that way", () => {
    // The sentence has to answer the fear it creates in the same breath. A
    // person told to create their account again assumes they are about to
    // lose what is in it.
    expect(PASSWORD_RESET_NOTE).toMatch(/same account/i);
    expect(PASSWORD_RESET_NOTE).toMatch(/upvotes|comments|profile/i);
    expect(PASSWORD_RESET_NOTE).toMatch(/new password/i);
  });

  it("puts the note where a screen reader hears it", () => {
    // `setNote` is the modal's one message channel and it renders inside the
    // `aria-live` region. Switching a tab and silently changing the form
    // under somebody who cannot see it is the version of this that fails.
    expect(MODAL).toContain('aria-live="polite"');
    const live = MODAL.slice(MODAL.indexOf('role="status"'));
    expect(live.slice(0, 300)).toContain("{note}");
  });

  it("builds no reset route in the app either", () => {
    // The gateway lane pins that no `/auth/reset` exists upstream; this pins
    // that the app does not grow one in front of it.
    const routes = readdirSync(join(WEB_SRC, "app/auth"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    expect(routes).toEqual(["callback", "password", "session", "signout", "start"]);
  });
});
