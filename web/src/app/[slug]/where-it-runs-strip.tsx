import type { PublicProfile } from "@openproduct/contracts";

import { FOCUS } from "../ui/design";
import { AppLink } from "../ui/link";

import { WHERE_IT_RUNS_LABEL, repositoryLabel, whereItRunsOfProfile, whereItRunsRows } from "./where-it-runs";
import { WORKSPACE_VIEW_LABEL, workspaceConsentPath } from "./workspace-view";

/** One link of a product, as the header card draws it. */
interface LinkTile {
  readonly key: string;
  readonly label: string;
  readonly shown: string;
  readonly meta: string | null;
  readonly href: string;
  /** An address on this site, taken by the client router. */
  readonly internal: boolean;
}

/** A tile's skin: the shaded tile a post's Try it wears (LR3, design §5.3). */
const TILE = `flex min-h-[52px] min-w-[220px] flex-1 items-center justify-between gap-3 rounded-[12px] bg-secondary px-4 py-2 text-foreground no-underline transition-colors hover:bg-border max-sm:min-w-0 max-sm:basis-full ${FOCUS}`;

/**
 * A product's links, INSIDE its header card (openproduct-left-rail LR6): one
 * shaded tile per address a visitor can open — where it runs
 * (openproduct-stages-crew SC-2), its repository, and its workspace.
 *
 * ONLY WHAT IS THERE. Where it runs was a card of its own with a row for the
 * stage and a row for production whether or not either existed, each saying
 * "Not on stage yet"; the repository and the workspace were rows of the side
 * column's "In the open". The owner's rule is that a product's links belong
 * in its main card and that the page says less: a link that does not exist
 * draws nothing, and a product with none draws no strip at all. The stage
 * badge under the name already says where the product has got to.
 *
 * THE WORKSPACE IS THE DOOR, NOT THE WORKSPACE: a plain link to the consent
 * page on this origin, drawn on `workspaceRef` alone, so the page is the same
 * bytes signed in and out (OPC-1, I6) and no listing without a door shows one
 * (openproduct-reader OPR5, seam S12).
 *
 * The same markup for every visitor, on the server.
 */
export function WhereItRunsStrip({
  profile,
}: {
  profile: Pick<PublicProfile, "whereItRuns" | "repoUrl" | "workspaceRef" | "slug">;
}) {
  const tiles: LinkTile[] = whereItRunsRows(whereItRunsOfProfile(profile))
    .filter((row) => row.url !== null)
    .map((row) => ({
      key: row.env,
      label: row.label,
      shown: row.shown ?? "",
      meta: row.meta,
      href: row.url!,
      internal: false,
    }));
  if (profile.repoUrl) {
    tiles.push({
      key: "repository",
      label: "Repository",
      shown: repositoryLabel(profile.repoUrl),
      meta: null,
      href: profile.repoUrl,
      internal: false,
    });
  }
  if (profile.workspaceRef) {
    tiles.push({
      key: "workspace",
      label: "Workspace",
      shown: WORKSPACE_VIEW_LABEL,
      meta: null,
      href: workspaceConsentPath(profile.slug),
      internal: true,
    });
  }
  if (tiles.length === 0) return null;

  return (
    <section
      aria-label={WHERE_IT_RUNS_LABEL}
      data-where-it-runs
      className="flex flex-wrap gap-2 px-[22px] pb-4 max-sm:px-[14px] max-sm:pb-3"
    >
      {tiles.map((tile) => {
        const body = (
          <>
            <span className="flex min-w-0 flex-col leading-[1.35]">
              <span className="text-[12px] font-semibold lowercase text-muted-foreground first-letter:uppercase">{tile.label}</span>
              <span className="truncate text-[15px] font-medium">{tile.shown}</span>
              {tile.meta ? <span className="truncate text-[12px] text-muted-foreground">{tile.meta}</span> : null}
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false" className="shrink-0">
              <path d={tile.internal ? "M9 6l6 6-6 6" : "M7 17L17 7M9 7h8v8"} />
            </svg>
          </>
        );
        return tile.internal ? (
          <AppLink key={tile.key} href={tile.href} data-where-row={tile.key} className={TILE}>
            {body}
          </AppLink>
        ) : (
          <a key={tile.key} href={tile.href} rel="noreferrer noopener" data-where-row={tile.key} className={TILE}>
            {body}
          </a>
        );
      })}
    </section>
  );
}
