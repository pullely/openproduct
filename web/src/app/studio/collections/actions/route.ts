// POST /studio/collections/actions — every act the curator's page offers (LC4).
//
// ONE ROUTE FOR EVERY INTENT, dispatched on a hidden field, for the reason
// TS3's queue actions gave: separate routes would be separate copies of the
// session dance and the refusal mapping, and the last copy is the one that
// forgets to sanitize something.
//
// THE SESSION IS READ HERE, SERVER-SIDE, and the token never reaches the
// browser (OX5b). The forms are plain HTML with no client JS.
import { NextResponse, type NextRequest } from "next/server";

import { COLLECTION_REFUSALS, type CollectionRefusalReason } from "@openproduct/contracts";

import { SESSION_COOKIE, decodeSession } from "../../../auth/auth";
import { studioAnswer } from "../../answer";
import { collectionItems, createCollection, setCollectionState } from "../../studio-api";

const PAGE = "/studio/collections";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const back = (query: string) => answer.back(`${PAGE}${query}`);

  // OPP15 — the same act, answered as a `303` to a browser posting the form
  // and as that same address in JSON to the save island. One decision below,
  // two ways of carrying it; see `studio/answer.ts`.
  const answer = studioAnswer(request);

  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return answer.signIn(PAGE);

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "create") {
    const title = String(form.get("title") ?? "").trim();
    const slug = String(form.get("slug") ?? "").trim().toLowerCase();
    const blurb = String(form.get("blurb") ?? "").trim();
    const result = await createCollection(session.accessToken, {
      slug,
      title,
      ...(blurb.length > 0 ? { blurb } : {}),
    });
    return back(result.kind === "ok" ? "?notice=created" : refusalQuery(result));
  }

  const collectionId = String(form.get("collectionId") ?? "");
  if (!UUID_RE.test(collectionId)) return back("?refused=unknown-collection");

  if (intent === "publish" || intent === "retire") {
    const result = await setCollectionState(session.accessToken, {
      collectionId,
      state: intent === "publish" ? "published" : "retired",
    });
    return back(result.kind === "ok" ? `?notice=${intent === "publish" ? "published" : "retired"}` : refusalQuery(result));
  }

  if (intent !== "add" && intent !== "remove") return back("?refused=unknown-collection");

  const slug = String(form.get("slug") ?? "").trim().toLowerCase();
  if (slug.length === 0) return back("?refused=unknown-listing");
  const note = String(form.get("note") ?? "").trim();

  const result = await collectionItems(session.accessToken, intent, {
    collectionId,
    slug,
    ...(intent === "add" && note.length > 0 ? { note } : {}),
  });
  return back(result.kind === "ok" ? `?notice=${intent === "add" ? "added" : "removed"}` : refusalQuery(result));
}

/**
 * A refusal token from a CLOSED SET, never a message from the API.
 *
 * The API's `code` IS a `CollectionRefusalReason` for every refusal this
 * surface can provoke, so the token passes through when the contract knows it
 * and falls back otherwise — the page looks it up and renders the contract's
 * sentence either way. Passing the API's own text through the query string
 * would let anybody with a link put arbitrary words on a curator's screen.
 */
function refusalQuery(result: { kind: string; code?: string }): string {
  if (result.kind === "unauthorized") return "?refused=not-a-curator";
  const code = result.code ?? "";
  const known: CollectionRefusalReason | null =
    code in COLLECTION_REFUSALS ? (code as CollectionRefusalReason) : null;
  return `?refused=${known ?? "unknown-collection"}`;
}
