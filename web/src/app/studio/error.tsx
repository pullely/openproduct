"use client";

// A studio surface that threw (openproduct-commons XP3).
//
// THE ONE SENTENCE A MAINTAINER NEEDS HERE that a visitor does not: whether
// the edit they just made was saved. They were mid-task, and "something went
// wrong" leaves them unable to decide whether to do it again — which is the
// worst possible state to leave somebody in on a surface that writes.
//
// The honest answer is that we cannot tell from here, so the page says so and
// says where to look, rather than reassuring them either way.

import { RouteError } from "../ui/route-error";

// OB8 — logs the error, and reloads a page from the previous build. A stale
// page here is never a lost save: the chunk failed before anything posted.
export default function StudioError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteError
      error={error}
      reset={reset}
      what="This screen stopped part way through. If you had just saved something, we cannot tell from here whether it went through — reload and check before doing it again."
      actions={[{ label: "Your listings", href: "/studio" }]}
    />
  );
}
