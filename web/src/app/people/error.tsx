"use client";

// A person's page, or the directory of them, that threw (XP3).
//
// The nearest useful place is the CONTRIBUTORS directory, not the product
// one: somebody who was looking for a person is still looking for a person.

import { RouteError } from "../ui/route-error";

// OB8 — `RouteError` logs the error (this boundary used to discard it, which
// is why the prod failure could only be reproduced, never read) and reloads a
// page from the previous build into the current one (`ui/stale-deploy.ts`).
export default function PeopleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteError
      error={error}
      reset={reset}
      what="This page stopped part way through. Reloading may be enough; nothing about the person it describes has changed."
      actions={[{ label: "All people", href: "/people" }]}
    />
  );
}
