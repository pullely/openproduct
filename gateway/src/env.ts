// Bindings the openproduct gateway declares — and the ones it deliberately
// does not (openproduct-independence OX3).
//
// The gateway is openproduct's own front door: the public 60s-cacheable read,
// the token→subject resolution for the authenticated planes, CORS, rate
// limits, and the publish-time repo read. It replaces the api-edge facade —
// and inherits its discipline: the gateway holds exactly ONE service binding
// (core, inside the product boundary) and NO platform binding of any kind.
// The platform is reached only over public HTTPS with either the visitor's
// own bearer or nothing (seam edges S2/S8 — 19-openproduct-seam.md).

export interface Env {
  /** openproduct-core (worker name `openproduct-worker`) — the one binding. */
  CORE?: Fetcher;
  /**
   * MD1 — openproduct's OWN media bucket, the first data resource this
   * worker has held. Named as the one exception in `bindings.test.ts`
   * rather than by dropping its "no data resource" assertion (MD-4, OPX-4).
   * Unbound in an environment = uploads answer 503 `storage_unavailable`.
   */
  MEDIA?: R2Bucket;
  /**
   * CS1 — the rate-limit counter: one Durable Object per bucket key, IN THIS
   * WORKER (`RateLimitBucket`, exported from `index.ts`), never a platform
   * binding. Present, the published number is the enforced one; absent — a
   * test, `wrangler dev` without the class — the per-isolate bucket the
   * gateway always had stands in, and says nothing, because absence is a
   * configuration and not a failure. Unreachable at runtime is the failure,
   * and it FAILS OPEN to the old limiter: the per-isolate bucket decides, so
   * nothing is refused that the pre-CS1 gateway would not have refused, and
   * `rate_limit_unavailable` is logged at most once a minute.
   */
  RATE_LIMIT?: DurableObjectNamespace;
  /**
   * OO3 — the runtime's account of THIS version: its id, its tag (empty on
   * this estate's uploads) and when it was uploaded. Carried on `/health` as
   * `build`, so which deploy is answering is a read and not an inference
   * (WC-H). Absent in a test and under `wrangler dev`; `/health` then says
   * `build: { version: null, … }` rather than inventing one.
   */
  CF_VERSION_METADATA?: WorkerVersionMetadata;
  /**
   * MD1 — "true" once Cloudflare Image Resizing is enabled on the zone that
   * serves this worker. A zone feature this repository cannot see, so it is
   * stated per environment rather than assumed; anything else = derivatives
   * are skipped and the original serves at every width.
   */
  MEDIA_RESIZING?: string;
  /**
   * CT2 — this API's own public origin, named in the OpenAPI document's
   * `servers` block so a generated client points at the right host. Absent =
   * no servers block, which is correct for a preview deployment: a document
   * that names the wrong host is worse than one that names none.
   */
  PUBLIC_API_ORIGIN?: string;
  /** Deploy environment name ("dev" | "stage" | "prod" | "local"). */
  ENVIRONMENT: string;
  /**
   * The platform API base (api-edge) — the S2 subject resolution reads
   * `GET {here}/v1/identity/me` with the visitor's own bearer. Public HTTPS,
   * never a binding.
   */
  PLATFORM_API_URL?: string;
  /** This product's web origin (CORS) — the ONE allowed origin since OX5b:
   *  the maintainer surface moved into the studio, and the console's interim
   *  S11 POST deleted, so no other origin speaks to this gateway from a
   *  browser. */
  SITE_ORIGIN?: string;
  /**
   * Optional GitHub token for the S8 repo read's rate headroom (OX-D).
   * A secret when set — deliberately NOT declared in wrangler.jsonc; the
   * unauthenticated public read is the degraded mode.
   */
  GITHUB_TOKEN?: string;
  /**
   * MD4 — where a screenshot is taken, and the token that lets us ask.
   *
   * BOTH SECRETS, deliberately NOT declared in wrangler.jsonc: the endpoint
   * carries an account id (BF6 forbids committing one) and the token is a
   * token. ABSENT — either of them — MEANS CAPTURES ARE OFF in that
   * environment: no address is visited, no capture is shown, no listing is
   * marked as missing one, and `/health` says `configured: false`. The
   * endpoint must be `https:` on `api.cloudflare.com`; anything else is
   * treated as absent, so a mistyped var cannot send the token elsewhere
   * (`captureProvider` in the contract).
   */
  SCREENSHOT_CAPTURE_URL?: string;
  SCREENSHOT_CAPTURE_TOKEN?: string;
  /**
   * The shared listing-seam secret (OX5 — 19-openproduct-seam.md): verifies
   * the platform's S6/S7 webhook deliveries at /seam/v1/*. One per
   * environment, a SECRET on both sides, deliberately never templated.
   * Absent = the receivers refuse 503 — the seam fails visibly, never open.
   */
  LISTING_SEAM_SECRET?: string;
  /**
   * AC2b — the key for the ONE seam call openproduct makes to turn a typed
   * address into a subject id (`/v1/seam/openproduct/subject-by-email`).
   *
   * DELIBERATELY NOT `LISTING_SEAM_SECRET`, which is shared with core and
   * membership-worker and moves listing facts. This one authorizes an
   * account-enumeration oracle on the platform's side; one key compromised
   * should not buy both.
   *
   * Delivered by secrets-live from the escrow — never `wrangler secret put`
   * by hand. Absent, sign-in refuses exactly as a wrong password does, which
   * is the same posture the identity worker takes from the other end.
   */
  OPENPRODUCT_AUTH_SEAM_SECRET?: string;
  /**
   * LC5 — where digest deliveries are posted, signed with the seam secret.
   *
   * ABSENT MEANS NO SENDING, deliberately: LC5's done-when says that if the
   * seam cannot carry delivery, LC1's page and feed remain the shipped digest
   * rather than the milestone being half-built. The send path exists, is
   * tested, and is inert until an environment names a destination.
   */
  DIGEST_DELIVERY_URL?: string;
  /**
   * TS2 — a velocity override, as a JSON array, so a limit can move during an
   * incident WITHOUT A DEPLOY.
   *
   * A plain var rather than a secret: the per-subject half of this policy is
   * published at `/docs` anyway, and a value nobody may read is a value
   * nobody can check. Absent, unparseable, or naming a rule that does not
   * exist all fall back to `DEFAULT_VELOCITY_RULES` — never to "no limit",
   * which is the one failure mode this whole sub-epic exists to prevent, and
   * never to zero, which is an outage wearing a configuration change.
   */
  OPENPRODUCT_VELOCITY?: string;
}
