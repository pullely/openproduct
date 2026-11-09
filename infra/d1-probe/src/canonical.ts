// Canonical JSON and its digest (openproduct-standalone OPN-2).
//
// `/export` answers with SHA-256 digests of the slice's outputs rather than
// megabytes of cards, so the smoke can compare remote D1 against a committed
// snapshot taken from LOCAL D1 for the same corpus. A digest is only a
// comparison if both sides serialise identically: keys sorted at every depth,
// arrays in their own order (order is part of every result here), and no
// Map, Date or undefined left to serialise differently.

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Map) throw new Error("canonicalJson: convert a Map before serialising it");
  if (value instanceof Date) throw new Error("canonicalJson: convert a Date before serialising it");
  if (Array.isArray(value)) return value.map((item) => (item === undefined ? null : canonicalize(item)));
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const item = (value as Record<string, unknown>)[key];
    if (item !== undefined) out[key] = canonicalize(item);
  }
  return out;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The digest of a value's canonical JSON, with the JSON's size. */
export async function digestOf(value: unknown): Promise<{ digest: string; bytes: number }> {
  const json = canonicalJson(value);
  return { digest: await sha256Hex(json), bytes: new TextEncoder().encode(json).byteLength };
}
