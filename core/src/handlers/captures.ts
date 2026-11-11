// Observed screenshots — the queue and the ledger's door (openproduct-worldclass MD4).
//
// Two routes on the ingestion door, beside the signals' two, and shaped like
// them: the sweep ASKS which listings are due and REPORTS what came of each.
// No actor rides either — the sweep is not a person and the service binding
// is the authorization (SN1). Nothing here reaches the internet, stores a
// byte, or renders a picture: core knows WHICH listings and holds the
// database; the gateway holds the bucket and can reach the browser. That is
// the division `gateway/sweep.ts` opens with, applied to a picture.
//
// ─── THE OBSERVATION DOOR REFUSES THIS BY NAME, SO THIS IS ITS OWN ───────
//
// `signals/observation` validates its source against the repository tiers and
// says why: "a `declared_url` observation would have matched no row, recorded
// nothing, and answered 200". A capture carries no metric and is not a tier;
// it is a row in `product_media` and a row in the capture ledger (1905). So it
// has its own door, and adding a kind of observation stays a question of
// which door it belongs to rather than a case in one handler.

import {
  CAPTURE_FAILURES,
  CAPTURE_FAILURE_TOLERANCE,
  CAPTURE_MAX_PER_RUN,
  MEDIA_ALT_MAX,
  MEDIA_MAX_SIDE,
  MEDIA_MIN_HEIGHT,
  MEDIA_MIN_WIDTH,
  SCREENSHOT_REFRESH_AFTER_DAYS,
  parseMediaRef,
  type CaptureFailure,
  type DueCapture,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";

import type { Env } from "../env.js";
import { successResponse, validationError } from "../http.js";
import { generateId, parseProfilePublicId, profilePublicId, type Uuid } from "../ids.js";

export interface CaptureHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    "listDueCaptures" | "replaceScreenshot" | "recordCaptureSuccess" | "recordCaptureFailure"
  >;
  now?: () => Date;
  generateId?: () => Uuid;
}

const REFRESH_MS = SCREENSHOT_REFRESH_AFTER_DAYS * 24 * 60 * 60 * 1000;

/** GET …/media/captures/due — the listings the sweep should photograph now,
 *  oldest first, capped at the contract's per-run number. */
export async function handleListDueCaptures(
  env: Env,
  requestId: string,
  deps: CaptureHandlerDeps,
): Promise<Response> {
  const now = (deps.now ?? (() => new Date()))();
  const before = new Date(now.getTime() - REFRESH_MS).toISOString();
  const rows = await deps.repo.listDueCaptures(before, CAPTURE_MAX_PER_RUN);
  void env;
  const captures: DueCapture[] = rows.map((row) => ({
    // A PUBLIC id over the wire, never the row's uuid — the gateway is the
    // other side of a boundary, and internal ids do not cross it.
    profileId: profilePublicId(row.profileId),
    slug: row.slug,
    target: row.target,
    observedAt: row.observedAt,
  }));
  return successResponse({ captures }, requestId);
}

interface CaptureBody {
  profileId?: unknown;
  target?: unknown;
  ok?: unknown;
  error?: unknown;
  ref?: unknown;
  alt?: unknown;
  width?: unknown;
  height?: unknown;
  observedAt?: unknown;
}

/**
 * POST …/media/captures — what came of one attempt.
 *
 * AN OUTAGE IS NOT AN OBSERVATION, here as everywhere in this plane: a
 * failed attempt writes NO picture and touches nothing on the page. It is
 * counted against the address, and at the tolerance the address leaves the
 * queue — the capture already on the page, if any, ages out through its own
 * window rather than being frozen or torn down.
 */
export async function handleRecordCapture(
  env: Env,
  request: Request,
  requestId: string,
  deps: CaptureHandlerDeps,
): Promise<Response> {
  let body: CaptureBody;
  try {
    body = (await request.json()) as CaptureBody;
  } catch {
    return validationError(requestId, { body: ["Body must be JSON"] });
  }
  void env;

  const profileId =
    typeof body.profileId === "string" ? parseProfilePublicId(body.profileId) : null;
  if (!profileId) return validationError(requestId, { profileId: ["Unknown listing"] });
  const target = typeof body.target === "string" ? body.target.trim() : "";
  if (target.length === 0) return validationError(requestId, { target: ["The address attempted"] });
  const at = ((deps.now ?? (() => new Date()))()).toISOString();

  if (body.ok === false) {
    const error = typeof body.error === "string" ? body.error : "";
    if (!(CAPTURE_FAILURES as readonly string[]).includes(error)) {
      // The closed list, or nothing: the ledger's column holds a word an
      // operator greps for, never a body or an address.
      return validationError(requestId, { error: [`One of: ${CAPTURE_FAILURES.join(", ")}`] });
    }
    const row = await deps.repo.recordCaptureFailure(
      profileId,
      target,
      error as CaptureFailure,
      at,
      CAPTURE_FAILURE_TOLERANCE,
    );
    return successResponse(
      { recorded: "failure", failureCount: row.failureCount, withdrawn: row.withdrawnAt !== null },
      requestId,
    );
  }

  const fields: Record<string, string[]> = {};
  const ref = typeof body.ref === "string" ? body.ref : "";
  if (!parseMediaRef(ref)) fields.ref = ["A content reference the gateway produced"];
  const alt = typeof body.alt === "string" ? body.alt.trim() : "";
  if (alt.length === 0) fields.alt = ["Alt text is required"];
  else if (alt.length > MEDIA_ALT_MAX) fields.alt = [`At most ${MEDIA_ALT_MAX} characters`];
  const width = typeof body.width === "number" ? body.width : NaN;
  const height = typeof body.height === "number" ? body.height : NaN;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < MEDIA_MIN_WIDTH ||
    height < MEDIA_MIN_HEIGHT ||
    width > MEDIA_MAX_SIDE ||
    height > MEDIA_MAX_SIDE
  ) {
    fields.dimensions = [
      `Between ${MEDIA_MIN_WIDTH}×${MEDIA_MIN_HEIGHT} and ${MEDIA_MAX_SIDE}×${MEDIA_MAX_SIDE}`,
    ];
  }
  // The moment is the sweep's, not this handler's: it is when the page was
  // SEEN, and the frame on the listing shows exactly that. It must parse,
  // and it must not be in the future — a capture from tomorrow is a clock
  // somebody has not set, and the window would be measured from it.
  const observedAt = typeof body.observedAt === "string" ? body.observedAt : "";
  const observedMs = Date.parse(observedAt);
  if (Number.isNaN(observedMs)) fields.observedAt = ["An ISO instant"];
  else if (observedMs > Date.parse(at) + 5 * 60 * 1000) fields.observedAt = ["Not in the future"];
  if (Object.keys(fields).length > 0) return validationError(requestId, fields);

  const row = await deps.repo.replaceScreenshot({
    id: (deps.generateId ?? generateId)(),
    profileId,
    kind: "screenshot",
    storageRef: ref,
    alt,
    width,
    height,
    position: 0,
    observedAt: new Date(observedMs).toISOString(),
  });
  await deps.repo.recordCaptureSuccess(profileId, target, at);
  return successResponse({ recorded: "capture", id: row.id, observedAt: row.observedAt }, requestId);
}
