import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import {
  MAKER_COUNTER_FORMULAS,
  MAKER_COUNTER_LABELS,
  MAKER_TAB_LABELS,
  OPEN_TO_PROJECT_LABEL,
  OPEN_TO_PROJECT_NOTE,
  PROFILE_STAT_FORMULAS,
  MAKER_HISTORY_EARLIER_LABEL,
  formulaHref,
  makerCardMark,
  makerMarks,
  makerHistoryPath,
  makerPath,
  parseHandle,
  profileTitle,
  type MakerTab,
} from "@openproduct/contracts";

import { fetchMakerPage, publicApexOrigin, type MakerDocument } from "../../public-api";
import { initialsOf } from "../../feed/tile";
import { OpenPill, StatInline } from "../../ui/bits";
import { PAGE_TITLE } from "../../ui/design";
import { FollowButton } from "../../ui/follow-button";
import { AppLink } from "../../ui/link";
import { cardMeta, makerCopy } from "../../ui/og";
import { MakerRows } from "./maker-rows";
import { MakerTabs } from "./maker-tabs";

/**
 * A maker page's header and its tab (openproduct-launch MP0).
 *
 * ONE BODY, THREE ADDRESSES. `/@ada` is the launched tab and `/@ada/upvoted`
 * and `/@ada/comments` are the other two — one component so the header, the
 * counters and the tab strip cannot drift between them, and three addresses so
 * each tab can be linked, bookmarked, crawled and cached (UV2's leaderboard
 * made the same call and for the same reason).
 *
 * THE COUNTERS ARE THE TABS. The design draws three numbers in the header and
 * two of them are the lengths of two tabs — so they are the SAME number,
 * counted once by core and rendered twice. The milestone's own done-when is
 * "the counters agree with the lists", and the way to make that true is for
 * there to be nothing to disagree.
 *
 * MP0 MOVED CG4's THREE NUMBERS OUT OF THEIR CARDS, and the reasoning is in
 * `StatInline`: two of them now sit on the heading of the section that lists
 * what they count, where a reader can check the number against the evidence
 * rather than beside it, and the third rides in the byline. Every one of them
 * kept its published sentence — a number losing its `?` was never on the
 * table (OPC-4, I7).
 */
export function makerMetadata(doc: MakerDocument | null, tab: MakerTab): Metadata {
  if (doc === null) return { title: "Not found", robots: { index: false, follow: false } };
  const title = profileTitle(doc.contributor);
  const origin = publicApexOrigin();
  const description =
    doc.contributor.bio?.trim() ||
    `${title} on openproduct — ${doc.counts.launched} launched, ${doc.counts.upvotesGiven} upvotes given.`;
  const path = tab === "launched" ? `/@${doc.contributor.handle}` : `/@${doc.contributor.handle}/${tab}`;
  // RE0 — ONE CARD FOR ALL THREE TABS, and that is deliberate rather than
  // lazy. The tabs are three views of one person; the card names the person.
  // Three cards would be three near-identical pictures differing only in a
  // word nobody reads at unfurl size, and each would be a separate object for
  // every cache between here and a timeline.
  const card = cardMeta(
    origin,
    `/og/maker/${encodeURIComponent(doc.contributor.handle)}`,
    makerCopy(doc.contributor.handle, doc.contributor.displayName, makerCardMark(doc.marks)).alt,
  );
  return {
    // EACH TAB IS ITS OWN TITLE. Three documents with one title would look
    // like one page to anything that reads titles, which is most of what
    // reads pages.
    title: tab === "launched" ? title : `${title} · ${MAKER_TAB_LABELS[tab]}`,
    description,
    ...(origin ? { alternates: { canonical: `${origin}${path}` } } : {}),
    openGraph: {
      title: `${title} · openproduct`,
      description,
      type: "profile",
      ...(card ? { images: card.images } : {}),
    },
    ...(card ? { twitter: card.twitter } : {}),
  };
}

/** The read, with CG0's grammar checked HERE and only here on this path. */
export async function loadMaker(
  handleParam: string,
  tab: MakerTab,
  /** PE1 — the history page before a moment. */
  before: string | null = null,
): Promise<MakerDocument | null> {
  const parsed = parseHandle(handleParam);
  if (!parsed.ok) return null;
  return fetchMakerPage(parsed.handle, tab, before);
}

export function MakerView({
  doc,
  now,
  links,
  builds,
}: {
  doc: MakerDocument;
  now: number;
  /** The bare page's row of authored links, drawn under the hero's marks
   *  where the design keeps a person's links; the tab pages pass none. */
  links?: ReactNode;
  /** OB6 — the Builds tab's list (every listing they run), drawn by the bare
   *  page in place of the launch rows. The tab pages pass none. */
  builds?: ReactNode;
}) {
  const person = doc.contributor;
  const title = profileTitle(person);

  return (
    <>
      {/* The design's hero: an 84px round mark on the chip fill, the name at
          the page title's 26px, the handle and the byline in muted 14px, the
          bio in their own words, and the three counts inline rather than as
          a strip of cards — `18px 0 8px`, a hairline 24px beneath. */}
      <div className="mb-2 mt-[18px] flex flex-wrap items-start gap-5 border-b border-border pb-6">
        <span
          aria-hidden="true"
          className="grid h-[84px] w-[84px] shrink-0 place-items-center rounded-full bg-secondary font-mono text-[22px] text-copy"
        >
          {initialsOf(title)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className={PAGE_TITLE}>{title}</h1>
          <div className="mt-1.5 text-[14px] text-muted-foreground">
            <span className="font-mono">@{person.handle}</span>
            {/* CG4's `since`, in the byline it belongs in. Coarse on purpose:
                a person's exact join date is not something a stranger needs. */}
            {" · "}
            <StatInline
              value={sinceOf(person.publishedAt)}
              label="on openproduct"
              formula={PROFILE_STAT_FORMULAS.since}
            />
          </div>
          {person.bio ? (
            <p className="m-0 mt-2.5 max-w-[62ch] text-[16px] leading-[1.5] text-copy [text-wrap:pretty]">
              {person.bio}
            </p>
          ) : null}
          <div className="mt-3.5 flex flex-wrap items-center gap-x-[22px] gap-y-2 text-[14px] text-muted-foreground">
            {/* OB6 — the first count is BUILDS, the listings they run:
                the Builds list counts the same array. */}
            <StatInline
              value={person.maintains.length}
              label={MAKER_COUNTER_LABELS.launched}
              formula={MAKER_COUNTER_FORMULAS.launched}
            />
            <StatInline
              value={person.followers}
              label={MAKER_COUNTER_LABELS.followers}
              formula={MAKER_COUNTER_FORMULAS.followers}
            />
            <StatInline
              value={doc.counts.upvotesGiven}
              label={MAKER_COUNTER_LABELS.upvotesGiven}
              formula={MAKER_COUNTER_FORMULAS.upvotesGiven}
            />
            {/* Authored, and false by default — nobody is advertised as
                looking for work without having said so.

                AG3 — THE WORDS COME FROM THE CONTRACT AND SO DOES THE NOTE.
                This pill and the directory card's pill were two string
                literals describing the same tick, which is two places for the
                sentence to drift and, until now, nowhere at all that said
                whose claim it is. Nothing observes availability; a person
                ticked a box (OPC-2). */}
            {person.openToProject ? (
              <OpenPill title={OPEN_TO_PROJECT_NOTE}>{OPEN_TO_PROJECT_LABEL}</OpenPill>
            ) : null}
          </div>
          {/* PE2 — the marks, each derived from an input on the wire and each
              a link to its formula; `title` carries the input in words. None
              renders without its input: `makerMarks` is the only source. */}
          {makerMarks(doc.marks).length > 0 ? (
            <ul className="m-0 mt-3 flex list-none flex-wrap gap-1.5 p-0" aria-label="Marks">
              {makerMarks(doc.marks).map((mark) => (
                <li key={mark.kind}>
                  <AppLink
                    href={formulaHref(mark.formula)}
                    title={mark.input}
                    className="tap inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 text-[12.5px] font-medium text-foreground no-underline transition-colors hover:border-faint"
                  >
                    {mark.label}
                  </AppLink>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {/* FL0's control. Its count is public and identical in every visitor's
            HTML; whether YOU follow them arrives after paint from the XP2
            overlay, so the anonymous and signed-in renders are byte-identical
            (I6). The count beside it is the same `followers` the header
            already printed — one number, not two. */}
        <FollowButton
          kind="person"
          value={person.handle}
          followers={person.followers}
          returnTo={`/@${person.handle}`}
          size="hero"
          countHidden
        />
        {/* The links: a full-width row under the hero's three, indented past
            the mark on a wide screen so it reads as the text column's last
            line, and the whole width on a phone — where the text column,
            squeezed beside Follow, is too narrow for an address. */}
        {links ? (
          <div className="mt-1 flex basis-full flex-wrap items-center gap-2.5 sm:pl-[104px]">{links}</div>
        ) : null}
      </div>

      <MakerTabs handle={person.handle} current={doc.tab} counts={doc.counts} builds={person.maintains.length} />

      {doc.tab === "launched" && builds !== undefined ? (
        builds
      ) : (
        <MakerRows
          tab={doc.tab}
          rows={doc.rows}
          counts={doc.counts}
          now={now}
          returnTo={makerPath(person.handle, doc.tab)}
        />
      )}
      {/* PE1 — the rest of the history is an ADDRESS, not a button: the page
          before this one's last moment, cacheable like every other. Absent on
          the last page rather than disabled — there is nothing to say. */}
      {doc.tab === "history" && doc.nextCursor ? (
        <p className="m-0 mt-5 text-[14.5px]">
          <AppLink
            href={makerHistoryPath(person.handle, doc.nextCursor)}
            className="tap text-foreground underline underline-offset-4"
          >
            {MAKER_HISTORY_EARLIER_LABEL} →
          </AppLink>
        </p>
      ) : null}
    </>
  );
}

/** Null means the page could not be read at all — not that this person has
 *  done nothing. An empty room and a locked door look nothing alike (OD5). */
export function makerNotFound(): never {
  notFound();
}

/** How long the PUBLIC page has existed. */
function sinceOf(publishedAt: string): string {
  const at = Date.parse(publishedAt);
  if (Number.isNaN(at)) return "—";
  return new Date(at).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
