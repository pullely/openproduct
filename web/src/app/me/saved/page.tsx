import Link from "next/link";
import { redirect } from "next/navigation";

import { readSession } from "../../auth/session-server";
import { BTN_SMALL, PAGE_TITLE } from "../../ui/design";
import { ProductTile } from "../../ui/product-tile";
import { fetchSaved } from "../me-api";
import { ME_MAIN, ME_TITLE_GAP, MeNav } from "../nav";
import { MeUnavailable } from "../unavailable";

/**
 * Saved products (openproduct-home OH2). Only PUBLIC cards ever arrive — the
 * repository re-asserts visibility at read time, so a listing unpublished
 * after being saved simply disappears from here (and returns if re-published).
 *
 * THE DESIGN'S LIST: one card, a row per product under a `--line` rule — the
 * 44px tile, the name over its one-liner, and a small `Remove` button at the
 * right edge. The empty state is a dashed box, not a sentence in the void.
 */
export const dynamic = "force-dynamic";

export default async function SavedProductsPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await readSession();
  if (!session) redirect("/signin?return_to=%2Fme%2Fsaved");

  const result = await fetchSaved(session.accessToken);
  if (result.kind === "unauthorized") redirect("/signin?return_to=%2Fme%2Fsaved");
  if (result.kind === "unavailable") return <MeUnavailable active="saved" />;

  const { products } = result.data;
  const writeFailed = (await props.searchParams).error === "save_failed";

  return (
    <main className={ME_MAIN}>
      <MeNav active="saved" />

      <h1 className={`${PAGE_TITLE} ${ME_TITLE_GAP}`}>Saved products</h1>

      {writeFailed ? (
        <p className="m-0 mt-4 max-w-[65ch] rounded-[8px] border border-warning-soft-border bg-warning-soft px-3 py-2 text-[13px] text-warning-strong">
          That change was not saved. Try again in a moment.
        </p>
      ) : null}

      {products.length === 0 ? (
        <p className="m-0 mt-7 rounded-[20px] border border-dashed border-border px-8 py-14 text-center text-[16px] text-muted-foreground">
          Nothing saved yet.
        </p>
      ) : (
        <ul className="m-0 mt-6 grid list-none gap-[14px] p-0" data-saved-tiles>
          {products.map((product) => (
            <li
              key={product.slug}
              className="relative flex items-center gap-[18px] rounded-[20px] border border-border bg-card px-7 py-5 transition-colors hover:border-border-strong max-sm:gap-3.5 max-sm:px-4 max-sm:py-4"
            >
              <Link href={`/${product.slug}`} tabIndex={-1} aria-hidden="true" className="shrink-0">
                <ProductTile slug={product.slug} thumbnail={product.thumbnail} size={72} phoneSize={52} />
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/${product.slug}`}
                  className="text-[19px] font-semibold leading-[1.25] tracking-[-0.015em] text-foreground no-underline hover:text-copy"
                >
                  {product.slug}
                </Link>
                {product.tagline ? (
                  <p className="m-0 mt-1 line-clamp-2 text-[15px] leading-[1.5] text-copy">{product.tagline}</p>
                ) : null}
              </div>
              <form method="post" action={`/me/unsave?slug=${encodeURIComponent(product.slug)}`}>
                <button
                  type="submit"
                  className={`${BTN_SMALL} border-border text-muted-foreground hover:text-foreground`}
                >
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
