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
    // Was a line under the field. OPR1 allows no helper text under a control
    // (design.md §2 rule 9), so the floor is said IN the field somebody is
    // about to fill — the new-password placeholder — and enforced by the
    // field's own `minLength`, both from the contract's number.
    expect(MODAL).toContain("placeholder={creating ? `At least ${PASSWORD_MIN_LENGTH} characters` : ");
    expect(MODAL).toContain("minLength={creating ? PASSWORD_MIN_LENGTH : undefined}");
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

describe("OPR1 — the card is the board's, and says what is true", () => {
  /** The file with its comments removed: a guard about markup must not read
   *  prose, because the header explains the wording it rejected. */
  const CODE = MODAL.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("offers the two ways in that exist, Orunbase first, across an OR rule", () => {
    const platform = CODE.indexOf("Continue with Orunbase");
    const rule = CODE.indexOf('uppercase text-muted-foreground">or</span>');
    const email = CODE.indexOf('type="email"');
    expect(platform).toBeGreaterThan(-1);
    expect(rule).toBeGreaterThan(platform);
    expect(email).toBeGreaterThan(rule);
    // The platform's door is the ink button and still an ANCHOR to the
    // handshake, carrying the way back.
    expect(CODE).toMatch(/href=\{returnTo \? `\/auth\/start\?return_to=\$\{encodeURIComponent\(returnTo\)\}` : "\/auth\/start"\}\s*className=\{PLATFORM\}/);
    expect(CODE).toMatch(/const PLATFORM =\s*"[^"]*bg-primary[^"]*text-primary-foreground/);
  });

  it("labels the email door for what it does: a password, not a link", () => {
    // The board's second door reads "Email me a sign-in link". Nothing here
    // mails a link: sign-in is an email and a password, and a sign-up mails
    // a code to type. The card must not promise the board's wording.
    expect(CODE).toContain('type="password"');
    expect(CODE).not.toMatch(/sign-in link|magic link|Email me a/i);
    expect(CODE).toContain('{creating ? "Create account" : "Sign in"}');
    expect(CODE).toContain("Six-digit code");
    expect(CODE).toContain('autoComplete="one-time-code"');
  });

  it("draws a refusal in red, and nothing that is not a failure", () => {
    // design.md §2 rule 8: red is danger only. A failed sign-in and a wrong
    // code are refusals; the reset's explanation and "check your inbox" are
    // not, and keep the body ink.
    expect(CODE).toContain('refused ? "text-destructive" : "text-copy"');
    const refuse = CODE.slice(CODE.indexOf("function refuse("));
    expect(refuse.slice(0, refuse.indexOf("\n  }"))).toMatch(/setRefused\(true\);\s*setNote\(sentence\);/);
    // Both refusals go through it…
    expect(CODE.match(/refuse\(answer\.note \?\? SIGN_IN_REFUSAL\)/g)).toHaveLength(2);
    // …the ambiguous sign-up answer and the reset note do not…
    expect(CODE).toContain("setNote(answer.note ?? AUTH_AMBIGUOUS_ANSWER);");
    expect(CODE).toMatch(/setRefused\(false\);\s*setNote\(PASSWORD_RESET_NOTE\);/);
    // …and every new attempt starts clean.
    expect(CODE).toMatch(/setBusy\(true\);\s*setRefused\(false\);\s*setNote\(null\);/);
    // Red appears nowhere else in the card.
    expect(CODE.match(/text-destructive/g)).toHaveLength(1);
  });

  it("has a check-your-inbox state with the address and a way back", () => {
    expect(CODE).toContain('stage === "code" ? "Check your inbox"');
    expect(CODE).toContain("<MailIcon");
    // The address the mail went to, so a typo is caught on this screen.
    expect(CODE).toMatch(/<p className="[^"]*break-all[^"]*">\{email\}<\/p>/);
    expect(CODE).toContain("Use a different email");
    const back = CODE.slice(CODE.indexOf("function startOver("));
    const fn = back.slice(0, back.indexOf("\n  }"));
    expect(fn).toContain('setStage("form")');
    expect(fn).toContain("setChallengeId(null)");
    // Going back asks the gateway nothing.
    expect(fn).not.toMatch(/fetch\(|post\(/);
  });

  it("cannot be submitted empty or twice", () => {
    expect(CODE).toMatch(/stage === "code" \? code\.trim\(\)\.length > 0 : email\.trim\(\)\.length > 0 && password\.length > 0/);
    expect(CODE.match(/disabled=\{busy \|\| !ready\}/g)).toHaveLength(2);
  });

  it("switches between signing in and creating an account with one line, not tabs", () => {
    expect(CODE).toContain('{creating ? "Have an account?" : "New here?"}');
    expect(CODE).toContain('onClick={() => switchTo(creating ? "signin" : "create")}');
    expect(CODE).toContain('{creating ? "Sign in" : "Create an account"}');
    expect(CODE).not.toMatch(/\bTAB(_ON|_OFF)?\b/);
  });

  it("is one title: the page's h1 on /signin, an h2 over a scrim", () => {
    expect(CODE).toContain('const Title = inDialog ? "h2" : "h1";');
    expect(CODE.match(/<Title className=\{PAGE_TITLE\}>\{title\}<\/Title>/g)).toHaveLength(2);
    expect(CODE).not.toMatch(/<h[1-6]\b/);
  });

  it("is flat, with no illustration and no explainer", () => {
    // No drop shadow (rule 11): over the scrim the card wears an inset ring.
    expect(CODE).not.toMatch(/shadow-\[|shadow-(sm|md|lg|xl)/);
    expect(CODE).toContain('className="ring-1 ring-inset ring-foreground/10"');
    // The board's illustration panel and its "same account" line are not
    // drawn: the second would be false for an account made with a password.
    expect(CODE).not.toMatch(/op-visual|Same Orunbase account/);
    expect(CODE).not.toContain("Enter the six-digit code we sent.");
  });

  it("gives a phone 44px targets and fields that do not zoom", () => {
    expect(CODE).toMatch(/const PLATFORM =\s*"[^"]*max-sm:min-h-\[48px\]/);
    expect(CODE).toMatch(/const SUBMIT =\s*"[^"]*max-sm:min-h-\[48px\]/);
    expect(CODE).toMatch(/const CONFIRM =\s*"[^"]*max-sm:min-h-\[48px\]/);
    expect(CODE).toMatch(/const TEXT_ACT =\s*"[^"]*max-sm:min-h-\[44px\]/);
    // Every input is the design's 44px, 16px field.
    expect(CODE.match(/className=\{FIELD\}/g)).toHaveLength(3);
  });
});

describe("OPR1 — the sign-in failure notice", () => {
  const NOTICE = read("app/auth-notice.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("says what failed in red, on a flat card, with one action and a dismiss", () => {
    expect(NOTICE).toContain('<p className="m-0 text-[15px] font-semibold text-destructive">{copy.title}</p>');
    expect(NOTICE).toContain("rounded-[16px] bg-card");
    expect(NOTICE).not.toMatch(/border border-border|shadow-/);
    expect(NOTICE.match(/<a\b/g)).toHaveLength(1);
    expect(NOTICE).toContain('href="/signin"');
    expect(NOTICE).toContain('aria-label="Dismiss"');
    expect(NOTICE).toContain("<CloseIcon");
  });

  it("carries no heading: the page under it has the h1", () => {
    expect(NOTICE).not.toMatch(/<h[1-6]\b/);
  });

  it("still reads the reason on the client and strips it on dismiss", () => {
    expect(NOTICE).toContain('new URLSearchParams(window.location.search).get("auth_error")');
    expect(NOTICE).toContain('url.searchParams.delete("auth_error")');
    expect(NOTICE).toMatch(/max-sm:min-h-\[44px\]/);
    expect(NOTICE).toMatch(/max-sm:h-\[44px\] max-sm:w-\[44px\]/);
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

  it("is the card alone, centred: no illustration and no paragraph around it", () => {
    // Boards `SignIn` and `PhoneSignIn`, less the decorative panel.
    const markup = PAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(markup).toMatch(/<main className="[^"]*flex[^"]*justify-center[^"]*">\s*<SignInCard returnTo=\{returnTo\} \/>\s*<\/main>/);
    expect(markup).not.toMatch(/<p\b|<img\b|<svg\b|<h[1-6]\b/);
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
    // Offering a reset to somebody already creating an account is an answer
    // to a question they did not ask: while creating, the spot is empty (the
    // password floor moved into the field's placeholder with OPR1).
    expect(MODAL).toMatch(/\{creating \? null : \(\s*<button[\s\S]{0,300}onClick=\{offerReset\}[\s\S]{0,300}\{PASSWORD_RESET_PROMPT\}/);
    expect(MODAL.match(/\{PASSWORD_RESET_PROMPT\}/g)).toHaveLength(1);
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
