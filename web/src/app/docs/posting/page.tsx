import type { Metadata } from "next";

import { POSTING_DOCS_PATH, type ProductPostKind } from "@openproduct/contracts";

import { publicApexOrigin } from "../../public-api";
import { BTN_INK, FOCUS, PAGE_TITLE } from "../../ui/design";
import { AppLink } from "../../ui/link";
import { DocsTabs } from "../docs-nav";

import { postingTemplates, postingTitle } from "./posting";

/**
 * How posting works (openproduct-redesign OPR-3; board `Templates`) —
 * `/docs/posting`.
 *
 * THE TEMPLATES ARE READ FROM THE CATALOGUE, NOT DESCRIBED. Every kind, every
 * block of it, whether the block is required and how long it may be comes
 * from `POST_BLOCK_CATALOGUE` through `posting.ts` — the list the builder
 * draws and core validates against — so this page cannot drift from what the
 * site accepts (the docs' own rule: the rules describe themselves).
 *
 * Static and the same for every reader (I6): it reads no request and no
 * session, and it is a build-time fact of the contract.
 */
export const revalidate = 60;

export function generateMetadata(): Metadata {
  const origin = publicApexOrigin();
  return {
    title: "Posting",
    description:
      "Every post on openproduct is one of a fixed set of templates: the kinds, the blocks each has, which are required and how long each may be.",
    ...(origin ? { alternates: { canonical: `${origin}${POSTING_DOCS_PATH}` } } : {}),
  };
}

/** A kind's own colour: the dot beside its name and the tint behind it. */
const KIND_HEAD: Record<ProductPostKind, { dot: string; head: string }> = {
  feature: { dot: "bg-amber", head: "bg-amber-soft" },
  version: { dot: "bg-version", head: "bg-version-soft" },
  demo: { dot: "bg-foreground", head: "bg-sunken" },
  idea: { dot: "bg-idea", head: "bg-idea-soft" },
  seat: { dot: "bg-seat", head: "bg-seat-soft" },
};

/** What holds for every post, whatever its kind. */
const PRINCIPLES: readonly { title: string; body: string }[] = [
  {
    title: "Every post shows who and what",
    body: "The product it is about and the person who posted it. A product is followed from its posts, a person from their own page.",
  },
  {
    title: "Some posts draft themselves",
    body: "Shipping a milestone drafts a Feature shipped post, and opening a seat drafts a Help wanted post. Nothing goes out until someone on the crew presses Post.",
  },
  {
    title: "Talk lives under posts",
    body: "Comments, replies and reactions are open on every post. There is no free-standing status update.",
  },
  {
    title: "Only the crew posts for a product",
    body: "You can post only for products you are on the crew of.",
  },
];

/** What the templates leave out, and that it is deliberate. */
const LEFT_OUT: readonly { title: string; body: string }[] = [
  { title: "Free text, links and images on their own.", body: "They belong inside a template's blocks." },
  { title: "Reordering.", body: "A kind's blocks are always in the same order; a block is added or removed, never moved." },
  { title: "Reposts.", body: "A post appears in the feed once." },
];

export default function PostingDocsPage() {
  const templates = postingTemplates();
  return (
    <main className="mx-auto box-border flex w-full max-w-[1180px] flex-col gap-8 px-6 pb-[72px] pt-12 max-sm:gap-5 max-sm:px-3 max-sm:pb-6 max-sm:pt-4">
      <header className="flex max-w-[760px] flex-col gap-2.5">
        <p className="m-0 font-mono text-mono-label uppercase text-amber-ink">Spec · Posting on openproduct</p>
        <h1 className={PAGE_TITLE}>{postingTitle(templates.length)}</h1>
        <p className="m-0 text-card-title text-copy max-sm:text-[15px]">
          openproduct is not a place to share anything. Every post is one of these templates, filled in block by
          block, so posts of the same kind look the same and can be compared, filtered and trusted.
        </p>
      </header>

      {/* The docs' own tabs; the page's column already spaces them. */}
      <div className="[&>nav]:mt-0">
        <DocsTabs current="posting" />
      </div>

      <section aria-label="What holds for every post" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,250px),1fr))] gap-3">
        {PRINCIPLES.map((principle) => (
          <div key={principle.title} className="flex flex-col gap-1 rounded-[16px] bg-card p-[18px] max-sm:p-[14px]">
            <h2 className="m-0 text-[15px] font-semibold text-foreground">{principle.title}</h2>
            <p className="m-0 text-[13px] text-copy">{principle.body}</p>
          </div>
        ))}
      </section>

      <section
        aria-label="The templates"
        data-posting-templates
        className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,360px),1fr))] gap-4 max-sm:gap-2.5"
      >
        {templates.map((template) => (
          <article
            key={template.kind}
            data-posting-template={template.kind}
            className="flex flex-col overflow-hidden rounded-[16px] bg-card"
          >
            <div className={`flex flex-col gap-1 px-[18px] py-4 ${KIND_HEAD[template.kind].head}`}>
              <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1">
                <h2 className="m-0 flex items-center gap-2 text-card-title font-semibold text-foreground">
                  <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-[3px] ${KIND_HEAD[template.kind].dot}`} />
                  {template.label}
                </h2>
                <span className="font-mono text-[11px] uppercase text-copy">{template.who}</span>
              </div>
              <p className="m-0 text-[13px] text-copy">{template.when}</p>
            </div>
            <ul className="m-0 list-none px-[18px] pb-3 pt-1.5">
              {template.fields.map((field) => (
                <li
                  key={field.id}
                  data-posting-block={field.id}
                  className="flex flex-wrap items-baseline gap-x-2.5 border-b border-line py-2 last:border-b-0"
                >
                  <span className="flex-1 text-[15px] text-foreground">{field.name}</span>
                  <span className="text-[13px] text-muted-foreground">{field.rule}</span>
                  <span
                    className={`w-[66px] shrink-0 text-right font-mono text-[11px] ${
                      field.required ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {field.requirement}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section aria-labelledby="left-out" className="flex max-w-[760px] flex-col gap-2.5">
        <h2 id="left-out" className="m-0 font-serif text-[26px] font-normal leading-[1.2] text-foreground">
          Left out on purpose
        </h2>
        <ul className="m-0 flex flex-col gap-1.5 pl-5 text-copy">
          {LEFT_OUT.map((item) => (
            <li key={item.title}>
              <span className="font-semibold text-foreground">{item.title}</span> {item.body}
            </li>
          ))}
        </ul>
      </section>

      <div>
        <AppLink href="/" className={`${BTN_INK} px-5 ${FOCUS}`}>
          Back to the feed
        </AppLink>
      </div>
    </main>
  );
}
