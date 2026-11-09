// What the synthetic is given — and, as pointedly, what it is not
// (openproduct-operations OO1).
//
// OO-1: THE WATCHER IS NOT THE WATCHED. This worker holds NO binding to core,
// to the gateway, to the web worker or to anything of the platform's. It
// reaches the product the way a visitor does — by URL, anonymously (OO-4) —
// and the only resource it owns is the Durable Object that remembers what it
// last saw. A synthetic that shared a binding with the thing it watches would
// share the failure too.

export interface Env {
  /** "dev" | "stage" | "prod" | "local". */
  ENVIRONMENT: string;
  /** The gateway — `/health`, the catalogue, search. Public HTTPS. */
  API_ORIGIN?: string;
  /** The site — the front page and a listing. Public HTTPS. */
  SITE_ORIGIN?: string;
  /**
   * The one resource this worker holds: its own memory of the last cycle —
   * whether each SLO held, since when, the last time it did, the last ten
   * cache samples. `SyntheticState`, exported from `index.ts`.
   */
  SYNTHETIC_STATE?: DurableObjectNamespace;
  /**
   * OO-A — WHERE AN ALERT GOES, AND TO WHOM. All three absent by default,
   * and absent means an alert is a log line and nothing else: the flip is
   * recorded, `alert_undeliverable` says `no_channel`, and nobody is paged
   * about a threshold nobody has agreed to route. When the gate is answered
   * the platform-seam route (OO-5, CB4's model) is: a signed POST of a
   * notification kind addressed to an operator SUBJECT — never an address;
   * openproduct holds none (I3). The secret is a secret and the url names a
   * platform host, so neither is committed in `wrangler.jsonc`.
   */
  ALERT_DELIVERY_URL?: string;
  ALERT_SEAM_SECRET?: string;
  OPERATOR_SUBJECT_ID?: string;
  /**
   * OO-C — a maintenance window: an ISO instant until which flips are
   * recorded and logged but NOT sent. Set in the dashboard before a cold run
   * (RS3's seeding is the case the risk names); absent or past means no
   * window. A var rather than a route, so it can move without a deploy and
   * needs no secret to move.
   */
  MAINTENANCE_UNTIL?: string;
}
