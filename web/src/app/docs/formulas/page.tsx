import type { Metadata } from "next";

import { allFormulas, formulaAnchor } from "@openproduct/contracts";

import { CRUMBS, H2, PAGE_NARROW, PAGE_TITLE } from "../../ui/design";

import { AppLink } from "../../ui/link";

/**
 * `/docs/formulas` (openproduct-commons DS2) — where every ordering on this
 * site can be read in full.
 *
 * OPC-4 SAYS NO ORDERING SHIPS WITHOUT A SENTENCE A PERSON CAN READ. `/docs`
 * lists the sentences; this page is where each one has an ADDRESS. That
 * difference matters more than it looks: a formula id rendered beside a number
 * is only useful if it is a link somebody can follow, and a link is only
 * honest if it lands on the thing it named. So the anchor is derived from the
 * id (`formulaAnchor`) rather than written beside it, and a test walks every
 * `FormulaId` and asserts this page renders its anchor. A formula that exists
 * and a formula that is reachable cannot be different sets.
 *
 * The page is rendered from the SAME registry the rankers import. There is no
 * copy of a sentence anywhere in this file — a hand-written formula page is a
 * second source of truth that drifts silently and is discovered by whoever
 * trusted it.
 *
 * IT IS STATIC AND RESOLVES NO ACTOR, like every other public page (OPC-1).
 * The order these formulas produce is the same for everyone, which is the
 * whole reason it can be published at all.
 */
export const revalidate = 600;

export const metadata: Metadata = {
  title: "How every number is computed",
  description:
    "Every ordering and computed figure on openproduct, each in one sentence. No relevance score, no engagement signal.",
};

/** The clusters, in the order a reader meets them on the site. */
const GROUPS: ReadonlyArray<{ prefix: string; label: string; blurb: string }> = [
  {
    prefix: "sort.",
    label: "The orders you can choose",
    blurb:
      "Three, and no fourth. Each is a sentence rather than a score, which is what makes it arguable — and an order nobody can argue with is an order nobody can check.",
  },
  {
    // IN3 — the one rule on this page that decides PRESENCE rather than
    // position, which is why it gets its own group instead of sitting under
    // the orders. Grouping it with them would invite the reading WC-D
    // refused: that filling in a listing moves it up something.
    prefix: "catalog.",
    label: "What appears in the catalogue",
    blurb:
      "Not an ordering. This is the one rule here that decides whether a listing is in a list at all, and it deliberately does not decide where: a listing that clears it takes exactly the position its observed activity gives it, and one that has not is absent rather than last. It asks for two things a reader needs before they can decide whether to click, and there is nothing to compete on — clearing the bar twice buys nothing.",
  },
  {
    prefix: "search.",
    label: "Search",
    blurb:
      "Relevance is an editorial position wearing a technical name: it decides whose work is seen. So it is a published rule rather than a library's weighting, and it takes no input about who is searching.",
  },
  {
    prefix: "activity.",
    label: "Activity",
    blurb:
      "Observed from the repository, never from anything a maintainer types. A number here is always accompanied on the page by when it was observed.",
  },
  {
    prefix: "endorsements.",
    label: "Upvotes",
    blurb:
      "One person, one upvote, and the total is the discounted one. A save is a different, private act and is counted nowhere public.",
  },
  {
    prefix: "similar.",
    label: "Similar products",
    blurb:
      "A recommendation is an ordering, and OPC-4 does not carve out recommendations. No embeddings, no co-visitation, no behavioural signal.",
  },
  {
    prefix: "launch.",
    label: "Launches",
    blurb: "The board's order shares no inputs with the directory's, deliberately.",
  },
  {
    // FL1 — the feed's sidebar. Every panel there is an ORDERING, and OPC-4
    // does not carve out sidebars.
    prefix: "topic.",
    label: "Topics",
    blurb:
      "The panel this feeds is called Active rather than Trending, and the difference is the whole rule: activity is measured, and trending would be a claim about what readers are doing that this product does not observe.",
  },
  {
    prefix: "collection.",
    label: "Collections",
    blurb:
      "A collection is already an attributable editorial act by a named curator (LC4). There is no `featured` flag over the top of that, because a second layer of selection would be an unattributable one.",
  },
  {
    prefix: "openings.",
    label: "Roles a listing is looking to fill",
    blurb:
      "One count and one order. A role on a quiet product is as findable as a role on a busy one — nothing here is weighted by how popular the listing is or by how many people have already applied.",
  },
  {
    prefix: "people.",
    label: "People",
    blurb:
      "Nobody is ordered by merit anywhere on this estate. The one people-ordering that exists lists those who ticked `open to one more project` themselves, in the order they ticked it — not by the upvotes their products earned, not by how much they have launched, and not by how many already follow them.",
  },
  {
    // DQ1 — the one count on this estate that deliberately has no discount,
    // because it is the one that orders nothing.
    prefix: "comment.",
    label: "Comments",
    blurb:
      "A comment's upvotes are public and one per person, and they change nothing about what anybody is shown — comments appear in the order they were written. That is why this is the one count here with no integrity discount: the discount protects orderings, and this is not one.",
  },
  {
    // MP0 — a maker page's three tabs. Each is a list of somebody else's work
    // ordered by something this person did, which is the kind of ordering that
    // most needs its sentence in public.
    prefix: "maker.",
    label: "A maker's own page",
    blurb:
      "What a person did, in the order they did it — never a ranking of people. The upvotes tab lists a public act the vote control announces at the moment it is pressed; a save is private, is counted nowhere, and has no tab.",
  },
  {
    prefix: "contributor.",
    label: "The numbers on a person's profile",
    blurb:
      "Held to a higher bar than anything else here, because they are claims about somebody's work rather than about a product. Each is counted from acts that person took: a role they hold, a place they confirmed. One of them is deliberately absent rather than zero — nothing observes it, and inventing a number about a person is the one place a made-up figure does real harm.",
  },
  {
    prefix: "",
    label: "Counts on the page",
    blurb:
      "Whatever is left: figures that are not orderings but are still computed, and therefore still owe a sentence.",
  },
];

export default function FormulasPage() {
  const formulas = allFormulas();
  const claimed = new Set<string>();

  return (
    <main className={PAGE_NARROW}>
      <nav aria-label="Breadcrumb" className={CRUMBS}>
        <AppLink href="/docs" className="tap underline underline-offset-[3px] hover:text-foreground">
          Docs
        </AppLink>
        <span aria-hidden="true">/</span>
        <span className="text-foreground">Formulas</span>
      </nav>

      <h1 className={`${PAGE_TITLE} mt-4`}>How every number is computed</h1>
      <p className="m-0 mt-3 max-w-[70ch] text-[16px] leading-[1.7] text-copy">
        Every ordering and every computed figure on openproduct resolves to one sentence, and this
        is the list. There is{" "}
        <span className="font-medium text-foreground">no relevance score</span> anywhere in this
        product: the default order multiplies two published counts, merged changes and counted
        upvotes, and nothing else. There is{" "}
        <span className="font-medium text-foreground">no engagement signal</span> — no clicks, no
        dwell time, no trending. A directory that decides who gets seen should be able to say
        exactly how.
      </p>

      {GROUPS.map((group) => {
        const rows = formulas.filter(
          (f) => (group.prefix ? f.id.startsWith(group.prefix) : !claimed.has(f.id)),
        );
        for (const row of rows) claimed.add(row.id);
        if (rows.length === 0) return null;
        return (
          <section key={group.label} className="mt-10">
            <h2 className={H2}>{group.label}</h2>
            <p className="m-0 mt-2.5 max-w-[68ch] text-[15px] leading-[1.7] text-muted-foreground">
              {group.blurb}
            </p>
            <div className="mt-4 border-t border-border">
              {rows.map((formula) => (
                <article
                  key={formula.id}
                  id={formulaAnchor(formula.id)}
                  className="scroll-mt-[72px] border-b border-line py-4 sm:scroll-mt-6"
                >
                  <h3 className="m-0 flex flex-wrap items-baseline gap-2.5">
                    <a
                      href={`#${formulaAnchor(formula.id)}`}
                      className="tap font-mono text-[14px] font-medium text-foreground underline decoration-transparent underline-offset-4 hover:decoration-inherit"
                    >
                      {formula.id}
                    </a>
                    <span className="font-mono text-[12px] uppercase tracking-[0.06em] text-muted-foreground">
                      {formula.computedBy}
                    </span>
                  </h3>
                  <p className="m-0 mt-2 max-w-[66ch] text-[15px] leading-[1.7] text-copy">
                    {formula.sentence}
                  </p>
                </article>
              ))}
            </div>
          </section>
        );
      })}

      {/* ── the two disclosures the orders above make necessary ──────── */}
      <section className="mt-12" id="bias">
        <h2 className={H2}>What we know is wrong with these orders</h2>
        <div className="mt-3 grid max-w-[70ch] gap-3.5 text-[15px] leading-[1.7] text-copy">
          <p className="m-0">
            <span className="font-medium text-foreground">
              Not every product can be measured the same amount.
            </span>{" "}
            A product whose repository is linked through our GitHub integration can be read fully; a
            product that only declares a public URL can be read partly; a product that declares
            neither is not read at all. Ordering by activity therefore favours the first group. We
            render the gap as an <span className="font-medium text-foreground">absence</span> rather
            than as a low score — a dash, never a zero — but it is a real bias in the default order
            and you should know it is there.
          </p>
          <p className="m-0">
            <span className="font-medium text-foreground">Activity is gameable, and it is ranked on.</span>{" "}
            The default order is <span className="font-mono text-[14px]">sort.most-active</span>, so
            the exposure is real rather than theoretical. Four things blunt it, and we would rather
            name them than imply there is more: the metric counts{" "}
            <span className="font-medium text-foreground">merged changes, not pushes</span>; it is{" "}
            <span className="font-medium text-foreground">capped per contributor per day</span>, so
            one person or one agent cannot manufacture activity alone; it is{" "}
            <span className="font-medium text-foreground">multiplied by counted upvotes</span>, so
            work nobody wants does not lead on its own, and the upvotes are counted after the
            integrity discount; and the figure renders beside the team size, which makes an
            implausible ratio visible to a reader rather than only to us.
          </p>
          <p className="m-0">
            There is no anti-gaming model beyond that, and that is a choice rather than an omission.
            A real one needs opaque adjustments — a score nudged for reasons nobody publishes — and
            an unexplainable rank cannot be defended to the maintainer whose launch sank because of
            it. We would rather have an order that can be gamed and{" "}
            <span className="font-medium text-foreground">argued with</span> than one that cannot be
            either.
          </p>
          <p className="m-0">
            Nothing here can be bought. There is no paid placement, no sponsored listing, and no way
            to pay for position in any of these orders.
          </p>
        </div>
      </section>
    </main>
  );
}
