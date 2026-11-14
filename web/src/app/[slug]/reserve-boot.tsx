import { makerReserveBoot } from "./maker/gate";

/**
 * The maker view's room, held before the first paint (openproduct-redesign
 * OPR-3; `maker/gate.ts` says what the room is).
 *
 * A SERVER COMPONENT, AND THE SAME BYTES FOR EVERY VISITOR: an inline script
 * whose text depends on the product's slug and on nothing about who is
 * reading. It runs while the page is being parsed, reads THIS browser's own
 * memory of how tall the maker view's pieces were, and — only when the
 * session hint says signed in — sets the custom properties the empty slots'
 * `min-height` reads. A visitor's browser holds no such memory, and for a
 * visitor it does nothing.
 *
 * THE TEXT IS WRITTEN BY `makerReserveBoot`, not assembled here. The slug is
 * the page's own (letters, digits and hyphens: the route would not have
 * matched anything else), and the text holds no `<` at all — so nothing in it
 * can close the `<script>` it is written into. Anything but a slug draws no
 * script.
 */
export function MakerReserveBoot({ slug }: { slug: string }) {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(slug)) return null;
  return <script dangerouslySetInnerHTML={{ __html: makerReserveBoot(slug) }} />;
}
