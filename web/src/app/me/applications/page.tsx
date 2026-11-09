import Link from "next/link";
import { redirect } from "next/navigation";

import { readSession } from "../../auth/session-server";
import { PAGE_TITLE } from "../../ui/design";
import { fetchMyApplications } from "../me-api";
import { ME_MAIN, ME_TITLE_GAP, MeNav } from "../nav";
import { MeUnavailable } from "../unavailable";

import { AppLink } from "../../ui/link";

/**
 * The contributor's applications (openproduct-home OH2) — their own view of
 * the JR requests they raised from listed products. A PROJECTION: the status
 * shown is a snapshot of JR's answer, and JR is right (design.md §4).
 *
 * THE DESIGN'S ROW: the product, its line, when, and the status as a 24px
 * pill — green for an approval, amber while it waits, grey for the rest.
 */
export const dynamic = "force-dynamic";

const STATUS_COPY: Record<string, string> = {
  pending: "Waiting on the maintainers",
  approved: "Approved — you're in",
  denied: "Not this time",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

/** The pill's colour says the same thing as its word, and nothing more. */
function pillClass(status: string): string {
  const base = "inline-flex h-[24px] shrink-0 items-center rounded-full px-2.5 text-[12.5px] font-semibold";
  if (status === "approved") return `${base} bg-success-soft text-success`;
  if (status === "pending") return `${base} bg-warning-soft text-warning-strong`;
  return `${base} bg-muted text-muted-foreground`;
}

export default async function MyApplicationsPage() {
  const session = await readSession();
  if (!session) redirect("/signin?return_to=%2Fme%2Fapplications");

  const result = await fetchMyApplications(session.accessToken);
  if (result.kind === "unauthorized") redirect("/signin?return_to=%2Fme%2Fapplications");
  if (result.kind === "unavailable") return <MeUnavailable active="applications" />;

  const { applications } = result.data;

  return (
    <main className={ME_MAIN}>
      <MeNav active="applications" />

      <h1 className={`${PAGE_TITLE} ${ME_TITLE_GAP}`}>Your applications</h1>

      {applications.length === 0 ? (
        <p className="m-0 mt-7 rounded-[20px] border border-dashed border-border px-8 py-14 text-center text-[16px] text-muted-foreground">
          Nothing yet.
        </p>
      ) : (
        <ul className="m-0 mt-7 grid list-none gap-[14px] p-0" data-application-tiles>
          {applications.map((application) => (
            <li
              key={application.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[20px] border border-border bg-card px-7 py-5 max-sm:px-4 max-sm:py-4"
            >
              {application.productSlug ? (
                <Link
                  href={`/${application.productSlug}`}
                  className="text-[19px] font-semibold leading-[1.25] tracking-[-0.015em] text-foreground no-underline hover:text-copy"
                >
                  {application.productSlug}
                </Link>
              ) : (
                <span className="text-[19px] font-semibold leading-[1.25] text-muted-foreground">
                  (listing removed)
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-[15px] text-copy">
                {application.productTagline ?? ""}
              </span>
              <span className="text-[12.5px] text-muted-foreground">{day(application.createdAt)}</span>
              <span className={pillClass(application.status)}>
                {STATUS_COPY[application.status] ?? application.status}
              </span>
              {application.status === "approved" ? (
                // OD-K — the approval's deep link, surfaced where the
                // contributor already looks. The console is reachable on
                // this host (host-rewrite passes /login through), so the
                // path stays host-relative.
                <AppLink className="tap text-[12.5px] text-muted-foreground underline underline-offset-4" href="/login">
                  Open your workspace
                </AppLink>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function day(iso: string): string {
  const at = Date.parse(iso);
  return Number.isNaN(at)
    ? ""
    : new Date(at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
}
