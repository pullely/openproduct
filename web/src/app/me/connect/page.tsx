import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  AGENT_SCOPES,
  AGENT_SCOPE_WORDS,
  isPkceChallenge,
  parseScopeParam,
  redirectUriMatches,
  type AgentScope,
} from "@openproduct/contracts";

import { readSession } from "../../auth/session-server";
import { BOARD_CARD, BOARD_CARD_TITLE, BTN_INK, BTN_SOFT, NOTICE, NOTICE_WARN, PAGE_NARROW, PAGE_TITLE } from "../../ui/design";
import { fetchConsentClient } from "../agents-api";
import { fetchMyListings } from "../listings";
import { signInFor } from "../section";
import { MeUnavailable } from "../unavailable";

/**
 * The consent screen (openproduct-mcp MC1, design §6.1).
 *
 * An MCP client sent a person here through the gateway's `/oauth/authorize`,
 * which checked the client, its redirect and its PKCE challenge before
 * handing over. THIS PAGE CHECKS THEM AGAIN, because anybody can type this
 * address: a request that does not hold up is a page that says so and offers
 * no Allow, never a redirect somewhere unverified.
 *
 * What a person decides here: whether to connect at all, what the agent may
 * do (the scopes, every one the client asked for ticked, any of them
 * untickable), and whether it may touch every listing they are on or only
 * the ones they choose. Allow and Cancel both post to `decide`, which asks
 * the gateway for the address to send the browser back to.
 *
 * The client's name is ITS OWN CLAIM — it registered itself — and the page
 * says so beside the address it will return to, which is the one fact here
 * a client cannot choose freely.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Connect an agent", robots: { index: false } };

type Query = {
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  scope?: string;
  state?: string;
  error?: string;
};

function hereOf(q: Query): string {
  const params = new URLSearchParams();
  for (const key of ["client_id", "redirect_uri", "code_challenge", "scope", "state"] as const) {
    const value = q[key];
    if (typeof value === "string") params.set(key, value);
  }
  return `/me/connect?${params.toString()}`;
}

function hostOf(uri: string): string {
  try {
    const url = new URL(uri);
    return url.host.length > 0 ? url.host : `${url.protocol}…`;
  } catch {
    return uri;
  }
}

function Refusal({ title, detail }: { title: string; detail: string }) {
  return (
    <main className={PAGE_NARROW}>
      <h1 className={PAGE_TITLE}>{title}</h1>
      <p className={`${NOTICE} mt-4`}>{detail}</p>
    </main>
  );
}

export default async function ConnectPage(props: { searchParams: Promise<Query> }) {
  const q = await props.searchParams;
  const session = await readSession();
  if (!session) redirect(signInFor(hereOf(q)));

  const clientId = q.client_id ?? "";
  const redirectUri = q.redirect_uri ?? "";
  const challenge = q.code_challenge ?? "";
  const client = await fetchConsentClient(clientId);
  if (client === "unavailable") return <MeUnavailable />;
  if (!client || !redirectUriMatches(client.redirectUris, redirectUri) || !isPkceChallenge(challenge)) {
    return (
      <Refusal
        title="This connection request does not hold up"
        detail="The app that sent you here is not registered with openproduct, or asked to return somewhere it did not register. Nothing was connected. Start again from the app."
      />
    );
  }
  const requested = parseScopeParam(q.scope);
  const asked: AgentScope[] = "error" in requested ? [...AGENT_SCOPES] : requested.scopes;

  const listings = await fetchMyListings(session.accessToken);
  if (listings.kind === "unauthorized") redirect(signInFor(hereOf(q)));
  const mine = listings.kind === "ok" ? listings.data.listings : [];

  return (
    <main className={PAGE_NARROW}>
      <form method="post" action="/me/connect/decide" className="flex flex-col gap-5 max-sm:gap-3">
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="redirect_uri" value={redirectUri} />
        <input type="hidden" name="code_challenge" value={challenge} />
        {typeof q.state === "string" ? <input type="hidden" name="state" value={q.state} /> : null}

        <header className="flex flex-col gap-2">
          <h1 className={PAGE_TITLE}>Connect {client.clientName} to openproduct</h1>
          <p className="m-0 text-[15px] text-muted-foreground">
            It will act as you over MCP, with what you allow below, until you revoke it in Settings → Connected agents.
          </p>
        </header>

        {q.error ? (
          <p role="alert" className={NOTICE_WARN}>
            {q.error.slice(0, 240)}
          </p>
        ) : null}

        <section aria-labelledby="h-who" className={`${BOARD_CARD} flex flex-col gap-2`}>
          <h2 id="h-who" className={BOARD_CARD_TITLE}>
            Who is asking
          </h2>
          <p className="m-0 text-[15px]">
            <span className="font-semibold">{client.clientName}</span>{" "}
            <span className="text-muted-foreground">· unverified: the app named itself</span>
          </p>
          <p className="m-0 text-[14px] text-muted-foreground">
            You will be sent back to <span className="break-all font-mono text-foreground">{hostOf(redirectUri)}</span>
          </p>
        </section>

        <fieldset className={`${BOARD_CARD} m-0 flex flex-col gap-1`}>
          <legend className={`${BOARD_CARD_TITLE} float-left mb-2 w-full p-0`}>What it may do</legend>
          {AGENT_SCOPES.filter((s) => asked.includes(s)).map((scope) => (
            <label key={scope} className="flex min-h-[52px] cursor-pointer items-start gap-3 border-t border-line py-2.5 first-of-type:border-t-0">
              <input type="checkbox" name="scope" value={scope} defaultChecked className="mt-1 h-4 w-4 shrink-0" />
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold">{AGENT_SCOPE_WORDS[scope].title}</span>
                <span className="text-[13px] text-muted-foreground">{AGENT_SCOPE_WORDS[scope].detail}</span>
              </span>
            </label>
          ))}
          <p className="m-0 mt-2 text-[13px] text-muted-foreground">
            An agent can never do more than you can: a scope only narrows what your own role allows.
          </p>
        </fieldset>

        <fieldset className={`${BOARD_CARD} m-0 flex flex-col gap-1`}>
          <legend className={`${BOARD_CARD_TITLE} float-left mb-2 w-full p-0`}>Which listings</legend>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
            <input type="radio" name="listings" value="all" defaultChecked className="h-4 w-4 shrink-0" />
            <span>All my listings</span>
          </label>
          {mine.length > 0 ? (
            <>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
                <input type="radio" name="listings" value="only" className="h-4 w-4 shrink-0" />
                <span>Only these</span>
              </label>
              <div className="flex flex-col gap-0.5 pl-7">
                {mine.map((listing) => (
                  <label key={listing.id} className="flex min-h-[40px] cursor-pointer items-center gap-3">
                    <input type="checkbox" name="listing" value={listing.id} className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate">{listing.slug}</span>
                  </label>
                ))}
              </div>
            </>
          ) : null}
        </fieldset>

        <div className="flex flex-wrap items-center justify-end gap-2.5 max-sm:flex-col-reverse max-sm:items-stretch">
          <button type="submit" name="decision" value="deny" className={BTN_SOFT}>
            Cancel
          </button>
          <button type="submit" name="decision" value="allow" className={BTN_INK}>
            Allow
          </button>
        </div>
      </form>
    </main>
  );
}
