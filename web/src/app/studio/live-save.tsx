"use client";

// A studio act, without the reload (openproduct-performance OPP15).
//
// ─── WHAT A SAVE USED TO COST ─────────────────────────────────────────────
//
// Every studio form posted, took a `303`, and loaded the step again. Two
// sequential round trips to a worker that talks to a gateway that talks to
// core that talks to a database in Singapore — the write, and then a whole
// personal document that could not be cached by anything (OX5b: these pages
// are `force-dynamic` and `no-store`, and rightly so). Then the browser threw
// away the document it had, parsed a new one, hydrated it again, and put the
// maintainer back at the top of a page they had been editing halfway down.
//
// Measured on the perf lane's build, with every request the app answers
// delayed to production's shape: 700 ms for a save that changed one field,
// of which the second round trip was a re-fetch of a page the maintainer was
// already looking at. The same save now says so 423 ms after the submit,
// beside an answer that took 418 ms of it.
//
// ─── WHAT IT COSTS NOW ────────────────────────────────────────────────────
//
// One round trip. The same form posts the same fields to the same route,
// from here, with `accept: application/json`; the route does exactly what it
// did and answers with the ADDRESS it would have redirected to. This turns
// that address back into the sentence the page would have rendered
// (`notices.ts`, the one vocabulary both paths read) and says it at once, in
// a banner that pins itself to the top of the viewport rather than moving the
// page. The document is not discarded, the scroll position is untouched, the
// fields keep what was typed, and focus stays where it was.
//
// Then `router.refresh()` re-renders the server components behind that — the
// completeness panel ticks, a new media row appears, the status line catches
// a publish — without the maintainer waiting on any of it.
//
// ─── WHAT DID NOT CHANGE, WHICH IS THE POINT ─────────────────────────────
//
// The forms. Same `method="post"`, same `action`, same fields, same order.
// This is a DELEGATED listener on a wrapper — the shape OPP2 gave the four
// toggles and OPP14 gave the comment box — so with no JavaScript every form
// posts and redirects exactly as it always has, and the token still never
// reaches the browser (OX5b): the act goes to the same route, which reads the
// session server-side.
//
// ─── WHICH FORMS, AND THE RULE THAT DECIDES ──────────────────────────────
//
// The ones that say `data-live="stay"`, which is four of the studio's
// twenty-five: the Details fields, the Topics fields, the published
// maintainers, and an existing role opening. What they have in common is
// that a save changes WHAT THE MAINTAINER JUST TYPED INTO WHAT THEY TYPED.
// The form is already showing the truth when the answer arrives, so the page
// cannot be wrong — at worst the advice beside it (IN3's completeness panel,
// IN2's "yours" badge) is one act behind until the next navigation.
//
// EVERYTHING ELSE STILL POSTS AND RELOADS, and that is a measurement rather
// than caution. An act that adds a row, removes one, publishes, schedules or
// decides changes the PAGE, so the page has to be re-rendered for it — and
// `router.refresh()` cannot be trusted to do that here. Measured over eight
// uploads on the perf lane's build: the refresh issued its request every
// single time and its answer was dropped twice, leaving "Image added." over
// a page that still said "No images yet" until it was reloaded by hand.
// Bare, inside `startTransition`, and from an effect all behaved the same.
//
// THE CAUSE WAS FOUND LATER, and it was not this app's. The React that
// Next 15.5 vendors lost a Suspense ping that arrived during a render, and
// each dropped refresh was left parked on the root for good.
// `patches/next@15.5.18.patch` backports the upstream fix, and the web-perf
// `refresh` lane requires ten consecutive refreshes to land. The rule below is
// unchanged: a page-changing act keeping its `303` is still correct by
// construction, and moving one of them onto the refresh is its own decision.
//
// So the refresh stays as a BEST EFFORT for the four forms above, where
// losing it costs a stale sentence of advice, and nothing that must be right
// depends on it. An act whose result is a changed page keeps the `303` that
// has always been correct by construction. The common loop — type, save,
// type, save — is the one that got fast, and it is the one the report was
// about.

import { useRouter } from "next/navigation";
import * as React from "react";

import { TILE } from "../ui/design";
import { blockerCopy } from "./publish-disclosure";
import { noticeFromUrl, type StudioNotice, type StudioVocabulary } from "./notices";

/** How a form opts in. Absent means the form posts and reloads, as it always
 *  did — the default is the behaviour that cannot be wrong. */
export const LIVE_ATTRIBUTE = "data-live";
/** Post this one in the background and stay where we are. */
export const LIVE_STAY = "stay";

/** What the island says when the request never reached the route. */
export const LIVE_NETWORK_MESSAGE =
  "That did not reach the server. Nothing was changed, and what you typed is still here.";
/** What it says when the route answered something it could not read. */
export const LIVE_UNREADABLE_MESSAGE =
  "That action did not complete. Try again in a moment.";

/** A studio act's answer: the address the route would have redirected to. */
interface ActAnswer {
  data?: { to?: unknown };
}

function isLiveAction(action: string): boolean {
  try {
    const url = new URL(action, window.location.href);
    return url.origin === window.location.origin && url.pathname.endsWith("/actions");
  } catch {
    return false;
  }
}

/**
 * The frame's live region: the notice and the blockers, from the server on
 * first paint and from the last act after that.
 *
 * Rendered by a client component so an act can replace it, and SERVER
 * RENDERED all the same — a maintainer with no JavaScript gets the notice the
 * page's own address asked for, because that is what `server` holds.
 */
export function StudioLive({
  vocabulary,
  notice: server,
  blockers: serverBlockers,
  flush = false,
  children,
}: {
  /** This surface's words. See `notices.ts` — the island renders the same
   *  sentence the page would have rendered for the same code. */
  vocabulary: StudioVocabulary;
  notice?: StudioNotice | undefined;
  blockers?: readonly { title: string; remedy: string }[] | undefined;
  /** Under the listing's persistent hero (openproduct-studio OSD5) the step's
   *  columns carry their own top margin; the gap below a page title does not
   *  apply. */
  flush?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [live, setLive] = React.useState<{
    notice: StudioNotice | undefined;
    blockers: readonly { title: string; remedy: string }[];
  } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const banner = React.useRef<HTMLDivElement | null>(null);

  // ─── THE CATCH-UP, WHICH IS BEST EFFORT AND SAYS SO ────────────────────
  //
  // The advice beside these forms is derived from the profile: the
  // completeness panel, the "yours" badge, the slug in the title. Asking for
  // a re-render brings them along. It is asked for from an effect rather than
  // from inside the resolved `fetch`, which is where React expects router
  // work — and it is still not guaranteed: measured, the refresh issues its
  // request every time and the answer is dropped about one time in four.
  // (That was a reconciler bug in Next's vendored React, now patched; see
  // the header.)
  //
  // That is exactly why only forms whose page cannot be WRONG opt in. A lost
  // refresh here leaves a completeness panel one act behind until the next
  // navigation, and nothing else.
  const [landed, setLanded] = React.useState(0);
  React.useEffect(() => {
    if (landed === 0) return;
    router.refresh();
  }, [landed, router]);

  const notice = live ? live.notice : server;
  const blockers = live ? live.blockers : (serverBlockers ?? []);

  const onSubmit = (event: React.FormEvent<HTMLDivElement>) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (event.defaultPrevented) return;
    if (form.getAttribute(LIVE_ATTRIBUTE) !== LIVE_STAY) return;
    if (!isLiveAction(form.action)) return;
    if (busy) {
      // A second act while the first is in flight would race the refresh.
      event.preventDefault();
      return;
    }
    event.preventDefault();

    // ─── THE SUBMITTER IS PART OF THE FORM ──────────────────────────────
    //
    // None of the four forms that opt in today carries anything on its
    // button, so this is a guard rather than a fix — but it is the guard a
    // fifth form would need, and the failure it prevents is silent. Twelve
    // controls elsewhere in this studio put the INTENT on the button rather
    // than in a hidden field (`<button name="intent" value="delist">`, and
    // three more on one moderation form, because one form with four buttons
    // is the honest shape for four things you can do to one report). A native
    // post includes the pressed button's name and value; a
    // `new FormData(form)` does NOT — so such a form, opted in without this,
    // would post no intent at all and be answered by the route's fallthrough.
    //
    // The two-argument constructor is the native rule exactly, including
    // where in the order the entry lands — which matters for a form with BOTH
    // a hidden `intent` and a button, where the hidden one wins. The append
    // below is for an engine that ignores the argument.
    const submitter =
      (event.nativeEvent as SubmitEvent | undefined)?.submitter instanceof HTMLElement
        ? ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | HTMLInputElement)
        : null;
    const data = new FormData(form, submitter);
    if (submitter?.name && !data.has(submitter.name)) data.append(submitter.name, submitter.value);

    setBusy(true);
    form.setAttribute("aria-busy", "true");
    if (submitter) submitter.disabled = true;

    const done = () => {
      setBusy(false);
      form.removeAttribute("aria-busy");
      if (submitter) submitter.disabled = false;
    };

    void (async () => {
      try {
        const res = await fetch(form.action, {
          method: "POST",
          body: data,
          headers: { accept: "application/json" },
          credentials: "same-origin",
          cache: "no-store",
        });
        if (res.status === 401) {
          // The session went while the page was open. The plain form does
          // what it always did: bounce through sign-in and come back here.
          done();
          form.submit();
          return;
        }
        const body = (await res.json().catch(() => null)) as ActAnswer | null;
        const to = body?.data?.to;
        if (!res.ok || typeof to !== "string" || to.length === 0) {
          setLive({
            notice: { kind: "refused", message: LIVE_UNREADABLE_MESSAGE },
            blockers: [],
          });
          done();
          return;
        }

        const read = noticeFromUrl(to, vocabulary);
        setLive({
          notice: read.notice,
          blockers: read.blockers.map((blocker) => {
            const copy = blockerCopy(blocker);
            return { title: copy.title, remedy: copy.remedy };
          }),
        });
        done();

        // An act whose answer is somewhere ELSE is a navigation the route
        // asked for — a created collection, a listing that moved. Follow it
        // rather than refreshing a page the route did not mean.
        if (read.pathname !== window.location.pathname) {
          router.push(to);
          return;
        }
        // ─── THEN THE DERIVED HALF, WHICH NOBODY WAITS ON ────────────────
        //
        // The completeness panel, a new media row, the status line after a
        // publish: server-rendered content this act changed. The notice is
        // already painted from the answer above — `setLive` is an ordinary
        // state update and commits at its own priority — so the re-render
        // costs the maintainer nothing but a moment's staleness in the parts
        // of the page they are not looking at.
        //
        // CALLED HERE, NOT FROM A `setTimeout`. It was deferred for a while,
        // on the theory that sharing a tick with the notice's own update was
        // what made the lane read 847 ms to say "Saved." — and that reading
        // was the LANE's rather than the page's (an observer inside the
        // document put the paint at 423 ms, one round trip, either way). What
        // the deferral did buy was a refresh that sometimes never landed: the
        // studio walk uploaded an image, was told it was added, and sat on a
        // page that still said "No images yet" until it was reloaded by hand.
        // A macrotask scheduled from inside a resolved fetch, after a
        // `form.reset()`, is a hop this does not need.
        setLanded((n) => n + 1);
      } catch {
        setLive({ notice: { kind: "refused", message: LIVE_NETWORK_MESSAGE }, blockers: [] });
        done();
      }
    })();
  };

  // ─── WHERE THE RESULT IS SEEN, WITHOUT THE PAGE MOVING ─────────────────
  //
  // The banner sits above the surface, which was right when every act
  // reloaded the page and landed you at the top of it. It is wrong now: a
  // maintainer saving the Details form is at the BOTTOM of a long step, and a
  // sentence written six hundred pixels above them has not told them
  // anything.
  //
  // The first answer here was to scroll the banner into view, and the lane
  // caught what that really is: a save that moves the page away from the
  // field you were working on. Losing your place is the thing this milestone
  // set out to stop.
  //
  // So the banner STICKS while it is reporting a live act — pinned at the top
  // of the viewport wherever the maintainer happens to be, gone again when
  // they act next or reload. Nothing scrolls, nothing is announced twice, and
  // the server-rendered notice (the no-JavaScript path, which does land at
  // the top) keeps its ordinary place in the flow.
  const reporting = live !== null || busy;

  return (
    <div onSubmit={onSubmit}>
      <div ref={banner} className={reporting ? "sticky top-3 z-20" : undefined}>
        {notice ? <NoticeBanner notice={notice} busy={busy} /> : busy ? <Working /> : null}
        {blockers.length > 0 ? <Blockers blockers={blockers} /> : null}
      </div>
      <div className={flush ? undefined : "mt-7"}>{children}</div>
    </div>
  );
}

/**
 * One result, said once.
 *
 * THE REFUSAL IS THE HEAVIER OF THE TWO. An interface that renders bad news
 * fainter than good news has its emphasis exactly backwards; this is where
 * that is decided rather than argued about on each surface.
 *
 * `role="status"` on both: a maintainer using a screen reader who just posted
 * a form is waiting to hear what happened, and a refusal that renders
 * silently is a form that appears to have done nothing.
 */
function NoticeBanner({ notice, busy }: { notice: StudioNotice; busy: boolean }) {
  const refused = notice.kind === "refused";
  return (
    <p
      role="status"
      data-studio-notice={refused ? "refused" : "said"}
      className={`m-0 mt-5 max-w-[70ch] rounded-[14px] px-3.5 py-2.5 text-[15px] transition-opacity ${
        refused ? "bg-warning-soft font-medium text-warning-strong" : "bg-card text-copy"
      } ${busy ? "opacity-60" : ""}`}
    >
      {busy ? WORKING_MESSAGE : notice.message}
    </p>
  );
}

/** What the banner says between the click and the answer. One round trip, so
 *  usually too short to read — and never nothing, which is what a form that
 *  posts in the background looks like when it says so too late. */
export const WORKING_MESSAGE = "Saving…";

function Working() {
  return (
    <p
      role="status"
      data-studio-notice="working"
      className="m-0 mt-5 max-w-[70ch] rounded-[14px] bg-card px-3.5 py-2.5 text-[15px] text-muted-foreground"
    >
      {WORKING_MESSAGE}
    </p>
  );
}

/** Each blocker, with its remedy. Never the state alone (OD6). */
function Blockers({ blockers }: { blockers: readonly { title: string; remedy: string }[] }) {
  return (
    <ul className="m-0 mt-5 grid max-w-[70ch] list-none gap-2 p-0">
      {blockers.map((blocker) => (
        <li key={blocker.title} className={`px-5 py-4 ${TILE}`}>
          <div className="text-[15px] font-semibold text-foreground">{blocker.title}</div>
          <p className="m-0 mt-1 text-[13px] leading-[1.5] text-muted-foreground">
            {blocker.remedy}
          </p>
        </li>
      ))}
    </ul>
  );
}
