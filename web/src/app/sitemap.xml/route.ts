import {
  fetchDigestWeeks,
  fetchAllDirectoryProjects,
  fetchPublicPeople,
  fetchTopics,
  sitemapXml,
  fetchBoardDays,
} from "../public-api";
import {
  forumCategories,
  forumPath,
  parseWeekId,
  pricingTally,
  stackTally,
  weekWindow,
} from "@openproduct/contracts";

/**
 * The sitemap (launch polish, widened at openproduct-commons DS4).
 *
 * "A directory nobody can link to is not a directory" (OD5) — and one
 * crawlers cannot enumerate is only half linked. DS4's done-when is that a
 * crawl of this document reaches every public listing AND every public
 * profile, so it now names both namespaces.
 *
 * Built from the same anonymous reads as the pages themselves, so it can
 * never name anything those pages would not show; the host rewrite maps the
 * apex's `/sitemap.xml` here.
 *
 * WHAT IS DELIBERATELY ABSENT: every filtered view of the directory.
 * `/?category=devtools&stack=rust` is a real page, and there are 2^n of them.
 * Naming even a few would spend a crawler's budget on permutations of one
 * document rather than on the listings; naming all of them is not a finite
 * document. Each permutation instead carries `<link rel="canonical">` to the
 * bare directory, which says the same thing where a crawler is already
 * looking. See `sitemapXml`.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const origin = new URL(request.url).origin;
  // Both reads, concurrently: the sitemap is one document and a serial pair
  // of 60s-cached reads would make it twice as slow to build for no benefit.
  const [projects, people, weeks, topicDoc, days] = await Promise.all([
    // OS1 — the WHOLE catalogue, page by page: the sitemap is the one place
    // every listed product belongs, and a first page is not a sitemap.
    fetchAllDirectoryProjects(),
    fetchPublicPeople(),
    // LC1 — the archive is the third namespace. A digest crawlers cannot
    // enumerate is a set of permanent pages nobody arrives at from a search,
    // which is most of what an archive is for.
    fetchDigestWeeks(),
    // TP0 — the fourth namespace. Read rather than derived from `projects`
    // here, so the sitemap names exactly the topics that have a page: core
    // decides which values are renderable, and a sitemap that guessed would
    // eventually advertise a 404.
    fetchTopics(),
    // QE1 — the days that hold a board. Null is "could not be read", and the
    // sitemap goes out without them rather than not at all: a day board is
    // reachable from the archive strip regardless.
    fetchBoardDays(),
  ]);

  // FAILURE IS A 503, NEVER A PARTIAL SITEMAP. If either read failed we
  // cannot tell "there are none" from "we could not ask", and a cacheable
  // document that omits a namespace is a crawler being told those pages were
  // removed. `people` failing matters as much as `projects` failing: a
  // sitemap that silently loses every profile is worse than no sitemap,
  // because it is confidently wrong.
  if (projects === null || people === null || weeks === null || topicDoc === null) {
    return new Response("directory unavailable", {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }

  const topics = topicDoc.topics;
  const xml = sitemapXml(origin, [
    // OL2 — R8, kept. `/` changed meaning: it was the faceted directory and
    // is now the launch feed. `sitemapXml` always emits `/` first, so what
    // has to be added here is the directory's NEW address — otherwise the
    // page that used to be the front page would silently stop being in the
    // one document whose job is to say which addresses exist. Both pages are
    // wanted, which is exactly why neither redirects to the other.
    //
    // No `lastmod` on either: they are indexes over a catalogue that changes
    // constantly, and a date stamped from the moment this document was built
    // would ask a crawler to re-fetch them on every publish anywhere.
    // OPR1 — THE LIST'S ORDERS LEFT THIS DOCUMENT. `/builds/newest` and
    // `/builds/upvoted` were pages of their own and were listed here; they
    // are sorts of the Products page now (`/products?sort=…`) and their old
    // addresses redirect, as `/builds/roles` does to the Help wanted section
    // and the leaderboard's ranges did before them (OB7). A sitemap lists the
    // address a page lives at, never one that redirects — and a sort is a
    // view of one document whose canonical address is `/products`, which is
    // the one entry it gets.
    { path: "products", lastmod: null },
    { path: "help-wanted", lastmod: null },
    // QE1 — every day that holds a board, at its own address (LC3): a
    // settled day is a document that never changes, which is the best kind
    // of sitemap entry there is.
    ...(days ?? []).map((entry) => ({ path: `launches/${entry.day}`, lastmod: entry.day })),
    // ─── AG0 — THE STATIC PAGES THIS LIST HAD NEVER BEEN SWEPT FOR ────────
    //
    // Every entry above and below was added by the milestone that built the
    // page it names, which is the right instinct and leaves exactly this: a
    // list that is correct about what somebody remembered. Seven public,
    // permanent, indexable pages were not in it, and the one that made the
    // omission visible is `/docs` — the audit browsed the whole site, did not
    // find the shipped API, and could not have, because nothing links to
    // `/docs` except its own two children and no crawler is told it exists.
    //
    // `sitemap-coverage.test.ts` enumerates `src/app/**/page.tsx` and requires
    // every static public page to be HERE or in a named exclusion with a
    // reason, so the next omission is a failing test rather than a page
    // nobody can find for a year.
    { path: "docs", lastmod: null },
    { path: "docs/formulas", lastmod: null },
    { path: "docs/checks", lastmod: null },
    { path: "docs/api", lastmod: null },
    { path: "docs/runbook", lastmod: null },
    { path: "collections", lastmod: null },
    { path: "digest", lastmod: null },
    { path: "people", lastmod: null },
    { path: "transparency", lastmod: null },
    { path: "submit", lastmod: null },
    // TP0 — the topic index, and every topic a live listing has chosen. This
    // is a FINITE, enumerable set (the CT1 vocabulary, filtered to values in
    // use) rather than the facet permutations the note above refuses, and each
    // topic page is a document of its own with its own launches.
    { path: "topics", lastmod: null },
    ...topics.map((topic) => ({ path: `topics/${topic.value}`, lastmod: null })),
    // VC1 — the stack index, and every value something is actually built
    // with. The same finite-and-enumerable argument as the topics above, and
    // deliberately DERIVED from `projects` rather than read: a stack page is
    // built by filtering the very array this line reads, so "has a page" and
    // "is in the sitemap" are one answer by construction. (The topics above
    // are read instead because CORE decides which of those are renderable;
    // nothing but this catalogue decides a stack page.)
    { path: "stack", lastmod: null },
    ...stackTally(projects).map((entry) => ({
      path: `stack/${entry.value}`,
      lastmod: null,
    })),
    // PP3 — the pricing index, and the four answers. Same argument as the
    // stack above: a pricing page filters this very array, so "has a page"
    // and "is in the sitemap" are one answer. A value nobody has chosen is
    // still a page (see `pricing/[value]/page.tsx`), so all four are listed.
    // FO1 — the forum index and its addresses: two orders and six
    // categories, a finite and enumerable set like the topics above; each
    // is a document of its own with its own order. The composer is not
    // here — it is a door, and `noindex`.
    { path: "threads", lastmod: null },
    { path: "threads/replied", lastmod: null },
    ...forumCategories().flatMap((category) => [
      { path: forumPath("latest", category.value).slice(1), lastmod: null },
      { path: forumPath("replied", category.value).slice(1), lastmod: null },
    ]),
    { path: "pricing", lastmod: null },
    ...pricingTally(projects).map((entry) => ({
      path: `pricing/${entry.value}`,
      lastmod: null,
    })),
    ...projects
      // TS1 — a listing a crawler is told not to index does not belong in a
      // document whose entire purpose is asking crawlers to index things.
      // Listing it anyway would send two contradictory instructions about one
      // URL, and the honest reading of the sitemap is "these are the pages we
      // are asking you to take".
      .filter((project) => project.indexable)
      .flatMap((project) => [
        { path: project.slug, lastmod: project.publishedAt },
        // FO2 — the listing's forum, a document of its own beside it.
        { path: `${project.slug}/forum`, lastmod: null },
      ]),
    // CG1 — the canonical address of a person is `/@handle`, which is what
    // the page's own `<link rel="canonical">` advertises. Listing `/people/x`
    // here instead would put a second address for one page into the one
    // document whose job is to say which addresses exist.
    //
    // There is no `indexable` filter on this half, and there should not be: a
    // public profile only exists because somebody opted in AND holds standing
    // (CG1's two gates). TS1's index gate is about a maker's FIRST LISTING
    // being amplified before anyone has looked at it; a profile already
    // requires a public listing to exist at all, so the review has happened
    // by the time there is a page here to name.
    ...people.map((person) => ({ path: `@${person.handle}`, lastmod: person.publishedAt })),
    // LC1 — one entry per week that held something. `lastmod` is the week's
    // END, not now: a settled week cannot change, and stamping it with the
    // moment this document was built would ask a crawler to re-fetch four
    // hundred immutable pages every time anything anywhere was published.
    ...weeks.flatMap((id) => {
      const parsed = parseWeekId(id);
      return parsed.ok
        ? [{ path: `digest/${parsed.week.id}`, lastmod: weekWindow(parsed.week).end }]
        : [];
    }),
  ]);

  return new Response(xml, {
    headers: {
      "content-type": "application/xml",
      // The reads themselves are max-age=60; the sitemap can be lazier.
      "cache-control": "public, max-age=3600",
    },
  });
}
