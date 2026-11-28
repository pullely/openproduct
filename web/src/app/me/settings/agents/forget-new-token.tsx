"use client";

import * as React from "react";

/**
 * SHOWN ONCE MEANS ONCE (security review, MC1). A page cannot delete a
 * cookie while it renders, so once the new token is on screen this asks
 * `/auth/agent-token-seen` to drop the one-minute cookie that carried it: a reload, or the
 * next person at this browser, finds nothing. Without script the cookie
 * still dies by itself within the minute.
 */
export function ForgetNewToken() {
  React.useEffect(() => {
    void fetch("/auth/agent-token-seen", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
  }, []);
  return null;
}
