// The one moment a personal token is shown (openproduct-mcp MC1).
//
// `mint` gets the token in the gateway's answer and must put it in front of
// the person exactly once without putting it in a URL (a URL is a log line,
// a referrer and a history entry). So it rides a cookie: HttpOnly, Secure,
// SameSite=Strict, scoped to the Connected agents page's own path, and alive
// for one minute — long enough for the redirect that follows, short enough
// that it is gone by the time anybody else could sit down at the browser.

export const NEW_TOKEN_COOKIE = "op_new_agent_token";
export const NEW_TOKEN_PATH = "/me/settings/agents";
export const NEW_TOKEN_MAX_AGE_SECONDS = 60;

export function newTokenCookie(token: string): {
  name: string;
  value: string;
  httpOnly: true;
  secure: true;
  sameSite: "strict";
  path: string;
  maxAge: number;
} {
  return {
    name: NEW_TOKEN_COOKIE,
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: NEW_TOKEN_PATH,
    maxAge: NEW_TOKEN_MAX_AGE_SECONDS,
  };
}

/** Only ever an agent token, so a stale or tampered cookie shows nothing. */
export function readNewToken(value: string | undefined): string | null {
  return value && /^opa_[A-Za-z0-9_-]{20,80}$/.test(value) ? value : null;
}
