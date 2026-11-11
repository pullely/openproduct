# Security

openproduct is public code that runs a public site,
[openproduct.live](https://openproduct.live). If you find a way to break it,
please tell us privately first, so it can be fixed before anyone else can
use it.

## Reporting a vulnerability

Use GitHub's **private vulnerability reporting** on this repository:
[pullely/openproduct → Security → Report a vulnerability](https://github.com/pullely/openproduct/security/advisories/new).
Only the maintainers can read the report, and the fix can be discussed and
prepared in a private advisory before it is published.

Please do **not** open a public issue, pull request or discussion for a
vulnerability, and do not test against other people's listings, accounts or
data.

A useful report says:

- what an attacker can do, and what they need first (an account, a listing,
  a maintainer role, nothing at all);
- how to reproduce it: the requests, the inputs, and what you expected to
  happen instead;
- where in the code you think it lives, if you know;
- whether you have told anyone else.

You will get an acknowledgement within three working days, and a first
assessment within ten. We will tell you when a fix ships and, if you want,
credit you in the advisory. There is no bug bounty.

## Scope

In scope is everything in this repository and what it runs: the website
(`web/`), the gateway (`gateway/`), the core Worker (`core/`), the shared
packages (`packages/`) and the synthetic monitor (`infra/synthetic/`).
Reports we especially want:

- **The seam with the Orunbase platform.** The listing grant, the webhooks
  the platform sends (workspace visibility, purge, join requests) and the
  calls openproduct makes back are all HMAC-signed with shared secrets. The
  verification code is public on purpose: `core/src/seam.ts`,
  `core/src/handlers/seam-events.ts`, `gateway/src/seam.ts` and
  `gateway/src/auth-seam.ts`, with the wire format pinned by
  `seam-fixtures/`. A forged or replayed signature that is accepted, a
  comparison that is not constant-time, a tolerance window that is wider than
  it says, or a refusal that tells a caller *why* it was refused, is a
  vulnerability.
- **Authentication and sessions.** Password sign-in and sign-up, "Sign in
  with Orunbase", the `ops_` session tokens and how they are stored, resolved
  and revoked (`gateway/src/auth.ts`, `gateway/src/password.ts`,
  `core/src/handlers/auth.ts`, `core/src/handlers/sessions.ts`), and the
  rate limits in front of them.
- **Authorisation.** Acting on a listing, thread, comment or application you
  do not own, or seeing a private workspace's data through a public read,
  the public projection, the search index or the MCP endpoint.
- **Uploads and media**, and anything that lets one visitor's input run in
  another visitor's browser.

Out of scope here:

- the Orunbase platform itself (accounts, workspaces, the console, the CLI),
  which has its own security policy;
- Cloudflare, GitHub and other providers openproduct runs on;
- denial of service by volume, missing hardening headers with no
  demonstrated impact, and findings that need a compromised device or
  browser.

## Secrets

No credential lives in this repository or in its GitHub Actions secrets.
Provider credentials and the seam keys are Orunbase workspace secrets,
brokered to a CI run through GitHub's OIDC exchange and redacted from its
logs; pull requests from forks get none of them. The test fixtures contain
only values made up for the tests (for example the `ops_test_…` session
token). If you find something that looks like a live secret anywhere in this
repository or its history, report it as above.
