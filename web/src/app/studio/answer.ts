// One studio act, two transports (openproduct-performance OPP15).
//
// Six `…/actions` routes share one discipline: read the session, do the act,
// and answer with a `303` back to the surface carrying `?notice=…` or
// `?error=…`. The step's page turns that code into a sentence.
//
// OPP15 adds a second reader of the same answer and NOT a second decision.
// `live-save.tsx` posts the same form with `accept: application/json`, and
// what comes back is the address the route would have redirected to — the
// same query, decided by the same line of code. The island turns it into the
// same sentence through the same vocabulary (`notices.ts`). There is no JSON
// branch inside any handler: a route calls `back("?notice=saved")` exactly as
// it did, and this decides how that leaves the building.
//
// WHY THE ADDRESS RATHER THAN A BODY THE ISLAND COULD READ DIRECTLY. Because
// the address is what the no-JavaScript path uses, and a second shape would
// be a second thing to keep in step — the failure this file exists to make
// impossible. One route, one answer, two ways of carrying it.

import { NextResponse, type NextRequest } from "next/server";

import { wantsJson } from "../me/act";

const NO_STORE = { "cache-control": "no-store" } as const;

export interface StudioAnswer {
  /** Whether this caller asked for JSON. Handlers rarely need it; the two
   *  helpers below are the point. */
  readonly json: boolean;
  /** Back to the surface, with the act's result in the query. */
  readonly back: (to: string) => NextResponse;
  /** Through sign-in and back. To a JSON caller this is an EMPTY `401`: a
   *  `303` to `/signin` would be followed by `fetch`, come back as a `200`
   *  sign-in document, and be read as success by an island that had just
   *  told a maintainer their listing was saved. */
  readonly signIn: (returnTo: string) => NextResponse;
}

export function studioAnswer(request: NextRequest): StudioAnswer {
  const json = wantsJson(request);
  return {
    json,
    back: (to: string) =>
      json
        ? NextResponse.json({ data: { to } }, { status: 200, headers: NO_STORE })
        : NextResponse.redirect(new URL(to, request.url), 303),
    signIn: (returnTo: string) =>
      json
        ? new NextResponse(null, { status: 401, headers: NO_STORE })
        : NextResponse.redirect(
            new URL(`/signin?return_to=${encodeURIComponent(returnTo)}`, request.url),
            303,
          ),
  };
}
