"use client";

// One of the visitor's own pages that threw (XP3).

import { RouteError } from "../ui/route-error";

// OB8 — logs the error, and reloads a page from the previous build.
export default function MeError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteError
      error={error}
      reset={reset}
      what="This page stopped part way through. Nothing you saved has been lost — reloading is worth one try."
      actions={[
        { label: "Your saved products", href: "/me?section=saved" },
        { label: "Products", href: "/products" },
      ]}
    />
  );
}
