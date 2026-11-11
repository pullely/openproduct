import type { Metadata } from "next";

import {
  AGENT_TOOLS,
  CATALOG_API_VERSION,
  FACETS,
  allFormulas,
  formulaHref,
  DIGEST_MEANING,
  LAUNCH_MEANING,
  cooldownNote,
  publishedRules,
  COMPLETENESS_LABEL,
  FLOOR_FIELDS,
} from "@openproduct/contracts";

import { openproductApiBase } from "@/lib/platform";
import { PAGE_NARROW, PAGE_TITLE } from "../ui/design";

import { AppLink } from "../ui/link";
import {
  DOC_BODY,
  DOC_H2,
  DOC_KEY,
  DOC_LEDE,
  DOC_LINKS,
  DOC_LINK_P,
  DOC_PRE,
  DOC_PROSE,
  DOC_ROW,
  DOC_ROWS,
  DOC_SECTIONS,
  DOC_TABLE,
  DOC_TD,
  DOC_TD_KEY,
  DOC_TH,
  DOC_VALUE,
  DocsContents,
  DocsTabs,
} from "./docs-nav";

/**
 * The docs surface (openproduct-commons CT2).
 *
 * THREE THINGS LIVE HERE, and each is a locked decision made public rather
 * than a page of marketing:
 *
 *   the API        OPC-9 — the catalog is machine-readable or the claim is empty
 *   the formulas   OPC-4 — every computed number resolves to one sentence
 *   what qualifies OPC-I — this directory shows the licence it observed and
 *                          does not adjudicate which licences are acceptable
 *
 * Rendered from the SAME contracts the API serves, so a formula that exists
 * and a formula that is documented cannot be different sets. There is no copy
 * on this page that describes a rule; the rules describe themselves.
 */
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Docs",
  description:
    "The openproduct catalog as a machine-readable API, how every number on it is computed, and what qualifies for a listing.",
};

/** The overview's outline, for its contents rail (CP4): the section ids and
 *  their own headings, in the order the page renders them. */
const OVERVIEW_SECTIONS = [
  { id: "api", label: "The API" },
  { id: "agent", label: "For an agent" },
  { id: "provenance", label: "What every field tells you" },
  { id: "formulas", label: "How every number is computed" },
  { id: "facets", label: "What the catalog is filterable by" },
  { id: "floor", label: "The front-page floor" },
  { id: "launching", label: "Publishing and launching are two things" },
  { id: "digest", label: "The weekly digest" },
  { id: "limits", label: "How fast you can do things" },
  { id: "qualifies", label: "What qualifies for a listing" },
] as const;

export default function DocsPage() {
  const base = openproductApiBase();
  const formulas = allFormulas();

  return (
    <main className={PAGE_NARROW}>
      <h1 className={PAGE_TITLE}>The catalog, and how to read it</h1>
      <p className={DOC_LEDE}>
        Everything on openproduct is available as JSON, and every field says where it came from.
        That second part is the point: a catalog that hands out numbers without saying whether a
        person wrote them, something measured them, or we computed them is a catalog of assertions.
      </p>

      <DocsTabs current="overview" />

      {/* CP4 — the longest docs page reads beside its contents. */}
      <div className="grid gap-x-12 lg:grid-cols-[minmax(0,1fr)_176px]">
        <div className={DOC_SECTIONS}>
          {/* ── the API ─────────────────────────────────────────────────── */}
          <section id="api">
            <h2 className={DOC_H2}>The API</h2>
            <p className={DOC_BODY}>
              Anonymous. No credential is accepted on any route below — the response is identical for
              every caller, which is what makes it cacheable and what makes it safe to hand to anyone.
              Cached for 60 seconds.
            </p>
            <div
              // FR5 — A REGION THAT SCROLLS HAS TO BE REACHABLE. At 375px this
              // table is wider than the screen and scrolls sideways, so a keyboard
              // user has to be able to get into it.
              //
              // AND SINCE AG0 IT IS REACHED THROUGH ITS OWN CONTENTS, so it takes
              // NO `tabIndex` of its own. The rule both ways is one rule: a scroll
              // region needs a tab stop only while nothing inside it has one. AG0
              // turned the route names into links, which is three stops inside
              // this box — and the `tabIndex` FR5 added then became a fourth,
              // wrapping them. `a11y.mjs` caught it as a nested interactive, which
              // is the defect it has always named: two targets in one box, and a
              // keyboard user who cannot tell which one they are on.
              //
              // The rate-limit table below has no links in it and keeps its stop.
              role="region"
              aria-label="The anonymous catalog routes"
              className={`${DOC_ROWS} overflow-x-auto`}
            >
              <table className={`${DOC_TABLE} min-w-[520px]`}>
                <tbody>
                  {/* AG0 — THE ROUTES ARE LINKS, so the done-when is literal: the
                      footer is one click to this page and a row is the second, to
                      a working request. They were text, which is a table of
                      addresses a reader has to copy by hand — and the milestone
                      before this one is the audit failing to find the API at all.

                      `path` is null for `/v1/products/{slug}`, and that is not an
                      oversight: it is a TEMPLATE, and this page holds no catalogue
                      read to substitute a real slug into. A link to a literal
                      `{slug}` would 404, which is worse than text — the one thing
                      this milestone cannot do is make a broken promise about the
                      API being reachable. */}
                  {[
                    { route: "GET /v1/products", path: "/v1/products", what: "Every published listing." },
                    {
                      route: "GET /v1/products/{slug}",
                      path: null,
                      what: "One product. Unknown, unpublished and unreachable all answer 404 — deliberately indistinguishable.",
                    },
                    { route: "GET /v1/facets", path: "/v1/facets", what: "The vocabulary the catalog is filterable by." },
                    {
                      route: "GET /v1/openapi.json",
                      path: "/v1/openapi.json",
                      what: `The schema, version ${CATALOG_API_VERSION}.`,
                    },
                  ].map(({ route, path, what }) => (
                    <tr key={route} className="border-t border-line first:border-t-0">
                      <td className={`w-[216px] ${DOC_TD_KEY}`}>
                        {base && path ? (
                          // A NEW TAB, and this is the one place on the estate
                          // where that is the reader's interest rather than ours:
                          // the whole point of the page is to be read BESIDE the
                          // response. `rel` because the gateway is another origin.
                          <a
                            className="tap underline decoration-border underline-offset-[3px] hover:text-copy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            href={`${base}${path}`}
                            rel="noreferrer noopener"
                            target="_blank"
                          >
                            {route}
                          </a>
                        ) : (
                          // No base configured (a preview host advertises none) or
                          // a template with no real address: the row is what it
                          // always was.
                          route
                        )}
                      </td>
                      <td className={DOC_TD}>{what}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {base ? <pre className={DOC_PRE}>curl {base}/v1/products</pre> : null}
          </section>

          {/* ── the agent surface ───────────────────────────────────────── */}
          <section id="agent">
            <h2 className={DOC_H2}>For an agent</h2>
            <p className={DOC_BODY}>
              The same catalog, over the Model Context Protocol. Anonymous and stateless, like the
              routes above — there is nothing here a request to <span className="font-mono text-[14px]">/v1/products</span>{" "}
              does not answer, and no credential to obtain. The tools return the catalog card
              untouched, provenance and all, so anything an agent reads it can also verify by hand.
            </p>
            {base ? <pre className={DOC_PRE}>{base}/mcp</pre> : null}
            {/* RENDERED FROM THE TOOL SET THE SERVER REGISTERS, which is this
                page's own rule applied to a second surface: a tool that exists and
                a tool that is documented cannot be different sets. AG0's finding
                was an API nobody could find; an agent surface documented nowhere
                would be the same milestone's mistake made twice. */}
            <ul className={DOC_ROWS}>
              {AGENT_TOOLS.map((tool) => (
                <li key={tool.name} className={DOC_ROW}>
                  <span className={DOC_KEY}>{tool.name}</span>
                  <p className={DOC_VALUE}>{tool.description}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* ── provenance ──────────────────────────────────────────────── */}
          {/* AG2 GAVE THIS SECTION AN ADDRESS. It explained the three classes and
              nothing could link to it, so a label reading "observed" on a topic's
              comparison grid had nowhere to send a reader who wanted to know what
              that covers — the same defect AG0 found one level up, at the scale of
              a section instead of a page. */}
          <section id="provenance">
            <h2 className={DOC_H2}>What every field tells you</h2>
            <p className={DOC_BODY}>
              A metric is <span className="font-medium text-foreground">absent</span> — never zero —
              when a listing&rsquo;s tier cannot see it, or when what we last read has gone stale past
              its window. <span className="font-mono text-[14px]">0 merges this week</span> says a
              project is dead; a project nobody measured has said nothing.
            </p>
            <ul className={DOC_ROWS}>
              {[
                [
                  "authored",
                  "A person wrote it — a maintainer or a contributor — and it is visibly in their voice. The pitch, the tagline, an opening's description, a display name.",
                ],
                [
                  "observed",
                  "Something measured it, at a stated time. Comes with observedAt, always. The licence, the components, work merged in the last week.",
                ],
                [
                  "derived",
                  "We computed it, from a formula published below. Comes with the formula's id, so you can look up exactly what it means.",
                ],
              ].map(([cls, what]) => (
                <li key={cls} className={DOC_ROW}>
                  <span className={DOC_KEY}>{cls}</span>
                  <p className={DOC_VALUE}>{what}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* ── the formulas ────────────────────────────────────────────── */}
          <section id="formulas">
            <h2 className={DOC_H2}>How every number is computed</h2>
            <p className={DOC_BODY}>
              Every ordering and every computed figure resolves to one sentence, and this is the list.
              There is no relevance score anywhere in openproduct: the default order multiplies two
              published counts, merged changes and counted upvotes, and nothing else. There is no
              engagement signal — no clicks, no dwell time, no trending. A directory that decides who
              gets seen should be able to say exactly how.
            </p>
            {/* CP-R5 — the full list is reference, one click away: the sentence
                above says what it is, and /docs/formulas reads each in full. */}
            <details className="group mt-4" data-docs-formulas>
              <summary className="tap inline-flex cursor-pointer list-none items-center gap-1.5 text-[15px] font-medium text-foreground hover:text-copy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">
                  ›
                </span>
                Every formula, one sentence each ({formulas.length})
              </summary>
              <dl className="m-0 mt-4 grid gap-0 border-t border-border">
                {formulas.map((formula) => (
                  <div
                    key={formula.id}
                    className="grid gap-1 border-b border-line py-3.5 sm:grid-cols-[260px_minmax(0,1fr)] sm:gap-5"
                  >
                    {/* DS2 — the id is a LINK now. A formula that exists and a
                        formula somebody can reach cannot be different sets, and an
                        id printed beside a number is only useful if following it
                        lands on the sentence it named. */}
                    <dt className="font-mono text-[13px] text-foreground">
                      <AppLink
                        href={formulaHref(formula.id)}
                        className="tap underline decoration-dotted underline-offset-[3px] hover:decoration-solid"
                      >
                        {formula.id}
                      </AppLink>
                    </dt>
                    <dd className="m-0 max-w-[62ch] text-[14.5px] leading-[1.7] text-muted-foreground">
                      {formula.sentence}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
            <div className={DOC_LINKS}>
              <p className={DOC_LINK_P}>
                <AppLink href="/docs/formulas" className="tap underline underline-offset-4">
                  Read them in full, with what we know is wrong with them →
                </AppLink>
              </p>
              {/* TS4 — the same promise applied to the checks. OPC-4 does not carve
                  out moderation, and a maker whose listing quietly stopped
                  appearing in search has to be able to find out why. */}
              <p className={DOC_LINK_P}>
                <AppLink href="/docs/checks" className="tap underline underline-offset-4">
                  What runs automatically, what it may do, and how often it is wrong →
                </AppLink>
              </p>
              {/* TS5 — the same promise applied to what a PERSON did. The formulas
                  and the checks say what the rules are; this says how often we
                  used them, and how often we turned out to be wrong. */}
              <p className={DOC_LINK_P}>
                <AppLink href="/transparency" className="tap underline underline-offset-4">
                  Every act of moderation, counted — including the ones we reversed →
                </AppLink>
              </p>
              {/* CS0 — the same promise applied to the API itself: what it will
                  never do (remove a field without a dated notice), and everything
                  it has done, with the milestone that did it. */}
              <p className={DOC_LINK_P}>
                <AppLink href="/docs/api" className="tap underline underline-offset-4">
                  The API's changelog, and what it promises not to change →
                </AppLink>
              </p>
              {/* OO4 — what we do when one of the promises breaks, in public: one
                  page per degraded state, reached from the alert. A product that
                  publishes its checks can publish its runbook. */}
              <p className={DOC_LINK_P}>
                <AppLink href="/docs/runbook" className="tap underline underline-offset-4">
                  What we do when something is stale, and what you would see →
                </AppLink>
              </p>
            </div>
          </section>

          {/* ── the taxonomy ────────────────────────────────────────────── */}
          <section id="facets">
            <h2 className={DOC_H2}>What the catalog is filterable by</h2>
            <ul className={DOC_ROWS}>
              {FACETS.map((group) => (
                <li key={group.id} className={DOC_ROW}>
                  <span className={DOC_KEY}>
                    {group.label}
                    <span className="text-muted-foreground"> · {group.kind}</span>
                  </span>
                  <p className={DOC_VALUE}>{group.description}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* ── launching ───────────────────────────────────────────────── */}
          {/* HB0 — where the front page's "N more below the floor →" lands. */}
          <section id="floor">
            <h2 className={DOC_H2}>The front-page floor</h2>
            <p className={DOC_BODY}>
              A published listing appears in the front page&apos;s catalogue once it has{" "}
              {FLOOR_FIELDS.map((field, i) => (
                <span key={field}>
                  {i > 0 ? " and " : ""}
                  <span className="font-medium">{COMPLETENESS_LABEL[field].toLowerCase()}</span>
                </span>
              ))}
              . Until then it is not ranked lower — it is not listed there yet. It is still in the
              directory, still at its own address, and still in the API. The front page says how many
              listings the floor is holding back, and a maintainer sees which fields on their
              listing&apos;s checklist in the studio.
            </p>
          </section>

          <section id="launching">
            <h2 className={DOC_H2}>Publishing and launching are two things</h2>
            <div className={DOC_PROSE}>
              <p className="m-0">{LAUNCH_MEANING}</p>
              <p className="m-0">
                {/* THE RULE, PUBLISHED, for the same reason the limits below are:
                    a maker who meets a refusal they cannot read experiences the
                    product as broken rather than as principled. And this
                    particular rule is one somebody will want to argue with, which
                    is exactly why it has to be written down where they can. */}
                <span className="font-medium text-foreground">
                  A listing launches once per version.
                </span>{" "}
                {cooldownNote()} That is two rules at once, on purpose: the version is yours to name
                and stops the accidental repeat, and the cooldown is ours and stops the deliberate one.
                A label anybody can type is not a limit.
              </p>
              <p className="m-0">
                A scheduled launch is invisible until its moment — not on the board, not in the digest,
                not on your own page. If the listing is not published when the moment comes, the launch
                is <span className="font-medium text-foreground">missed</span> rather than fired: we
                will not announce a page nobody can open. Nothing is announced, the version stays free,
                and you can schedule it again.
              </p>
            </div>
          </section>

          {/* ── the digest ──────────────────────────────────────────────── */}
          <section id="digest">
            <h2 className={DOC_H2}>The weekly digest</h2>
            <div className={DOC_PROSE}>
              <p className="m-0">{DIGEST_MEANING}</p>
              <p className="m-0">
                {/* LC-5, said where somebody looking for a subscribe button will
                    be standing. A feed is not a lesser email — it needs no
                    address, works at any volume, and cannot leak a subscriber
                    list because there is not one. */}
                There is{" "}
                <span className="font-medium text-foreground">no email signup, and no address</span>{" "}
                stored anywhere on this side. The digest is a page at{" "}
                <AppLink className="underline underline-offset-4" href="/digest">
                  /digest
                </AppLink>{" "}
                with an{" "}
                <a className="underline underline-offset-4" href="/digest/feed.xml">
                  RSS
                </a>{" "}
                and a{" "}
                <a className="underline underline-offset-4" href="/digest/feed.json">
                  JSON
                </a>{" "}
                feed, and every week keeps its address forever.
              </p>
              <p className="m-0">
                Weeks are{" "}
                <span className="font-medium text-foreground">ISO weeks</span> — Monday to Sunday, in
                UTC — which means a week&rsquo;s year is not always its dates&rsquo; year: 30 December
                2025 is in <span className="font-mono text-[14px]">2026-w01</span>. That looks like a
                mistake and is the standard behaving correctly, so every digest prints the days it
                covers. A week gets its page once it has ENDED: &ldquo;what happened&rdquo; and
                &ldquo;what has happened so far&rdquo; are different claims, and only one of them is
                worth archiving.
              </p>
            </div>
          </section>

          {/* ── velocity ────────────────────────────────────────────────── */}
          <section id="limits">
            <h2 className={DOC_H2}>How fast you can do things</h2>
            <p className={DOC_BODY}>
              Every write has a limit, and the limits are here because a product that says{" "}
              <span className="font-medium text-foreground">no</span> and will not say why is a product
              you cannot plan around. Each has two windows: a short one that catches a script, and a
              long one that catches the patient version of the same script. Both have to pass.
            </p>
            <div
              // The same reachable-scroll-region treatment as the catalog table
              // above, for the same reason and at the same width.
              role="region"
              aria-label="The rate limits"
              tabIndex={0}
              className={`${DOC_ROWS} overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
            >
              <table className={`${DOC_TABLE} min-w-[520px]`}>
                <thead>
                  <tr>
                    <th className={`w-[216px] ${DOC_TH}`}>Action</th>
                    <th className={DOC_TH}>Burst</th>
                    <th className={DOC_TH}>Sustained</th>
                  </tr>
                </thead>
                <tbody>
                  {/* RENDERED FROM THE RULES THE GATEWAY ENFORCES, so a limit
                      that exists and a limit that is documented cannot be
                      different sets — the same discipline the formulas table
                      follows. `publishedRules` is what filters out the
                      per-listing bounds; see below. */}
                  {publishedRules().map((rule) => (
                    <tr key={`${rule.action}-${rule.dimension}`} className="border-t border-line">
                      <td className={DOC_TD_KEY}>{rule.action}</td>
                      <td className={`${DOC_TD} whitespace-nowrap font-mono text-[12.5px]`}>
                        {rule.burst.limit} / {windowLabel(rule.burst.windowSec)}
                      </td>
                      <td className={`${DOC_TD} whitespace-nowrap font-mono text-[12.5px]`}>
                        {rule.sustained.limit} / {windowLabel(rule.sustained.windowSec)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={`${DOC_PROSE} mt-3.5`}>
              <p className="m-0">
                Going over gets you a{" "}
                <span className="font-mono text-[14px]">429</span> with a sentence saying what happened
                and a <span className="font-mono text-[14px]">Retry-After</span> saying how long — and
                nothing you did is lost.
              </p>
              <p className="m-0">
                <span className="font-medium text-foreground">One limit is not published, and here
                is why.</span>{" "}
                Alongside the per-person limits above, some actions also have a bound per{" "}
                <span className="font-medium text-foreground">listing</span> — a ceiling on how fast
                one product can be endorsed by everybody at once. Those exist to slow a coordinated
                arrival down enough to be visible. Publishing the exact number would tell anyone
                planning one precisely how many accounts to bring, so the bound is stated and the
                figure is not. It is set well above what a product having a very good day reaches.
              </p>
            </div>
          </section>

          {/* ── the editorial positions ─────────────────────────────────── */}
          <section id="qualifies">
            <h2 className={DOC_H2}>What qualifies for a listing</h2>
            <div className={DOC_PROSE}>
              <p className="m-0">
                A product qualifies if its repository can be read. That is the whole bar, and it is a
                bar about <span className="font-medium text-foreground">checkability</span> rather than
                about licensing: if nobody can read the code, nothing on the page is verifiable.
              </p>
              <p className="m-0">
                The licence is <span className="font-medium text-foreground">shown, not judged</span>.
                We display what was observed on the repository — including{" "}
                <span className="font-mono text-[14px]">no licence detected</span>, which is information
                a reader wants. openproduct does not adjudicate which licences count as open. Doing so
                would put this directory in the business of settling licence disputes within a month,
                and the facet plus the visible licence lets every reader apply their own bar.
              </p>
              <p className="m-0">
                <span className="font-medium text-foreground">A ranking bias we should state.</span> A
                product whose repository is linked through our GitHub integration can be measured more
                fully than one that only declares a public URL, and a product that declares neither is
                not measured at all. Ordering by activity therefore favours the first group. We show the
                gap as absence rather than as a low score, but it is a real bias and you should know it
                is there.
              </p>
              <p className="m-0">
                Nothing on openproduct can be bought. There is no paid placement, no sponsored listing
                and no way to pay for position — in the default order or anywhere else.
              </p>
            </div>
          </section>
        </div>
        <DocsContents sections={OVERVIEW_SECTIONS} />
      </div>
    </main>
  );
}


/** A window in the words a person uses. `60` is "a minute", not "60s". */
function windowLabel(seconds: number): string {
  if (seconds % 86_400 === 0) {
    const days = seconds / 86_400;
    return days === 1 ? "day" : `${days} days`;
  }
  if (seconds % 3_600 === 0) {
    const hours = seconds / 3_600;
    return hours === 1 ? "hour" : `${hours} hours`;
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return minutes === 1 ? "minute" : `${minutes} minutes`;
  }
  return `${seconds}s`;
}
