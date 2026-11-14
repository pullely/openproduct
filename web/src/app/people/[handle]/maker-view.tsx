import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import {
  MAKER_COUNTER_FORMULAS,
  MAKER_COUNTER_LABELS,
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
  type FormulaId,
  type MakerTab,
} from "@openproduct/contracts";

import { fetchMakerPage, publicApexOrigin, type MakerDocument } from "../../public-api";
import { initialsOf } from "../../feed/tile";
import { OpenPill, StatInline } from "../../ui/bits";
import {
  BOARD_COLUMNS_NARROW,
  BOARD_STACK,
  CARD,
  COVER_PERSON,
  FOLLOW_PILL_INK,
  PAGE_TITLE,
  SIDE_CARD,
  SIDE_TITLE,
} from "../../ui/design";
import { FollowButton } from "../../ui/follow-button";
import { AppLink } from "../../ui/link";
import { cardMeta, makerCopy } from "../../ui/og";
import { MakerRows } from "./maker-rows";
import { MakerTabs, SECTION_LABELS } from "./maker-tabs";
import { ProductRows } from "./product-rows";

/**
 * A person's profile card and the section under it (openproduct-launch MP0,
 * redrawn to the redesign's `Person` board in OPR1).
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
    title: tab === "launched" ? title : `${title} · ${SECTION_LABELS[tab]}`,
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
  aside,
}: {
  doc: MakerDocument;
  now: number;
  /** The bare page's row of authored links, drawn under the profile card's
   *  facts where a person's links belong; the other sections pass none. */
  links?: ReactNode;
  /** OB6 — the default section's list (every listing they run), drawn by the
   *  bare page in place of the launch rows. The other sections pass none. */
  builds?: ReactNode;
  /** The bare page's side card. Every other section shows the person's
   *  products there (board `Person`), which the bare page has as its list. */
  aside?: ReactNode;
}) {
  const person = doc.contributor;
  const title = profileTitle(person);
  const marks = makerMarks(doc.marks);
  const products = person.maintains.length;
  const side =
    doc.tab === "launched" && builds !== undefined ? (
      aside
    ) : products > 0 ? (
      <section className={SIDE_CARD} aria-labelledby="maker-products">
        <h2 id="maker-products" className={SIDE_TITLE}>
          Products
        </h2>
        <ProductRows listings={person.maintains} />
      </section>
    ) : null;

  return (
    <>
      {/* The profile card (boards `Person`, `PhonePerson`): a cover band, the
          92px round mark overlapping it, the name as the page's one `h1`,
          their own line about themselves, the line of facts — and ONE
          Follow, which follows the PERSON: this card is the only place on
          the site a person is followed (owner rule 3). The sections sit in
          its bottom edge as pills. */}
      <section aria-label="Profile" className={CARD}>
        <div aria-hidden="true" className={COVER_PERSON} />
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-4 px-[30px] pb-5 max-sm:px-[14px] max-sm:pb-3">
          <span
            aria-hidden="true"
            className="col-start-1 row-start-1 -mt-[46px] grid h-[92px] w-[92px] shrink-0 place-items-center rounded-full bg-sunken text-[30px] font-semibold text-copy ring-[5px] ring-card max-sm:-mt-[36px] max-sm:h-[72px] max-sm:w-[72px] max-sm:text-[28px] max-sm:ring-4"
          >
            {initialsOf(title)}
          </span>
          {/* FL0's control. Whether YOU follow them arrives after paint from
              the XP2 overlay, so the anonymous and signed-in renders are
              byte-identical (I6). At the card's bottom right on a wide
              screen; beside the mark on a phone, as the phone board has it. */}
          <div className={`col-start-2 row-span-2 row-start-1 self-end max-sm:row-span-1 ${FOLLOW_PILL_INK}`}>
            <FollowButton
              kind="person"
              value={person.handle}
              followers={person.followers}
              returnTo={`/@${person.handle}`}
              size="hero"
              countHidden
            />
          </div>
          <div className="col-start-1 row-start-2 mt-2 flex min-w-0 flex-col gap-2 max-sm:col-span-2 max-sm:mt-1.5 max-sm:gap-1.5">
            <h1 className={`${PAGE_TITLE} break-words`}>{title}</h1>
            {/* In their own words (CG-4): nothing here is copied from an
                Orunbase account. */}
            {person.bio ? (
              <p className="m-0 max-w-[62ch] text-[15px] leading-[1.5] text-copy [text-wrap:pretty]">
                {person.bio}
              </p>
            ) : null}
            {/* The line of facts (board: "Maker of 1 product · on openproduct
                since …"). Every number keeps the address of its sentence
                (OPC-4, I7) through `StatInline` — the design draws no `?`, so
                the door is there for a keyboard and a screen reader.
                A count that is zero is not said: the line states what there
                is. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] leading-[1.4] text-muted-foreground">
              <span className="font-mono">@{person.handle}</span>
              {/* OB6 — the listings they RUN: the Products list counts the
                  same array. */}
              {products > 0 ? (
                <span className="inline-flex items-center gap-2">
                  <Dot />
                  <span className="whitespace-nowrap">
                    Maker of{" "}
                    <StatInline
                      value={person.maintains.length}
                      label={products === 1 ? "product" : "products"}
                      formula={MAKER_COUNTER_FORMULAS.launched}
                    />
                  </span>
                </span>
              ) : null}
              {/* CG4's `since`. Coarse on purpose: a person's exact join date
                  is not something a stranger needs. */}
              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                <Dot />
                on openproduct since {sinceOf(person.publishedAt)}
                <FormulaDoor label="on openproduct" formula={PROFILE_STAT_FORMULAS.since} />
              </span>
              {person.followers > 0 ? (
                <span className="inline-flex items-center gap-2">
                  <Dot />
                  <StatInline
                    value={person.followers}
                    label={MAKER_COUNTER_LABELS.followers}
                    formula={MAKER_COUNTER_FORMULAS.followers}
                  />
                </span>
              ) : null}
              {/* What they gave: the Upvoted section lists them, and its pill
                  carries the same number. */}
              {doc.counts.upvotesGiven > 0 ? (
                <span className="inline-flex items-center gap-2">
                  <Dot />
                  <StatInline
                    value={doc.counts.upvotesGiven}
                    label={MAKER_COUNTER_LABELS.upvotesGiven}
                    formula={MAKER_COUNTER_FORMULAS.upvotesGiven}
                  />
                </span>
              ) : null}
            </div>
            {/* Authored, and false by default — nobody is advertised as
                looking for work without having said so.

                AG3 — THE WORDS COME FROM THE CONTRACT AND SO DOES THE NOTE.
                Nothing observes availability; a person ticked a box (OPC-2).

                PE2 — the marks, each derived from an input on the wire and
                each a link to its formula; `title` carries the input in
                words. None renders without its input: `makerMarks` is the
                only source. */}
            {person.openToProject || marks.length > 0 ? (
              <ul className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0" aria-label="Marks">
                {person.openToProject ? (
                  <li>
                    <OpenPill title={OPEN_TO_PROJECT_NOTE}>{OPEN_TO_PROJECT_LABEL}</OpenPill>
                  </li>
                ) : null}
                {marks.map((mark) => (
                  <li key={mark.kind}>
                    <AppLink
                      href={formulaHref(mark.formula)}
                      title={mark.input}
                      className="tap inline-flex items-center rounded-full bg-sunken px-2.5 py-1 text-[13px] font-medium text-foreground no-underline transition-colors hover:bg-foreground/[0.1]"
                    >
                      {mark.label}
                    </AppLink>
                  </li>
                ))}
              </ul>
            ) : null}
            {/* The links: where else to find this person, drawn beside the
                facts about them here. */}
            {links ? <div className="flex flex-wrap items-center gap-2.5">{links}</div> : null}
          </div>
        </div>
        <MakerTabs handle={person.handle} current={doc.tab} counts={doc.counts} builds={person.maintains.length} />
      </section>

      {/* The two columns (board `Person`): what the section lists, beside the
          side card. One column when there is no side card to draw, and on a
          phone. */}
      <div className={side ? BOARD_COLUMNS_NARROW : undefined}>
        <div className={BOARD_STACK}>
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
          {/* PE1 — the rest of the history is an ADDRESS, not a button: the
              page before this one's last moment, cacheable like every other.
              Absent on the last page rather than disabled — there is nothing
              to say. */}
          {doc.tab === "history" && doc.nextCursor ? (
            <p className="m-0 px-2 text-[15px]">
              <AppLink
                href={makerHistoryPath(person.handle, doc.nextCursor)}
                className="tap font-semibold text-link no-underline hover:underline hover:underline-offset-[3px]"
              >
                {MAKER_HISTORY_EARLIER_LABEL} →
              </AppLink>
            </p>
          ) : null}
        </div>
        {side ? <aside className={BOARD_STACK}>{side}</aside> : null}
      </div>
    </>
  );
}

/** The `·` between two facts. */
function Dot() {
  return <span aria-hidden="true">·</span>;
}

/**
 * The address of a published sentence (OPC-4) for the one fact here that is
 * not a count — *since*, whose words come before its value — exactly as
 * `StatInline` draws it: visually hidden until focus, because the design
 * draws no `?` and a keyboard and a screen reader still have to find one.
 */
function FormulaDoor({ label, formula }: { label: string; formula: FormulaId }) {
  return (
    <AppLink
      href={formulaHref(formula)}
      aria-label={`How "${label}" is computed`}
      title={`How "${label}" is computed`}
      className="sr-only ml-1 font-mono text-[13px] font-normal text-muted-foreground focus:not-sr-only focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
    >
      ?
    </AppLink>
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
