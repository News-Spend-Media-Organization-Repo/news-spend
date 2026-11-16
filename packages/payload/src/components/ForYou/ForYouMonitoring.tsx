import type { AdminViewServerProps } from "payload";
import type { ReactNode } from "react";

import { scopeOfRequest } from "../Analytics/access";
import { PageFrame } from "../Analytics/PageFrame";
import { DataTable, Denied, Panel, Styles } from "../Analytics/ui";

const ADMIN_PATH = "/admin";
const now = () => new Date().toISOString();
const dateLabel = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("en-NG") : "Not recorded";

function Link({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}): ReactNode {
  return (
    <a className="fy-link" href={href}>
      {children}
    </a>
  );
}

function MonitoringStyles(): ReactNode {
  return (
    <style>
      {`
        .fy-links{display:flex;flex-wrap:wrap;gap:8px}
        .fy-link{display:inline-flex;align-items:center;min-height:36px;padding:7px 12px;border:1px solid var(--theme-elevation-200);border-radius:8px;color:var(--theme-text);text-decoration:none;font-size:13px;font-weight:500}
        .fy-link:hover{background:var(--theme-elevation-50);text-decoration:none}
        .fy-counts{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px}
        .fy-count{padding:14px;border:1px solid var(--theme-elevation-150);border-radius:10px;background:var(--theme-elevation-0)}
        .fy-count strong{display:block;margin-top:5px;font-size:25px}
        .fy-table-wrap{overflow-x:auto}
        .fy-error{color:#b33c32}
      `}
    </style>
  );
}

/** Staff-only operational overview. Private profiles and event rows are never queried. */
export async function ForYouMonitoringView(
  props: AdminViewServerProps
): Promise<ReactNode> {
  const { req } = props.initPageResult;
  if (scopeOfRequest(req)?.kind !== "staff") {
    return (
      <PageFrame view={props}>
        <Denied />
      </PageFrame>
    );
  }

  try {
    const at = now();
    const [sourceResult, pendingReports, currentResult, expiredResult] =
      await Promise.all([
        req.payload.find({
          collection: "opportunity-sources",
          limit: 1000,
          pagination: false,
          depth: 0,
          overrideAccess: true,
        }),
        req.payload.find({
          collection: "opportunity-reports",
          where: { status: { equals: "pending" } },
          limit: 100,
          sort: "-createdAt",
          depth: 0,
          select: {
            id: true,
            reason: true,
            opportunity: true,
            status: true,
          },
          overrideAccess: true,
        }),
        req.payload.find({
          collection: "opportunities",
          where: {
            and: [
              { status: { equals: "published" } },
              { "source.status": { equals: "approved" } },
              {
                or: [
                  { deadline: { exists: false } },
                  { deadline: { greater_than: at } },
                ],
              },
            ],
          },
          limit: 30,
          sort: "-publishedAt",
          depth: 0,
          overrideAccess: true,
        }),
        req.payload.find({
          collection: "opportunities",
          where: {
            or: [
              { status: { equals: "expired" } },
              { deadline: { less_than_equal: at } },
            ],
          },
          limit: 30,
          sort: "-publishedAt",
          depth: 0,
          overrideAccess: true,
        }),
      ]);

    const sources = sourceResult.docs;
    const failedSources = sources.filter((source) => Boolean(source.lastError));
    const imports = sources.reduce(
      (total, source) => total + (source.itemsImported ?? 0),
      0
    );
    const sourceCount = (status: string) =>
      sources.filter((source) => source.status === status).length;

    return (
      <PageFrame view={props}>
        <Styles />
        <MonitoringStyles />
        <main className="ana ana-page">
          <header className="ana-head">
            <div>
              <h2>For You monitoring</h2>
              <div className="ana-muted">
                Source and opportunity operations. No reader profiles or
                individual activity is shown here.
              </div>
            </div>
            <Link href={`${ADMIN_PATH}/globals/opportunity-settings`}>
              Global settings
            </Link>
          </header>

          <section aria-label="For You source statistics" className="fy-counts">
            <div className="fy-count">
              <span className="ana-muted">Sources</span>
              <strong>{sources.length}</strong>
            </div>
            <div className="fy-count">
              <span className="ana-muted">Approved</span>
              <strong>{sourceCount("approved")}</strong>
            </div>
            <div className="fy-count">
              <span className="ana-muted">Awaiting review</span>
              <strong>{sourceCount("pending")}</strong>
            </div>
            <div className="fy-count">
              <span className="ana-muted">Imported items</span>
              <strong>{imports.toLocaleString("en-NG")}</strong>
            </div>
            <div className="fy-count">
              <span className="ana-muted">Sources with failures</span>
              <strong>{failedSources.length}</strong>
            </div>
            <div className="fy-count">
              <span className="ana-muted">Pending reports</span>
              <strong>{pendingReports.totalDocs}</strong>
            </div>
          </section>

          <section aria-label="For You editors" className="fy-links">
            <Link href={`${ADMIN_PATH}/collections/opportunity-sources`}>
              Review sources and trust
            </Link>
            <Link href={`${ADMIN_PATH}/collections/opportunity-interests`}>
              Classifications
            </Link>
            <Link
              href={`${ADMIN_PATH}/collections/opportunities?where%5BduplicateKey%5D%5Bexists%5D=true`}
            >
              Review duplicates
            </Link>
            <Link
              href={`${ADMIN_PATH}/collections/opportunities?where%5Bfeatured%5D%5Bequals%5D=true`}
            >
              Featured opportunities
            </Link>
            <Link href={`${ADMIN_PATH}/collections/opportunity-reports`}>
              Report review
            </Link>
          </section>

          <Panel
            hint="Import counts and last fetch outcomes reported by each configured source."
            title="Source and import health"
          >
            {failedSources.length ? (
              <div className="ana-notice" data-tone="bad">
                {failedSources.length} source
                {failedSources.length === 1 ? " has" : "s have"} a recorded
                import failure.
              </div>
            ) : null}
            <div className="fy-table-wrap">
              <DataTable
                columns={[
                  { key: "source", label: "Source" },
                  { key: "state", label: "Review / trust" },
                  { key: "count", label: "Items imported", align: "right" },
                  { key: "fetched", label: "Last fetched" },
                  { key: "failure", label: "Latest failure" },
                ]}
                empty="No opportunity sources have been added."
                rows={sources.map((source) => ({
                  key: String(source.id),
                  cells: {
                    source: (
                      <Link
                        href={`${ADMIN_PATH}/collections/opportunity-sources/${source.id}`}
                      >
                        {source.title}
                      </Link>
                    ),
                    state: (
                      <>
                        <span>{source.status}</span>
                        <div className="ana-sub">{source.trust}</div>
                      </>
                    ),
                    count: (source.itemsImported ?? 0).toLocaleString("en-NG"),
                    fetched: dateLabel(source.lastFetchedAt),
                    failure: source.lastError ? (
                      <span className="fy-error">{source.lastError}</span>
                    ) : (
                      "None recorded"
                    ),
                  },
                }))}
              />
            </div>
          </Panel>

          <div className="ana-grid ana-even">
            <Panel
              hint="Published, approved-source opportunities with no passed deadline."
              title={`Current opportunities · ${currentResult.totalDocs}`}
            >
              <div className="fy-table-wrap">
                <DataTable
                  columns={[
                    { key: "title", label: "Opportunity" },
                    { key: "category", label: "Classification" },
                    { key: "deadline", label: "Deadline" },
                  ]}
                  empty="No current opportunities."
                  rows={currentResult.docs.map((item) => ({
                    key: String(item.id),
                    cells: {
                      title: (
                        <Link
                          href={`${ADMIN_PATH}/collections/opportunities/${item.id}`}
                        >
                          {item.title}
                        </Link>
                      ),
                      category: item.category,
                      deadline: dateLabel(item.deadline),
                    },
                  }))}
                />
              </div>
            </Panel>
            <Panel
              hint="Expired records and records past their listed deadline."
              title={`Expired opportunities · ${expiredResult.totalDocs}`}
            >
              <div className="fy-table-wrap">
                <DataTable
                  columns={[
                    { key: "title", label: "Opportunity" },
                    { key: "status", label: "Status" },
                    { key: "deadline", label: "Deadline" },
                  ]}
                  empty="No expired opportunities."
                  rows={expiredResult.docs.map((item) => ({
                    key: String(item.id),
                    cells: {
                      title: (
                        <Link
                          href={`${ADMIN_PATH}/collections/opportunities/${item.id}`}
                        >
                          {item.title}
                        </Link>
                      ),
                      status: item.status,
                      deadline: dateLabel(item.deadline),
                    },
                  }))}
                />
              </div>
            </Panel>
          </div>

          <Panel
            hint="Only report reason and related opportunity are shown; reporter identity and private details are not exposed."
            title="Pending reports"
          >
            <div className="fy-table-wrap">
              <DataTable
                columns={[
                  { key: "reason", label: "Reason" },
                  { key: "opportunity", label: "Opportunity record" },
                  { key: "status", label: "Status" },
                  { key: "review", label: "Review" },
                ]}
                empty="No pending reports."
                rows={pendingReports.docs.map((report) => ({
                  key: String(report.id),
                  cells: {
                    reason: report.reason,
                    opportunity: (() => {
                      const opportunityId =
                        typeof report.opportunity === "string"
                          ? report.opportunity
                          : report.opportunity.id;
                      return (
                        <Link
                          href={`${ADMIN_PATH}/collections/opportunities/${opportunityId}`}
                        >
                          Open opportunity
                        </Link>
                      );
                    })(),
                    status: report.status,
                    review: (
                      <Link
                        href={`${ADMIN_PATH}/collections/opportunity-reports/${report.id}`}
                      >
                        Review report
                      </Link>
                    ),
                  },
                }))}
              />
            </div>
          </Panel>
        </main>
      </PageFrame>
    );
  } catch {
    return (
      <PageFrame view={props}>
        <Styles />
        <div className="ana ana-page">
          <Panel
            hint="The operational records could not be loaded."
            title="For You monitoring is unavailable"
          >
            <div className="ana-empty">
              Refresh the page or ask a Payload administrator to check access.
            </div>
          </Panel>
        </div>
      </PageFrame>
    );
  }
}
