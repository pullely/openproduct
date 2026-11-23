import type { PublicProfile } from "@openproduct/contracts";

import { BTN_INK, FOCUS } from "../ui/design";

import { WHERE_IT_RUNS_LABEL, shownAddress, whereItRunsOfProfile, whereItRunsRows } from "./where-it-runs";
import { WORKSPACE_VIEW_LABEL, workspaceDoorPath } from "./workspace-view";

/** One link of a product, as the header card draws it. */
interface PlainLink {
  readonly key: string;
  /** What the link is — Stage, Repository, the crew's own word. Spoken and
   *  shown on hover, never drawn. */
  readonly label: string;
  /** The address as a reader reads it: host and path, no scheme. */
  readonly shown: string;
  readonly meta: string | null;
  readonly href: string;
}

/** A link's skin: the address alone, in the muted ink, underlined on hover. */
const LINK = `tap-h inline-flex min-h-[28px] min-w-0 max-w-full items-center gap-1.5 rounded-[6px] text-[14px] text-muted-foreground no-underline transition-colors hover:text-foreground hover:underline hover:underline-offset-[3px] ${FOCUS}`;

/**
 * A product's links, INSIDE its header card (openproduct-left-rail LR6): one
 * plain address per place a visitor can open — where it runs
 * (openproduct-stages-crew SC-2), its repository, and any link the crew
 * wrote themselves (LR-8).
 *
 * JUST THE ADDRESS (LR-9). LR6 drew each link as a shaded tile with a label
 * over the address; the owner's rule is that a link is its URL and nothing
 * around it. So a link is the address in the muted ink with a small link
 * glyph before it. What the link IS — Stage, Production, Repository, the
 * crew's label — is its accessible name and its hover title, so a screen
 * reader still hears "Stage: stage.example.com".
 *
 * ONLY WHAT IS THERE: a link that does not exist draws nothing, and a product
 * with none draws no strip at all. The stage badge under the name already
 * says where the product has got to.
 *
 * The workspace is not here: it is the header's ink button
 * (`WorkspaceDoor`, below).
 *
 * The same markup for every visitor, on the server.
 */
export function WhereItRunsStrip({
  profile,
}: {
  profile: Pick<PublicProfile, "whereItRuns" | "repoUrl" | "links">;
}) {
  const found: PlainLink[] = whereItRunsRows(whereItRunsOfProfile(profile))
    .filter((row) => row.url !== null)
    .map((row) => ({
      key: row.env,
      // The model's labels are capitals (STAGE, PRODUCTION); a name is a word.
      label: `${row.label.charAt(0)}${row.label.slice(1).toLowerCase()}`,
      shown: row.shown ?? "",
      meta: row.meta,
      href: row.url!,
    }));
  if (profile.repoUrl) {
    found.push({
      key: "repository",
      label: "Repository",
      shown: shownAddress(profile.repoUrl),
      meta: null,
      href: profile.repoUrl,
    });
  }
  // LR-8 — the crew's own links, last and in their order.
  for (const [index, link] of (profile.links ?? []).entries()) {
    found.push({
      key: `link-${index}`,
      label: link.label,
      shown: shownAddress(link.url),
      meta: null,
      href: link.url,
    });
  }
  if (found.length === 0) return null;

  // ONE ADDRESS, ONCE. With only the address drawn, a product whose stage
  // and production are the same place would show the same line twice; the
  // later one folds into the first, which then answers to both names.
  const links: PlainLink[] = [];
  for (const link of found) {
    const at = links.findIndex((earlier) => earlier.href === link.href);
    if (at === -1) links.push(link);
    else links[at] = { ...links[at]!, label: `${links[at]!.label}, ${link.label}`, meta: null };
  }

  return (
    <section
      aria-label={WHERE_IT_RUNS_LABEL}
      data-where-it-runs
      className="flex flex-wrap gap-x-5 gap-y-1 px-[22px] pb-4 max-sm:flex-col max-sm:gap-y-0 max-sm:px-[14px] max-sm:pb-3"
    >
      {links.map((link) => (
        <a
          key={link.key}
          href={link.href}
          rel="noreferrer noopener"
          data-where-row={link.key}
          title={link.meta ? `${link.label} · ${link.meta}` : link.label}
          className={LINK}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className="shrink-0">
            <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1 1M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1-1" />
          </svg>
          <span className="sr-only">{link.label}: </span>
          <span className="truncate">{link.shown}</span>
        </a>
      ))}
    </section>
  );
}

/**
 * The workspace's door, as the header's ink button (LR-9): the same pill
 * "Open it" wears, saying "Open on Orunbase".
 *
 * A PLAIN ANCHOR to `/{slug}/workspace` on this origin, drawn on
 * `workspaceRef` alone, so the page is the same bytes signed in and out
 * (OPC-1, I6) and no listing without a door shows one (openproduct-reader
 * OPR5, seam S12). That address answers with a redirect to the console, so
 * it is an `<a>` the browser follows, never a client-router link.
 */
export function WorkspaceDoor({ profile }: { profile: Pick<PublicProfile, "workspaceRef" | "slug"> }) {
  if (!profile.workspaceRef) return null;
  return (
    <a href={workspaceDoorPath(profile.slug)} rel="noopener" data-workspace-door className={BTN_INK}>
      {WORKSPACE_VIEW_LABEL}
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className="shrink-0">
        <path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
      </svg>
    </a>
  );
}
