"use client";

import * as React from "react";

import { hintedSignedIn } from "../ui/use-toggle";
import { subscribeVisitor, visitorSnapshot } from "../ui/visitor";

// The feed's two personal columns, as gates (openproduct-redesign OPR-3).
//
// `/` is one document for everybody, and every visitor's browser downloads
// what its client components import. The left column ("Your products") and
// the Following card are drawn for somebody who is signed in and for nobody
// else — so the code that draws them (`feed-you.tsx`) is fetched only when
// this browser has a session to show them for. What an anonymous visitor
// downloads is this file: the question, and nothing that answers it.
//
// THE QUESTION IS THE SHELL'S: the pre-paint hint (the cookie the boot script
// read), or `/auth/session`'s answer once the shell has published it. Either
// is enough to fetch the columns; they make their own signed-in read and
// draw nothing if it says no. The server's answer is always "no", so the
// cached HTML carries neither column.

const FeedYouBody = React.lazy(() => import("./feed-you").then((module) => ({ default: module.FeedYou })));
const FeedFollowingBody = React.lazy(() => import("./feed-you").then((module) => ({ default: module.FeedFollowing })));

const signedIn = (): boolean => visitorSnapshot().signedIn || hintedSignedIn();
const never = (): boolean => false;

function useSignedIn(): boolean {
  return React.useSyncExternalStore(subscribeVisitor, signedIn, never);
}

/** The left column, signed in: the profile card and "Your products". */
export function FeedYou() {
  if (!useSignedIn()) return null;
  return (
    <React.Suspense fallback={null}>
      <FeedYouBody />
    </React.Suspense>
  );
}

/** The right column's Following card, signed in. */
export function FeedFollowing() {
  if (!useSignedIn()) return null;
  return (
    <React.Suspense fallback={null}>
      <FeedFollowingBody />
    </React.Suspense>
  );
}
