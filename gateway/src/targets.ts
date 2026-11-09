// The internal paths the public catalog routes proxy to.
//
// EXTRACTED SO TWO SURFACES CANNOT DRIFT (openproduct-worldclass AG1, WC-9).
// `router.ts` forwards `/v1/products`, `/v1/products/{slug}` and `/v1/facets`
// to these; `mcp.ts` reads the same three. The rule is *"the badge, the public
// API and the MCP server are one distribution surface reading one document"*,
// and a constant is the cheapest way to make that structural rather than
// something two files agree about until one is edited.
export const CATALOG_LIST_TARGET = "/internal/public/openproduct/catalog/products";
export const CATALOG_FACETS_TARGET = "/internal/public/openproduct/catalog/facets";

export function catalogProductTarget(slug: string): string {
  return `${CATALOG_LIST_TARGET}/${encodeURIComponent(slug)}`;
}
