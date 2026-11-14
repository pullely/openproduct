"use client";

// The logo, edited where it is seen (openproduct-studio OSD4).
//
// The 72px tile in the editor's hero IS the control. Before this the only way
// to give a product a face was the media tab's form — pick "Where it goes",
// pick a file, type a sentence, post, reload — and the tile beside the name
// stayed a monogram whatever you did, because there was no logo in the model.
//
// Click the tile (or drop an image on it), see the picture in the tile before
// anything is sent, say what it shows, save. The upload goes to the listing's
// own actions route — the same door the plain form uses — as a background
// post with progress, and the page is refreshed in place when it lands. A
// second logo REPLACES the first in one step (core upserts the slot), so
// there is no "remove the old one first".
//
// THE SHAPE IS CHECKED HERE AND AGAIN THERE. `mediaShapeRefusal` is the one
// rule the gateway applies to the sniffed bytes and core to the row; running
// it on the decoded preview means a banner offered as a logo is refused
// before its bytes leave the browser, in the same sentence the server would
// have used. The server's check is still the one that counts.
//
// WITHOUT SCRIPT the tile is a link to the media tab, whose form has a Logo
// option; nothing here is the only way to do anything.

import { useRouter } from "next/navigation";
import type { MediaFact } from "@openproduct/contracts";
import { useEffect, useRef, useState } from "react";

import {
  MEDIA_ALT_MAX,
  MEDIA_FORMATS,
  MEDIA_MAX_BYTES,
  MEDIA_REFUSALS,
  mediaShapeRefusal,
  type MediaThumbnail,
} from "@openproduct/contracts";

import { thumbnailSource } from "../../../feed/thumbnail";
import { BTN_PRIMARY, FIELD } from "../../../ui/design";
import { LogoTile } from "../../../ui/logo-tile";

type Phase =
  | { kind: "idle" }
  | { kind: "chosen"; file: File; preview: string }
  | { kind: "sending"; file: File; preview: string; percent: number }
  | { kind: "refused"; message: string };

const ACCEPT = Object.values(MEDIA_FORMATS).join(",");

export function LogoControl({
  slug,
  logo,
  action,
  mediaHref,
  apiBase,
}: {
  slug: string;
  /** The current logo, with its row id so it can be removed. */
  logo: (MediaThumbnail & { id: string }) | null;
  /** The listing's actions route. */
  action: string;
  /** The media tab — the no-script path, and the fallback link. */
  mediaHref: string;
  apiBase: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [alt, setAlt] = useState(`The ${slug} logo`);
  const [over, setOver] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [scripted, setScripted] = useState(false);
  // WHAT THE TILE SHOWS AFTER AN ACT, from the act's own answer. `undefined`
  // defers to the server's prop. The refresh after an act re-renders the
  // rest of the page when it lands — and it does not always land (see
  // `live-save.tsx`: measured, about one in four is dropped) — so the tile
  // does not wait on it: a saved logo is the row the route answered, a
  // removed one is the monogram. When a render does arrive with the same
  // truth, the prop takes over again.
  const [local, setLocal] = useState<(MediaThumbnail & { id: string }) | null | undefined>(undefined);
  // It yields only when the server has CAUGHT UP to it — a render arriving
  // late with an older truth (a refresh from the act before) must not undo
  // the one the maker just made.
  const keyOf = (l: (MediaThumbnail & { id: string }) | null) => (l ? `${l.id}:${l.ref}` : "none");
  const propKey = keyOf(logo);
  const localKey = local === undefined ? null : keyOf(local);
  useEffect(() => {
    if (localKey !== null && localKey === propKey) setLocal(undefined);
  }, [localKey, propKey]);
  const shown = local === undefined ? logo : local;

  // The re-render for the rest of the page, asked for from an effect once
  // this component's own state has committed — `live-save.tsx`'s pattern,
  // the one the studio walk sees land.
  const [landed, setLanded] = useState(0);
  useEffect(() => {
    if (landed > 0) router.refresh();
  }, [landed, router]);

  // Until hydration the tile is the plain link; after it, a button.
  useEffect(() => setScripted(true), []);

  // An object URL is a small leak until it is revoked.
  const preview = phase.kind === "chosen" || phase.kind === "sending" ? phase.preview : null;
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    if (!(Object.values(MEDIA_FORMATS) as string[]).includes(file.type)) {
      setPhase({ kind: "refused", message: MEDIA_REFUSALS.unsupported_media_type });
      return;
    }
    if (file.size > MEDIA_MAX_BYTES) {
      setPhase({ kind: "refused", message: MEDIA_REFUSALS.payload_too_large });
      return;
    }
    const url = URL.createObjectURL(file);
    const dims = await new Promise<{ width: number; height: number } | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = url;
    });
    if (!dims) {
      URL.revokeObjectURL(url);
      setPhase({ kind: "refused", message: MEDIA_REFUSALS.unsupported_media_type });
      return;
    }
    const shape = mediaShapeRefusal("logo", dims.width, dims.height);
    if (shape) {
      URL.revokeObjectURL(url);
      setPhase({ kind: "refused", message: MEDIA_REFUSALS[shape] });
      return;
    }
    setPhase({ kind: "chosen", file, preview: url });
  };

  const send = () => {
    if (phase.kind !== "chosen") return;
    const { file, preview: url } = phase;
    const data = new FormData();
    data.set("intent", "upload-media");
    data.set("kind", "logo");
    data.set("position", "0");
    data.set("alt", alt.trim());
    data.set("file", file);
    // XHR, not fetch: fetch has no upload progress, and a 5 MB logo on a
    // slow line is long enough to wonder whether anything is happening.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", action);
    xhr.setRequestHeader("accept", "application/json");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setPhase({ kind: "sending", file, preview: url, percent: Math.round((e.loaded / e.total) * 100) });
      }
    };
    xhr.onerror = () => setPhase({ kind: "refused", message: "The upload did not reach the server. Try again." });
    xhr.onload = () => {
      if (xhr.status === 401) {
        window.location.href = `/signin?return_to=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const refusal = refusalOf(xhr.status, xhr.responseText);
      if (refusal) {
        setPhase({ kind: "refused", message: refusal });
        return;
      }
      const stored = storedOf(xhr.responseText);
      if (stored) setLocal(stored);
      setPhase({ kind: "idle" });
      setLanded((n) => n + 1);
    };
    setPhase({ kind: "sending", file, preview: url, percent: 0 });
    xhr.send(data);
  };

  const remove = async () => {
    if (!shown) return;
    setRemoving(true);
    const data = new FormData();
    data.set("intent", "remove-media");
    data.set("mediaId", shown.id);
    try {
      const res = await fetch(action, {
        method: "POST",
        body: data,
        headers: { accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
      });
      const refusal = refusalOf(res.status, await res.text());
      if (refusal) setPhase({ kind: "refused", message: refusal });
      else {
        setLocal(null);
        setLanded((n) => n + 1);
      }
    } finally {
      setRemoving(false);
    }
  };

  const tile = preview ? (
    <Picture src={preview} />
  ) : shown ? (
    <Picture src={thumbnailSource(shown, apiBase).src} />
  ) : (
    <LogoTile slug={slug} size={72} className="box-border border-[3px] border-card" />
  );

  if (!scripted) {
    return (
      <a href={mediaHref} aria-label={shown ? "Change the logo" : "Add a logo"} className="block shrink-0 no-underline">
        {tile}
      </a>
    );
  }

  const open = phase.kind !== "idle";
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void choose(e.dataTransfer.files[0]);
        }}
        aria-label={shown ? "Change the logo" : "Add a logo"}
        title={shown ? "Change the logo — click, or drop an image here" : "Add a logo — click, or drop an image here"}
        className={`group relative block rounded-[16px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
          over ? "ring-2 ring-ring ring-offset-2" : ""
        }`}
      >
        {tile}
        <span
          aria-hidden="true"
          className={`absolute inset-[3px] grid place-items-center rounded-[13px] bg-scrim/60 text-[11px] font-medium text-on-accent transition-opacity ${
            over || phase.kind === "sending" ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
          }`}
        >
          {phase.kind === "sending" ? `${phase.percent}%` : shown ? "Change" : "Add logo"}
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        // Named although hidden: the button above is the control; this is the
        // picker it opens, and a form control with no name fails the sweep
        // (and any audit) whether or not a reader can reach it.
        aria-label="Logo image file"
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {open ? (
        <div
          role="dialog"
          aria-label="The logo"
          className="absolute left-0 top-[84px] z-30 w-[300px] rounded-[16px] border border-line bg-card p-4"
        >
          {phase.kind === "refused" ? (
            <>
              <p role="status" className="m-0 text-[13px] leading-[1.5] text-warning-strong">
                {phase.message}
              </p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => input.current?.click()} className={BTN}>
                  Choose another
                </button>
                <button type="button" onClick={() => setPhase({ kind: "idle" })} className={BTN_QUIET}>
                  Close
                </button>
              </div>
            </>
          ) : (
            <>
              <label htmlFor="logo-alt" className="block text-[13px] font-medium text-copy">
                What the logo shows
              </label>
              <input
                id="logo-alt"
                type="text"
                value={alt}
                maxLength={MEDIA_ALT_MAX}
                onChange={(e) => setAlt(e.target.value)}
                disabled={phase.kind === "sending"}
                className={`${FIELD} mt-1.5`}
              />
              {phase.kind === "sending" ? (
                <div
                  role="progressbar"
                  aria-valuenow={phase.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Uploading the logo"
                  className="mt-3 h-[6px] overflow-hidden rounded-full bg-muted"
                >
                  <div className="h-full bg-foreground transition-[width]" style={{ width: `${phase.percent}%` }} />
                </div>
              ) : null}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={send}
                  disabled={phase.kind === "sending" || alt.trim().length === 0}
                  className={BTN}
                >
                  {phase.kind === "sending" ? "Saving…" : shown ? "Replace logo" : "Save logo"}
                </button>
                <button
                  type="button"
                  onClick={() => setPhase({ kind: "idle" })}
                  disabled={phase.kind === "sending"}
                  className={BTN_QUIET}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      ) : shown ? (
        <button
          type="button"
          onClick={() => void remove()}
          disabled={removing}
          className="mt-1.5 block w-[72px] text-center text-[12px] text-muted-foreground hover:text-foreground"
        >
          {removing ? "Removing…" : "Remove"}
        </button>
      ) : null}
    </div>
  );
}

/** The picture in the tile's box: contained on the card, as every tile draws a logo. */
function Picture({ src }: { src: string }) {
  return (
    <span className="block h-[72px] w-[72px] overflow-hidden rounded-[16px] border-[3px] border-card bg-card">
      <img src={src} alt="" width={72} height={72} className="block h-full w-full object-contain" />
    </span>
  );
}

/** The row the route stored, from a background answer (OSD4). */
function storedOf(body: string): (MediaThumbnail & { id: string }) | null {
  try {
    const media = (JSON.parse(body) as { data?: { media?: MediaFact } }).data?.media;
    if (!media || media.value.kind !== "logo") return null;
    const { id, ref, alt, width, height } = media.value;
    return { id, ref, alt, width, height };
  } catch {
    return null;
  }
}

/**
 * The route's answer, read the way the save island reads it: `{data:{to}}`
 * with the result in `to`'s query. `null` when it worked.
 */
function refusalOf(status: number, body: string): string | null {
  if (status < 200 || status >= 300) return "That did not work just now. Try again in a moment.";
  let to: string | undefined;
  try {
    to = (JSON.parse(body) as { data?: { to?: string } }).data?.to;
  } catch {
    return "That did not work just now. Try again in a moment.";
  }
  if (!to) return "That did not work just now. Try again in a moment.";
  const query = new URL(to, window.location.origin).searchParams;
  if (!query.get("error")) return null;
  return query.get("why") || "That did not work just now. Try again in a moment.";
}

const BTN = `${BTN_PRIMARY} disabled:opacity-60`;
const BTN_QUIET =
  "inline-flex h-[40px] items-center justify-center rounded-full px-3 text-[14px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60";
