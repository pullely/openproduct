// The inbox in the web layer (openproduct-launch NF0).
//
// The PHRASEBOOK is pinned in packages/contracts and the READS in tests/core.
// What is pinned here is what the web layer owns:
//
//   - this page is `force-dynamic` and reads the session, and it is the ONLY
//     openproduct page that is allowed to be
//   - no sentence is written here; every one comes from the contract
//   - reading the page writes nothing — the cursor moves on a POST and only on
//     a POST
//   - the badge shows nothing rather than zero while the overlay is loading
//   - the unread dot carries a word, not only a colour

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  INBOX_BADGE_CAP,
  INBOX_EMPTY,
  INBOX_MARK_READ,
  inboxBadge,
  inboxHref,
  inboxSentence,
} from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");

/** The file with its comments removed. A guard about markup must not read
 *  prose: the comment above a decision names the thing it rejected. */
const markupOf = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const page = () => read("activity/page.tsx");
const readRoute = () => read("me/notifications/read/route.ts");

describe("the page that is about the reader", () => {
  it("is force-dynamic, and says why in the file", () => {
    // Every public openproduct page is one cacheable document that resolves no
    // actor (OPC-1, I6). This one is not a public page — its whole content is
    // one person's — so the invariant does not apply rather than being bent,
    // and the file has to say so where the next author will read it.
    expect(page()).toContain('export const dynamic = "force-dynamic"');
    expect(page()).toMatch(/I6/);
  });

  it("sends a signed-out reader to sign in, and back here afterwards", () => {
    // "Here" is `/activity` since openproduct-redesign OPR1: returning to
    // the old address would work, through one more redirect.
    expect(page()).toContain("/signin?return_to=%2Factivity");
    expect(page()).not.toContain("%2Fme%2Fnotifications");
  });

  it("lives at /activity, and the old address arrives there from the edge", () => {
    // One implementation, one address. The page MOVED to `/activity` (no
    // module is left at the old path to render a second copy), it is still
    // uncached, and `/me/notifications` is a `redirects()` entry — issued
    // before the renderer, so the status is a real 308 (the lesson `/create`
    // taught, in next.config.mjs).
    expect(existsSync(resolve(APP_DIR, "me/notifications/page.tsx"))).toBe(false);
    expect(existsSync(resolve(APP_DIR, "activity/loading.tsx"))).toBe(true);
    expect(page()).toContain('export const dynamic = "force-dynamic";');
    const config = readFileSync(resolve(APP_DIR, "../../next.config.mjs"), "utf-8");
    expect(config).toContain('{ source: "/me/notifications", destination: "/activity", permanent: true }');
    // The form's POST target is a different path and is NOT redirected: a
    // 308 would replay the POST at a page.
    expect(config).not.toMatch(/source: "\/me\/notifications\/(?::|read)/);
    expect(page()).toContain('action="/me/notifications/read"');
  });

  it("tells a failed read apart from an empty inbox (OD5)", () => {
    // An unavailable read renders the unavailable state. An empty list renders
    // the empty note. Printing "nothing yet" over a database that was down is
    // the one thing OD5 exists to stop.
    const src = page();
    expect(src).toContain('result.kind === "unavailable"');
    expect(src).toContain("MeUnavailable");
    // The empty state is the short "Nothing yet." rather than INBOX_EMPTY's explanation.
    expect(src).toContain("Nothing yet.");
  });

  it("writes no sentence of its own", () => {
    // Every line a reader sees comes from the contract's phrasebook, so a
    // wording somebody regrets is a deploy rather than a backfill.
    expect(page()).toContain("inboxSentence(item)");
    const markup = markupOf("activity/page.tsx");
    for (const phrase of ["replied", "reached #1", "launched in", "was upvoted"]) {
      expect(markup).not.toContain(phrase);
    }
  });

  it("links every row through the contract, never by hand", () => {
    // XP-5: no link that goes nowhere. One function decides where a row points
    // and every kind goes through it.
    expect(page()).toContain("inboxHref(item)");
  });

  it("carries the unread state as a WORD as well as a dot", () => {
    // A bare coloured dot is a state a screen reader cannot report and a
    // colour-blind reader cannot see.
    expect(page()).toMatch(/sr-only[^]*Unread/);
  });
});

describe("reading is not a write", () => {
  it("moves the cursor on a POST and nowhere else", () => {
    const src = page();
    expect(src).toContain('<form method="post" action="/me/notifications/read">');
    // The page itself never marks. A GET that moved the cursor would make
    // opening the page destroy the thing the page is for.
    expect(src).not.toContain("markInboxRead");
    expect(readRoute()).toContain("markInboxRead");
    expect(readRoute()).toContain("export async function POST");
  });

  it("offers the button only when there is something to mark", () => {
    expect(page()).toContain("unread > 0");
    expect(page()).toContain("INBOX_MARK_READ");
    expect(INBOX_MARK_READ).toBe("Mark all as read");
  });

  it("returns a 303 to the same page rather than rendering its own", () => {
    // A form, a redirect, no client JS — the same shape as every other act
    // on this estate.
    const src = readRoute();
    expect(src).toContain("303");
    // The page's address is `/activity` since OPR1.
    expect(src).toContain('new URL("/activity", request.url)');
  });

  it("does not invent a page state for a mark that failed", () => {
    // A failed mark leaves the badge where it was, which the next render
    // shows. "We could not mark your notifications read" is a sentence nobody
    // needs and a state nobody can act on.
    expect(readRoute()).toContain("await markInboxRead(session.accessToken)");
    expect(readRoute()).not.toMatch(/if\s*\(\s*result/);
  });
});

describe("the badge", () => {
  it("shows nothing rather than zero", () => {
    // Zero is a claim (OPC-C), and an overlay that has not answered has made
    // none. `null` and "nothing unread" render identically, which is correct
    // for both.
    expect(inboxBadge(0)).toBeNull();
    expect(inboxBadge(-1)).toBeNull();
    expect(inboxBadge(1)).toBe("1");
  });

  it("caps a number nobody can read at a glance", () => {
    expect(inboxBadge(INBOX_BADGE_CAP)).toBe(String(INBOX_BADGE_CAP));
    expect(inboxBadge(INBOX_BADGE_CAP + 1)).toBe(`${INBOX_BADGE_CAP}+`);
    expect(inboxBadge(9_999)).toBe(`${INBOX_BADGE_CAP}+`);
  });

  it("is fed by the overlay, which is the one per-subject read a page makes", () => {
    const chip = read("shell/account-chip.tsx");
    expect(chip).toContain("overlay.overlay.unread");
    const shell = read("shell/shell.ts");
    expect(shell).toContain('export const ACTIVITY_PATH = "/activity";');
    expect(shell).toContain('href: ACTIVITY_PATH, countKey: "unread"');
    // The header's bell and the phone's Activity tab wear a DOT fed by the
    // same read, and nothing until it answers.
    const bell = read("shell/notification-bell.tsx");
    expect(bell).toContain("unreadCount(useOverlay(");
    expect(bell).toContain("href={ACTIVITY_PATH}");
    expect(bell).toMatch(/unread > 0 \? <UnreadDot/);
  });

  it("appears in the contributor's own nav beside the other personal pages", () => {
    expect(read("me/nav.tsx")).toContain('item("notifications", "/activity", "Notifications")');
  });
});

describe("the sentences a reader actually sees", () => {
  const at = { createdAt: "2026-09-01T09:00:00.000Z", id: "n-1", unread: true } as const;

  it("names the replier, and survives a handle that stopped resolving", () => {
    const item = { ...at, kind: "post.reply", actor: "ada", targetKind: "post", targetRef: "acme-thing", figure: null } as const;
    expect(inboxSentence(item)).toBe("@ada replied where you commented on acme-thing.");
    expect(inboxSentence({ ...item, actor: null })).toBe(
      "Somebody replied where you commented on acme-thing.",
    );
  });

  it("says how many upvoted, never who", () => {
    const item = { ...at, kind: "post.upvoted", actor: null, targetKind: "post", targetRef: "acme-thing", figure: 4 } as const;
    expect(inboxSentence(item)).toContain("4 upvotes");
    expect(inboxSentence(item)).not.toContain("@");
    expect(inboxSentence({ ...item, figure: 1 })).toBe(
      "A comment you wrote on acme-thing was upvoted.",
    );
  });

  it("sends each kind somewhere that exists", () => {
    expect(inboxHref({ kind: "launch.topic", targetKind: "topic", targetRef: "developer-tools" })).toBe(
      "/topics/developer-tools",
    );
    expect(inboxHref({ kind: "rank.first", targetKind: "listing", targetRef: "acme-thing" })).toBe(
      "/acme-thing",
    );
    expect(inboxHref({ kind: "post.reply", targetKind: "post", targetRef: "acme-thing" })).toBe(
      "/acme-thing#discussion",
    );
  });

  it("says the ordinary thing when there is nothing", () => {
    // Not an apology, and not a suggestion to go and do something. An empty
    // inbox is the ordinary state of a person who has been here a day.
    expect(INBOX_EMPTY).toMatch(/^Nothing yet\./);
    expect(INBOX_EMPTY).not.toMatch(/sorry|oops|try/i);
  });
});
