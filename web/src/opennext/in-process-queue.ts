// Background revalidation, without a binding (openproduct-performance OPP13).
//
// ─── WHY NOT OPENNEXT'S OWN QUEUES ────────────────────────────────────────
//
// When ISR serves a stale document it asks the "queue" to re-render it. Every
// queue the Cloudflare adapter ships needs a `WORKER_SELF_REFERENCE` service
// binding — the worker's own deployed name — and this worker is deployed as
// `openproduct-web-{dev,stage,prod}` from ONE committed `wrangler.jsonc`, so
// that name cannot be written down (D8, risks-and-open-questions.md, which
// also says an app-private render step is the wrong way round that).
//
// The adapter's `memoryQueue` also AWAITS the re-render: `send` blocks on the
// revalidation fetch, so the visitor who found the stale document would wait
// for the fresh one — a serve-stale that does not serve stale.
//
// ─── WHAT THIS DOES INSTEAD ───────────────────────────────────────────────
//
// `worker.ts` — this worker's real entry — registers the OpenNext handler on
// the global scope. A revalidation is then an in-process call to it: the same
// `HEAD` request with `x-prerender-revalidate` the adapter's queues would have
// sent over a binding, handed to `ctx.waitUntil` so the stale response leaves
// first and the render happens after it. Same isolate, same data centre, same
// Cache API the stale document was read from; no binding, no hostname.
//
// De-duplicated per isolate by OpenNext's own `MessageDeduplicationId` (path,
// last-modified and etag), so a burst of readers on one stale document costs
// one render per isolate rather than one per reader. `Cache-Control` on the
// stored entry bounds how long a render that keeps failing can be served.
//
// Pure by construction: the worker, the request context and the clock are
// injected, so `incremental-cache.test.ts` drives it with fakes.

export interface RevalidationMessage {
  MessageBody: { host: string; url: string; eTag?: string; lastModified?: number };
  MessageDeduplicationId: string;
  MessageGroupId?: string;
}

export interface QueueLike {
  name: string;
  send(message: RevalidationMessage): Promise<void>;
}

/** The OpenNext worker's `fetch`, as `worker.ts` registers it. */
export type SelfFetch = (request: Request, env: unknown, ctx: WaitUntilContext) => Promise<Response>;

export interface WaitUntilContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface InProcessQueueDeps {
  /** The registered worker, or `null` before `worker.ts` has run (a dry-run,
   *  `next dev`) — a revalidation then simply does not happen. */
  self(): SelfFetch | null;
  /** The current request's `env` and `ctx`, from OpenNext's request context. */
  context(): { env: unknown; ctx: WaitUntilContext } | null;
  /** `process.env.NEXT_PREVIEW_MODE_ID` — what Next accepts as the
   *  revalidation credential. */
  previewModeId(): string;
  /** How long one re-render may take before it is abandoned. */
  timeoutMs?: number;
  log?: (message: string) => void;
}

export const NAME = "openproduct-in-process-queue";
export const DEFAULT_REVALIDATION_TIMEOUT_MS = 10_000;

/** Where `worker.ts` publishes the handler and this queue finds it. A
 *  `Symbol.for` key, so the entry bundle and the server bundle — two modules,
 *  one isolate — agree on it without sharing an import. */
export const SELF_FETCH_KEY = Symbol.for("openproduct.opennext.self-fetch");

export function registerSelfFetch(fetchImpl: SelfFetch): void {
  (globalThis as Record<symbol, unknown>)[SELF_FETCH_KEY] = fetchImpl;
}

export function registeredSelfFetch(): SelfFetch | null {
  const found = (globalThis as Record<symbol, unknown>)[SELF_FETCH_KEY];
  return typeof found === "function" ? (found as SelfFetch) : null;
}

/** The request OpenNext's own queues send, byte for byte. */
export function revalidationRequest(message: RevalidationMessage, previewModeId: string): Request {
  const { host, url } = message.MessageBody;
  const protocol = host.includes("localhost") ? "http" : "https";
  return new Request(`${protocol}://${host}${url}`, {
    method: "HEAD",
    headers: {
      "x-prerender-revalidate": previewModeId,
      "x-isr": "1",
    },
  });
}

export function createInProcessQueue(deps: InProcessQueueDeps): QueueLike {
  const inFlight = new Set<string>();
  const timeoutMs = deps.timeoutMs ?? DEFAULT_REVALIDATION_TIMEOUT_MS;
  const log = deps.log ?? (() => {});

  return {
    name: NAME,

    async send(message: RevalidationMessage): Promise<void> {
      const self = deps.self();
      const context = deps.context();
      if (!self || !context) {
        log(`revalidation skipped for ${message.MessageBody.url}: no worker registered`);
        return;
      }
      if (inFlight.has(message.MessageDeduplicationId)) return;
      inFlight.add(message.MessageDeduplicationId);

      const request = revalidationRequest(message, deps.previewModeId());
      const run = (async () => {
        let response: Response | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          response = await Promise.race([
            self(request, context.env, context.ctx),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error("revalidation timed out")), timeoutMs);
            }),
          ]);
          if (response.status !== 200) {
            log(`revalidation of ${message.MessageBody.url} answered ${response.status}`);
          }
        } catch (err) {
          log(`revalidation of ${message.MessageBody.url} failed: ${String(err)}`);
        } finally {
          if (timer !== undefined) clearTimeout(timer);
          inFlight.delete(message.MessageDeduplicationId);
          try {
            await response?.body?.cancel();
          } catch {
            // The body was consumed, which is fine.
          }
        }
      })();

      // The whole point: schedule, do not await.
      context.ctx.waitUntil(run);
    },
  };
}
