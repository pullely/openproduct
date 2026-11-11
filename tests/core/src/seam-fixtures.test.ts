// The seam fixtures, product side (openproduct-independence OX6).
//
// The other half of the cross-repo bargain `tests/membership-worker/src/
// seam-fixtures.test.ts` opens: the platform pins what it EMITS against the
// fixture set; this file pins what the product ACCEPTS against the same
// bytes. While both live in one tree the platform's twin-sync keeps the two
// copies identical; after the cut each repo owns its copy, and a deliberate
// seam change ships by updating the fixture on both sides — which is what
// makes it deliberate.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { OpenproductRepository } from "@openproduct/db";
import { executeWorkspacePurge } from "@openproduct/db/purge";
import { route } from "@openproduct-worker/router";
import { verifyListingGrant, SEAM_VERSION } from "@openproduct-worker/seam";
import type { Env } from "@openproduct-worker/env";
import type { ProfileHandlerDeps } from "@openproduct-worker/handlers/profiles";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, "../../../seam-fixtures");

const ENV: Env = { ENVIRONMENT: "test" };

function fixture<T = Record<string, unknown>>(name: string): T {
  return JSON.parse(readFileSync(resolve(FIXTURES, name), "utf-8")) as T;
}

const card = fixture("webhook-contract.json");

function post(path: string, body: unknown): Request {
  return new Request(`https://openproduct-worker.internal${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

interface SeamHarness {
  deps: ProfileHandlerDeps;
  recorded: Array<Record<string, unknown>>;
  statusWrites: Array<{ ref: string; status: string }>;
  revoked: string[];
}

function seamHarness(): SeamHarness {
  const recorded: Array<Record<string, unknown>> = [];
  const statusWrites: Array<{ ref: string; status: string }> = [];
  const revoked: string[] = [];
  const activity: Array<{ kind: string; actorSubjectId: string | null }> = [];
  const repo = {
    async getRoleOpeningByJoinLinkRef(ref: string) {
      return { id: "00000000-0000-4000-8000-00000000000a", profileId: "00000000-0000-4000-8000-00000000000b", joinLinkRef: ref };
    },
    async recordApplication(input: Record<string, unknown>) {
      recorded.push(input);
    },
    // CB3 — the decision trail. An acceptance writes a `joined` row; a
    // decline writes nothing, which is why there is no branch for it.
    async getApplicationByRequestRef(_ref: string) {
      return {
        subjectId: "usr_0123456789abcdef0123456789abcdef",
        profileId: "55555555-5555-4555-8555-555555555555",
        status: "approved",
        openingTitle: "Someone who likes tests",
      };
    },
    async appendActivity(input: { kind: string; actorSubjectId: string | null }) {
      activity.push({ kind: input.kind, actorSubjectId: input.actorSubjectId });
    },
    async setApplicationStatusByRequestRef(ref: string, status: string) {
      statusWrites.push({ ref, status });
      return 1;
    },
    async revokeWorkspaceEligibility(orgUuid: string) {
      revoked.push(orgUuid);
      return [];
    },
    async appendAudit() {},
  } as unknown as OpenproductRepository;
  return { deps: { repo } as ProfileHandlerDeps, recorded, statusWrites, revoked };
}

describe("the receivers accept the fixtures, byte for byte", () => {
  it("join_request.submitted records through the public-listing filter", async () => {
    const h = seamHarness();
    const fx = fixture("join-request.submitted.json");
    const res = await route(post("/internal/openproduct/seam/join-request", fx), ENV, h.deps);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { recorded: boolean } }).data.recorded).toBe(true);
    expect(h.recorded[0]!.jrRequestRef).toBe((fx.data as Record<string, unknown>).jrRequestRef);
  });

  it("join_request.decided overwrites the snapshot by ref", async () => {
    const h = seamHarness();
    const fx = fixture("join-request.decided.json");
    const res = await route(post("/internal/openproduct/seam/join-request", fx), ENV, h.deps);
    expect(res.status).toBe(200);
    expect(h.statusWrites).toEqual([
      {
        ref: (fx.data as Record<string, unknown>).jrRequestRef,
        status: (fx.data as Record<string, unknown>).status,
      },
    ]);
  });

  it("every status in the card's vocabulary is accepted; anything else 422s", async () => {
    const fx = fixture("join-request.decided.json");
    for (const status of card.joinRequestStatuses as string[]) {
      const h = seamHarness();
      const body = { ...fx, data: { ...(fx.data as Record<string, unknown>), status } };
      const res = await route(post("/internal/openproduct/seam/join-request", body), ENV, h.deps);
      expect(`${status}: ${res.status}`).toBe(`${status}: 200`);
    }
    const h = seamHarness();
    const bogus = { ...fx, data: { ...(fx.data as Record<string, unknown>), status: "escalated" } };
    const res = await route(post("/internal/openproduct/seam/join-request", bogus), ENV, h.deps);
    expect(res.status).toBe(422);
  });

  it("workspace.visibility_narrowed revokes by the org PUBLIC id", async () => {
    const h = seamHarness();
    const fx = fixture("workspace.visibility_narrowed.json");
    const res = await route(post("/internal/openproduct/seam/workspace-event", fx), ENV, h.deps);
    expect(res.status).toBe(200);
    // The fixture's org_<hex> decodes to the UUID the repository is keyed by.
    expect(h.revoked).toEqual(["11111111-1111-4111-8111-111111111111"]);
  });
});

describe("the purge receipt is the fixture's, exactly", () => {
  it("request fixture in, receipt fixture's data out — same keys, same values", async () => {
    const emptyExecutor = {
      async execute() {
        return { rows: [], rowCount: 0 };
      },
    };
    const request = fixture("workspace-purge.request.json");
    const receipt = fixture("workspace-purge.receipt.json");
    const result = await executeWorkspacePurge(() => emptyExecutor, "openproduct", request, {
      enabled: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(receipt.data);
  });

  it("the kill switch refuses before the body is parsed", async () => {
    const result = await executeWorkspacePurge(
      () => {
        throw new Error("must not touch the database");
      },
      "openproduct",
      fixture("workspace-purge.request.json"),
      { enabled: false },
    );
    expect(result).toEqual({
      ok: false,
      code: "purge_disabled",
      message: "Workspace purge is not enabled in this environment",
      status: 503,
    });
  });
});

describe("the grant blob verifies from the fixture payload", () => {
  // The platform's builder and this verifier meet only on the wire; building
  // the fixture payload here with the documented form proves the form, not an
  // implementation the two sides secretly share.
  async function hmacHex(secret: string, message: string): Promise<string> {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
    return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  it("accepts the card's exact payload key set and returns its facts", async () => {
    const payload = fixture("listing-grant.payload.json");
    const grantCard = card.grantBlob as { payloadKeys: string[]; maxAgeMs: number };
    expect(Object.keys(payload).sort()).toEqual([...grantCard.payloadKeys].sort());

    const encoded = Buffer.from(JSON.stringify(payload), "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const blob = `${encoded}.${await hmacHex("secret", encoded)}`;
    const verified = await verifyListingGrant(
      "secret",
      blob,
      () => new Date(payload.issuedAt as string),
    );
    expect(verified).not.toBeNull();
    expect(verified!.doorRef).toBe(payload.doorRef);
    expect(verified!.workspaceVisibility).toBe("public");
    expect(payload.seam).toBe(SEAM_VERSION);
  });

  it("the product's stake in the door ladder: rank 0 is project_viewer", () => {
    const ladder = card.doorRoleLadder as string[];
    expect(ladder[0]).toBe("project_viewer");
    expect(ladder).toEqual(["project_viewer", "viewer", "builder"]);
  });

  it("freshness follows the card: a blob older than maxAgeMs is refused", async () => {
    const payload = fixture("listing-grant.payload.json");
    const grantCard = card.grantBlob as { maxAgeMs: number };
    const encoded = Buffer.from(JSON.stringify(payload), "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const blob = `${encoded}.${await hmacHex("secret", encoded)}`;
    const tooLate = new Date(Date.parse(payload.issuedAt as string) + grantCard.maxAgeMs + 1000);
    expect(await verifyListingGrant("secret", blob, () => tooLate)).toBeNull();
  });
});

describe("CB3 — the decision trail, and its asymmetry", () => {
  /** A seam receiver whose activity writes are observable. */
  function trailHarness(status: "approved" | "denied") {
    const activity: Array<{ kind: string; actorSubjectId: string | null; summary: string }> = [];
    const repo = {
      async setApplicationStatusByRequestRef() {
        return 1;
      },
      async getApplicationByRequestRef() {
        return {
          subjectId: "usr_0123456789abcdef0123456789abcdef",
          profileId: "55555555-5555-4555-8555-555555555555",
          status,
          openingTitle: "Someone who likes tests",
        };
      },
      async appendActivity(input: { kind: string; actorSubjectId: string | null; summary: string }) {
        activity.push(input);
      },
      async recordApplication() {
        return null;
      },
      async getRoleOpeningByJoinLinkRef() {
        return null;
      },
    };
    return { deps: { repo } as never, activity };
  }

  function decided(status: string): Request {
    return new Request("https://openproduct.internal/internal/openproduct/seam/join-request", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "req_cb3" },
      body: JSON.stringify({
        seam: "v1",
        type: "join_request.decided",
        data: { jrRequestRef: "jr_abc", status },
      }),
    });
  }

  it("publishes an acceptance, attributed to the person who joined", async () => {
    const h = trailHarness("approved");
    const res = await route(decided("approved"), { ENVIRONMENT: "test" } as never, h.deps);
    expect(res.status).toBe(200);
    expect(h.activity).toHaveLength(1);
    expect(h.activity[0]!.kind).toBe("joined");
    expect(h.activity[0]!.actorSubjectId).toBe("usr_0123456789abcdef0123456789abcdef");
    // Summarised by the OPENING: SN3's filter resolves the name at read time
    // from the consent edge, so a row written now cannot publish somebody who
    // has not confirmed yet (OPC-5).
    expect(h.activity[0]!.summary).toContain("Someone who likes tests");
  });

  it("PUBLISHES NOTHING ON A DECLINE — there is no branch for it", async () => {
    // "Ada was declined" is a fact about Ada, published at an address she
    // does not control, permanently, on a page search engines crawl. Nobody
    // applies twice to a place that publishes its rejections.
    const h = trailHarness("denied");
    const res = await route(decided("denied"), { ENVIRONMENT: "test" } as never, h.deps);
    expect(res.status).toBe(200);
    expect(h.activity).toEqual([]);
  });

  it("publishes nothing on any other status either", async () => {
    for (const status of ["pending", "withdrawn", "expired"]) {
      const h = trailHarness("denied");
      const res = await route(decided(status), { ENVIRONMENT: "test" } as never, h.deps);
      expect(res.status).toBe(200);
      expect(h.activity).toEqual([]);
    }
  });

  it("does not publish a decline note at the moment of the decision", async () => {
    // THE TIMING JOIN, refused. A decline note emitted the instant a decision
    // landed would be joinable against that moment, and on an opening with
    // one pending offer the timing alone identifies the person — the same
    // arithmetic CB2 refuses. Publishing is a separate, later, deliberate act.
    const h = trailHarness("denied");
    await route(decided("denied"), { ENVIRONMENT: "test" } as never, h.deps);
    expect(h.activity).toEqual([]);
  });
});
