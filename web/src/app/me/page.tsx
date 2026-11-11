import { redirect } from "next/navigation";

import { consoleOrigin } from "@/lib/platform";

import { readSession } from "../auth/session-server";
import { initialsOf } from "../shell/shell";
import { BTN_OUTLINE, BTN_PRIMARY, FIELD, H2, LABEL, PAGE_TITLE, TEXTAREA } from "../ui/design";
import { DigestControl } from "../ui/digest-control";
import { fetchDigestStanding, fetchMe } from "./me-api";
import { ME_CARD, ME_MAIN, ME_TITLE_GAP, MeNav } from "./nav";
import { MeUnavailable } from "./unavailable";

import { AppLink } from "../ui/link";

/**
 * The contributor's own page (openproduct-home OH2, CG1): who openproduct.live
 * thinks you are, in your own words — and, since CG1, the controls for the
 * public half: the handle that is your address, the page behind it, the two
 * links, and whether you are open to joining a project.
 *
 * A server component with an EXPLICIT session read — the authenticated half's
 * defining difference from the anonymous pages (design.md §1). Signed out is
 * a redirect to sign-in, never a 500. Never cached: this is a per-person
 * surface.
 *
 * THE DESIGN'S SHAPE: the identity card (disc, name, address, the public-page
 * pill), then the form in its own card, then two more cards — the digest and
 * the account — each a 16px/600 heading over a line and its controls.
 */
export const dynamic = "force-dynamic";

/** How much of a refusal's reason the banner will echo back. */
const MAX_REASON = 240;

export default async function MePage(props: {
  searchParams: Promise<{ error?: string; field?: string; message?: string; saved?: string }>;
}) {
  const session = await readSession();
  if (!session) redirect("/signin?return_to=%2Fme");

  // BOTH IN ONE ROUND TRIP. A failed digest read renders the control in its
  // "never asked" state rather than taking the page down — the standing is a
  // preference, and being unable to read it is not a reason to lose the
  // profile somebody came here to edit.
  const [result, digest] = await Promise.all([
    fetchMe(session.accessToken),
    fetchDigestStanding(session.accessToken),
  ]);
  // A dead token (expired mid-session, revoked from the console) reads as
  // signed out; a service failure renders as one, never as a redirect loop.
  if (result.kind === "unauthorized") redirect("/signin?return_to=%2Fme");
  if (result.kind === "unavailable") return <MeUnavailable active="profile" />;
  const me = result.data;
  const params = await props.searchParams;
  const notice = noticeFor(params);

  const authored = me.contributor;
  // What renders when nothing is authored yet: the OI display name, clearly
  // provisional. The authored name never comes from the platform (OD3's
  // maintainer-names reasoning) — this fallback is presentation, not storage.
  const shownName = authored?.displayName ?? session.displayName ?? null;
  const handle = authored?.handle ?? null;
  const isPublic = authored?.profilePublic === true;
  const hasStanding = authored?.hasStanding === true;
  const workspace = consoleOrigin();

  return (
    <main className={ME_MAIN}>
      <MeNav active="profile" />

      <h1 className={`${PAGE_TITLE} ${ME_TITLE_GAP}`}>Your profile</h1>

      {notice ? (
        <p
          role="status"
          className={
            notice.kind === "saved"
              ? "m-0 mt-4 max-w-[65ch] rounded-[6px] border border-success-border bg-success-soft px-3 py-2 text-[13px] text-success"
              : "m-0 mt-4 max-w-[65ch] rounded-[6px] border border-warning-soft-border bg-warning-soft px-3 py-2 text-[13px] text-warning-strong"
          }
        >
          {notice.text}
        </p>
      ) : null}

      {/* Identity: who you are here, and the public address. */}
      <div className={`${ME_CARD} mt-6 flex flex-wrap items-center gap-4`}>
        <span className="grid h-[56px] w-[56px] shrink-0 place-items-center rounded-full bg-panel text-[19px] font-semibold text-panel-foreground">
          {initialsOf(shownName)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[17px] font-semibold text-foreground">
            {shownName ?? "Your account"}
          </span>
          <span className="truncate font-mono text-[12.5px] text-muted-foreground">
            {handle ? `openproduct.live/@${handle}` : "No handle yet"}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <span
            className={
              isPublic
                ? "inline-flex h-[26px] items-center gap-1.5 rounded-full border border-success-border bg-success-soft px-2.5 text-[12.5px] font-medium text-success"
                : "inline-flex h-[26px] items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 text-[12.5px] font-medium text-muted-foreground"
            }
          >
            <span
              aria-hidden="true"
              className={isPublic ? "h-1.5 w-1.5 rounded-full bg-success" : "h-1.5 w-1.5 rounded-full bg-muted-foreground"}
            />
            {isPublic ? "Public page on" : "Public page off"}
          </span>
          {isPublic && handle ? (
            <AppLink href={`/@${handle}`} className="tap text-[13px] underline underline-offset-4">
              View
            </AppLink>
          ) : null}
        </div>
      </div>

      <form method="post" action="/me/profile" className={`${ME_CARD} mt-4 grid gap-5`}>
        {/* What the page rendered, so the handler writes only what CHANGED —
            an untouched handle field must not re-claim, and an empty one on
            a form that never had a handle must not release (CG0: a release
            is permanent). */}
        <input type="hidden" name="currentHandle" value={handle ?? ""} />
        <input type="hidden" name="currentPublic" value={String(isPublic)} />

        <div>
          <label htmlFor="displayName" className={LABEL}>
            Display name
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            maxLength={120}
            defaultValue={shownName ?? ""}
            placeholder="How you want to appear"
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="handle" className={LABEL}>
            Handle
          </label>
          <div className="flex h-[38px] items-stretch overflow-hidden rounded-[8px] border border-border bg-background text-[14.5px] transition-shadow focus-within:border-endorse focus-within:ring-[3px] focus-within:ring-endorse-soft">
            <span className="flex items-center border-r border-border bg-muted px-2.5 font-mono text-[12.5px] text-muted-foreground">
              openproduct.live/@
            </span>
            <input
              id="handle"
              name="handle"
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={39}
              defaultValue={handle ?? ""}
              placeholder="your-handle"
              aria-describedby="handle-hint"
              className="min-w-0 flex-1 bg-transparent px-3 text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <p id="handle-hint" className="m-0 mt-1.5 text-[12.5px] leading-[1.5] text-muted-foreground">
            Lowercase letters, digits and hyphens.
            {handle ? " Clearing it releases the handle for good." : ""}
          </p>
        </div>

        <div>
          <label htmlFor="bio" className={LABEL}>
            Bio
          </label>
          <textarea
            id="bio"
            name="bio"
            rows={5}
            maxLength={2000}
            defaultValue={authored?.bio ?? ""}
            placeholder="What you build, what you're looking for"
            className={TEXTAREA}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="githubUrl" className={LABEL}>
              GitHub
            </label>
            <input
              id="githubUrl"
              name="githubUrl"
              type="url"
              inputMode="url"
              maxLength={512}
              defaultValue={authored?.githubUrl ?? ""}
              placeholder="https://github.com/…"
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="siteUrl" className={LABEL}>
              Website
            </label>
            <input
              id="siteUrl"
              name="siteUrl"
              type="url"
              inputMode="url"
              maxLength={512}
              defaultValue={authored?.siteUrl ?? ""}
              placeholder="https://"
              className={FIELD}
            />
          </div>
        </div>

        <div className="grid gap-3 pt-1">
          <label className="flex items-start gap-2.5 text-[13.5px] leading-[1.45]">
            <input
              type="checkbox"
              name="profilePublic"
              defaultChecked={isPublic}
              className="mt-[3px] h-4 w-4 shrink-0 accent-foreground"
            />
            <span>
              <span className="font-medium">Show my public page.</span>
              {!hasStanding ? (
                <>
                  {" "}
                  <span className="text-muted-foreground">Available once you maintain a listed product.</span>
                </>
              ) : null}
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-[13.5px] leading-[1.45]">
            <input
              type="checkbox"
              name="openToProject"
              defaultChecked={authored?.openToProject === true}
              className="mt-[3px] h-4 w-4 shrink-0 accent-foreground"
            />
            <span className="font-medium">Open to joining a project.</span>
          </label>
        </div>

        <div className="flex items-center gap-3.5 pt-1">
          <button type="submit" className={BTN_PRIMARY}>
            Save profile
          </button>
        </div>
      </form>

      <section id="digest" className={`${ME_CARD} mt-4 scroll-mt-20`}>
        <h2 className={H2}>The weekly digest</h2>
        <DigestControl
          standing={digest.kind === "ok" ? digest.data.subscription.standing : "never"}
          returnTo="/me"
          compact
        />
      </section>

      <section className={`${ME_CARD} mt-4`}>
        <h2 className={H2}>Account</h2>
        <p className="m-0 mt-3 text-[13.5px] leading-[1.6] text-muted-foreground">
          Signed in as <span className="font-mono text-[12.5px]">{me.subjectId}</span>.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3.5">
          {workspace ? (
            <a
              href={workspace}
              rel="noreferrer noopener"
              className={`${BTN_OUTLINE} gap-2 no-underline`}
            >
              Your workspace on Orunbase
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
            </a>
          ) : null}
          {/* CS3 — everything this person has put here, as one file, from the
              same list the exit reads. A link, not a button: the route
              answers the document as an attachment. */}
          <a
            href="/me/export"
            data-me-export
            className={`${BTN_OUTLINE} gap-2 no-underline`}
          >
            Download your data
            <span className="text-[12px] text-muted-foreground">JSON</span>
          </a>
          <a
            href="/auth/signout"
            className={`${BTN_OUTLINE} gap-2 no-underline`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="text-muted-foreground">
              <path
                d="M6.5 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3M10 11l3-3-3-3M13 8H6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Sign out
          </a>
        </div>
      </section>
    </main>
  );
}

/**
 * The one line above the form. A refusal echoes the service's own reason
 * (bounded, and rendered as text — never markup); an outage says "not
 * saved" and nothing about why, because the page does not know.
 */
function noticeFor(params: { error?: string; field?: string; message?: string; saved?: string }):
  | { kind: "saved" | "refused" | "failed"; text: string }
  | null {
  if (params.saved === "1") return { kind: "saved", text: "Saved." };
  if (params.error === "refused") {
    const reason = (params.message ?? "").trim().slice(0, MAX_REASON);
    const where = fieldLabel(params.field);
    return {
      kind: "refused",
      text: `${where ? `${where}: ` : ""}${reason.length > 0 ? reason : "the service did not accept this change."} Everything else you entered was saved.`,
    };
  }
  if (params.error === "save_failed") {
    return {
      kind: "failed",
      text: "Your last edit was not saved. Try again in a moment.",
    };
  }
  return null;
}

function fieldLabel(field: string | undefined): string | null {
  switch (field) {
    case "displayName":
      return "Display name";
    case "bio":
      return "Bio";
    case "handle":
      return "Handle";
    case "githubUrl":
      return "GitHub";
    case "siteUrl":
      return "Website";
    case "public":
      return "Public page";
    case "openToProject":
      return "Open to joining a project";
    default:
      return null;
  }
}
