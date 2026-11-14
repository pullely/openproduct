import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { consoleOrigin } from "@/lib/platform";

import { readSession } from "../../auth/session-server";
import { BOARD_CARD_TITLE, BTN_SOFT, EYEBROW, NOTICE_WARN, PAGE_TITLE } from "../../ui/design";
import { AppLink } from "../../ui/link";
import { GLYPH_BACK, GLYPH_BELL, GLYPH_LOCK, GLYPH_OUT, GLYPH_PERSON, Glyph } from "../glyph";
import { fetchDigestStanding, fetchMe } from "../me-api";
import { SETTINGS_MAIN } from "../nav";
import { signInFor } from "../section";
import { MeUnavailable } from "../unavailable";
import { SaveBar } from "./save-bar";

/**
 * Settings (openproduct-redesign OPR1, boards `Settings` and
 * `PhoneSettings`) — the controls for who openproduct.live thinks you are.
 *
 * EVERYTHING HERE LIVED ON `/me` (openproduct-home OH2, CG1): the profile
 * form with the handle that is your address and the two switches for the
 * public half, the weekly digest, and the account row with your data and the
 * way out. `/me` is the profile itself now; its Edit profile comes here.
 * Nothing was added on the way: a setting is on this page because it existed.
 *
 * THE BOARD'S SHAPE: the title with Save opposite it, a side list of the
 * sections on a desktop, and the sections as flat cards in one scroll — the
 * side list jumps to a card rather than swapping one for another, so a phone
 * and a desktop read the same document and the page ships no script for it.
 *
 * WHAT THE BOARD DRAWS THAT IS NOT HERE, because the product has no such
 * setting today: a photo to change, a headline, a switch per notification
 * kind (the digest is the one subscription there is), inviting somebody to a
 * product's crew, and deleting the account.
 *
 * A server component with an EXPLICIT session read, like every signed-in
 * page (design.md §1): signed out is a redirect to sign-in and back here.
 * Never cached — the whole document is one person's.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Settings" };

/** This page's address: where the forms return and where sign-in comes back. */
const HERE = "/me/settings";

/** The profile form's id: Save and Discard sit in the title row, outside the
 *  card, and are bound to the form by it. */
const PROFILE_FORM = "settings-profile";

/** How much of a refusal's reason the notice will echo back. */
const MAX_REASON = 240;

/** The sections, in the board's order — the side list and the cards' ids. */
const SECTIONS = [
  { id: "profile", label: "Profile", glyph: GLYPH_PERSON, tile: "bg-amber-soft text-amber-ink" },
  { id: "notifications", label: "Notifications", glyph: GLYPH_BELL, tile: "bg-version-soft text-version" },
  { id: "account", label: "Account", glyph: GLYPH_LOCK, tile: "bg-sunken text-foreground" },
] as const;

/** A settings card: the flat card, 18px inside; 14px on a phone. It stops
 *  24px under the top when the side list jumps to it. */
const CARD = "scroll-mt-6 rounded-[16px] bg-card p-[18px] max-sm:p-3.5";

/** A field's label: the mono label on a desktop (board `Settings`), 13px/600
 *  in sentence case on a phone (board `PhoneSettings`). */
const FIELD_LABEL =
  "font-mono text-mono-label uppercase text-muted-foreground max-sm:font-sans max-sm:text-[13px] max-sm:font-semibold max-sm:normal-case max-sm:tracking-normal max-sm:text-foreground";

/** The boards' field skin: the lighter well under an inset hairline, the
 *  amber ring on focus. */
const FIELD_SKIN =
  "bg-well ring-1 ring-inset ring-foreground/[0.06] transition-shadow focus-within:ring-2 focus-within:ring-endorse";

/** A text field: 44px, a pill on a desktop and 14px round on a phone, 16px
 *  type (which is also what stops a phone zooming on focus). */
const FIELD = `box-border h-[44px] w-full rounded-full border-0 px-[18px] text-nozoom text-foreground outline-none placeholder:text-muted-foreground max-sm:rounded-[14px] max-sm:px-3.5 ${FIELD_SKIN}`;

/** A switch's row: the label on the left, the switch on the right, a hairline
 *  above; 56px, 48px on a phone. */
const SWITCH_ROW =
  "flex min-h-[56px] items-center gap-3.5 border-t border-line px-1 max-sm:min-h-[48px] max-sm:gap-3 max-sm:px-0";

/** The switch's track and knob (the boards' 44×26 with a 20px knob): ink
 *  under an amber knob when on, a 14% wash under a white one when off. */
const TRACK = "relative block h-[26px] w-[44px] shrink-0 rounded-full transition-colors";
const KNOB = "absolute left-[3px] top-[3px] block h-5 w-5 rounded-full transition-transform";

/**
 * A switch that is a checkbox in a form: the real control is the input, and
 * the track beside it draws its state with `peer-checked`. It posts with the
 * form like the checkbox it replaced, and works without script.
 */
function SwitchField({
  name,
  label,
  note,
  defaultChecked,
}: {
  name: string;
  label: string;
  note?: string | null;
  defaultChecked: boolean;
}) {
  return (
    <label className={`${SWITCH_ROW} cursor-pointer`}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">{label}</span>
        {note ? <span className="text-[13px] text-muted-foreground">{note}</span> : null}
      </span>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={`${TRACK} bg-foreground/[0.14] peer-checked:bg-primary peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring [&>span]:bg-card peer-checked:[&>span]:translate-x-[18px] peer-checked:[&>span]:bg-brand-amber-inverted`}
      >
        <span className={KNOB} />
      </span>
    </label>
  );
}

export default async function SettingsPage(props: {
  searchParams: Promise<{ error?: string; field?: string; message?: string; saved?: string }>;
}) {
  const session = await readSession();
  if (!session) redirect(signInFor(HERE));

  // BOTH IN ONE ROUND TRIP. A failed digest read renders the switch in its
  // "never asked" state rather than taking the page down — the standing is a
  // preference, and being unable to read it is not a reason to lose the
  // profile somebody came here to edit.
  const [result, digest] = await Promise.all([
    fetchMe(session.accessToken),
    fetchDigestStanding(session.accessToken),
  ]);
  // A dead token (expired mid-session, revoked from the console) reads as
  // signed out; a service failure renders as one, never as a redirect loop.
  if (result.kind === "unauthorized") redirect(signInFor(HERE));
  if (result.kind === "unavailable") return <MeUnavailable />;
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
  const subscribed = digest.kind === "ok" && digest.data.subscription.standing === "subscribed";
  const workspace = consoleOrigin();

  return (
    <main className={`${SETTINGS_MAIN} group/settings`} data-settings>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* The phone board's way back to the profile; a desktop has the
              header for that. */}
          <AppLink
            href="/me"
            aria-label="Back to your profile"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-card text-foreground no-underline sm:hidden"
          >
            <Glyph d={GLYPH_BACK} size={17} />
          </AppLink>
          <h1 className={PAGE_TITLE}>Settings</h1>
        </div>
        <SaveBar formId={PROFILE_FORM} saved={notice?.kind === "saved"} />
      </div>

      {notice && notice.kind !== "saved" ? (
        <p role="status" className={`m-0 max-w-[65ch] ${NOTICE_WARN}`}>
          {notice.text}
        </p>
      ) : null}

      <div className="flex items-start gap-7 max-md:flex-col max-md:items-stretch">
        {/* The side list (board `Settings`). A desktop's: on a phone the
            cards are one short scroll and the board draws no list. */}
        <nav
          aria-label="Settings sections"
          className="sticky top-6 flex w-[260px] shrink-0 flex-col gap-0.5 rounded-[16px] bg-card p-2.5 max-md:hidden"
        >
          <div className={`${EYEBROW} px-2.5 pb-2 pt-1.5`}>Account settings</div>
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="flex min-h-[40px] items-center gap-3 rounded-[14px] px-2.5 text-[15px] text-copy no-underline transition-colors hover:bg-accent"
            >
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] ${section.tile}`}>
                <Glyph d={section.glyph} />
              </span>
              <span className="flex-1">{section.label}</span>
              {section.id === "profile" ? <UnsavedDot /> : null}
            </a>
          ))}
        </nav>

        <div className="flex min-w-0 max-w-[720px] flex-1 flex-col gap-3.5 max-md:max-w-none max-sm:gap-2.5">
          <section id="profile" aria-labelledby="h-profile" className={CARD}>
            <form
              id={PROFILE_FORM}
              method="post"
              action="/me/profile"
              className="flex flex-col gap-[22px] max-sm:gap-3"
            >
              {/* What the page rendered, so the handler writes only what
                  CHANGED — an untouched handle field must not re-claim, and
                  an empty one on a form that never had a handle must not
                  release (CG0: a release is permanent). */}
              <input type="hidden" name="currentHandle" value={handle ?? ""} />
              <input type="hidden" name="currentPublic" value={String(isPublic)} />

              <div className="flex items-center gap-2">
                <h2 id="h-profile" className={BOARD_CARD_TITLE}>
                  Profile
                </h2>
                <UnsavedDot className="md:hidden" />
              </div>

              <label className="flex flex-col gap-1.5 max-sm:gap-1">
                <span className={FIELD_LABEL}>Name</span>
                <input
                  name="displayName"
                  type="text"
                  maxLength={120}
                  defaultValue={shownName ?? ""}
                  placeholder="How you want to appear"
                  className={FIELD}
                />
              </label>

              <label className="flex flex-col gap-1.5 max-sm:gap-1">
                <span className={FIELD_LABEL}>Handle</span>
                {/* No line of explanation under the field (the owner's rule):
                    the format is the field's own tooltip, and a handle the
                    service will not take comes back with its reason. */}
                <span
                  className={`flex h-[44px] items-center overflow-hidden rounded-full max-sm:rounded-[14px] ${FIELD_SKIN}`}
                >
                  <span className="pl-[18px] font-mono text-[13px] text-muted-foreground max-sm:pl-3.5">
                    openproduct.live/@
                  </span>
                  <input
                    name="handle"
                    type="text"
                    inputMode="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={39}
                    defaultValue={handle ?? ""}
                    placeholder="your-handle"
                    title="Lowercase letters, digits and hyphens"
                    className="h-full min-w-0 flex-1 border-0 bg-transparent pl-0.5 pr-[18px] text-nozoom text-foreground outline-none placeholder:text-muted-foreground max-sm:pr-3.5"
                  />
                </span>
              </label>

              <label className="flex flex-col gap-1.5 max-sm:gap-1">
                <span className={FIELD_LABEL}>Bio</span>
                <textarea
                  name="bio"
                  rows={5}
                  maxLength={2000}
                  defaultValue={authored?.bio ?? ""}
                  placeholder="What you build, what you're looking for"
                  className={`box-border w-full rounded-[22px] border-0 px-[18px] py-3 text-nozoom leading-[1.5] text-foreground outline-none placeholder:text-muted-foreground max-sm:rounded-[14px] max-sm:px-3.5 ${FIELD_SKIN}`}
                />
              </label>

              <div className="grid gap-[22px] sm:grid-cols-2 max-sm:gap-3">
                <label className="flex flex-col gap-1.5 max-sm:gap-1">
                  <span className={FIELD_LABEL}>GitHub</span>
                  <input
                    name="githubUrl"
                    type="url"
                    inputMode="url"
                    maxLength={512}
                    defaultValue={authored?.githubUrl ?? ""}
                    placeholder="https://github.com/…"
                    className={FIELD}
                  />
                </label>
                <label className="flex flex-col gap-1.5 max-sm:gap-1">
                  <span className={FIELD_LABEL}>Website</span>
                  <input
                    name="siteUrl"
                    type="url"
                    inputMode="url"
                    maxLength={512}
                    defaultValue={authored?.siteUrl ?? ""}
                    placeholder="https://"
                    className={FIELD}
                  />
                </label>
              </div>

              <div className="flex flex-col">
                {/* The second line is a STATE, not an explanation of the
                    control: without a listed product the public page cannot
                    be seen, and a switch that appears to do nothing is the
                    thing `hasStanding` is sent to prevent. */}
                <SwitchField
                  name="profilePublic"
                  label="Show my public page"
                  note={hasStanding ? null : "Available once you maintain a listed product"}
                  defaultChecked={isPublic}
                />
                <SwitchField
                  name="openToProject"
                  label="Open to joining a project"
                  defaultChecked={authored?.openToProject === true}
                />
              </div>
            </form>
          </section>

          <section id="notifications" aria-labelledby="h-notifications" className={`${CARD} max-sm:pb-1.5`}>
            <h2 id="h-notifications" className={`${BOARD_CARD_TITLE} mb-2.5 max-sm:mb-2`}>
              Notifications
            </h2>
            {/* THE ONE SUBSCRIPTION THERE IS (openproduct-commons LC5). Its
                own form, as it always was: the switch IS the submit, it posts
                to the route that reads the session, and comes back here —
                nothing about it waits for Save. */}
            <form method="post" action="/me/digest" className={SWITCH_ROW}>
              <input type="hidden" name="return_to" value={HERE} />
              <input type="hidden" name="subscribed" value={String(!subscribed)} />
              <span className="min-w-0 flex-1 font-semibold">Weekly digest</span>
              <button
                type="submit"
                aria-pressed={subscribed}
                aria-label="Weekly digest"
                data-digest-switch
                className="grid h-10 w-14 shrink-0 cursor-pointer place-items-center border-0 bg-transparent p-0 max-sm:-mr-1.5 max-sm:h-11"
              >
                <span className={`${TRACK} ${subscribed ? "bg-primary" : "bg-foreground/[0.14]"}`}>
                  <span
                    className={`${KNOB} ${subscribed ? "translate-x-[18px] bg-brand-amber-inverted" : "bg-card"}`}
                  />
                </span>
              </button>
            </form>
          </section>

          <section
            id="account"
            aria-labelledby="h-account"
            className={`${CARD} flex flex-col gap-[18px] max-sm:gap-2.5`}
          >
            <h2 id="h-account" className={BOARD_CARD_TITLE}>
              Account
            </h2>
            <div className="flex flex-wrap items-center gap-3.5 rounded-[16px] bg-well p-3.5 max-sm:gap-3 max-sm:rounded-[14px] max-sm:p-3">
              <span
                aria-hidden="true"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-primary text-primary-foreground max-sm:rounded-[12px]"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  focusable="false"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 3v9l6 3" className="stroke-brand-amber-inverted" />
                </svg>
              </span>
              <span className="flex min-w-0 flex-[1_1_180px] flex-col">
                <span className="font-semibold leading-[1.3]">Signed in with Orunbase</span>
                <span className="break-all font-mono text-[13px] text-muted-foreground">{me.subjectId}</span>
              </span>
              <a href="/auth/signout" className={`${BTN_SOFT} max-sm:w-full`}>
                Sign out
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 border-t border-line pt-[18px] max-sm:flex-col max-sm:items-stretch max-sm:pt-2.5">
              {workspace ? (
                <a href={workspace} rel="noreferrer noopener" className={BTN_SOFT}>
                  Your workspace on Orunbase
                  <Glyph d={GLYPH_OUT} size={13} className="text-muted-foreground" />
                </a>
              ) : null}
              {/* CS3 — everything this person has put here, as one file, from
                  the same list the exit reads. A link, not a button: the
                  route answers the document as an attachment. */}
              <a href="/me/export" data-me-export className={BTN_SOFT}>
                Download your data
                <span className="text-[13px] font-normal text-muted-foreground">JSON</span>
              </a>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

/** The amber dot that says the profile form holds changes nobody saved. Drawn
 *  by CSS from the page's `data-dirty`, which the save bar sets; the bar's
 *  own status word is what a screen reader hears. */
function UnsavedDot({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`hidden h-2 w-2 shrink-0 rounded-full bg-amber group-data-[dirty]/settings:block ${className}`}
    />
  );
}

/**
 * The outcome of the last save. "Saved" is the save bar's status word; a
 * refusal echoes the service's own reason (bounded, and rendered as text —
 * never markup); an outage says "not saved" and nothing about why, because
 * the page does not know.
 */
function noticeFor(params: { error?: string; field?: string; message?: string; saved?: string }):
  | { kind: "saved" | "refused" | "failed"; text: string }
  | null {
  if (params.saved === "1") return { kind: "saved", text: "Saved" };
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
      return "Name";
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
