import type { Metadata } from "next";

import {
  AGENT_EXCLUSIONS,
  AGENT_INLINE_MEDIA_MAX_BYTES,
  AGENT_RATE_LIMITS,
  AGENT_RESOLVE_CACHE_SECONDS,
  AGENT_SCOPES,
  AGENT_SCOPE_WORDS,
  AGENT_SIGNED_IN_TOOLS,
  AGENT_TOOLS,
  AGENT_UPLOAD_TICKET_TTL_SECONDS,
  MCP_DOCS_PATH,
  MCP_SIGNED_IN_PATH,
  OAUTH_ACCESS_TTL_SECONDS,
  OAUTH_REFRESH_TTL_SECONDS,
  PERSONAL_TOKEN_LIFETIMES,
  type AgentScope,
} from "@openproduct/contracts";

import { openproductApiBase } from "@/lib/platform";

import { publicApexOrigin } from "../../public-api";
import { PAGE_NARROW, PAGE_TITLE } from "../../ui/design";
import {
  DOC_BODY,
  DOC_H2,
  DOC_KEY,
  DOC_LEDE,
  DOC_PRE,
  DOC_ROW,
  DOC_ROWS,
  DOC_SECTIONS,
  DOC_VALUE,
  DocsTabs,
} from "../docs-nav";

/**
 * `/docs/mcp` (openproduct-mcp MC8) — everything a person or an agent needs
 * to connect to openproduct over MCP: the two endpoints, how to connect, the
 * scopes, every tool, the limits, and what is deliberately not a tool.
 *
 * RENDERED FROM THE REGISTRY AND THE EXCLUSIONS TABLE, which is `/docs`'s own
 * rule for the catalogue tools applied to all of them: a tool that exists and
 * a tool documented here cannot be different sets, and an exclusion cannot be
 * a route somebody forgot, because the parity test reads the same table.
 *
 * Static and anonymous like every docs page: nothing on it is anybody's.
 */
export const revalidate = 600;

export function generateMetadata(): Metadata {
  const origin = publicApexOrigin();
  return {
    title: "MCP",
    description:
      "Connect an agent to openproduct over the Model Context Protocol: the endpoints, OAuth and personal tokens, the scopes, every tool and what is deliberately left out.",
    ...(origin ? { alternates: { canonical: `${origin}${MCP_DOCS_PATH}` } } : {}),
  };
}

const SCOPE_ORDER: Array<AgentScope | "any" | null> = [null, "any", ...AGENT_SCOPES];

function scopeHeading(scope: AgentScope | "any" | null): string {
  if (scope === null) return "Public reads — any connection";
  if (scope === "any") return "Any connection";
  return `${AGENT_SCOPE_WORDS[scope].title} — scope ${scope}`;
}

function days(seconds: number): string {
  const d = Math.round(seconds / 86400);
  return d === 1 ? "a day" : `${d} days`;
}

export default function McpDocsPage() {
  const base = openproductApiBase();
  const lifetimes = PERSONAL_TOKEN_LIFETIMES.map((d) => (d === null ? "no expiry" : `${d} days`)).join(", ");
  return (
    <main className={PAGE_NARROW}>
      <h1 className={PAGE_TITLE}>MCP</h1>
      <p className={DOC_LEDE}>
        Everything a person can do on openproduct, an agent can do for them over the Model Context Protocol — with
        only what they allowed, and through the same routes, checks and limits as the website.
      </p>
      <DocsTabs current="mcp" />

      <div className={DOC_SECTIONS}>
        <section id="endpoints">
          <h2 className={DOC_H2}>Two endpoints</h2>
          <p className={DOC_BODY}>
            <span className="font-mono text-[14px]">/mcp</span> is anonymous and serves the catalogue. <span className="font-mono text-[14px]">{MCP_SIGNED_IN_PATH}</span>{" "}
            is the one to connect: it answers 401 with a <span className="font-mono text-[14px]">WWW-Authenticate</span> header until it has an
            agent&rsquo;s own credential, which is how an MCP client knows to start signing in. A person&rsquo;s browser session is never
            accepted there, and an agent&rsquo;s credential is accepted nowhere else.
          </p>
          {base ? <pre className={DOC_PRE}>{`${base}${MCP_SIGNED_IN_PATH}`}</pre> : null}
        </section>

        <section id="connect">
          <h2 className={DOC_H2}>Connecting</h2>
          <p className={DOC_BODY}>
            An MCP client that speaks OAuth (Claude&rsquo;s connectors among them) needs nothing but the address: it finds the
            authorization server from the 401, registers itself, and sends the person to a consent screen on openproduct.live where
            they choose what it may do and which listings it may touch. Access tokens last {Math.round(OAUTH_ACCESS_TTL_SECONDS / 60)}{" "}
            minutes and refresh for {days(OAUTH_REFRESH_TTL_SECONDS)}; a refresh token used twice ends the connection.
          </p>
          <p className={DOC_BODY}>
            For a script or a CLI, make a personal token in Settings → Connected agents ({lifetimes}) and send it as{" "}
            <span className="font-mono text-[14px]">Authorization: Bearer …</span>. Every connection can be revoked there; a revocation
            takes effect within {Math.round(AGENT_RESOLVE_CACHE_SECONDS / 60)} minute.
          </p>
        </section>

        <section id="scopes">
          <h2 className={DOC_H2}>Scopes</h2>
          <p className={DOC_BODY}>A scope only narrows what the person may do. An agent can never do more than they can.</p>
          <ul className={DOC_ROWS}>
            {AGENT_SCOPES.map((scope) => (
              <li key={scope} className={DOC_ROW}>
                <span className={DOC_KEY}>{scope}</span>
                <p className={DOC_VALUE}>
                  {AGENT_SCOPE_WORDS[scope].title}. {AGENT_SCOPE_WORDS[scope].detail}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section id="tools">
          <h2 className={DOC_H2}>Tools</h2>
          <p className={DOC_BODY}>
            Each tool sends the request the website&rsquo;s own control sends. Answers that carry other people&rsquo;s words say so, so a
            client can keep them out of its instructions. Creating tools take an optional <span className="font-mono text-[14px]">idempotencyKey</span>:
            the same key within a day gets the first answer back.
          </p>
          <h3 className="m-0 mt-6 text-[15px] font-semibold">The catalogue — also on /mcp</h3>
          <ul className={DOC_ROWS}>
            {AGENT_TOOLS.map((tool) => (
              <li key={tool.name} className={DOC_ROW}>
                <span className={DOC_KEY}>{tool.name}</span>
                <p className={DOC_VALUE}>{tool.description}</p>
              </li>
            ))}
          </ul>
          {SCOPE_ORDER.map((scope) => {
            const tools = AGENT_SIGNED_IN_TOOLS.filter((t) => t.scope === scope);
            if (tools.length === 0) return null;
            return (
              <div key={String(scope)} data-mcp-scope={String(scope)}>
                <h3 className="m-0 mt-6 text-[15px] font-semibold">{scopeHeading(scope)}</h3>
                <ul className={DOC_ROWS}>
                  {tools.map((tool) => (
                    <li key={tool.name} className={DOC_ROW} data-mcp-tool={tool.name}>
                      <span className={DOC_KEY}>
                        {tool.name}
                        {tool.annotations.destructiveHint ? " · destructive" : ""}
                      </span>
                      <p className={DOC_VALUE}>{tool.description}</p>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>

        <section id="images">
          <h2 className={DOC_H2}>Images</h2>
          <p className={DOC_BODY}>
            Ask <span className="font-mono text-[14px]">request_media_upload</span> for a one-time address, valid{" "}
            {Math.round(AGENT_UPLOAD_TICKET_TTL_SECONDS / 60)} minutes, and PUT exactly the bytes it was asked for. Small images may go inline
            (at most {Math.round(AGENT_INLINE_MEDIA_MAX_BYTES / 1024 / 1024)} MB), and a public https image may be fetched by address. All three go
            through the same checks as an upload on the website.
          </p>
        </section>

        <section id="limits">
          <h2 className={DOC_H2}>Limits</h2>
          <p className={DOC_BODY}>
            An agent spends its person&rsquo;s rate limits, and on top of them its own: {AGENT_RATE_LIMITS.agentWrite.limit} writes a minute per
            connection. Everything it posts passes the same defence and moderation as the website&rsquo;s, and is the person&rsquo;s, in their
            name.
          </p>
        </section>

        <section id="not-tools">
          <h2 className={DOC_H2}>What is not a tool, and why</h2>
          <ul className={DOC_ROWS}>
            {Object.entries(AGENT_EXCLUSIONS).map(([key, reason]) => (
              <li key={key} className={DOC_ROW}>
                <span className={DOC_KEY}>{key}</span>
                <p className={DOC_VALUE}>{reason}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
