import { redirect } from "next/navigation";

import {
  INBOX_MARK_READ,
  inboxHref,
  inboxSentence,
  type InboxItem,
} from "@openproduct/contracts";

import { readSession } from "../../auth/session-server";
import { BTN_SMALL, PAGE_TITLE } from "../../ui/design";
import { fetchInbox } from "../me-api";
import { ME_MAIN, MeNav } from "../nav";
import { MeUnavailable } from "../unavailable";

import { AppLink } from "../../ui/link";

/**
 * The inbox (openproduct-launch NF0).
 *
 * THE ONE OPENPRODUCT SURFACE THAT IS ABOUT THE READER. Every public page here
 * is one cacheable document that resolves no actor (OPC-1, I6); this one is
 * `force-dynamic` and reads the session, because it is not a page about a
 * product with a personal decoration on it — it is a page whose entire content
 * is one person's. The invariant is not bent, it simply does not apply: I6 is
 * about the pages a stranger can crawl.
 *
 * NO PROSE IS STORED. Every sentence below is composed here from the
 * contract's phrasebook and a row that holds a kind and its referents, so a
 * wording somebody regrets is a deploy rather than a backfill.
 *
 * READING IT WRITES NOTHING. The cursor moves only when somebody presses the
 * button — which is the whole reason read state is a cursor rather than a flag
 * per row, on a page whose purpose is to be looked at.
 */
export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const session = await readSession();
  if (!session) redirect("/signin?return_to=%2Fme%2Fnotifications");

  const result = await fetchInbox(session.accessToken);
  if (result.kind === "unauthorized") redirect("/signin?return_to=%2Fme%2Fnotifications");
  if (result.kind === "unavailable") return <MeUnavailable active="notifications" />;

  const { items, unread } = result.data;

  return (
    <main className={ME_MAIN}>
      <MeNav active="notifications" />

      <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
        <h1 className={PAGE_TITLE}>Notifications</h1>
        {/* The ONE read action. A form rather than a link, because it changes
            something — and no client JS, like every other act here. */}
        {unread > 0 ? (
          <form method="post" action="/me/notifications/read">
            <button type="submit" className={`${BTN_SMALL} border-border`}>
              {INBOX_MARK_READ}
            </button>
          </form>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="m-0 mt-6 max-w-[65ch] text-[14px] leading-[1.6] text-muted-foreground">
          Nothing yet.
        </p>
      ) : (
        <ul className="m-0 mt-6 grid list-none gap-2.5 p-0" data-notification-tiles>
          {items.map((item) => (
            <Row key={item.id} item={item} />
          ))}
        </ul>
      )}
    </main>
  );
}

/**
 * One notification, as a tile (openproduct-calm-pages CP5, CP-R6): a 7px dot,
 * the sentence, its date at the right edge, in a 16px-radius card 10px from
 * the next — a feed is denser than a list of builds. Unread tiles sit on
 * `--endorse-soft` (the accent's one other meaning, CP-R1); read ones on the
 * card, with the dot still occupying its column so the text does not shift.
 */
function Row({ item }: { item: InboxItem }) {
  return (
    <li
      className={`flex items-start gap-3.5 rounded-[16px] border border-border px-6 py-4 max-sm:px-4 ${
        item.unread ? "bg-endorse-soft" : "bg-card"
      }`}
    >
      {/* UNREAD IS A DOT, and it carries a word for anybody not reading the
          colour. A bare coloured dot is a state a screen reader cannot
          report and a colour-blind reader cannot see. */}
      <span
        aria-hidden={item.unread ? undefined : "true"}
        className={`mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full ${
          item.unread ? "bg-endorse" : "bg-transparent"
        }`}
      >
        {item.unread ? <span className="sr-only">Unread. </span> : null}
      </span>
      <AppLink
        href={inboxHref(item)}
        className="min-w-0 flex-1 text-[15px] leading-[1.5] text-foreground no-underline hover:text-copy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {inboxSentence(item)}
      </AppLink>
      <span className="shrink-0 text-[12.5px] leading-[1.5] text-muted-foreground">
        {day(item.createdAt)}
      </span>
    </li>
  );
}

function day(iso: string): string {
  const at = Date.parse(iso);
  return Number.isNaN(at)
    ? ""
    : new Date(at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
}
