/**
 * A JSON-LD block, emitted once and escaped once (openproduct-worldclass RE1).
 *
 * ONE COMPONENT BECAUSE THERE IS ONE ESCAPING RULE, and it is the kind that is
 * correct in the file where somebody thought about it and forgotten in the
 * five that copied the shape. The value is a JSON string built from this
 * product's own projection, so `JSON.stringify` escapes what it must — except
 * `<`, which it leaves alone and which is the whole risk: a tagline containing
 * `</script>` would otherwise close this tag and everything after it would be
 * markup somebody else wrote.
 *
 * RENDERS NOTHING FOR `null`, which is what the builders return when the
 * deployment has no canonical origin. A document consumed away from the page
 * cannot carry relative addresses — they would resolve against whatever host
 * quoted it — so on a preview host the honest output is no document at all.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | null }) {
  if (data === null) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
