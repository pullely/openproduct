import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  AGENT_RESOLVE_CACHE_SECONDS,
  AGENT_SCOPES,
  AGENT_SCOPE_WORDS,
  MCP_SIGNED_IN_PATH,
  PERSONAL_TOKEN_NAME_MAX,
  type AgentCredentialSummary,
} from "@openproduct/contracts";

import { readSession } from "../../../auth/session-server";
import { publicApiBase } from "../../../public-api";
import {
  BOARD_CARD,
  BOARD_CARD_TITLE,
  BTN_INK,
  BTN_SOFT_SMALL,
  FIELD,
  LABEL,
  NOTICE,
  NOTICE_WARN,
  PAGE_NARROW,
  PAGE_TITLE,
} from "../../../ui/design";
import { fetchAgentCredentials } from "../../agents-api";
import { signInFor } from "../../section";
import { MeUnavailable } from "../../unavailable";
import { NEW_TOKEN_COOKIE, readNewToken } from "./new-token";

/**
 * Settings → Connected agents (openproduct-mcp MC1, design §6.2).
 *
 * Every agent this person connected over MCP and every personal token they
 * minted: what it may do, which listings, when it was made, when it last
 * acted, when it ends, and Revoke. Below them, New personal token, for a CLI
 * or a script that cannot run a browser sign-in.
 *
 * A NEW TOKEN IS SHOWN ONCE, from a one-minute cookie on this path
 * (`new-token.ts`), never from the URL. After that minute it is gone from
 * this page for good: openproduct keeps only its hash.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Connected agents", robots: { index: false } };

const HERE = "/me/settings/agents";

function day(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function AgentRow({ credential }: { credential: AgentCredentialSummary }) {
  return (
    <li className="flex flex-wrap items-start gap-3 border-t border-line py-3.5 first:border-t-0 max-sm:flex-col">
      <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
        <span className="font-semibold">
          {credential.clientName}{" "}
          <span className="text-[13px] font-normal text-muted-foreground">
            {credential.kind === "personal" ? "· personal token" : "· connected app"}
          </span>
        </span>
        <span className="text-[13px] text-muted-foreground">
          {credential.scopes.map((s) => AGENT_SCOPE_WORDS[s]?.title ?? s).join(" · ")}
        </span>
        <span className="text-[13px] text-muted-foreground">
          {credential.listingIds === null ? "All your listings" : `${credential.listingIds.length} listing${credential.listingIds.length === 1 ? "" : "s"}`}
          {" · "}made {day(credential.createdAt)}
          {" · "}last used {credential.lastUsedAt ? day(credential.lastUsedAt) : "never"}
          {" · "}
          {credential.expiresAt ? `ends ${day(credential.expiresAt)}` : "no expiry"}
        </span>
      </div>
      <form method="post" action={`${HERE}/revoke`}>
        <input type="hidden" name="id" value={credential.id} />
        <button type="submit" className={BTN_SOFT_SMALL} aria-label={`Revoke ${credential.clientName}`}>
          Revoke
        </button>
      </form>
    </li>
  );
}

export default async function ConnectedAgentsPage(props: {
  searchParams: Promise<{ error?: string; revoked?: string; minted?: string }>;
}) {
  const session = await readSession();
  if (!session) redirect(signInFor(HERE));
  const q = await props.searchParams;
  const result = await fetchAgentCredentials(session.accessToken);
  if (result.kind === "unauthorized") redirect(signInFor(HERE));
  if (result.kind === "unavailable") return <MeUnavailable />;
  const credentials = result.data.credentials;
  const jar = await cookies();
  const fresh = q.minted ? readNewToken(jar.get(NEW_TOKEN_COOKIE)?.value) : null;
  const endpoint = `${publicApiBase()}${MCP_SIGNED_IN_PATH}`;

  return (
    <main className={PAGE_NARROW}>
      <div className="flex flex-col gap-5 max-sm:gap-3">
        <header className="flex flex-col gap-2">
          <a href="/me/settings" className="text-[14px] text-muted-foreground no-underline hover:text-foreground">
            ← Settings
          </a>
          <h1 className={PAGE_TITLE}>Connected agents</h1>
          <p className="m-0 text-[15px] text-muted-foreground">
            Agents act as you over MCP at <span className="break-all font-mono text-foreground">{endpoint}</span>, with only
            what you allowed. Revoking one takes effect within {Math.round(AGENT_RESOLVE_CACHE_SECONDS / 60)} minute.
          </p>
        </header>

        {q.error ? (
          <p role="alert" className={NOTICE_WARN}>
            {q.error.slice(0, 240)}
          </p>
        ) : null}
        {q.revoked ? <p className={NOTICE}>Revoked. That agent can no longer act for you.</p> : null}

        <section aria-labelledby="h-agents" className={BOARD_CARD}>
          <h2 id="h-agents" className={`${BOARD_CARD_TITLE} mb-1`}>
            Your agents · {credentials.length}
          </h2>
          {credentials.length === 0 ? (
            <p className="m-0 py-2 text-[14px] text-muted-foreground">
              No agent is connected. Add openproduct to an MCP client with the address above, or make a personal token below.
            </p>
          ) : (
            <ul className="m-0 list-none p-0">
              {credentials.map((c) => (
                <AgentRow key={c.id} credential={c} />
              ))}
            </ul>
          )}
        </section>

        <section id="new-token" aria-labelledby="h-new" className={`${BOARD_CARD} flex flex-col gap-3`}>
          <h2 id="h-new" className={BOARD_CARD_TITLE}>
            New personal token
          </h2>
          {fresh ? (
            <div className="flex flex-col gap-2">
              <p role="status" className="m-0 font-semibold">
                Copy it now. It is shown this once.
              </p>
              <input
                readOnly
                value={fresh}
                aria-label="Your new personal token"
                className={`${FIELD} font-mono text-[13px]`}
                data-new-agent-token
              />
              <p className="m-0 text-[13px] text-muted-foreground">
                Send it as <span className="font-mono">Authorization: Bearer …</span> to {endpoint}.
              </p>
            </div>
          ) : null}
          <form method="post" action={`${HERE}/mint`} className="flex flex-col gap-3">
            <label className="flex flex-col">
              <span className={LABEL}>Name</span>
              <input name="name" required maxLength={PERSONAL_TOKEN_NAME_MAX} placeholder="My release script" className={FIELD} />
            </label>
            <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
              <legend className={LABEL}>What it may do</legend>
              {AGENT_SCOPES.map((scope) => (
                <label key={scope} className="flex min-h-[40px] cursor-pointer items-center gap-3">
                  <input type="checkbox" name="scope" value={scope} defaultChecked={scope === "read"} className="h-4 w-4 shrink-0" />
                  <span>{AGENT_SCOPE_WORDS[scope].title}</span>
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col">
              <span className={LABEL}>Ends</span>
              <select name="days" defaultValue="90" className={FIELD}>
                <option value="30">In 30 days</option>
                <option value="90">In 90 days</option>
                <option value="365">In a year</option>
                <option value="never">Never</option>
              </select>
            </label>
            <div className="flex justify-end">
              <button type="submit" className={`${BTN_INK} max-sm:w-full`}>
                Make token
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
