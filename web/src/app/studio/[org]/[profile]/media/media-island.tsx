"use client";

// The media step, without the reloads (openproduct-studio OSD6).
//
// The step was a plain form: choose where it goes, one file, type a sentence,
// post, 303, the whole page again — per image. No preview before sending, no
// progress, the chosen file lost on a refusal, a hero that could only be
// replaced by removing it first, words that could only be fixed by deleting
// the picture, and a gallery in whatever order it happened to be uploaded.
//
// This island takes over the card once it hydrates. Drop images (several at
// once) or choose them; each shows its own preview and is checked against the
// rule the server applies (`mediaShapeRefusal`) before a byte leaves; say
// what each shows and where it goes; upload them one after another, each with
// its progress. The saved pictures are listed from the ACT'S OWN ANSWERS — an
// upload, a new description, a new order and a removal each answer with the
// rows they wrote — so the list never waits on `router.refresh()`, which on
// this surface drops most repeat refreshes (see IMPLEMENTATION-STATUS). The
// refresh is still asked for, for the rest of the page.
//
// WITHOUT SCRIPT the server's card and form render instead (`children`), and
// every act here is the same intent on the same route that form posts.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  GALLERY_MAX,
  LOGO_MIN_SIDE,
  MEDIA_ALT_MAX,
  MEDIA_FORMATS,
  MEDIA_MAX_BYTES,
  MEDIA_MIN_HEIGHT,
  MEDIA_MIN_WIDTH,
  MEDIA_REFUSALS,
  galleryOf,
  heroOf,
  logoOf,
  mediaShapeRefusal,
  type AuthoredMediaKind,
  type MediaFact,
} from "@openproduct/contracts";

import { GALLERY_SIZES, imageSourceOf } from "../../../../[slug]/media";
import { BTN_PRIMARY, BTN_SMALL, FIELD, H2, INSET, NOTICE, NOTICE_WARN } from "../../../../ui/design";
import { STEP_CARD } from "../step-card";

type Queued = {
  key: string;
  file: File;
  preview: string;
  width: number;
  height: number;
  kind: AuthoredMediaKind;
  alt: string;
  state: "ready" | "sending" | "refused";
  percent: number;
  message?: string;
};

const ACCEPT = Object.values(MEDIA_FORMATS).join(",");
const KIND_LABEL: Record<AuthoredMediaKind, string> = { logo: "Logo", hero: "Hero", gallery: "Gallery" };

export function MediaIsland({
  media,
  action,
  apiBase,
  children,
}: {
  media: readonly MediaFact[];
  action: string;
  apiBase: string;
  /** The server's card and form — what renders before hydration, and without script. */
  children: ReactNode;
}) {
  const router = useRouter();
  const [scripted, setScripted] = useState(false);
  useEffect(() => setScripted(true), []);

  // The page's truth, from the server once and from each act's answer after.
  const [rows, setRows] = useState<MediaFact[]>(() => [...media]);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [over, setOver] = useState(false);
  const [notice, setNotice] = useState<{ kind: "said" | "refused"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const [landed, setLanded] = useState(0);
  useEffect(() => {
    if (landed > 0) router.refresh();
  }, [landed, router]);

  // Object URLs leak until revoked.
  const previews = useRef(new Set<string>());
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  if (!scripted) return <>{children}</>;

  const logo = logoOf(rows);
  const hero = heroOf(rows);
  const gallery = galleryOf(rows);
  const queuedGallery = queue.filter((q) => q.kind === "gallery").length;
  const galleryRoom = GALLERY_MAX - gallery.length;

  const refusalFor = (kind: AuthoredMediaKind, width: number, height: number): string | null => {
    const shape = mediaShapeRefusal(kind, width, height);
    if (shape) return MEDIA_REFUSALS[shape];
    return null;
  };

  const add = async (files: FileList | File[] | null) => {
    if (!files) return;
    const next: Queued[] = [];
    let heroTaken = Boolean(hero) || queue.some((q) => q.kind === "hero");
    let room = galleryRoom - queuedGallery;
    for (const file of Array.from(files)) {
      const key = `${file.name}:${file.size}:${Math.random().toString(36).slice(2)}`;
      if (!(Object.values(MEDIA_FORMATS) as string[]).includes(file.type)) {
        setNotice({ kind: "refused", message: `${file.name}: ${MEDIA_REFUSALS.unsupported_media_type}` });
        continue;
      }
      if (file.size > MEDIA_MAX_BYTES) {
        setNotice({ kind: "refused", message: `${file.name}: ${MEDIA_REFUSALS.payload_too_large}` });
        continue;
      }
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      const dims = await new Promise<{ width: number; height: number } | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve(null);
        img.src = preview;
      });
      if (!dims) {
        setNotice({ kind: "refused", message: `${file.name}: ${MEDIA_REFUSALS.unsupported_media_type}` });
        continue;
      }
      // The first picture without a hero becomes the hero; the rest fill the
      // gallery while it has room. A near-square picture is offered as the
      // logo if there is none. The maker can change any of these.
      const squareish = mediaShapeRefusal("logo", dims.width, dims.height) === null;
      let kind: AuthoredMediaKind =
        !logo && squareish && !queue.some((q) => q.kind === "logo") && !next.some((q) => q.kind === "logo")
          ? "logo"
          : !heroTaken
            ? "hero"
            : "gallery";
      if (kind === "hero") heroTaken = true;
      if (kind === "gallery") {
        if (room <= 0) kind = "hero";
        else room -= 1;
      }
      const refusal = refusalFor(kind, dims.width, dims.height);
      next.push({
        key,
        file,
        preview,
        ...dims,
        kind,
        alt: "",
        state: refusal ? "refused" : "ready",
        percent: 0,
        ...(refusal ? { message: refusal } : {}),
      });
    }
    setQueue((q) => [...q, ...next]);
  };

  const patch = (key: string, change: Partial<Queued>) =>
    setQueue((q) =>
      q.map((item) => {
        if (item.key !== key) return item;
        const merged = { ...item, ...change };
        const refusal = refusalFor(merged.kind, merged.width, merged.height);
        return { ...merged, state: merged.state === "sending" ? "sending" : refusal ? "refused" : "ready", message: refusal ?? undefined } as Queued;
      }),
    );

  // One XHR per file, in order — fetch has no upload progress.
  const send = (item: Queued, position: number) =>
    new Promise<MediaFact | string>((resolve) => {
      const data = new FormData();
      data.set("intent", "upload-media");
      data.set("kind", item.kind);
      data.set("position", String(position));
      data.set("alt", item.alt.trim());
      data.set("file", item.file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", action);
      xhr.setRequestHeader("accept", "application/json");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) patch(item.key, { state: "sending", percent: Math.round((e.loaded / e.total) * 100) });
      };
      xhr.onerror = () => resolve("The upload did not reach the server. Try again.");
      xhr.onload = () => {
        if (xhr.status === 401) {
          window.location.href = `/signin?return_to=${encodeURIComponent(window.location.pathname)}`;
          return;
        }
        const answer = read(xhr.status, xhr.responseText);
        if (typeof answer === "string") return resolve(answer);
        const media = answer.find((m) => m.value.kind === item.kind);
        resolve(media ?? "The server did not say what it stored. Reload to see it.");
      };
      xhr.send(data);
    });

  const uploadAll = async () => {
    setBusy(true);
    setNotice(null);
    let local = rows;
    let sent = 0;
    for (const item of queue.filter((q) => q.state === "ready")) {
      if (item.alt.trim().length === 0) {
        patch(item.key, { message: "Say what the picture shows first." });
        continue;
      }
      const taken = new Set(galleryOf(local).map((g) => g.value.position));
      let position = 0;
      if (item.kind === "gallery") while (taken.has(position)) position += 1;
      patch(item.key, { state: "sending", percent: 0 });
      const result = await send(item, position);
      if (typeof result === "string") {
        setQueue((q) => q.map((x) => (x.key === item.key ? { ...x, state: "refused", message: result } : x)));
        continue;
      }
      // A logo or a hero replaces the one in its slot (OSD4); a gallery image joins.
      local =
        result.value.kind === "gallery"
          ? [...local, result]
          : [...local.filter((m) => m.value.kind !== result.value.kind), result];
      setRows(local);
      setQueue((q) => q.filter((x) => x.key !== item.key));
      URL.revokeObjectURL(item.preview);
      previews.current.delete(item.preview);
      sent += 1;
    }
    setBusy(false);
    if (sent > 0) {
      setNotice({ kind: "said", message: sent === 1 ? "Image added." : `${sent} images added.` });
      setLanded((n) => n + 1);
    }
  };

  // The three in-place acts: describe, reorder, remove. Same route, JSON answer.
  const act = async (fields: Record<string, string>): Promise<MediaFact[] | string> => {
    const data = new FormData();
    for (const [k, v] of Object.entries(fields)) data.set(k, v);
    try {
      const res = await fetch(action, {
        method: "POST",
        body: data,
        headers: { accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
      });
      if (res.status === 401) {
        window.location.href = `/signin?return_to=${encodeURIComponent(window.location.pathname)}`;
        return "Signed out.";
      }
      return read(res.status, await res.text());
    } catch {
      return "That did not reach the server. Try again.";
    }
  };

  const describe = async (row: MediaFact, alt: string) => {
    const answer = await act({ intent: "describe-media", mediaId: row.value.id, alt });
    if (typeof answer === "string") return answer;
    const updated = answer[0];
    if (updated) setRows((r) => r.map((m) => (m.value.id === updated.value.id ? updated : m)));
    setLanded((n) => n + 1);
    return null;
  };

  const move = async (row: MediaFact, by: -1 | 1) => {
    const order = gallery.map((g) => g.value.id);
    const at = order.indexOf(row.value.id);
    const to = at + by;
    if (to < 0 || to >= order.length) return;
    [order[at], order[to]] = [order[to]!, order[at]!];
    const before = rows;
    // Moved at once; put back if the server says no.
    setRows((r) =>
      r.map((m) => (m.value.kind === "gallery" ? { ...m, value: { ...m.value, position: order.indexOf(m.value.id) } } : m) as MediaFact),
    );
    const answer = await act({ intent: "reorder-gallery", gallery: order.join(",") });
    if (typeof answer === "string") {
      setRows(before);
      setNotice({ kind: "refused", message: answer });
      return;
    }
    setRows((r) => [...r.filter((m) => m.value.kind !== "gallery"), ...answer]);
    setLanded((n) => n + 1);
  };

  const remove = async (row: MediaFact) => {
    const answer = await act({ intent: "remove-media", mediaId: row.value.id });
    if (typeof answer === "string") {
      setNotice({ kind: "refused", message: answer });
      return;
    }
    setRows((r) => r.filter((m) => m.value.id !== row.value.id));
    setNotice({ kind: "said", message: "Image removed." });
    setLanded((n) => n + 1);
  };

  const listed = [...(logo ? [logo] : []), ...(hero ? [hero] : []), ...gallery];
  const ready = queue.filter((q) => q.state === "ready").length;

  return (
    <section id="media" aria-labelledby="media-heading" className={STEP_CARD}>
      <div className="flex min-h-[32px] items-center justify-between gap-3">
        <h2 id="media-heading" className={H2}>
          Media
        </h2>
        <span className="text-[13px] text-muted-foreground">
          {logo ? "Logo" : "No logo"} · {hero ? "Hero" : "No hero"} · {gallery.length} of {GALLERY_MAX} in the gallery
        </span>
      </div>

      {notice ? (
        <p
          role="status"
          className={`m-0 mt-3 ${notice.kind === "refused" ? `font-medium ${NOTICE_WARN}` : NOTICE}`}
        >
          {notice.message}
        </p>
      ) : null}

      {listed.length > 0 ? (
        <ul aria-label="Your images" className="m-0 mt-3 grid list-none gap-3 p-0 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
          {listed.map((row) => (
            <SavedRow
              key={row.value.id}
              row={row}
              apiBase={apiBase}
              first={row.value.kind === "gallery" && gallery[0]?.value.id === row.value.id}
              last={row.value.kind === "gallery" && gallery[gallery.length - 1]?.value.id === row.value.id}
              onDescribe={describe}
              onMove={move}
              onRemove={remove}
            />
          ))}
        </ul>
      ) : (
        <p className="m-0 mt-3 text-[14px] text-muted-foreground">No images yet. A logo, a hero and up to {GALLERY_MAX} more.</p>
      )}

      {/* The drop zone. A button, so a keyboard reaches it; the file input is its engine. */}
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
          void add(e.dataTransfer.files);
        }}
        className={`mt-4 flex w-full flex-col items-center justify-center gap-1 px-4 py-6 text-center transition-colors ${INSET} ${
          over ? "ring-2 ring-ring" : "hover:bg-accent"
        }`}
      >
        <span className="text-[15px] font-medium text-foreground">Drop images here, or choose files</span>
        <span className="text-[13px] leading-[1.5] text-muted-foreground">
          PNG, JPEG or WebP, up to {Math.round(MEDIA_MAX_BYTES / 1024 / 1024)} MB each. A logo is square, at least {LOGO_MIN_SIDE}×
          {LOGO_MIN_SIDE}; a hero or gallery image at least {MEDIA_MIN_WIDTH}×{MEDIA_MIN_HEIGHT}.
        </span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        // Named even though hidden: the visible button is its label for a
        // person, and a sweep (the authed lane) rightly refuses an unnamed
        // control wherever it sits (openproduct-studio OSD8).
        aria-label="Choose images to upload"
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = "";
        }}
      />

      {queue.length > 0 ? (
        <div className="mt-4">
          <ul aria-label="Ready to upload" className="m-0 grid list-none gap-3 p-0">
            {queue.map((item) => (
              <li key={item.key} className={`flex gap-3 p-3 ${INSET}`}>
                <span className="grid h-[72px] w-[96px] shrink-0 place-items-center overflow-hidden rounded-[10px] bg-card">
                  <img src={item.preview} alt="" className="block max-h-full max-w-full object-contain" />
                </span>
                <div className="grid min-w-0 flex-1 gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                    <span className="truncate font-medium text-foreground">{item.file.name}</span>
                    <span>
                      {item.width}×{item.height}
                    </span>
                    <select
                      aria-label={`Where ${item.file.name} goes`}
                      value={item.kind}
                      disabled={item.state === "sending"}
                      onChange={(e) => patch(item.key, { kind: e.target.value as AuthoredMediaKind })}
                      className={`${FIELD.replace(" w-full", "")} w-auto`}
                    >
                      <option value="logo">Logo{logo ? " — replaces the current" : ""}</option>
                      <option value="hero">Hero{hero ? " — replaces the current" : ""}</option>
                      <option value="gallery" disabled={galleryRoom - queuedGallery <= 0 && item.kind !== "gallery"}>
                        Gallery
                      </option>
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        URL.revokeObjectURL(item.preview);
                        setQueue((q) => q.filter((x) => x.key !== item.key));
                      }}
                      disabled={item.state === "sending"}
                      className="ml-auto text-[13px] text-muted-foreground hover:text-foreground"
                    >
                      Discard
                    </button>
                  </div>
                  <input
                    type="text"
                    aria-label={`What ${item.file.name} shows`}
                    placeholder="What the picture shows — one sentence"
                    value={item.alt}
                    maxLength={MEDIA_ALT_MAX}
                    disabled={item.state === "sending"}
                    onChange={(e) => patch(item.key, { alt: e.target.value })}
                    className={FIELD}
                  />
                  {item.state === "sending" ? (
                    <div role="progressbar" aria-valuenow={item.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${item.file.name}`} className="h-[6px] overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-foreground transition-[width]" style={{ width: `${item.percent}%` }} />
                    </div>
                  ) : item.message ? (
                    <p role="status" className="m-0 text-[13px] font-medium text-warning-strong">
                      {item.message}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={() => void uploadAll()} disabled={busy || ready === 0} className={`${BTN_PRIMARY} disabled:opacity-60`}>
              {busy ? "Uploading…" : ready > 1 ? `Upload ${ready} images` : "Upload image"}
            </button>
            {queue.some((q) => q.alt.trim().length === 0 && q.state === "ready") ? (
              <span className="text-[13px] text-muted-foreground">Each picture needs a sentence saying what it shows.</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** One saved picture: its words editable in place, its gallery place movable. */
function SavedRow({
  row,
  apiBase,
  first,
  last,
  onDescribe,
  onMove,
  onRemove,
}: {
  row: MediaFact;
  apiBase: string;
  first: boolean;
  last: boolean;
  onDescribe: (row: MediaFact, alt: string) => Promise<string | null>;
  onMove: (row: MediaFact, by: -1 | 1) => Promise<void>;
  onRemove: (row: MediaFact) => Promise<void>;
}) {
  const { kind } = row.value;
  const [editing, setEditing] = useState(false);
  const [alt, setAlt] = useState(row.value.alt);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const source = imageSourceOf(row.value, apiBase, GALLERY_SIZES);
  const label = kind === "gallery" ? `Gallery ${row.value.position + 1}` : KIND_LABEL[kind as AuthoredMediaKind];
  return (
    <li className={kind === "hero" ? "col-span-full" : ""}>
      <div
        className={
          kind === "logo"
            ? `grid aspect-square w-[120px] place-items-center overflow-hidden ${INSET}`
            : `overflow-hidden ${INSET}`
        }
      >
        <img
          src={source.src}
          srcSet={source.srcSet}
          sizes={source.sizes}
          width={source.width}
          height={source.height}
          alt={source.alt}
          loading="lazy"
          decoding="async"
          className={kind === "logo" ? "block h-full w-full object-contain" : "block h-auto w-full"}
        />
      </div>
      {editing ? (
        <form
          className="mt-2 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setWorking(true);
            void onDescribe(row, alt.trim()).then((problem) => {
              setWorking(false);
              setError(problem);
              if (!problem) setEditing(false);
            });
          }}
        >
          <input
            type="text"
            aria-label={`What the ${label.toLowerCase()} shows`}
            value={alt}
            maxLength={MEDIA_ALT_MAX}
            onChange={(e) => setAlt(e.target.value)}
            className={FIELD}
            autoFocus
          />
          <div className="flex gap-2">
            <button type="submit" disabled={working || alt.trim().length === 0} className={`${BTN_SMALL} disabled:opacity-60`}>
              {working ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAlt(row.value.alt);
                setEditing(false);
                setError(null);
              }}
              className="text-[13px] text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          {error ? <p className="m-0 text-[13px] font-medium text-warning-strong">{error}</p> : null}
        </form>
      ) : (
        <div className="mt-2 grid gap-1.5">
          <p className="m-0 min-w-0 text-[13px] leading-[1.5] text-muted-foreground">
            <span className="font-medium text-foreground">{label}</span> · {row.value.alt}
          </p>
          <div className="flex flex-wrap items-center gap-1">
            {kind === "gallery" ? (
              <>
                <button type="button" onClick={() => void onMove(row, -1)} disabled={first} aria-label={`Move ${label} earlier`} className={`${BTN_SMALL} px-2 disabled:opacity-40`}>
                  ↑
                </button>
                <button type="button" onClick={() => void onMove(row, 1)} disabled={last} aria-label={`Move ${label} later`} className={`${BTN_SMALL} px-2 disabled:opacity-40`}>
                  ↓
                </button>
              </>
            ) : null}
            <button type="button" onClick={() => setEditing(true)} aria-label={`Edit what the ${label.toLowerCase()} shows`} className={BTN_SMALL}>
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                setWorking(true);
                void onRemove(row).finally(() => setWorking(false));
              }}
              disabled={working}
              aria-label={`Remove ${kind === "gallery" ? label.toLowerCase() : `the ${label.toLowerCase()}`}`}
              className={BTN_SMALL}
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * An act's answer: the rows it wrote, or the sentence to show. The route
 * answers a background caller `{data:{to, media?}}`, with a refusal in `to`'s
 * query (`error`, `why`).
 */
function read(status: number, body: string): MediaFact[] | string {
  const generic = "That did not work just now. Try again in a moment.";
  if (status < 200 || status >= 300) return generic;
  let data: { to?: string; media?: MediaFact | MediaFact[] } | undefined;
  try {
    data = (JSON.parse(body) as { data?: typeof data }).data;
  } catch {
    return generic;
  }
  if (!data?.to) return generic;
  const query = new URL(data.to, window.location.origin).searchParams;
  if (query.get("error")) return query.get("why") || generic;
  if (!data.media) return [];
  return Array.isArray(data.media) ? data.media : [data.media];
}
