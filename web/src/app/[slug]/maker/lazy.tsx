"use client";

import * as React from "react";

import { useMaker } from "./use-maker";

// The maker view's crew-only pieces, as gates (openproduct-redesign OPR-3,
// design §4).
//
// A PRODUCT'S PAGE IS ONE PAGE FOR EVERYBODY, and every visitor's browser
// downloads what its client components import. The switch, "Needs you", the
// New post pills, "Edit post" and the milestone manager are drawn for the
// crew and nobody else — so each is fetched (`React.lazy`) only once the
// overlay has said "crew", and what a visitor downloads is this file: the
// question, and nothing that answers it.
//
// THE GATE IS STILL `useMaker`. On the server, and for everybody who is not
// on the crew, each of these returns null before anything is fetched: no
// maker element is in the cached HTML, and none reaches a visitor's bundle.
//
// THE NAMES ARE THE COMPONENTS' OWN, so the page reads as it did; the real
// components keep their own gate as well (they are also what a test reads).

const ViewSwitchBody = React.lazy(() => import("./view-switch").then((module) => ({ default: module.ViewSwitch })));
const NeedsYouBody = React.lazy(() => import("./needs-you").then((module) => ({ default: module.NeedsYou })));
const NewPostRowBody = React.lazy(() => import("./new-post").then((module) => ({ default: module.NewPostRow })));
const EditPostLinkBody = React.lazy(() => import("./new-post").then((module) => ({ default: module.EditPostLink })));
const MilestonesManagerBody = React.lazy(() =>
  import("./milestones").then((module) => ({ default: module.MilestonesManager })),
);

/** The Manage / Visitor switch: for the crew, on either setting. */
export function ViewSwitch({ slug }: { slug: string }) {
  const { crew } = useMaker(slug);
  if (crew === null) return null;
  return (
    <React.Suspense fallback={null}>
      <ViewSwitchBody slug={slug} />
    </React.Suspense>
  );
}

/** "Needs you": the crew's, on Manage. */
export function NeedsYou({ slug }: { slug: string }) {
  const { managing } = useMaker(slug);
  if (!managing) return null;
  return (
    <React.Suspense fallback={null}>
      <NeedsYouBody slug={slug} />
    </React.Suspense>
  );
}

/** The New post pills: the crew's, on Manage. */
export function NewPostRow({ slug }: { slug: string }) {
  const { managing } = useMaker(slug);
  if (!managing) return null;
  return (
    <React.Suspense fallback={null}>
      <NewPostRowBody slug={slug} />
    </React.Suspense>
  );
}

/** "Edit post" on one of the product's posts: the crew's, on Manage. */
export function EditPostLink({ slug, postId, label }: { slug: string; postId: string; label?: string }) {
  const { managing } = useMaker(slug);
  if (!managing) return null;
  return (
    <React.Suspense fallback={null}>
      <EditPostLinkBody slug={slug} postId={postId} {...(label ? { label } : {})} />
    </React.Suspense>
  );
}

/** The milestone manager: the crew's, on Manage. */
export function MilestonesManager({ slug, standalone = false }: { slug: string; standalone?: boolean }) {
  const { managing } = useMaker(slug);
  if (!managing) return null;
  return (
    <React.Suspense fallback={null}>
      <MilestonesManagerBody slug={slug} standalone={standalone} />
    </React.Suspense>
  );
}
