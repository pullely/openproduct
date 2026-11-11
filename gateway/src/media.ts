// Media bytes — upload, store, derive, serve (openproduct-worldclass MD1).
//
// THE FIRST TIME A STRANGER HANDS THIS PRODUCT BYTES IT SERVES BACK TO OTHER
// PEOPLE. Everything about this file is a security decision wearing an
// ergonomics coat, and each one is made once, here, and stated.
//
// ─── THE ORDER OF THE CHECKS IS THE DESIGN ───────────────────────────────
//
//   1. method, bucket           cheap, no body, no network
//   2. content-length ceiling   BEFORE THE BODY IS READ (WC-C) — a 50 MB
//                               body with no length is refused at the header
//   3. who is asking            BEFORE THE BODY IS READ — an anonymous
//                               upload never costs a buffer
//   4. rate limit               the identity bucket, like every write
//   5. the body, bounded        `arrayBuffer()` then a hard byte check,
//                               because a content-length is a claim
//   6. what the bytes ARE       sniffed from the first bytes, never from the
//                               header — `content-type` is a claim too
//   7. dimensions, bounded      read from the same header bytes; no decoder
//   8. store, then ask core     the object is content-addressed and
//                               idempotent; the row is the authorisation
//   9. derivatives              only after core said yes, and off the
//                               response path
//
// ─── NO CODEC IN THIS WORKER, AND THAT IS WC-C'S POINT ───────────────────
//
// There is no image decoder anywhere in this estate and putting one here was
// refused: a multi-megabyte WASM decoder in a gateway already carrying the
// agent surface, exposed to every file a stranger cares to craft. What this
// file reads is HEADERS — the twelve bytes that say "PNG, 1200×630" — which
// is enough to refuse the wrong thing and to lay out a page, and which no
// crafted payload can turn into code execution because nothing here executes
// anything. The decode-and-re-emit that neutralises a hostile file is
// Cloudflare Image Resizing's, on the zone, producing the derivatives.
//
// The original is stored AS UPLOADED. It is served with `nosniff` and a
// content-type the SNIFF decided (never the one the client sent), from a path
// whose extension the sniff decided too. A PNG that is secretly HTML is
// served as `image/png` with `nosniff`, which is a broken image and not a
// page.
//
// ─── THE BINDING IS OPENPRODUCT'S OWN ────────────────────────────────────
//
// `MEDIA` is an R2 bucket bound to THIS worker — the first data resource the
// gateway has ever held, and the binding allowlist test names it as the one
// exception rather than dropping its "no data resource" assertion (MD-4,
// OPX-4). The `dev` environment binds nothing, like `state-worker`'s
// `ORUN_STATE`; every entry point guards the binding and answers 503 rather
// than throwing.

import {
  AUTHORED_MEDIA_KINDS,
  MEDIA_ALT_MAX,
  MEDIA_DERIVATIVE_FORMAT,
  MEDIA_FORMATS,
  MEDIA_MAX_BYTES,
  MEDIA_REFUSALS,
  MEDIA_WIDTHS,
  mediaShapeRefusal,
  derivativeWidths,
  parseMediaRef,
  type MediaFormat,
  type MediaRefusal,
  type MediaWidth,
  type AuthoredMediaKind,
} from "@openproduct/contracts";

import type { Env } from "./env.js";
import { errorResponse, methodNotAllowed } from "./http.js";

// ── The binding guard ───────────────────────────────────────────────────

export type BucketResult =
  | { ok: true; bucket: R2Bucket }
  | { ok: false; code: MediaRefusal; status: number };

export function requireMediaBucket(env: Env): BucketResult {
  if (!env.MEDIA) return { ok: false, code: "storage_unavailable", status: 503 };
  return { ok: true, bucket: env.MEDIA };
}

// ── Key layout ──────────────────────────────────────────────────────────
//
// Under one prefix so a bucket listing reads as one plane, and a derivative
// under its original's hash so the two are adjacent in any listing.

export function originalKey(hash: string, format: MediaFormat): string {
  return `media/${hash}.${format}`;
}

export function derivativeKey(hash: string, width: MediaWidth): string {
  return `media/${hash}/w${width}.${MEDIA_DERIVATIVE_FORMAT}`;
}

// ── The sniff ───────────────────────────────────────────────────────────
//
// Three formats, read from their headers alone. Each returns null on
// anything it does not recognise EXACTLY — a truncated header, a wrong magic
// byte, a JPEG with no frame marker — and null is a refusal.

export interface Sniffed {
  readonly format: MediaFormat;
  readonly width: number;
  readonly height: number;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function u16be(b: Uint8Array, at: number): number {
  return (b[at]! << 8) | b[at + 1]!;
}
function u32be(b: Uint8Array, at: number): number {
  return ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
}
function u16le(b: Uint8Array, at: number): number {
  return b[at]! | (b[at + 1]! << 8);
}
function u24le(b: Uint8Array, at: number): number {
  return b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);
}
function u32le(b: Uint8Array, at: number): number {
  return (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;
}
function ascii(b: Uint8Array, at: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i += 1) s += String.fromCharCode(b[at + i]!);
  return s;
}

function sniffPng(b: Uint8Array): Sniffed | null {
  if (b.length < 24) return null;
  for (let i = 0; i < 8; i += 1) if (b[i] !== PNG_MAGIC[i]) return null;
  // The first chunk MUST be IHDR: length 13, type "IHDR", then width/height.
  if (u32be(b, 8) !== 13 || ascii(b, 12, 4) !== "IHDR") return null;
  return { format: "png", width: u32be(b, 16), height: u32be(b, 20) };
}

function sniffJpeg(b: Uint8Array): Sniffed | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  // Walk the marker segments to the first SOF (start of frame), which carries
  // the dimensions. SOF markers are C0–CF except C4 (DHT), C8 (JPG) and CC (DAC).
  let at = 2;
  while (at + 9 < b.length) {
    if (b[at] !== 0xff) return null;
    const marker = b[at + 1]!;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      at += 2;
      continue;
    }
    const len = u16be(b, at + 2);
    if (len < 2) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      // length(2) precision(1) height(2) width(2)
      return { format: "jpg", width: u16be(b, at + 7), height: u16be(b, at + 5) };
    }
    if (marker === 0xda) return null; // start of scan before any frame — malformed
    at += 2 + len;
  }
  return null;
}

function sniffWebp(b: Uint8Array): Sniffed | null {
  if (b.length < 30) return null;
  if (ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 ") {
    // Lossy: a keyframe start code at 23..25, then 14-bit width and height.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { format: "webp", width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    // Lossless: signature 0x2f, then 14 bits width-1, 14 bits height-1.
    if (b[20] !== 0x2f) return null;
    const bits = u32le(b, 21);
    return { format: "webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    // Extended: 24-bit canvas width-1 at 24, height-1 at 27.
    return { format: "webp", width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  }
  return null;
}

/** What the bytes are, or null. The header the client sent is never consulted. */
export function sniff(bytes: Uint8Array): Sniffed | null {
  return sniffPng(bytes) ?? sniffJpeg(bytes) ?? sniffWebp(bytes);
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// ── The refusal ─────────────────────────────────────────────────────────

function refuse(code: MediaRefusal, status: number, requestId: string): Response {
  return errorResponse(code, MEDIA_REFUSALS[code], status, requestId);
}

// ── Upload ──────────────────────────────────────────────────────────────

export interface UploadDeps {
  /** Who is asking — resolved by the caller BEFORE the body is read. */
  readonly subject: { subjectId: string; subjectType: string };
  /** Core, to write the row. */
  readonly core: Fetcher;
  /** The internal path for this profile's media collection. */
  readonly internalPath: string;
  /** Background work, when the runtime offers it. */
  readonly waitUntil?: (p: Promise<unknown>) => void;
  /** This worker's own public origin, for the resize fetch. */
  readonly origin: string;
}

/**
 * Everything the caller must check BEFORE resolving the subject. Split out so
 * the router can refuse a 50 MB anonymous upload at the content-length header
 * without a subject lookup — which is the order the header of this file
 * describes and the tests assert.
 */
export function preflightUpload(request: Request, env: Env, requestId: string): Response | null {
  if (request.method !== "POST") return methodNotAllowed(requestId);
  const bucket = requireMediaBucket(env);
  if (!bucket.ok) return refuse(bucket.code, bucket.status, requestId);
  const declared = request.headers.get("content-length");
  if (declared === null) return refuse("length_required", 411, requestId);
  const length = Number(declared);
  if (!Number.isFinite(length) || length <= 0) return refuse("length_required", 411, requestId);
  if (length > MEDIA_MAX_BYTES) return refuse("payload_too_large", 413, requestId);
  return null;
}

/** The three fields that ride in the query string, because alt text is
 *  UTF-8 and headers are not, and a multipart parser is a surface. */
export interface UploadFields {
  readonly kind: AuthoredMediaKind;
  readonly alt: string;
  readonly position: number;
}

export function parseUploadFields(url: URL, requestId: string): UploadFields | Response {
  const kind = url.searchParams.get("kind");
  const alt = (url.searchParams.get("alt") ?? "").trim();
  const positionRaw = url.searchParams.get("position") ?? "0";
  const position = Number(positionRaw);
  const fields: Record<string, string[]> = {};
  if (!(AUTHORED_MEDIA_KINDS as readonly (string | null)[]).includes(kind)) {
    fields.kind = [`One of: ${AUTHORED_MEDIA_KINDS.join(", ")}`];
  }
  if (alt.length === 0) fields.alt = ["Alt text is required"];
  else if (alt.length > MEDIA_ALT_MAX) fields.alt = [`At most ${MEDIA_ALT_MAX} characters`];
  if (!Number.isInteger(position) || position < 0) fields.position = ["A non-negative integer"];
  if (Object.keys(fields).length > 0) {
    return errorResponse("validation_failed", "Validation failed", 422, requestId, { fields });
  }
  return { kind: kind as AuthoredMediaKind, alt, position };
}

/**
 * Upload: the body, the sniff, the store, the row, the derivatives.
 *
 * Called by the router AFTER `preflightUpload` passed and the subject was
 * resolved. Returns core's own response for the row (201 with the MediaFact,
 * or its refusal) so the client sees one shape for the whole act.
 */
export async function handleMediaUpload(
  request: Request,
  env: Env,
  requestId: string,
  fields: UploadFields,
  deps: UploadDeps,
): Promise<Response> {
  const bucket = requireMediaBucket(env);
  if (!bucket.ok) return refuse(bucket.code, bucket.status, requestId);

  // 5. The body, and the check the header could not make.
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) return refuse("length_required", 411, requestId);
  if (bytes.byteLength > MEDIA_MAX_BYTES) return refuse("payload_too_large", 413, requestId);

  // 6–7. What it is, and how big. The client's content-type is not read.
  const sniffed = sniff(new Uint8Array(bytes));
  if (!sniffed) return refuse("unsupported_media_type", 415, requestId);
  // A logo's shape is not a hero's (openproduct-studio OSD-3).
  const shape = mediaShapeRefusal(fields.kind, sniffed.width, sniffed.height);
  if (shape) return refuse(shape, 422, requestId);

  // 8. Store — content-addressed, so a repeat is a no-op — then ask core.
  const hash = await sha256Hex(bytes);
  const ref = `${hash}.${sniffed.format}`;
  const key = originalKey(hash, sniffed.format);
  const existed = (await bucket.bucket.head(key)) !== null;
  if (!existed) {
    await bucket.bucket.put(key, bytes, {
      httpMetadata: { contentType: MEDIA_FORMATS[sniffed.format] },
    });
  }

  const coreRes = await deps.core.fetch(
    new URL(deps.internalPath, "https://openproduct.internal").toString(),
    {
      method: "POST",
      headers: {
        "x-request-id": requestId,
        "x-actor-subject-id": deps.subject.subjectId,
        "x-actor-subject-type": deps.subject.subjectType,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        kind: fields.kind,
        alt: fields.alt,
        position: fields.position,
        ref,
        width: sniffed.width,
        height: sniffed.height,
      }),
    },
  );

  if (!coreRes.ok) {
    // Core refused the ROW — not a maintainer, a full gallery, a taken slot.
    // Only an object THIS request created is removed: the same bytes may
    // already be somebody else's hero (content-addressing's other edge).
    if (!existed) await bucket.bucket.delete(key).catch(() => undefined);
    return new Response(coreRes.body, { status: coreRes.status, headers: coreRes.headers });
  }

  // 9. Derivatives, after the row exists and off the response path.
  const work = deriveAll(bucket.bucket, env, deps.origin, ref, sniffed, requestId);
  if (deps.waitUntil) deps.waitUntil(work);
  else await work;

  return new Response(coreRes.body, { status: coreRes.status, headers: coreRes.headers });
}

// ── Derivatives ─────────────────────────────────────────────────────────
//
// Cloudflare Image Resizing, through the zone's `/cdn-cgi/image/` path,
// fetching the ORIGINAL back from this worker's own public address. Gated by
// `MEDIA_RESIZING`, because the feature is a zone setting this repository
// cannot see: where it is off, the fetch returns the original bytes with
// their original type, which is detected and NOT stored as a derivative —
// the serving path's fallback then does the right thing.

export async function deriveAll(
  bucket: R2Bucket,
  env: Env,
  origin: string,
  ref: string,
  sniffed: Sniffed,
  requestId: string,
): Promise<void> {
  if (env.MEDIA_RESIZING !== "true") return;
  const parsed = parseMediaRef(ref);
  if (!parsed) return;
  const source = `${origin}/v1/media/${ref}`;
  for (const width of derivativeWidths(sniffed)) {
    try {
      const url = `${origin}/cdn-cgi/image/width=${width},fit=scale-down,format=${MEDIA_DERIVATIVE_FORMAT},quality=82/${source}`;
      const res = await fetch(url, { headers: { accept: "image/webp" } });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.startsWith("image/webp")) {
        // Resizing is not on for this zone, or refused this file. Not an
        // error a maker can act on; the original serves at this width.
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "media_derivative_skipped",
            width,
            status: res.status,
            contentType: type,
            requestId,
          }),
        );
        continue;
      }
      await bucket.put(derivativeKey(parsed.hash, width), await res.arrayBuffer(), {
        httpMetadata: { contentType: "image/webp" },
      });
    } catch (error) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "media_derivative_failed",
          width,
          reason: error instanceof Error ? error.name : "unknown",
          requestId,
        }),
      );
    }
  }
}

// ── Serve ───────────────────────────────────────────────────────────────

const SERVE_ORIGINAL_RE = /^\/v1\/media\/([0-9a-f]{64})\.(png|jpg|webp)$/;
const SERVE_DERIVATIVE_RE = /^\/v1\/media\/([0-9a-f]{64})\/w(\d+)\.webp$/;

export function isMediaPath(pathname: string): boolean {
  return SERVE_ORIGINAL_RE.test(pathname) || SERVE_DERIVATIVE_RE.test(pathname);
}

/**
 * GET /v1/media/{ref} and GET /v1/media/{hash}/w{width}.webp.
 *
 * NO CORE, NO DATABASE, NO TOKEN. The response is immutable and the edge
 * holds it for a year (OPP4a's cache is on), so almost every request never
 * reaches this function; the ones that do are one R2 read. A rate-limit
 * token per image would spend the anonymous bucket on a page's own pictures.
 *
 * A DERIVATIVE THAT DOES NOT EXIST SERVES THE ORIGINAL. See the contract's
 * header: a missing derivative costs bytes, a 404 costs the reader the
 * picture, and the page may reference every standard width without knowing
 * which were generated.
 */
export async function handleMediaServe(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed(requestId);
  const bucket = requireMediaBucket(env);
  if (!bucket.ok) return refuse(bucket.code, bucket.status, requestId);

  let key: string | null = null;
  let fallback: string | null = null;
  const original = SERVE_ORIGINAL_RE.exec(pathname);
  const derivative = SERVE_DERIVATIVE_RE.exec(pathname);
  if (original) {
    key = originalKey(original[1]!, original[2] as MediaFormat);
  } else if (derivative) {
    const width = Number(derivative[2]);
    if (!(MEDIA_WIDTHS as readonly number[]).includes(width)) {
      return errorResponse("not_found", "Not found", 404, requestId);
    }
    key = derivativeKey(derivative[1]!, width as MediaWidth);
    // The original's format is not in the derivative's address; try each.
    fallback = derivative[1]!;
  } else {
    return errorResponse("not_found", "Not found", 404, requestId);
  }

  let object = await bucket.bucket.get(key);
  if (!object && fallback) {
    for (const format of Object.keys(MEDIA_FORMATS) as MediaFormat[]) {
      object = await bucket.bucket.get(originalKey(fallback, format));
      if (object) break;
    }
  }
  if (!object) return errorResponse("not_found", "Not found", 404, requestId);

  const headers = new Headers({
    "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
    "content-length": String(object.size),
    "cache-control": "public, max-age=31536000, immutable",
    etag: object.httpEtag,
    // The sniff decided the type; nothing downstream may second-guess it.
    "x-content-type-options": "nosniff",
    "x-request-id": requestId,
  });
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(object.body, { status: 200, headers });
}
