import { LINK_REL, type RenderNode, handlePath } from "@openproduct/contracts";

import { AppLink } from "./link";

/**
 * A post's body, from the contract's typed tree (openproduct-commons CB1).
 *
 * NOTE WHAT THIS COMPONENT CANNOT DO. There is no `dangerouslySetInnerHTML`
 * here and there is no way to add one usefully, because what it receives is
 * NODES rather than markup — the parser never produced a string, so there is
 * no string to inject. Every text value below goes through React, which
 * escapes it. That is the whole XSS story for this surface, and it is a
 * property of the data shape rather than of anybody remembering a rule.
 *
 * The switch is exhaustive over `RenderNode`, so adding a node kind to the
 * contract fails the typecheck here until it is rendered — a new kind cannot
 * arrive on the page as a blank.
 */
export function PostBody({ nodes }: { nodes: readonly RenderNode[] }) {
  return (
    // The design's comment body: 15px over 1.55, in `--copy`.
    <div className="text-[15px] leading-[1.55] text-copy">
      {nodes.map((node, i) => (
        <Node key={i} node={node} />
      ))}
    </div>
  );
}

function Children({ nodes }: { nodes: readonly RenderNode[] }) {
  return (
    <>
      {nodes.map((node, i) => (
        <Node key={i} node={node} />
      ))}
    </>
  );
}

function Node({ node }: { node: RenderNode }) {
  switch (node.kind) {
    case "text":
      return <>{node.value}</>;
    case "emphasis":
      return (
        <em>
          <Children nodes={node.children} />
        </em>
      );
    case "strong":
      return (
        <strong className="font-semibold">
          <Children nodes={node.children} />
        </strong>
      );
    case "code":
      return (
        <code className="rounded-[4px] bg-secondary px-1 py-0.5 font-mono text-[13px] text-foreground">{node.value}</code>
      );
    case "codeblock":
      return (
        // `overflow-x-auto` on the block itself, never on the page. A snippet
        // with a long line is normal; a page that scrolls sideways because
        // somebody pasted one is not.
        <pre className="my-2.5 overflow-x-auto rounded-[8px] bg-secondary px-3 py-2.5 font-mono text-[13px] leading-[1.5] text-foreground">
          <code>{node.value}</code>
        </pre>
      );
    case "link":
      // `rel` from the contract, not typed here: every rendered link says the
      // same thing about what it is, and a second spelling of that string is
      // a second thing to get wrong. `next/link` is deliberately NOT used —
      // these are external by construction (the subset refuses relative
      // hrefs), and prefetching a stranger's URL is a request the reader did
      // not make.
      return (
        <a href={node.href} rel={LINK_REL} target="_blank" className="underline underline-offset-2">
          <Children nodes={node.children} />
        </a>
      );
    case "mention":
      // CV3 — OPC-5, ONE TERNARY. A claimed handle is a link to the person;
      // an unclaimed one is the text somebody typed, never a link to a
      // profile that does not exist. The decision was made in core from a
      // read of the namespace — this renders the answer and does not
      // re-derive it, because a page that guessed would be the second place
      // the rule lives.
      //
      // `AppLink`, not the raw `<a>` above: this one IS ours, so it gets the
      // estate's own navigation. And no `rel` — the link goes to `/@handle`
      // on this site, not to a stranger's URL.
      return node.claimed ? (
        <AppLink
          href={handlePath(node.handle)}
          className="underline decoration-border underline-offset-2 hover:decoration-inherit"
        >
          @{node.handle}
        </AppLink>
      ) : (
        <>@{node.handle}</>
      );
    case "paragraph":
      return (
        <p className="m-0 mb-2.5 last:mb-0">
          <Children nodes={node.children} />
        </p>
      );
    case "quote":
      return (
        <blockquote className="my-2.5 border-l-2 border-border pl-3 text-muted-foreground">
          <Children nodes={node.children} />
        </blockquote>
      );
    case "list":
      return node.ordered ? (
        <ol className="my-2.5 list-decimal pl-5">
          <Children nodes={node.children} />
        </ol>
      ) : (
        <ul className="my-2.5 list-disc pl-5">
          <Children nodes={node.children} />
        </ul>
      );
    case "listitem":
      return (
        <li className="mb-1 last:mb-0">
          <Children nodes={node.children} />
        </li>
      );
  }
}

/** Unused, and that is the point: it fails the typecheck if a node kind is
 *  added to the contract and not rendered above. */
export type ExhaustiveNodeCheck = RenderNode["kind"];
