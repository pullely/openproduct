// The intent that survives sign-in (openproduct-worldclass FR3).
//
// Six controls bounce a signed-out visitor through the sign-in door. Before
// this milestone the ADDRESS came back and the ACT did not, so somebody who
// upvoted signed-out landed looking at the arrow they had already pressed,
// unpressed. What is pinned here is the record that closes that, and — more
// carefully — the three things that record must never become:
//
//   - it must never SUBTRACT, so a stale replay cannot withdraw something the
//     visitor did in another tab;
//   - it must never be written for a CROSS-SITE post, which would hand back
//     exactly the CSRF that `SameSite=Lax` closes;
//   - it must never be able to LOSE THE ADDRESS, which worked before FR3 and
//     has to keep working when FR3 has nothing to say.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { sanitizeReturnTo } from "@openproduct-web/app/auth/auth";
import {
  PENDING_COOKIE,
  PENDING_MAX_AGE_SECONDS,
  RESUME_PATH,
  bounceTarget,
  decodePending,
  encodePending,
  resumeDestination,
  sameOriginPost,
  type PendingAct,
} from "@openproduct-web/app/me/pending";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
/** The file with its prose removed — a guard about code must not read the
 *  comment that names the thing the code rejects. */
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const headers = (site: string | null) => ({
  headers: { get: (name: string) => (name === "sec-fetch-site" ? site : null) },
});

const ACTS: PendingAct[] = [
  { act: "endorse", slug: "my-product" },
  { act: "save", slug: "my-product" },
  { act: "follow", kind: "topic", value: "devtools" },
  { act: "comment-vote", postId: "8f14e45f-ceea-467a-9c2b-1e9f5a3d0c77" },
];

describe("the record survives the round trip", () => {
  it("round-trips every act it can carry", () => {
    for (const act of ACTS) {
      expect(decodePending(encodePending(act))).toEqual(act);
    }
  });

  it("encodes to something a cookie can hold", () => {
    // base64url: no `;`, no `,`, no whitespace, no `=` padding — the four
    // characters that would end the value early or need quoting.
    for (const act of ACTS) {
      expect(encodePending(act)).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("refuses everything that is not one of its four shapes", () => {
    const refused = [
      null,
      undefined,
      "",
      "not-base64!!",
      encodePending({ act: "endorse", slug: "my-product" }) + "%%",
      btoa(JSON.stringify(null)),
      btoa(JSON.stringify(["endorse", "my-product"])),
      btoa(JSON.stringify({ act: "wander", slug: "my-product" })),
      btoa(JSON.stringify({ act: "endorse" })),
      btoa(JSON.stringify({ act: "endorse", slug: "a slug with spaces" })),
      btoa(JSON.stringify({ act: "endorse", slug: "../../etc/passwd" })),
      btoa(JSON.stringify({ act: "follow", kind: "planet", value: "devtools" })),
      btoa(JSON.stringify({ act: "follow", kind: "topic", value: "!!" })),
      btoa(JSON.stringify({ act: "comment-vote", postId: "not-a-uuid" })),
      "A".repeat(513),
    ];
    const accepted = refused.filter((raw) => decodePending(raw as string) !== null);
    expect(accepted).toEqual([]);
  });

  it("re-validates on the way IN, not only on the way out", () => {
    // The cookie is HttpOnly, so this is defence in depth — the same depth
    // `sanitizeReturnTo` gets applied to the return cookie two files away.
    // The point is that a record can never reach the gateway carrying
    // something the route that wrote it would have refused.
    expect(decodePending(btoa(JSON.stringify({ act: "endorse", slug: "x".repeat(65) })))).toBeNull();
    expect(decodePending(btoa(JSON.stringify({ act: "endorse", slug: "" })))).toBeNull();
  });
});

describe("it can only ever ADD", () => {
  // THE INVARIANT. There are four kinds, not six: a signed-out page renders
  // every control unvoted, unsaved and unfollowed (I6), so the only act a
  // bounced visitor can have been performing is the one that adds. A record
  // that could subtract would be a replay able to withdraw an endorsement
  // somebody cast in another tab in the ten minutes since — a thing no reader
  // would connect to anything they did.
  it("has no withdrawal shape at all", () => {
    for (const act of ["unendorse", "unsave", "unfollow"]) {
      expect(decodePending(btoa(JSON.stringify({ act, slug: "my-product" })))).toBeNull();
    }
  });

  it("carries no direction that could be flipped", () => {
    // Not `{ on: false }` refused at the boundary — no `on` field EXISTS, so
    // there is nothing to flip and nothing to get wrong later.
    for (const act of ACTS) {
      expect(Object.keys(act)).not.toContain("on");
    }
    expect(code("me/pending.ts")).not.toMatch(/\bon\s*[:?]/);
  });

  it("is never written by the two routes that only subtract", () => {
    for (const file of ["me/unendorse/route.ts", "me/unsave/route.ts"]) {
      expect(read(file)).not.toContain("pending");
    }
  });

  it("is written by follow and comment-vote only in the `on` direction", () => {
    expect(code("me/follow/route.ts")).toContain("on ? ({ act: \"follow\"");
    expect(code("me/comment-vote/route.ts")).toContain("...(on ? { pending:");
  });

  it("replays only the adding direction, whatever the record says", () => {
    // `setFollow` and `setCommentVote` each take a boolean. The replay passes
    // a literal `true` — it does not read one from the record, because the
    // record does not have one to read.
    const resume = code("me/resume/route.ts");
    expect(resume).toContain("setFollow(token, act.kind, act.value, true)");
    expect(resume).toContain("setCommentVote(token, act.postId, true)");
    expect(resume).not.toContain("false");
  });
});

describe("it is never written for a cross-site post", () => {
  // `SameSite=Lax` is what stops a cross-site form post from acting as
  // somebody: the session cookie does not travel, the act route sees no
  // session, and it bounces. Replaying that bounce would hand the CSRF back —
  // evil.com posts to /me/endorse, the visitor signs in for their own reasons,
  // and casts a vote they never asked for.
  it("accepts only what the browser calls same-origin", () => {
    expect(sameOriginPost(headers("same-origin"))).toBe(true);
    const wrong = ["cross-site", "same-site", "none", ""].filter((site) =>
      sameOriginPost(headers(site)),
    );
    expect(wrong).toEqual([]);
  });

  it("treats a MISSING header as no", () => {
    // An old browser keeps the behaviour this milestone replaces, which
    // forgets the intent but has never once performed the wrong one.
    expect(sameOriginPost(headers(null))).toBe(false);
  });

  it("guards the one place the cookie is written", () => {
    const act = code("me/act.ts");
    expect(act).toContain("sameOriginPost(request)");
    expect(act).toContain('outcome === "signin" && where.pending && sameOriginPost(request)');
    // And the JSON branch returns before any of it: `use-toggle` answers a 401
    // by submitting the form, so the record is written by that second, real
    // POST rather than by two code paths that could drift.
    expect(act.indexOf("if (wantsJson(request))")).toBeLessThan(
      act.indexOf("sameOriginPost(request)"),
    );
  });
});

describe("it cannot lose the address", () => {
  it("returns the plain address when there is no record", () => {
    expect(bounceTarget("/my-product#vote-my-product", false)).toBe("/my-product#vote-my-product");
  });

  it("carries the address THROUGH the replay when there is one", () => {
    const target = bounceTarget("/my-product#vote-my-product", true);
    expect(target.startsWith(`${RESUME_PATH}?return_to=`)).toBe(true);
    // The fragment is the whole point of the address — it is the control they
    // pressed — and it only survives a query parameter if it is encoded.
    expect(target).not.toContain("#");
    expect(resumeDestination(new URL(target, "https://openproduct.live").searchParams.get("return_to")))
      .toBe("/my-product#vote-my-product");
  });

  it("keeps the resume path a LEGAL return target", () => {
    // The reason this route is not under `/auth/`. `sanitizeReturnTo` refuses
    // that prefix on purpose, so a resume route living there would have been
    // stripped out of the very parameter it has to ride — the bounce would
    // have silently gone back to being FR3-less, and every test above would
    // still have passed.
    expect(sanitizeReturnTo(RESUME_PATH)).toBe(RESUME_PATH);
    expect(sanitizeReturnTo(bounceTarget("/my-product", true))).not.toBeNull();
  });

  it("sanitizes the destination on the way back out", () => {
    const escapes = ["//evil.example", "https://evil.example", "/\\evil", "/auth/callback", "/signin"];
    const leaked = escapes.filter((raw) => resumeDestination(raw) !== "/");
    expect(leaked).toEqual([]);
    expect(resumeDestination(null)).toBe("/");
  });

  it("redirects even when it has nothing to replay", () => {
    // No record, an expired record, a dead session, an unreachable gateway:
    // every one ends in the same redirect to the same address. The act is the
    // thing this route may lose; the destination is not.
    const resume = code("me/resume/route.ts");
    // The response is built FIRST, so no early return can exist that does not
    // carry it.
    expect(resume.indexOf("NextResponse.redirect")).toBeLessThan(resume.indexOf("decodePending"));
    expect(resume.match(/return res;/g)?.length).toBe(3);
    expect(resume).not.toMatch(/return (?!res;)/);
  });
});

describe("the record is spent, and short-lived", () => {
  it("is cleared in the same response that reads it", () => {
    const resume = code("me/resume/route.ts");
    expect(resume).toContain(`res.cookies.set(PENDING_COOKIE, "", cookieAttributes(0))`);
    // Cleared BEFORE the act is even decoded — a record that survived a failed
    // replay would fire again on the visitor's next sign-in, days later, on a
    // page they are not looking at.
    expect(resume.indexOf("cookieAttributes(0)")).toBeLessThan(resume.indexOf("decodePending"));
  });

  it("lives exactly as long as the sign-in it is waiting for", () => {
    // The same window the OAuth handshake gets, because it is the same wait: a
    // consent screen, or a password and possibly a mailed code.
    expect(PENDING_MAX_AGE_SECONDS).toBe(600);
  });

  it("is HttpOnly, host-scoped and Secure, like every other cookie here", () => {
    expect(code("me/act.ts")).toContain("cookieAttributes(PENDING_MAX_AGE_SECONDS)");
    expect(PENDING_COOKIE.startsWith("op_")).toBe(true);
  });

  it("answers no-store", () => {
    // A per-visitor answer about one session. An intermediary that cached it
    // would pin every later visitor to somebody else's redirect.
    expect(code("me/resume/route.ts")).toContain('res.headers.set("cache-control", "no-store")');
  });
});

describe("neither sign-in door had to learn anything", () => {
  // The whole reason the record rides `return_to`: the platform round trip
  // stores its destination in `op_oauth_return` and the callback redirects
  // there; the password modal calls `location.assign` on the same value. One
  // reader, both doors, and no door-specific branch to keep in step.
  it("the platform callback is untouched by FR3", () => {
    expect(read("auth/callback/route.ts")).not.toContain("pending");
    expect(read("auth/callback/route.ts")).not.toContain("resume");
  });

  it("the password door is untouched by FR3", () => {
    expect(read("auth/password/route.ts")).not.toContain("pending");
    expect(read("shell/auth-modal.tsx")).not.toContain("pending");
  });

  it("and both still send the visitor wherever `return_to` says", () => {
    expect(read("auth/start/route.ts")).toContain("sanitizeReturnTo");
    expect(read("shell/auth-modal.tsx")).toContain("window.location.assign(returnTo");
  });
});
