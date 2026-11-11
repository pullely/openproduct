// VENDORED from the platform's `packages/db/src/content/doc.ts`
// (openproduct-independence OX6a) — byte-identical below this header. The
// digest form is load-bearing (profiles pinned revisions with it), so the
// vendored copy MUST NOT drift; it is 10 lines of hashing with no deps.

// Document canonicalization + content address.
//
// Rehomed from `work/doc.ts` at WT1b (orun-work-teardown). Skills pin their
// revisions with exactly this discipline (`skills/model.ts`), so the hashing
// outlives the work plane that first defined it. Unchanged otherwise — the
// digest form is load-bearing for anything that already pinned a revision.
//
// V3-2: the digest form matches the digest `orun work import` computes for a
// repo README (`sha256:<hex>` over the raw UTF-8 bytes), so a cloud-authored
// document and a repo-imported one share one doc_ref column and one sealing
// path. Canonicalization here is line endings only (CRLF → LF) — no other
// mutation, so what you hash is what you read back.

export function canonicalDocBody(body: string): string {
  return body.replace(/\r\n/g, "\n");
}

export async function docDigest(canonicalBody: string): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalBody);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  let hex = "";
  for (const b of new Uint8Array(hash)) hex += b.toString(16).padStart(2, "0");
  return `sha256:${hex}`;
}
