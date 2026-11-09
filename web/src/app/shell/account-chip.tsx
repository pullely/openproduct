"use client";

import * as React from "react";
import dynamic from "next/dynamic";

import { consoleOrigin } from "@/lib/platform";

import { SIGNED_IN_CLASS } from "../auth/auth";

import { useOverlay } from "../ui/use-overlay";
import { publishVisitor } from "../ui/visitor";


import {
  ACCOUNT_MENU_ITEMS,
  COUNT_PLACEHOLDER,
  initialsOf,
  signInHref,
  type OverlayCountKey,
} from "./shell";

import { AppLink } from "../ui/link";

/**
 * The panel's account affordance (openproduct-commons XP0) — the shell's home
 * for what `session-chip.tsx` used to do, plus the menu the design draws:
 * an identity block (name and public address), a Profile section (the form,
 * and the public page with its on/off state), a You section (what the
 * visitor holds here, counted), and the way out (the platform, sign out).
 *
 * THE PROPERTY THIS ISLAND EXISTS TO PROTECT is the same one the chip it
 * replaces protected, and it is invariant I6: the anonymous pages render
 * byte-identically signed-in and signed-out. So the SERVER render is always
 * the anonymous one — a bare `Sign in` pointing at `/signin` — and every
 * personalisation happens after hydration, in the visitor's own browser,
 * against the one session read (`/auth/session`, `no-store`). The cached HTML
 * never varies.
 *
 * THE COUNTS COME FROM THE XP2 OVERLAY, and they render `—` until it answers
 * — never `0`, because zero is a claim and an unread overlay has not made one.
 * The placeholder is the same one an unobserved metric uses, for the same
 * reason (SN2).
 *
 * `endorsements` is deliberately absent from the overlay until EN, so that
 * count keeps rendering `—`. An empty array would say "you have endorsed
 * nothing" about a thing that cannot yet be endorsed.
 */
type OverlayCounts = Partial<Record<OverlayCountKey, number>>;

/**
 * THE SIGN-IN CARD IS LOADED WHEN SOMEBODY ASKS FOR IT (OPP11).
 *
 * 394 lines of form, opened by a small minority of visitors, in the shell of
 * every page. `ssr: false` is right rather than merely tolerable: the card is
 * rendered only inside `{authOpen ? … }` below, which no server render can
 * be, so the boundary removes nothing from the document and cannot move the
 * layout.
 *
 * THE FIRST ATTEMPT AT THIS MADE EVERY ROUTE BIGGER, and the cause was not
 * `next/dynamic`. `AuthModal` took an `open` prop and returned null when it
 * was false, so the element sat in the tree on every page and the lazy chunk
 * loaded on mount — a boundary that deferred nothing and charged for the
 * loader. The prop is gone (see `auth-modal.tsx`), the condition is here, and
 * `tests/web/src/lazy-boundaries.test.ts` pins the shape.
 */
const AuthModal = dynamic(() => import("./auth-modal").then((m) => m.AuthModal), { ssr: false });

export function AccountChip() {
  // NO `signedIn` FLAG IN REACT STATE, AND THAT IS THE DESIGN.
  //
  // Which branch is DISPLAYED is decided entirely by a class on `<html>` —
  // seeded before the first paint by `SESSION_BOOT` and corrected here when
  // `/auth/session` answers. React renders BOTH branches, always, on the
  // server and on every client pass, so the markup is identical for everyone
  // (I6) and there is no first-render difference for hydration to trip over.
  //
  // What React still owns is the CONTENT of those branches: the name in the
  // menu, and where a sign-in should return to.
  const [displayName, setDisplayName] = React.useState<string | null>(null);
  const [returnTo, setReturnTo] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  // AC2c — the sign-in modal's own state, deliberately separate from the
  // menu's: the two are never open together and sharing one flag would make
  // "which thing is this closing" a question the Escape handler has to answer.
  const [authOpen, setAuthOpen] = React.useState(false);
  // The overlay is asked for no ids here: the chip needs only the totals, and
  // any per-slug answers the page itself wants are coalesced into the same
  // one request by the store.
  const overlay = useOverlay();
  const counts: OverlayCounts =
    overlay.status === "ready"
      ? {
          saved: overlay.overlay.savedCount,
          applications: overlay.overlay.requests,
          listings: overlay.overlay.listings,
          // NF0 — the badge, on the same read as every other count. A second
          // fetch for one integer on every page would have doubled the
          // personalisation traffic of the whole site.
          unread: overlay.overlay.unread,
        }
      : {};
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setReturnTo(window.location.pathname + window.location.search);
    void (async () => {
      try {
        const res = await fetch("/auth/session", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as {
          data?: { signedIn?: boolean; displayName?: string | null };
        };
        if (cancelled) return;
        // THE AUTHORITY, CORRECTING THE HINT. `/auth/session` resolves the
        // real session against the real issuer; the cookie the boot script
        // read is a guess about what it will say. When they agree this is a
        // no-op and nothing repaints — which is the whole point. When they
        // disagree, this is where a stale hint stops being believed, in the
        // same round trip that used to be the ONLY thing deciding.
        document.documentElement.classList.toggle(SIGNED_IN_CLASS, body.data?.signedIn === true);
        setDisplayName(body.data?.displayName ?? null);
        // OPP14 — the one answer, published once, for whatever posts a
        // comment in this visitor's name before the server has said it.
        publishVisitor({
          signedIn: body.data?.signedIn === true,
          displayName: body.data?.displayName ?? null,
        });
      } catch {
        // Left alone on purpose. An unreachable `/auth/session` is not
        // evidence that somebody is signed out, and tearing the chip down on
        // a transient blip is the flicker this milestone exists to remove,
        // wearing a different hat.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close on outside click and on Escape — a menu that can only be dismissed
  // by picking something is a trap for anyone navigating by keyboard.
  React.useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = initialsOf(displayName);
  const workspace = consoleOrigin();
  // The identity block's second line is the visitor's OWN public address —
  // the one thing the menu can say about them that a stranger could also
  // read. It arrives with the overlay (CG1's handle rides the same read as
  // the counts), so until then it is a placeholder rather than a guess.
  const identity =
    overlay.status === "ready"
      ? { handle: overlay.overlay.handle, profilePublic: overlay.overlay.profilePublic }
      : null;
  const handle = identity?.handle ?? null;
  const publicPageState =
    identity === null ? COUNT_PLACEHOLDER : identity.profilePublic && handle ? "on" : "off";

  return (
    // ONE CELL, TWO BRANCHES, and the cell is the width of the wider one.
    // Both branches are always in the document (I6) and CSS shows one — with
    // `visibility`, so the hidden one keeps its box (globals.css says why at
    // length). Stacking them in a single grid cell is what turns "keeps its
    // box" into "the bar does not move": the panel reserves the `Sign in`
    // pill's width for everybody, and the account disc lands inside that
    // reservation instead of shrinking the row by 48px on hydration. It is
    // the same construction the vote box uses for its two labels.
    <div className="grid shrink-0 justify-items-end">
      {/* ─── the anonymous branch, and it is what the server sends ────── */}
      <span data-auth-branch="anonymous" className="[grid-area:1/1]">
        <a
          href={signInHref(returnTo)}
          // AC2c — STILL AN ANCHOR, and that is what keeps I6 true. The
          // server renders exactly the markup the signed-out chrome always
          // had, so the cached HTML does not vary; a plain click is
          // intercepted and opens the modal instead. Middle-click, a copied
          // link, and a visitor with no JavaScript all still reach `/signin`,
          // which is the SAME CARD as a real page — the honest fallback, and
          // now the same card either way rather than the modal here and the
          // OAuth handshake there.
          onClick={(event) => {
            // Never swallow a click somebody meant as "open this elsewhere".
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            setAuthOpen(true);
          }}
          // XP4: 44px below `sm`, the same finger-first floor the rest of the
          // panel's controls take.
          className="inline-flex h-[44px] shrink-0 items-center rounded-full bg-primary px-5 text-[15px] font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:px-3.5 max-sm:text-[14px]"
        >
          Sign in
        </a>
        {authOpen ? (
          <AuthModal onClose={() => setAuthOpen(false)} returnTo={returnTo} />
        ) : null}
      </span>

      {/* ─── the signed-in branch, in the same bytes, hidden by default ── */}
      <div ref={rootRef} data-auth-branch="signed-in" className="relative [grid-area:1/1]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account — ${displayName ?? "your account"}`}
        // THE AVATAR: a 40px neutral disc on `--secondary`, the initials in
        // Geist Mono (CL1). It means "you" and opens the menu; it does not
        // wear the accent, which is the upvote's (CL-R8).
        className="grid h-[40px] w-[40px] place-items-center rounded-full bg-secondary font-mono text-[13px] font-medium text-foreground transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:h-[44px] max-sm:w-[44px]"
      >
        {initials}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-[48px] z-50 w-[292px] animate-menu-in rounded-[12px] border border-border bg-popover p-1.5 shadow-menu"
        >
          {/* Identity: who, and the public address. */}
          <div className="border-b border-border px-2.5 pb-3 pt-2.5">
            <div className="flex items-center gap-2.5">
              <span className="grid h-[32px] w-[32px] shrink-0 place-items-center rounded-full bg-secondary text-[13px] font-semibold text-foreground">
                {initials}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14.5px] font-semibold text-foreground">
                  {displayName ?? "Your account"}
                </span>
                <span className="block truncate font-mono text-[12px] text-muted-foreground">
                  {handle ? `openproduct.live/@${handle}` : identity ? "No handle yet" : COUNT_PLACEHOLDER}
                </span>
              </span>
            </div>
          </div>

          <MenuSection label="Profile" />
          <MenuLink href="/me" icon={<PersonIcon />}>
            Your profile
          </MenuLink>
          {/* The public page: at the handle when there is one, and otherwise
              at the profile form where a handle is claimed. The state word is
              the overlay's answer, never a default — `—` until it reads. */}
          <MenuLink href={handle ? `/@${handle}` : "/me"} icon={<GlobeIcon />} trailing={publicPageState}>
            Public page
          </MenuLink>

          <MenuSection label="You" />
          {ACCOUNT_MENU_ITEMS.map((item) => (
            <MenuLink
              key={item.id}
              href={item.href}
              trailing={item.countKey ? (counts[item.countKey] ?? COUNT_PLACEHOLDER) : undefined}
              trailingTitle={
                item.countKey && counts[item.countKey] === undefined
                  ? "Not read yet — your own counts arrive after the page paints"
                  : undefined
              }
            >
              {item.label}
            </MenuLink>
          ))}

          <div className="my-1.5 h-px bg-border" />
          {workspace ? (
            <MenuLink href={workspace} external plain trailing={<ExternalIcon />}>
              Your workspace on Orunbase
            </MenuLink>
          ) : null}
          {/* PLAIN, AND THIS IS THE BUG IT FIXES. `/auth/signout` is a ROUTE
              HANDLER, not a page: it clears the two cookies and redirects.
              Routed through `next/link` the client router asks it for an RSC
              payload, gets a redirect to a document instead, and the sign-out
              silently does not happen — which is exactly what people
              reported. A real anchor performs the navigation the handler is
              written for, `Set-Cookie` lands, and the visitor arrives at `/`
              signed out. */}
          <MenuLink href="/auth/signout" icon={<SignOutIcon />} plain>
            Sign out
          </MenuLink>
        </div>
      ) : null}
      </div>
    </div>
  );
}

function MenuSection({ label }: { label: string }) {
  return (
    <div className="px-2.5 pb-1 pt-2 font-mono text-[11.5px] uppercase tracking-[0.12em] text-muted-foreground">
      {label}
    </div>
  );
}

/**
 * One row of the menu.
 *
 * `plain` IS NOT A STYLE, IT IS WHICH NAVIGATION HAPPENS. `AppLink` is
 * `next/link`, and the client router can only soft-navigate to an App Router
 * PAGE: it asks the destination for an RSC payload. Two destinations in this
 * menu are not pages — the platform's own origin, and `/auth/signout`, which
 * is a route handler whose entire job is a `Set-Cookie` and a redirect — and
 * both need a real anchor and a real navigation.
 */
function MenuLink({
  href,
  icon,
  trailing,
  trailingTitle,
  external = false,
  plain = false,
  children,
}: {
  href: string;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  trailingTitle?: string | undefined;
  external?: boolean;
  /** Leave the client router out of it — see above. */
  plain?: boolean;
  children: React.ReactNode;
}) {
  const className =
    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14.5px] text-copy transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring";
  const body = (
    <>
      {icon}
      <span className="flex-1">{children}</span>
      {trailing !== undefined ? (
        <span
          className="font-mono text-[12.5px] tabular-nums text-muted-foreground"
          title={trailingTitle}
        >
          {trailing}
        </span>
      ) : null}
    </>
  );
  if (plain) {
    return (
      <a
        href={href}
        role="menuitem"
        {...(external ? { rel: "noreferrer noopener" } : {})}
        className={className}
      >
        {body}
      </a>
    );
  }
  return (
    <AppLink
      href={href}
      role="menuitem"
      {...(external ? { rel: "noreferrer noopener" } : {})}
      className={className}
    >
      {body}
    </AppLink>
  );
}

function PersonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 text-muted-foreground">
      <circle cx="8" cy="5.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M2.5 14c.6-3 3-4.5 5.5-4.5S12.9 11 13.5 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 text-muted-foreground">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 8h11M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="text-muted-foreground">
      <path
        d="M3 9 9 3M4.5 3H9v4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 text-muted-foreground">
      <path
        d="M6.5 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3M10 11l3-3-3-3M13 8H6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
