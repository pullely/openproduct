import type { Metadata } from "next";

import {
  API_CHANGELOG,
  API_DEPRECATIONS,
  API_STABILITY_SENTENCE,
  CATALOG_API_VERSION,
  DEPRECATION_NOTICE_DAYS,
  RATE_LIMITS,
  RATE_LIMIT_NAMES,
  RATE_LIMIT_SENTENCE,
  rateWindowWord,
  type ApiShape,
} from "@openproduct/contracts";

import { PAGE_NARROW, PAGE_TITLE } from "../../ui/design";
import {
  DOC_ARTICLE,
  DOC_ARTICLES,
  DOC_ARTICLE_BODY,
  DOC_ARTICLE_H,
  DOC_ARTICLE_META,
  DOC_BODY,
  DOC_H2,
  DOC_LEDE,
  DOC_ROWS,
  DOC_SECTIONS,
  DOC_TABLE,
  DOC_TD,
  DOC_TD_KEY,
  DOC_TH,
  DocsTabs,
} from "../docs-nav";

/**
 * The API's changelog and its stability policy (openproduct-consumers CS0).
 *
 * RENDERED FROM THE SAME REGISTRY THE TEST RECONCILES. `API_CHANGELOG` is
 * replayed by a test against the pinned key sets the handlers serialize, so
 * what this page lists is what the wire carries — a key cannot ship without
 * its line, and a line cannot outlive its key. The policy sentence is the
 * one the OpenAPI document's `info` carries, from the same constant.
 *
 * Static: nothing here reads a clock or a database. The page changes when a
 * release is added, which is a commit.
 */
export const revalidate = 600;

export const metadata: Metadata = {
  title: "API changelog and stability policy",
  description: `What the catalog API promises: additive forever, a dated notice of at least ${DEPRECATION_NOTICE_DAYS} days for any removal, and every change listed with the milestone that made it.`,
  alternates: { canonical: "/docs/api" },
};

const SHAPE_LABEL: Record<ApiShape, string> = {
  card: "every card",
  product: "the product document",
  page: "the page",
};

/** The note under a section's body: 14px/1.7 in `--muted`, 12px below. */
const NOTE = "m-0 mt-3 max-w-[70ch] text-[14px] leading-[1.7] text-muted-foreground";

export default function ApiDocsPage() {
  return (
    <main className={PAGE_NARROW}>
      <h1 className={PAGE_TITLE}>API changelog and stability policy</h1>
      <p className={DOC_LEDE}>
        The catalog is version <span className="font-mono text-[15px] text-foreground">{CATALOG_API_VERSION}</span>. Every change
        to what it returns is listed here with the milestone that made it, and a test holds this list to
        the fields the API actually serializes.
      </p>

      <DocsTabs current="api" />

      <div className={DOC_SECTIONS}>
        <section aria-labelledby="api-policy">
          <h2 id="api-policy" className={DOC_H2}>The policy</h2>
          <p className={DOC_BODY} data-stability-sentence>
            {API_STABILITY_SENTENCE}
          </p>
          <p className={NOTE}>
            The notice period is the proposal on the table until the people who depend on this API say
            otherwise; the number here and in the OpenAPI document is one constant, so when it moves it moves
            everywhere at once.
          </p>
        </section>

        {/* CS1 — the limit, from the same table the gateway enforces and the
            OpenAPI document's info carries. A limit that exists is a limit that
            is published; one that is published from a copy is one that drifts. */}
        <section aria-labelledby="api-limit">
          <h2 id="api-limit" className={DOC_H2}>The limit</h2>
          <p className={DOC_BODY} data-rate-limit-sentence>
            {RATE_LIMIT_SENTENCE}
          </p>
          {/* A region that can scroll on a phone must be reachable by a keyboard
              (axe: scrollable-region-focusable), so it is a named, focusable
              region rather than a bare overflow box. */}
          <div
            className={`${DOC_ROWS} overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
            tabIndex={0}
            role="region"
            aria-labelledby="api-limit"
          >
            <table className={`${DOC_TABLE} min-w-[520px]`} data-rate-limits={RATE_LIMIT_NAMES.length}>
              <thead>
                <tr>
                  <th scope="col" className={DOC_TH}>Bucket</th>
                  <th scope="col" className={DOC_TH}>Allows</th>
                  <th scope="col" className={DOC_TH}>Per</th>
                  <th scope="col" className={DOC_TH}>Guards</th>
                </tr>
              </thead>
              <tbody>
                {RATE_LIMIT_NAMES.map((name) => {
                  const bucket = RATE_LIMITS[name];
                  return (
                    <tr key={name} data-bucket={name} className="border-t border-line">
                      <td className={DOC_TD_KEY}>{name}</td>
                      <td className={`${DOC_TD} whitespace-nowrap text-foreground`}>
                        {bucket.limit} requests {rateWindowWord(bucket.windowSec)}
                      </td>
                      <td className={`${DOC_TD} text-foreground`}>{bucket.keyedBy}</td>
                      <td className={DOC_TD}>{bucket.guards}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className={NOTE}>
            A refused request is a <span className="font-mono text-foreground">429</span> carrying{" "}
            <span className="font-mono text-foreground">Retry-After</span> — whole seconds until the next request is
            yours, computed from the bucket's refill rather than a flat window — and a body naming the bucket. The
            table, the OpenAPI document's <span className="font-mono text-foreground">info</span> and the gateway's
            limiter read one constant, so when a number moves it moves everywhere at once.
          </p>
        </section>

        <section aria-labelledby="api-notice">
          <h2 id="api-notice" className={DOC_H2}>In notice</h2>
          {API_DEPRECATIONS.length === 0 ? (
            <p className={DOC_BODY} data-in-notice="0">
              Nothing. No field is scheduled for removal.
            </p>
          ) : (
            <ul className={`${DOC_ARTICLES} m-0 list-none p-0`} data-in-notice={API_DEPRECATIONS.length}>
              {API_DEPRECATIONS.map((notice) => (
                <li key={`${notice.shape}:${notice.key}`} className={DOC_ARTICLE}>
                  <div className={DOC_ARTICLE_H}>
                    <span className="font-mono text-[14px] font-medium text-foreground">{notice.key}</span>
                    <span className={DOC_ARTICLE_META}>
                      on {SHAPE_LABEL[notice.shape]} · announced {notice.since} · removed {notice.until}
                    </span>
                  </div>
                  <p className={DOC_ARTICLE_BODY}>{notice.sentence}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="api-changelog">
          <h2 id="api-changelog" className={DOC_H2}>The changelog</h2>
          {API_CHANGELOG.map((release) => (
            <article key={release.version} className="mt-5" data-release={release.version}>
              <h3 className={DOC_ARTICLE_H}>
                <span className="font-mono text-[16px] font-medium text-foreground">{release.version}</span>
                <time dateTime={release.date} className="text-[13px] text-muted-foreground">
                  {release.date}
                </time>
              </h3>
              <ul className={`${DOC_ARTICLES} m-0 mt-2 list-none p-0`}>
                {release.entries.map((entry) => (
                  <li key={`${entry.shape}:${entry.key}:${entry.change}`} className="border-b border-line py-3">
                    <div className={DOC_ARTICLE_H}>
                      <span className="font-mono text-[14px] font-medium text-foreground">{entry.key}</span>
                      <span className={DOC_ARTICLE_META}>
                        {entry.change} · {SHAPE_LABEL[entry.shape]} · {entry.milestone}
                      </span>
                    </div>
                    <p className={DOC_ARTICLE_BODY}>{entry.sentence}</p>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
