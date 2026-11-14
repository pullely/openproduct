/**
 * The build tile's old name (openproduct-redesign OPR1).
 *
 * openproduct-calm drew a product as a one-per-row tile, `BuildTile`. The
 * redesign draws it as the Products board's card (`product-card.tsx`), and
 * every list of products draws that card. The lists outside the Products
 * section — a topic's, a stack value's, a pricing value's — still import the
 * old name; this keeps them drawing the one card rather than a second copy,
 * until each is rebuilt and imports `ProductCard` itself.
 */
export { ProductCard as BuildTile } from "./product-card";
