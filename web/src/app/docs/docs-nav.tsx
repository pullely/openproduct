// The docs surface's shared shapes (openproduct redesign).
//
// THE FIVE DOCS PAGES ARE ONE DOCUMENT WITH TABS, which is how the design
// draws them: a 26px title, a 16px lede, a 38px tab strip on a `--border`
// rule, and then sections 32px apart in a 78ch column. `/docs/formulas` is
// the one that keeps a breadcrumb instead, because it is reached from a
// number on another page rather than browsed to.
//
// Everything here is read off the design's `isDocs.html`; the measurements
// the whole site shares come from `ui/design.ts` and are not respelled.

import { TAB, TAB_OFF, TAB_ON } from "../ui/design";
import { AppLink } from "../ui/link";

export const DOCS_TABS = [
  { id: "overview", label: "Overview", href: "/docs" },
  { id: "api", label: "API reference", href: "/docs/api" },
  { id: "checks", label: "What runs automatically", href: "/docs/checks" },
  { id: "formulas", label: "Formulas", href: "/docs/formulas" },
  { id: "runbook", label: "Runbook", href: "/docs/runbook" },
] as const;

export type DocsTab = (typeof DOCS_TABS)[number]["id"];

/** The tab strip under a docs title: 24px below the lede, 6px between tabs. */
export function DocsTabs({ current }: { current: DocsTab }) {
  return (
    <nav aria-label="Docs" className="mt-6 flex flex-wrap gap-1.5 border-b border-border">
      {DOCS_TABS.map((tab) => {
        const on = tab.id === current;
        return (
          <AppLink
            key={tab.id}
            href={tab.href}
            aria-current={on ? "page" : undefined}
            className={`tap-h ${TAB} ${on ? TAB_ON : TAB_OFF}`}
          >
            {tab.label}
          </AppLink>
        );
      })}
    </nav>
  );
}

/** The lede under a docs title: the page subtitle's 17.5px/1.55, 68ch
 *  (openproduct-calm-pages CP4). */
export const DOC_LEDE = "m-0 mt-[14px] max-w-[68ch] text-[17.5px] leading-[1.55] text-copy max-sm:text-[16px]";

/** The sections: 48px under the tabs, 56px apart, at the reading measure
 *  (CP-R5, 68ch). The column is `minmax(0,1fr)` so a section holding a 520px
 *  table shrinks on a phone and the table's own wrapper scrolls, rather than
 *  the whole page. */
export const DOC_SECTIONS = "mt-12 grid max-w-[68ch] grid-cols-[minmax(0,1fr)] gap-14";

/** A docs section heading: the page's section heading, 20px/600 (CP-R4). */
export const DOC_H2 =
  "m-0 scroll-mt-6 font-sans text-[20px] font-semibold leading-[1.25] tracking-[-0.015em] text-foreground";

/** A section's body: 16.5px/1.7 in `--copy`, 12px under its heading (CP-R5). */
export const DOC_BODY = "m-0 mt-3 text-[16.5px] leading-[1.7] text-copy max-sm:text-[15.5px]";

/** Several paragraphs of body, 16px apart. */
export const DOC_PROSE = "mt-3 grid gap-4 text-[16.5px] leading-[1.7] text-copy max-sm:text-[15.5px]";

/** A key/value list in a card, 14px under the body: 12px radius on `--card`. */
export const DOC_ROWS =
  "m-0 mt-4 list-none overflow-hidden rounded-[16px] border border-border bg-card p-0";

/** One row of it: a 200px key beside its value, `12px 16px`, a `--line` rule between rows. */
export const DOC_ROW =
  "grid gap-1 border-t border-line px-4 py-3 first:border-t-0 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-4";

/** The row's key: mono 12.5px in `--foreground`. */
export const DOC_KEY = "font-mono text-[12.5px] text-foreground";

/** The row's value: 13.5px/1.55 in `--muted`. */
export const DOC_VALUE = "m-0 text-[13.5px] leading-[1.55] text-muted-foreground";

/** A code block: mono 13px/1.65 on `--secondary`, `12px 15px`, 14px below the body. */
export const DOC_PRE =
  "m-0 mt-4 overflow-x-auto rounded-[16px] border border-border bg-secondary px-[18px] py-3.5 font-mono text-[13px] leading-[1.65] text-foreground";

/** A table inside the rows card: cells `12px 16px`, the key column mono. */
export const DOC_TABLE = "w-full border-collapse text-[13.5px]";
export const DOC_TH =
  "border-b border-border px-4 py-2.5 text-left font-mono text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground";
export const DOC_TD_KEY = "whitespace-nowrap px-4 py-3 font-mono text-[12.5px] text-foreground";
export const DOC_TD = "px-4 py-3 text-[13.5px] leading-[1.55] text-muted-foreground";

/** A list of formula-style articles: a `--border` rule above, `--line` rules between. */
export const DOC_ARTICLES = "mt-4 border-t border-border";
export const DOC_ARTICLE = "scroll-mt-[72px] border-b border-line py-4 sm:scroll-mt-6";
export const DOC_ARTICLE_H = "m-0 flex flex-wrap items-baseline gap-2.5";
export const DOC_ARTICLE_TITLE = "text-[17px] font-medium text-foreground";
export const DOC_ARTICLE_META =
  "font-mono text-[12px] uppercase tracking-[0.06em] text-muted-foreground";
export const DOC_ARTICLE_BODY = "m-0 mt-2 max-w-[68ch] text-[15.5px] leading-[1.7] text-muted-foreground";

/** A labelled line inside an article: the label in the mono eyebrow, the value under it. */
export const DOC_FIELD_LABEL =
  "mt-3 font-mono text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground";
export const DOC_FIELD_BODY = "m-0 mt-1 max-w-[70ch] text-[14.5px] leading-[1.6] text-foreground";

/** The links under a section: 8px apart, 15px in `--copy`, underlined 4px off. */
export const DOC_LINKS = "mt-4 grid gap-2";
export const DOC_LINK_P = "m-0 text-[15px] text-copy";

/**
 * The contents rail (openproduct-calm-pages CP4): a long docs page's sections
 * as anchors, sticky beside the column from `lg` up and absent below it,
 * where the column is the whole width and the headings are the outline.
 */
export function DocsContents({ sections }: { sections: readonly { id: string; label: string }[] }) {
  return (
    <nav aria-label="On this page" className="sticky top-6 mt-12 hidden self-start lg:block" data-docs-contents>
      <p className="m-0 text-[13px] font-medium text-faint">On this page</p>
      <ul className="m-0 mt-3 grid list-none gap-2 border-l border-line p-0 pl-4">
        {sections.map((section) => (
          <li key={section.id}>
            <a href={`#${section.id}`} className="tap text-[14px] leading-[1.4] text-muted-foreground hover:text-foreground">
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
