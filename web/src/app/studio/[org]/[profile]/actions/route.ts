// POST /studio/{org}/{profile}/actions — the editor's one form action (OX5b).
//
// Every studio mutation lands here with an `intent` field: one session read,
// one place the gateway is spoken to, one redirect discipline (303 back to
// the editor with a notice, an error, or the publish refusal's blockers in
// the URL — the page renders the remedy). The token never reaches the
// browser; these handlers are the only place it is used.
import { NextResponse, type NextRequest } from "next/server";

import {
  AUTHORED_MEDIA_KINDS,
  installLineRefusal,
  listingStepOf,
  normaliseInstallLine,
  type AuthoredMediaKind,
  type MaintainerEntry,
} from "@openproduct/contracts";

import { SESSION_COOKIE, decodeSession } from "../../../../auth/auth";
import { studioAnswer } from "../../../answer";
import {
  checkRepo,
  deleteOpening,
  publishListing,
  removeMedia,
  reorderGallery,
  updateMediaAlt,
  reviewListing,
  saveOpening,
  setMaintainers,
  unpublishListing,
  updateListing,
  uploadMedia,
  type StudioResult,
} from "../../../studio-api";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ org: string; profile: string }> },
): Promise<NextResponse> {
  const { org, profile } = await ctx.params;
  const editor = `/studio/${encodeURIComponent(org)}/${encodeURIComponent(profile)}`;

  // OPP15 — the same act, answered as a `303` to a browser posting the form
  // and as that same address in JSON to the save island. One decision below,
  // two ways of carrying it; see `studio/answer.ts`.
  const answer = studioAnswer(request);

  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return answer.signIn(editor);
  const token = session.accessToken;

  const form = await request.formData().catch(() => null);
  const intent = text(form?.get("intent"));

  // IN1 — WHERE A SAVE RETURNS TO. The editor used to be one page, so every
  // redirect went to the same place. Now a step is an address, and a save has
  // to land back on the step that made it or a maintainer is thrown to the
  // overview after every edit. `from` is that step's segment, posted by the
  // form; anything not in the vocabulary falls back to the overview rather
  // than being trusted into a URL.
  const from = text(form?.get("from"));
  const step = from.length > 0 ? listingStepOf(from) : null;
  const stepBase = step?.segment ? `${editor}/${step.segment}` : editor;
  const back = (suffix: string) => answer.back(`${stepBase}${suffix}`);
  // A background caller's answer with the rows an act wrote (OSD4, OSD6).
  const rows = (to: string, media: readonly unknown[]) =>
    NextResponse.json({ data: { to, media } }, { status: 200, headers: { "cache-control": "no-store" } });

  switch (intent) {
    // IN1 SPLIT `update` IN TWO, and the reason is a defect the split would
    // otherwise have introduced. The route read every field from every save,
    // so a Details form — which posts no `stack` and no facets — would have
    // sent empty ones and CLEARED the topics set on another page. The API is
    // a PATCH and always was; the old route simply sent everything because
    // there was only ever one form. Each step now sends its own fields and
    // nothing else (`STEP_FIELDS` in the contract is the list all three
    // agree on).
    case "update-details": {
      // PV2 — REFUSED HERE AS WELL AS AT THE API AND AT THE COLUMN, and the
      // reason is what a maintainer sees rather than what gets stored. The
      // API answers 422 and this route's fallthrough would turn that into a
      // generic `save_failed`, which tells somebody who typed a piped
      // installer nothing about why. Checking first means the refusal that
      // reaches them is the contract's own sentence.
      const installRaw = textOrNull(form?.get("installLine"));
      const installLine = installRaw === null ? null : normaliseInstallLine(installRaw);
      if (installLine !== null) {
        const refusal = installLineRefusal(installLine);
        if (refusal) return back(`?error=install_refused&why=${encodeURIComponent(refusal)}`);
      }
      const result = await updateListing(token, org, profile, {
        slug: text(form?.get("slug")).toLowerCase(),
        tagline: textOrNull(form?.get("tagline")),
        pitch: textOrNull(form?.get("pitch")),
        installLine,
        repoUrl: textOrNull(form?.get("repoUrl")),
        liveUrl: textOrNull(form?.get("liveUrl")),
      });
      if (result.kind === "ok") return back("?notice=saved");
      if (result.kind === "refused" && result.status === 409) return back("?error=slug_taken");
      return fallthrough(result, answer.signIn, editor, back, "?error=save_failed");
    }

    case "update-topics": {
      const stack = text(form?.get("stack"))
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
        .slice(0, 12);
      const result = await updateListing(token, org, profile, {
        stack,
        // CT1 — the assigned facets. An empty select means "we do not answer
        // this" and clears the field; the API refuses anything outside the
        // vocabulary rather than storing it, so the select's options and the
        // catalog's facets cannot drift.
        category: textOrNull(form?.get("category")),
        hosting: textOrNull(form?.get("hosting")),
        pricing: textOrNull(form?.get("pricing")),
      });
      if (result.kind === "ok") return back("?notice=saved");
      return fallthrough(result, answer.signIn, editor, back, "?error=save_failed");
    }

    case "repo-check": {
      const result = await checkRepo(token, org, profile);
      if (result.kind === "ok") {
        const blockers = result.data.blockers ?? [];
        return back(blockers.length > 0 ? `?notice=checked&blockers=${blockers.join(",")}` : "?notice=checked");
      }
      return fallthrough(result, answer.signIn, editor, back, "?error=check_failed");
    }

    case "review": {
      const result = await reviewListing(token, org, profile);
      if (result.kind === "ok") return back("?notice=reviewed");
      if (result.kind === "refused" && result.status === 404) return back("?error=review_refused");
      return fallthrough(result, answer.signIn, editor, back, "?error=action_failed");
    }

    case "publish": {
      const components = text(form?.get("components"))
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(0, 50)
        .map((line) => {
          const [name, kind] = line.split("|").map((part) => part.trim());
          return { name: name ?? "", kind: kind && kind.length > 0 ? kind : null };
        })
        .filter((entry) => entry.name.length > 0);
      const result = await publishListing(token, org, profile, components);
      if (result.kind === "ok") return back("?notice=published");
      if (result.kind === "refused" && result.blockers && result.blockers.length > 0) {
        // The refusal IS the answer: name every gate at once, with remedies.
        return back(`?blockers=${result.blockers.join(",")}`);
      }
      return fallthrough(result, answer.signIn, editor, back, "?error=action_failed");
    }

    case "unpublish": {
      const result = await unpublishListing(token, org, profile);
      if (result.kind === "ok") return back("?notice=unpublished");
      return fallthrough(result, answer.signIn, editor, back, "?error=action_failed");
    }

    case "opening-save": {
      const openingId = text(form?.get("openingId"));
      const status = text(form?.get("status"));
      const result = await saveOpening(
        token,
        org,
        profile,
        {
          title: text(form?.get("title")),
          ...(status ? { status } : {}),
        },
        openingId || undefined,
      );
      if (result.kind === "ok") return back("?notice=opening_saved");
      return fallthrough(result, answer.signIn, editor, back, "?error=action_failed");
    }

    case "opening-delete": {
      const openingId = text(form?.get("openingId"));
      if (!openingId) return back("?error=action_failed");
      const result = await deleteOpening(token, org, profile, openingId);
      if (result.kind === "ok") return back("?notice=opening_deleted");
      return fallthrough(result, answer.signIn, editor, back, "?error=action_failed");
    }

    // MD2 — THE ONE INTENT WHOSE BODY IS A FILE. The form posts
    // multipart; the file is read as a Blob and forwarded to the gateway as
    // the body, the fields in the query (MD1's shape). Never buffered into a
    // string, never written anywhere here: this route is a relay with a
    // token, and the gateway is the thing that sniffs, stores and asks core
    // for the row. Its refusals are the contract's own sentences (too large,
    // not an image, too small, a full gallery, a second hero) and they reach
    // the page as `why`, the way PV2's install refusal does.
    case "upload-media": {
      const file = form?.get("file");
      const kind = text(form?.get("kind"));
      const alt = text(form?.get("alt"));
      const position = Number.parseInt(text(form?.get("position")) || "0", 10);
      if (!(file instanceof Blob) || file.size === 0) return back("?error=media_refused&why=Choose+an+image+file");
      if (!(AUTHORED_MEDIA_KINDS as readonly string[]).includes(kind)) {
        return back("?error=media_refused&why=One+of+logo%2C+hero+or+gallery");
      }
      if (alt.length === 0) return back("?error=media_refused&why=Alt+text+is+required");
      const result = await uploadMedia(token, org, profile, file, {
        kind: kind as AuthoredMediaKind,
        alt,
        // A logo's and a hero's position is pinned to 0 by the model (and the
        // column); the form posts the next GALLERY slot, which only applies
        // to a gallery.
        position: kind !== "gallery" ? 0 : Number.isFinite(position) && position >= 0 ? position : 0,
      });
      if (result.kind === "ok") {
        // A background caller (the logo control, OSD4) gets the ROW as well
        // as the address: it draws the new picture from the answer rather
        // than waiting on a re-render the router does not always deliver.
        if (answer.json) {
          return NextResponse.json(
            { data: { to: `${stepBase}?notice=media_added`, media: result.data.media } },
            { status: 200, headers: { "cache-control": "no-store" } },
          );
        }
        return back("?notice=media_added");
      }
      if (result.kind === "refused") {
        return back(`?error=media_refused&why=${encodeURIComponent(result.message)}`);
      }
      return fallthrough(result, answer.signIn, editor, back, "?error=action_failed");
    }

    // openproduct-studio OSD6 — the words under a picture, and the gallery's
    // order, changed where they are shown. Both answer a background caller
    // with the rows they wrote, as an upload does.
    case "describe-media": {
      const mediaId = text(form?.get("mediaId"));
      const alt = text(form?.get("alt"));
      if (!mediaId) return back("?error=action_failed");
      if (alt.length === 0) return back("?error=media_refused&why=Alt+text+is+required");
      const result = await updateMediaAlt(token, org, profile, mediaId, alt);
      if (result.kind === "ok") {
        if (answer.json) return rows(`${stepBase}?notice=media_described`, [result.data.media]);
        return back("?notice=media_described");
      }
      if (result.kind === "refused") return back(`?error=media_refused&why=${encodeURIComponent(result.message)}`);
      return fallthrough(result, answer.signIn, editor, back, "?error=action_failed");
    }

    case "reorder-gallery": {
      const gallery = text(form?.get("gallery"))
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
      const result = await reorderGallery(token, org, profile, gallery);
      if (result.kind === "ok") {
        if (answer.json) return rows(`${stepBase}?notice=gallery_reordered`, result.data.media);
        return back("?notice=gallery_reordered");
      }
      if (result.kind === "refused") return back(`?error=media_refused&why=${encodeURIComponent(result.message)}`);
      return fallthrough(result, answer.signIn, editor, back, "?error=action_failed");
    }

    case "remove-media": {
      const mediaId = text(form?.get("mediaId"));
      if (!mediaId) return back("?error=action_failed");
      const result = await removeMedia(token, org, profile, mediaId);
      if (result.kind === "ok") return back("?notice=media_removed");
      return fallthrough(result, answer.signIn, editor, back, "?error=action_failed");
    }

    case "maintainers": {
      // One per line: "@handle | label" or, as before, "subjectId | label".
      // openproduct-studio OSD7 — a maker names people by the handle they can
      // SEE on a contributor page, not by an id they would have to be told.
      // This parse only splits: a leading `@` makes the line a handle, and
      // CORE resolves it (one batched read, active holders only) and refuses
      // one nobody holds by name. Emails are still refused there, on both
      // paths, and this parse never invents one.
      const maintainers: MaintainerEntry[] = text(form?.get("maintainers"))
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(0, 50)
        .map((line) => {
          const [who = "", label] = line.split("|").map((part) => part.trim());
          const roleLabel = label && label.length > 0 ? label : null;
          return who.startsWith("@") ? { handle: who.slice(1), roleLabel } : { subjectId: who, roleLabel };
        })
        .filter((entry) => (entry.handle ?? entry.subjectId ?? "").length > 0);
      const result = await setMaintainers(token, org, profile, maintainers);
      if (result.kind === "ok") return back("?notice=maintainers_saved");
      // The refusal's own sentence ("No one here goes by @x") travels in
      // `why`, as the media step's does — a maker who mistyped one name of
      // five needs to know which.
      if (result.kind === "refused" && result.status === 422) {
        const why = result.fields?.maintainers?.[0];
        return back(`?error=maintainers_refused${why ? `&why=${encodeURIComponent(why)}` : ""}`);
      }
      return fallthrough(result, answer.signIn, editor, back, "?error=save_failed");
    }

    default:
      return back("?error=action_failed");
  }
}

/** The shared tail: dead token → sign-in; anything else → the given error. */
function fallthrough(
  result: StudioResult<unknown>,
  signIn: (returnTo: string) => NextResponse,
  editor: string,
  back: (suffix: string) => NextResponse,
  errorSuffix: string,
): NextResponse {
  if (result.kind === "unauthorized") return signIn(editor);
  return back(errorSuffix);
}

function text(value: FormDataEntryValue | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function textOrNull(value: FormDataEntryValue | null | undefined): string | null {
  const trimmed = text(value);
  return trimmed.length === 0 ? null : trimmed;
}
