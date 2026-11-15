"use client";

import * as React from "react";

import {
  composePostPagePath,
  productPostPagePath,
  type AuthoredProductPostKind,
  type PostBlockSpec,
  type ProductPostBlock,
} from "@openproduct/contracts";

import { blockField } from "../../posts/crew-forms";
import { POST_CARD_SHELL, ProductPostCard } from "../../posts/post-card";
import { PostFooter } from "../../posts/post-footer";
import { BTN_INK, BTN_SOFT, EYEBROW, FOCUS, NOTICE, NOTICE_ERROR } from "../../ui/design";
import { BackIcon, CloseIcon, PlusIcon } from "../../ui/icons";
import { AppLink } from "../../ui/link";
import { ProductTile } from "../../ui/product-tile";

import {
  COMPOSE_KINDS,
  COMPOSE_KIND_SHORT,
  COMPOSE_PLACEHOLDER,
  addableBlocks,
  blockProblems,
  composeBlocks,
  composeDraftPath,
  composeKindLabel,
  composeReadiness,
  composeSpecs,
  composeTitle,
  counterText,
  initialPlaced,
  initialValues,
  isFilled,
  isOverLimit,
  previewPost,
  readinessText,
  readinessTone,
  serverBlockErrors,
  withBlock,
  withoutBlock,
  type ComposeProduct,
} from "./compose";

/**
 * The post builder (openproduct-redesign OPR-3; boards `Compose`,
 * `PhoneCompose`).
 *
 * THE CARD IS THE EDITOR. The page draws the card the post will be — the
 * kind's own shell, the product's row — and each block of the kind is a
 * field on it, in the catalogue's order. Required blocks are on the card from
 * the start and wear the kind's colour until they are filled; optional blocks
 * are added from "Add a block" and removed with their own control. NOTHING
 * MOVES A BLOCK: there is no drag, no up or down, and what is sent is built by
 * walking the catalogue (`composeBlocks`), so no sequence of presses can send
 * another order (design §2.1).
 *
 * POST IS LIT BY THE SERVER'S OWN RULE. `composeReadiness` is
 * `postBlocksPublishable` — the function core runs before it publishes.
 *
 * A PLAIN FORM FIRST. The card is one `<form>` posting to
 * `/{slug}/manage/posts`: one field per block (`blockField`), the kind, the
 * post's id, and the act in the pressed button's own `intent`. With no
 * JavaScript that is the whole builder — the optional blocks open from a
 * `<noscript>` list, Post is a plain button, and the server's answer comes
 * back to this address. With JavaScript the same form is sent as JSON, so
 * what was typed stays on the page whatever the answer is, and this adds the
 * counters, add and remove, the kind switch that keeps each kind's text, and
 * the preview.
 *
 * NO ID OF THE PRODUCT IS IN THE FORM. The handler resolves the workspace and
 * the listing from the slug in its own address and the caller's session.
 */

/** A post that already exists: a draft carried on, or a published post being
 *  edited. */
export interface ComposePost {
  readonly id: string;
  readonly state: "draft" | "published";
  readonly kind: AuthoredProductPostKind;
  readonly blocks: readonly ProductPostBlock[];
  readonly milestoneId: string | null;
  readonly roleOpeningId: string | null;
}

/** A shipped milestone a Feature shipped post may be about. */
export interface ComposeMilestone {
  readonly id: string;
  readonly code: string;
  readonly title: string;
}

/** An open seat a Help wanted post may be about. */
export interface ComposeSeat {
  readonly id: string;
  readonly title: string;
}

export interface ComposerProps {
  readonly product: ComposeProduct;
  /** The kind the address asked for; a post that exists has its own. */
  readonly kind: AuthoredProductPostKind;
  readonly post: ComposePost | null;
  /** What a new post of each kind starts with (the product's own Try it
   *  address on a Feature shipped post). */
  readonly starts?: Partial<Record<AuthoredProductPostKind, readonly ProductPostBlock[]>>;
  readonly milestones: readonly ComposeMilestone[];
  readonly seats: readonly ComposeSeat[];
  /** The sentence for `?notice=`, already read from the closed vocabulary. */
  readonly notice: string | null;
  /** The sentence for `?error=`, likewise. */
  readonly error: string | null;
  /** The fields a refused form named (`?fields=blocks.try,…`). */
  readonly errorFields: readonly string[];
  /** When the page was rendered: the preview's date, the same on both sides. */
  readonly now: string;
}

/** A kind's colours, as whole class names (the stylesheet is built from the
 *  words in the source). A colour here is the KIND (design §3). */
const KIND_SKIN: Record<
  AuthoredProductPostKind,
  { tile: string; tileOn: string; ink: string; mark: string; fieldMark: string; dot: string; badge: string }
> = {
  feature: {
    tile: "bg-amber-soft text-amber-ink",
    tileOn: "bg-amber text-card",
    ink: "text-amber-ink",
    mark: "md:bg-amber-soft/40 md:ring-[1.5px] md:ring-inset md:ring-amber/35",
    fieldMark: "max-md:ring-[1.5px] max-md:ring-inset max-md:ring-amber/40",
    dot: "ring-[1.5px] ring-inset ring-amber",
    // Words ON the amber tint take the deeper ink (`--endorse-ink`, 4.64:1);
    // `--amber-ink` is 4.36 there. On a phone the badge has no tint.
    badge: "md:bg-amber-soft text-amber-ink md:text-endorse-ink",
  },
  version: {
    tile: "bg-version-soft text-version",
    tileOn: "bg-version text-card",
    ink: "text-version",
    mark: "md:bg-version-soft/40 md:ring-[1.5px] md:ring-inset md:ring-version/35",
    fieldMark: "max-md:ring-[1.5px] max-md:ring-inset max-md:ring-version/40",
    dot: "ring-[1.5px] ring-inset ring-version",
    badge: "md:bg-version-soft text-version",
  },
  idea: {
    tile: "bg-idea-soft text-idea",
    tileOn: "bg-idea text-card",
    ink: "text-idea",
    mark: "md:bg-idea-soft/40 md:ring-[1.5px] md:ring-inset md:ring-idea/35",
    fieldMark: "max-md:ring-[1.5px] max-md:ring-inset max-md:ring-idea/40",
    dot: "ring-[1.5px] ring-inset ring-idea",
    badge: "md:bg-idea-soft text-idea",
  },
  seat: {
    tile: "bg-seat-soft text-seat-ink",
    tileOn: "bg-seat text-card",
    ink: "text-seat-ink",
    mark: "md:bg-seat-soft/40 md:ring-[1.5px] md:ring-inset md:ring-seat/35",
    fieldMark: "max-md:ring-[1.5px] max-md:ring-inset max-md:ring-seat/40",
    dot: "ring-[1.5px] ring-inset ring-seat",
    badge: "md:bg-seat-soft text-seat-ink",
  },
};

/** The glyph on a kind's tile (the boards' own paths, on a 24px box). */
const KIND_GLYPH: Record<AuthoredProductPostKind, string> = {
  feature: "M5 12l5 5 9-10",
  version: "M3 12V4h8l9 9-8 8zM7.5 7.5h.01",
  idea: "M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0012 3z",
  seat: "M9 11a4 4 0 100-8 4 4 0 000 8zM2 21c1-4 4-6 7-6s6 2 7 6M19 8v6M16 11h6",
};

/** The glyph beside a block in "Add a block": what TYPE of block it is. */
const TYPE_GLYPH: Record<PostBlockSpec["type"], string> = {
  line: "M4 12h16",
  text: "M4 7h16M4 12h16M4 17h10",
  lines: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  url: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
};

function Stroke({ d, size = 18, className = "" }: { d: string; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      <path d={d} />
    </svg>
  );
}

/** What is typed for one kind. Each kind keeps its own, so switching kinds
 *  loses nothing. */
interface KindDraft {
  values: Record<string, string>;
  placed: string[];
  milestone: string;
  opening: string;
}

function startOf(kind: AuthoredProductPostKind, props: ComposerProps): KindDraft {
  const own = props.post !== null && props.post.kind === kind ? props.post : null;
  const blocks = own ? own.blocks : (props.starts?.[kind] ?? []);
  return {
    values: initialValues(kind, blocks),
    placed: initialPlaced(kind, blocks),
    milestone: own?.milestoneId ?? "",
    opening: own?.roleOpeningId ?? "",
  };
}

const FORM_ID = "compose-form";

/** The field every block shares: no frame of its own on a desktop (the block
 *  is the frame), a 44px sunken field on a phone. */
const FIELD_BASE =
  "box-border w-full min-w-0 border-0 bg-transparent p-0 py-0.5 text-[15px] leading-[1.5] text-foreground outline-none placeholder:text-muted-foreground max-md:min-h-[44px] max-md:rounded-[14px] max-md:bg-well max-md:px-3.5 max-md:py-2.5 max-md:text-[16px] max-md:focus-visible:ring-2 max-md:focus-visible:ring-ring";

/** A kind's headline block is written at the size the card will print it. */
function headlineClass(kind: AuthoredProductPostKind): string {
  if (kind === "version") return "md:font-mono md:text-[26px] md:font-medium md:leading-[1.2]";
  if (kind === "idea") return "md:font-serif md:text-[22px] md:italic md:leading-[1.3]";
  return "md:text-[22px] md:font-semibold md:leading-[1.25] md:tracking-[-0.02em]";
}

/** A pill a radio sits behind: a chip that is lit when its radio is checked,
 *  with no script (the radio is the state). */
const CHIP =
  "inline-flex min-h-[32px] cursor-pointer items-center rounded-full bg-foreground/[0.05] px-3.5 text-[13px] text-copy peer-checked:bg-primary peer-checked:font-semibold peer-checked:text-primary-foreground peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring max-md:min-h-[44px]";

export function Composer(props: ComposerProps) {
  const { product } = props;
  const slug = product.slug;
  const action = `/${slug}/manage/posts`;

  const [post, setPost] = React.useState<{ id: string; state: "draft" | "published" } | null>(
    props.post ? { id: props.post.id, state: props.post.state } : null,
  );
  const [kind, setKind] = React.useState<AuthoredProductPostKind>(props.post?.kind ?? props.kind);
  const [drafts, setDrafts] = React.useState<Record<AuthoredProductPostKind, KindDraft>>(() => ({
    feature: startOf("feature", props),
    version: startOf("version", props),
    idea: startOf("idea", props),
    seat: startOf("seat", props),
  }));
  // The server's render and the first browser render are the plain form; the
  // enhancements switch on once the page is live.
  const [live, setLive] = React.useState(false);
  React.useEffect(() => setLive(true), []);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(props.notice);
  const [failure, setFailure] = React.useState<string | null>(props.error);
  const [refused, setRefused] = React.useState<Record<string, string[]>>(() =>
    props.post ? serverBlockErrors(props.errorFields, props.post.kind, props.post.blocks) : {},
  );

  const draft = drafts[kind];
  const specs = composeSpecs(kind);
  const skin = KIND_SKIN[kind];
  const readiness = composeReadiness(kind, draft.values, draft.placed);
  const tone = readinessTone(readiness);
  const problems = blockProblems(kind, draft.values, draft.placed);
  const addable = addableBlocks(kind, draft.placed);
  const published = post?.state === "published";
  const title = composeTitle(post === null ? "new" : post.state);
  const here = post ? composeDraftPath(slug, post.id) : composePostPagePath(slug, kind);

  const change = (patch: Partial<KindDraft>) =>
    setDrafts((all) => ({ ...all, [kind]: { ...all[kind], ...patch } }));
  const setValue = (id: string, value: string) => {
    change({ values: { ...draft.values, [id]: value } });
    if (refused[id]) {
      setRefused((all) => Object.fromEntries(Object.entries(all).filter(([block]) => block !== id)));
    }
  };

  const pickKind = (next: AuthoredProductPostKind) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    // A post that exists has its kind; another kind is another post, and the
    // link goes to it. A new post switches in place and keeps what was typed.
    if (post !== null || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setKind(next);
    setRefused({});
    setFailure(null);
    window.history.replaceState(null, "", composePostPagePath(slug, next));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const intent = submitter?.value ?? (post ? "save" : "create");
    if (intent !== "create" && intent !== "save" && intent !== "publish") return;
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(null);
    setFailure(null);
    const blocks = composeBlocks(kind, draft.values, draft.placed);
    const body: Record<string, unknown> = { intent, kind, blocks };
    if (post) body.post = post.id;
    if (intent === "publish" && kind === "feature" && draft.milestone) body.milestone = draft.milestone;
    if (intent === "publish" && kind === "seat" && draft.opening) body.opening = draft.opening;
    try {
      const response = await fetch(action, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 401) {
        window.location.assign(`/signin?return_to=${encodeURIComponent(here)}`);
        return;
      }
      const answer = (await response.json().catch(() => null)) as {
        data?: { post?: { id?: string; state?: string } };
        error?: { message?: string; fields?: Record<string, string[]> };
      } | null;
      const saved = answer?.data?.post;
      if (response.ok && saved && typeof saved.id === "string") {
        if (intent === "publish") {
          window.location.assign(`${productPostPagePath(slug, saved.id)}?notice=posted`);
          return;
        }
        setPost({ id: saved.id, state: saved.state === "published" ? "published" : "draft" });
        setRefused({});
        setNotice(intent === "create" ? "Draft saved" : "Saved");
        window.history.replaceState(null, "", composeDraftPath(slug, saved.id));
      } else {
        const fields = answer?.error?.fields ?? {};
        // A Post pressed before anything was saved writes the draft first; a
        // refusal names it, and the builder carries on from that draft.
        const written = fields.draft?.[0];
        if (typeof written === "string" && post === null) {
          setPost({ id: written, state: "draft" });
          window.history.replaceState(null, "", composeDraftPath(slug, written));
        }
        setRefused(serverBlockErrors(fields, kind));
        setFailure(answer?.error?.message ?? "That did not go through. Try again in a moment");
      }
    } catch {
      setFailure("That did not go through. Try again in a moment");
    } finally {
      setBusy(false);
    }
  };

  const saveIntent = post ? "save" : "create";
  const readyClass =
    tone === "ready" ? "text-success" : tone === "danger" ? "text-destructive" : "text-muted-foreground";

  return (
    <main
      data-compose
      data-compose-kind={kind}
      className="mx-auto box-border flex w-full max-w-[1920px] flex-col gap-5 px-6 pb-16 pt-4 max-md:gap-2.5 max-md:px-3 max-md:pb-6 max-md:pt-2.5"
    >
      {/* The builder's bar: back to the product, where this is, how ready it
          is, and Post. */}
      <div className="flex items-center gap-3.5 max-md:gap-2.5" data-compose-bar>
        <AppLink
          href={`/${slug}`}
          aria-label={`Back to ${product.name}`}
          className={`grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-foreground no-underline max-md:h-[44px] max-md:w-[44px] max-md:bg-card ${FOCUS}`}
        >
          <BackIcon className="h-4 w-4" />
        </AppLink>
        <div className="flex min-w-0 flex-1 items-center gap-2 max-md:flex-col max-md:items-start max-md:gap-0 max-md:leading-[1.25]">
          <span className="flex shrink-0 max-md:hidden">
            <ProductTile slug={slug} thumbnail={product.logo} size={32} />
          </span>
          {/* The product's name is a link at desktop width. On a phone it is
              the small line above the title, and the Back button beside it
              (44px) already goes to the same address — so there it is words,
              not a 16px-tall second link to the same place. */}
          <AppLink
            href={`/${slug}`}
            className={`truncate text-[15px] text-muted-foreground no-underline hover:underline max-md:hidden ${FOCUS}`}
          >
            {product.name}
          </AppLink>
          <span className="max-w-full truncate text-[13px] text-muted-foreground md:hidden">{product.name}</span>
          <span aria-hidden="true" className="text-muted-foreground max-md:hidden">
            /
          </span>
          <h1 className="m-0 text-[15px] font-semibold text-foreground max-md:text-card-title max-md:tracking-[-0.02em]">
            {title}
          </h1>
        </div>
        <span
          role="status"
          data-compose-ready={readiness.ready ? "yes" : "no"}
          className={`font-mono text-[11px] max-md:hidden ${readyClass}`}
        >
          {readinessText(readiness, "short")}
        </span>
        {published ? null : (
          <button
            type="submit"
            form={FORM_ID}
            name="intent"
            value={saveIntent}
            disabled={busy}
            className={`${BTN_SOFT} cursor-pointer border-0 max-md:hidden ${FOCUS}`}
          >
            Save draft
          </button>
        )}
        <button
          type="submit"
          form={FORM_ID}
          name="intent"
          value={published ? "save" : "publish"}
          disabled={!readiness.ready || busy}
          data-compose-post
          className={`${
            readiness.ready
              ? `${BTN_INK} cursor-pointer`
              : "inline-flex h-[40px] shrink-0 cursor-default items-center justify-center whitespace-nowrap rounded-full bg-foreground/[0.08] px-[18px] text-[15px] font-semibold text-muted-foreground max-sm:h-[44px]"
          } border-0 px-5 ${FOCUS}`}
        >
          {published ? "Save" : "Post"}
        </button>
      </div>

      {notice ? (
        <p role="status" className={`m-0 ${NOTICE}`} data-compose-notice>
          {notice}
        </p>
      ) : null}
      {failure ? (
        <p role="alert" className={`m-0 ${NOTICE_ERROR}`} data-compose-error>
          {failure}
        </p>
      ) : null}

      <div className="grid grid-cols-[76px_minmax(0,1fr)_230px] items-start gap-5 max-lg:grid-cols-[76px_minmax(0,1fr)] max-md:grid-cols-[minmax(0,1fr)] max-md:gap-2.5">
        {/* The four kinds: a rail on a desktop, four tiles on a phone. */}
        <nav
          aria-label="Kind of post"
          data-compose-kinds
          className="flex flex-col gap-1.5 rounded-[16px] bg-card p-2 max-md:grid max-md:grid-cols-4 max-md:rounded-none max-md:bg-transparent max-md:p-0"
        >
          {COMPOSE_KINDS.map((option) => {
            const on = option === kind;
            return (
              <AppLink
                key={option}
                href={composePostPagePath(slug, option)}
                onClick={pickKind(option)}
                aria-label={composeKindLabel(option)}
                title={composeKindLabel(option)}
                {...(on ? { "aria-current": "true" as const } : {})}
                data-compose-kind-option={option}
                className={`flex w-[60px] flex-col items-center gap-[5px] rounded-[14px] pb-1.5 pt-2 no-underline max-md:min-h-[68px] max-md:w-auto max-md:justify-center max-md:gap-1 max-md:px-0.5 max-md:py-1.5 ${
                  on ? "text-foreground max-md:bg-card" : "text-muted-foreground hover:text-foreground"
                } ${FOCUS}`}
              >
                <span
                  className={`grid h-[38px] w-[38px] place-items-center rounded-[12px] max-md:h-8 max-md:w-8 max-md:rounded-[10px] ${
                    on ? KIND_SKIN[option].tileOn : KIND_SKIN[option].tile
                  }`}
                >
                  <Stroke d={KIND_GLYPH[option]} className="max-md:h-4 max-md:w-4" />
                </span>
                <span className="text-[10.5px] font-semibold leading-[1.15] max-md:text-[11px]">
                  {COMPOSE_KIND_SHORT[option]}
                </span>
              </AppLink>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-col items-center gap-5 max-md:items-stretch max-md:gap-2.5">
          <form
            id={FORM_ID}
            method="post"
            action={action}
            onSubmit={submit}
            noValidate
            className="w-full max-w-[640px] max-md:max-w-none"
          >
            <input type="hidden" name="kind" value={kind} />
            {post ? <input type="hidden" name="post" value={post.id} /> : null}
            {/* The plain form comes back HERE whatever the answer; the page
                sends a posted one on to its own address. */}
            <input type="hidden" name="return_to" value={here} />
            <article
              aria-label={composeKindLabel(kind)}
              data-compose-card={kind}
              className={`${POST_CARD_SHELL[kind]} max-md:flex max-md:flex-col max-md:gap-3 max-md:p-[14px]`}
            >
              {kind === "seat" ? (
                <>
                  <span aria-hidden="true" className="absolute -left-3 top-1/2 -mt-3 h-6 w-6 rounded-full bg-background max-md:hidden" />
                  <span aria-hidden="true" className="absolute -right-3 top-1/2 -mt-3 h-6 w-6 rounded-full bg-background max-md:hidden" />
                </>
              ) : null}
              <div className="flex items-center gap-3 px-5 pb-1.5 pt-[18px] max-md:gap-2.5 max-md:p-0">
                <ProductTile slug={slug} thumbnail={product.logo} size={40} />
                <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
                  <span className="truncate font-semibold text-foreground">{product.name}</span>
                  <span className="text-[13px] text-muted-foreground">by you</span>
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full font-mono text-mono-label uppercase md:px-2.5 md:py-[5px] ${skin.badge}`}
                >
                  <Stroke d={KIND_GLYPH[kind]} size={13} className="max-md:hidden" />
                  {composeKindLabel(kind)}
                </span>
              </div>

              <div className="flex flex-col gap-1.5 px-3.5 pb-4 pt-2 max-md:gap-3 max-md:p-0" data-compose-blocks>
                {specs
                  .filter((spec) => draft.placed.includes(spec.id))
                  .map((spec, index) => {
                    const value = draft.values[spec.id] ?? "";
                    const filled = isFilled(value);
                    const marked = spec.required && !filled;
                    const over = isOverLimit(spec, value);
                    const said = [...(problems[spec.id] ?? []), ...(refused[spec.id] ?? [])].filter(
                      (message, at, all) => all.indexOf(message) === at,
                    );
                    const id = `compose-${kind}-${spec.id}`;
                    const fieldClass = `${FIELD_BASE} ${marked ? skin.fieldMark : ""}`;
                    const shared = {
                      id,
                      name: blockField(spec.id),
                      value,
                      placeholder: COMPOSE_PLACEHOLDER[kind][spec.id] ?? "",
                      "aria-invalid": said.length > 0 ? (true as const) : undefined,
                      "aria-describedby": said.length > 0 ? `${id}-error` : undefined,
                      ...(spec.required ? { "aria-required": true as const } : {}),
                    };
                    return (
                      <div
                        key={spec.id}
                        data-compose-block={spec.id}
                        data-required={spec.required ? "yes" : "no"}
                        data-filled={filled ? "yes" : "no"}
                        className={`flex flex-col gap-1 rounded-[16px] px-3 py-2.5 md:focus-within:ring-2 md:focus-within:ring-ring max-md:rounded-none max-md:bg-transparent max-md:p-0 ${
                          marked ? skin.mark : "md:bg-foreground/[0.025]"
                        }`}
                      >
                        <div className="flex min-h-[22px] items-center gap-2">
                          <label
                            htmlFor={id}
                            className={`font-mono text-mono-label uppercase max-md:font-sans max-md:text-[13px] max-md:font-semibold max-md:normal-case max-md:tracking-normal max-md:text-foreground ${
                              marked ? skin.ink : "text-muted-foreground"
                            }`}
                          >
                            {spec.label}{" "}
                            <span className={`font-normal md:hidden ${marked ? skin.ink : "text-muted-foreground"}`}>
                              {spec.required ? "required" : "optional"}
                            </span>
                          </label>
                          {live ? (
                            <span
                              data-compose-counter={over ? "over" : "within"}
                              className={`font-mono text-mono-label tracking-normal max-md:hidden ${over ? "text-destructive" : "text-muted-foreground"}`}
                            >
                              {counterText(spec, value, "ratio")}
                            </span>
                          ) : null}
                          <span className="flex-1" />
                          {live ? (
                            <span
                              className={`font-mono text-[11px] md:hidden ${over ? "text-destructive" : "text-muted-foreground"}`}
                            >
                              {counterText(spec, value, "left")}
                            </span>
                          ) : null}
                          {!spec.required && live ? (
                            <button
                              type="button"
                              onClick={() => change({ placed: withoutBlock(kind, draft.placed, spec.id) })}
                              aria-label={`Remove ${spec.label}`}
                              data-compose-remove={spec.id}
                              className={`grid h-[26px] w-[26px] shrink-0 cursor-pointer place-items-center rounded-[8px] border-0 bg-foreground/[0.05] p-0 text-muted-foreground hover:text-foreground max-md:h-[44px] max-md:w-[44px] max-md:justify-items-end max-md:bg-transparent ${FOCUS}`}
                            >
                              <CloseIcon className="h-3 w-3" />
                            </button>
                          ) : null}
                        </div>

                        {spec.type === "text" || spec.type === "lines" ? (
                          <textarea
                            {...shared}
                            rows={spec.type === "lines" ? 3 : 2}
                            onChange={(event) => setValue(spec.id, event.target.value)}
                            className={`${fieldClass} resize-y max-md:resize-none ${index === 0 ? headlineClass(kind) : ""}`}
                          />
                        ) : spec.type === "url" ? (
                          <div className="flex items-center gap-2">
                            <Stroke d={TYPE_GLYPH.url} size={15} className={`max-md:hidden ${skin.ink}`} />
                            <input
                              {...shared}
                              type="text"
                              inputMode="url"
                              autoCapitalize="none"
                              autoCorrect="off"
                              spellCheck={false}
                              onChange={(event) => setValue(spec.id, event.target.value)}
                              className={fieldClass}
                            />
                          </div>
                        ) : (
                          <input
                            {...shared}
                            type="text"
                            autoComplete="off"
                            onChange={(event) => setValue(spec.id, event.target.value)}
                            className={`${fieldClass} ${index === 0 ? headlineClass(kind) : ""}`}
                          />
                        )}

                        {/* A Feature shipped post may be about one of the
                            product's shipped milestones. */}
                        {kind === "feature" && spec.id === "milestone" && props.milestones.length > 0 ? (
                          <fieldset className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0 pt-1" data-compose-milestones>
                            <legend className="sr-only">Shipped milestone</legend>
                            {[{ id: "", code: "None", title: "" }, ...props.milestones].map((milestone) => (
                              <label key={milestone.id || "none"} title={milestone.title || undefined}>
                                <input
                                  type="radio"
                                  name="milestone"
                                  value={milestone.id}
                                  checked={draft.milestone === milestone.id}
                                  onChange={() =>
                                    change({
                                      milestone: milestone.id,
                                      ...(milestone.id
                                        ? { values: { ...draft.values, milestone: milestone.code } }
                                        : {}),
                                    })
                                  }
                                  className="peer sr-only"
                                />
                                <span className={CHIP}>{milestone.code}</span>
                              </label>
                            ))}
                          </fieldset>
                        ) : null}

                        {/* A Help wanted post may be about one of the
                            product's open seats. */}
                        {kind === "seat" && spec.id === "role" && props.seats.length > 0 ? (
                          <fieldset className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0 pt-1" data-compose-seats>
                            <legend className="sr-only">Open seat</legend>
                            {[{ id: "", title: "None" }, ...props.seats].map((seat) => (
                              <label key={seat.id || "none"}>
                                <input
                                  type="radio"
                                  name="opening"
                                  value={seat.id}
                                  checked={draft.opening === seat.id}
                                  onChange={() =>
                                    change({
                                      opening: seat.id,
                                      ...(seat.id && !isFilled(draft.values.role)
                                        ? { values: { ...draft.values, role: seat.title.slice(0, spec.limit) } }
                                        : {}),
                                    })
                                  }
                                  className="peer sr-only"
                                />
                                <span className={CHIP}>{seat.title}</span>
                              </label>
                            ))}
                          </fieldset>
                        ) : null}

                        {said.length > 0 ? (
                          <p id={`${id}-error`} className="m-0 text-[13px] text-destructive" data-compose-block-error>
                            {said.join(". ")}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
              </div>

              {/* A linked milestone stays linked when its block is not on the
                  card: the post is still about it. */}
              {kind === "feature" && draft.milestone && !draft.placed.includes("milestone") ? (
                <input type="hidden" name="milestone" value={draft.milestone} />
              ) : null}

              {/* With no script: every optional block the card does not hold,
                  closed until asked for, and Post as a plain button. */}
              <noscript>
                <div className="flex flex-col gap-2 px-3.5 pb-4 max-md:p-0">
                  {addable.map((spec) => (
                    <details key={spec.id} className="rounded-[14px] bg-foreground/[0.025] px-3 py-2">
                      <summary className="cursor-pointer text-[13px] font-semibold text-foreground">{spec.label}</summary>
                      {spec.type === "text" || spec.type === "lines" ? (
                        <textarea
                          name={blockField(spec.id)}
                          rows={3}
                          aria-label={spec.label}
                          maxLength={spec.limit}
                          className={`${FIELD_BASE} mt-1`}
                        />
                      ) : (
                        <input
                          type="text"
                          name={blockField(spec.id)}
                          aria-label={spec.label}
                          maxLength={spec.limit}
                          className={`${FIELD_BASE} mt-1`}
                        />
                      )}
                    </details>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    {published ? null : (
                      <button type="submit" name="intent" value={saveIntent} className={`${BTN_SOFT} cursor-pointer border-0`}>
                        Save draft
                      </button>
                    )}
                    <button
                      type="submit"
                      name="intent"
                      value={published ? "save" : "publish"}
                      className={`${BTN_INK} cursor-pointer border-0`}
                    >
                      {published ? "Save" : "Post"}
                    </button>
                  </div>
                </div>
              </noscript>
            </article>
          </form>

          {/* On a phone the card is the preview; "Add a block" sits under it. */}
          {live && addable.length > 0 ? (
            <section aria-label="Add a block" className="flex flex-col gap-2 md:hidden" data-compose-add-pills>
              <div className={`${EYEBROW} px-1`}>Add a block</div>
              <div className="flex flex-wrap gap-1.5">
                {addable.map((spec) => (
                  <button
                    key={spec.id}
                    type="button"
                    onClick={() => change({ placed: withBlock(kind, draft.placed, spec.id) })}
                    data-compose-add={spec.id}
                    className={`inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-full border-0 bg-card px-3.5 text-[13px] font-semibold text-foreground ${FOCUS}`}
                  >
                    <PlusIcon className="h-3 w-3" />
                    {spec.label}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {/* The phone's foot: how ready the post is, and Save draft. */}
          <div
            className="flex items-center justify-between gap-2.5 rounded-[16px] bg-card py-2 pl-4 pr-2 md:hidden"
            data-compose-foot
          >
            <span className={`text-[15px] font-semibold ${tone === "plain" ? "text-foreground" : readyClass}`}>
              {readinessText(readiness, "long")}
            </span>
            {published ? null : (
              <button
                type="submit"
                form={FORM_ID}
                name="intent"
                value={saveIntent}
                disabled={busy}
                className={`inline-flex min-h-[44px] cursor-pointer items-center rounded-full border-0 bg-foreground/[0.06] px-4 text-[13px] font-semibold text-foreground ${FOCUS}`}
              >
                Save draft
              </button>
            )}
          </div>

          {/* The exact card a reader will see, from what is typed so far. A
              desktop has the room for it under the editor; nothing in it can
              be pressed. */}
          {live && composeBlocks(kind, draft.values, draft.placed).length > 0 ? (
            <section aria-label="Preview" className="flex w-full max-w-[640px] flex-col gap-2 max-md:hidden" data-compose-preview>
              <div className={`${EYEBROW} px-1`}>Preview</div>
              <div inert>
                <ProductPostCard
                  post={previewPost(kind, draft.values, draft.placed, product, props.now)}
                  variant="feed"
                  returnTo={here}
                  // Under the page's `h1` ("New post"): no level is skipped.
                  headingLevel={2}
                  // The reader's own two rows, inert like the rest of the preview.
                  footer={<PostFooter post={previewPost(kind, draft.values, draft.placed, product, props.now)} returnTo={here} />}
                />
              </div>
            </section>
          ) : null}

          {post ? <RemovePost action={action} postId={post.id} published={published} className="md:hidden" /> : null}
        </div>

        {/* The toolbox: what can be added, and what is still required. */}
        <aside aria-label="Blocks" className="flex min-w-0 flex-col gap-3.5 max-lg:col-span-2 max-md:hidden" data-compose-toolbox>
          {specs.some((spec) => !spec.required) ? (
            <section className="flex flex-col gap-1 rounded-[16px] bg-card p-3">
              <h2 className={`m-0 px-2 pb-1.5 pt-1 font-normal ${EYEBROW}`}>Add a block</h2>
              {specs
                .filter((spec) => !spec.required)
                .map((spec) => {
                  const added = draft.placed.includes(spec.id);
                  return (
                    <button
                      key={spec.id}
                      type="button"
                      disabled={added || !live}
                      onClick={() => change({ placed: withBlock(kind, draft.placed, spec.id) })}
                      data-compose-add={spec.id}
                      className={`flex items-center gap-2.5 rounded-[12px] border-0 bg-transparent px-2 py-[7px] text-left text-[15px] ${
                        added ? "cursor-default text-muted-foreground" : "cursor-pointer text-foreground hover:bg-accent"
                      } ${FOCUS}`}
                    >
                      <span
                        className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[10px] ${
                          added ? "bg-foreground/[0.05] text-muted-foreground" : skin.tile
                        }`}
                      >
                        <Stroke d={TYPE_GLYPH[spec.type]} size={15} />
                      </span>
                      <span className="flex-1">{spec.label}</span>
                      <span aria-hidden="true" className={`text-[15px] font-semibold ${added ? "text-success" : "text-muted-foreground"}`}>
                        {added ? "✓" : "+"}
                      </span>
                      {added ? <span className="sr-only">added</span> : null}
                    </button>
                  );
                })}
            </section>
          ) : null}
          <section className="flex flex-col gap-2 rounded-[16px] bg-card p-[18px]" data-compose-required>
            <h2 className={`m-0 font-normal ${EYEBROW}`}>Required</h2>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {specs
                .filter((spec) => spec.required)
                .map((spec) => {
                  const done = isFilled(draft.values[spec.id]);
                  return (
                    <li key={spec.id} className="flex items-center gap-2 text-[13px] text-foreground">
                      <span
                        aria-hidden="true"
                        className={`h-[9px] w-[9px] shrink-0 rounded-full ${done ? "bg-success" : skin.dot}`}
                      />
                      {spec.label}
                      <span className="sr-only">{done ? "filled" : "not filled yet"}</span>
                    </li>
                  );
                })}
            </ul>
          </section>
          {post ? <RemovePost action={action} postId={post.id} published={published} /> : null}
        </aside>
      </div>
    </main>
  );
}

/**
 * Take a post away. A draft is deleted with one press — nobody else has seen
 * it. A published post is REMOVED, which readers will notice, so it asks
 * first, and the press that does it is red (design §2.8: red is danger).
 *
 * A form of its own, outside the card's: the act is `intent=remove` and it
 * goes back to the product's page.
 */
function RemovePost({
  action,
  postId,
  published,
  className = "",
}: {
  action: string;
  postId: string;
  published: boolean;
  className?: string;
}) {
  const fields = (
    <>
      <input type="hidden" name="intent" value="remove" />
      <input type="hidden" name="post" value={postId} />
    </>
  );
  if (!published) {
    return (
      <form method="post" action={action} className={className} data-compose-remove-post="draft">
        {fields}
        <button type="submit" className={`${BTN_SOFT} w-full cursor-pointer border-0 ${FOCUS}`}>
          Delete draft
        </button>
      </form>
    );
  }
  return (
    <details className={`group rounded-[16px] bg-card p-3 ${className}`} data-compose-remove-post="published">
      <summary
        className={`flex min-h-[40px] cursor-pointer list-none items-center justify-center rounded-full bg-foreground/[0.06] px-[18px] text-[15px] font-semibold text-foreground max-md:min-h-[44px] [&::-webkit-details-marker]:hidden ${FOCUS}`}
      >
        Remove post
      </summary>
      <form method="post" action={action} className="mt-3 flex flex-col gap-2.5">
        {fields}
        <p className="m-0 text-[13px] text-destructive">Remove this post for everyone?</p>
        <button
          type="submit"
          className={`inline-flex min-h-[40px] cursor-pointer items-center justify-center rounded-full border-0 bg-destructive px-[18px] text-[15px] font-semibold text-destructive-foreground max-md:min-h-[44px] ${FOCUS}`}
        >
          Remove post
        </button>
      </form>
    </details>
  );
}
