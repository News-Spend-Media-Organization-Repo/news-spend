import type { AdminViewServerProps } from "payload";
import type { ReactNode } from "react";

import {
  type SurveyPerformanceRow,
  summariseSurveyPerformance,
} from "../../lib/surveyPerformance";
import { scopeOfRequest } from "./access";
import { PageFrame } from "./PageFrame";
import { DataTable, Denied, Panel, Styles } from "./ui";

const PROVIDER_NAMES: Record<string, string> = {
  cpx: "CPX Research",
  rapido: "RapidoReach",
  theorem: "TheoremReach",
  bitlabs: "BitLabs",
};

const label = (row: SurveyPerformanceRow) =>
  PROVIDER_NAMES[row.provider] ?? row.provider;

const number = (value: number) => value.toLocaleString("en-US");

/**
 * Per-provider survey performance for staff. Deliberately excludes completion
 * rate (no start signal) and points per dollar (payout entry is deferred).
 */
export async function SurveyPerformanceView(
  props: AdminViewServerProps
): Promise<ReactNode> {
  const { req } = props.initPageResult;
  if (scopeOfRequest(req)?.kind !== "staff") {
    return (
      <PageFrame title="Survey performance" view={props}>
        <Denied />
      </PageFrame>
    );
  }

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [events, activities] = await Promise.all([
    req.payload.find({
      collection: "survey-offer-events",
      where: { createdAt: { greater_than_equal: since } },
      pagination: false,
      depth: 0,
    }),
    req.payload.find({
      collection: "activities",
      where: {
        and: [
          { action: { in: ["surveyTask", "pointReversal"] } },
          { createdAt: { greater_than_equal: since } },
        ],
      },
      pagination: false,
      depth: 0,
    }),
  ]);

  const rows = summariseSurveyPerformance(
    events.docs as never,
    activities.docs as never
  );

  return (
    <PageFrame title="Survey performance" view={props}>
      <Styles />
      <div className="ana ana-page">
        <h1>Survey performance</h1>
        <p className="ana-muted">
          Last 30 days, by provider. Offer counts are what each provider
          returned; awards are points actually paid and reversed.
        </p>

        <Panel
          hint="Payout received per provider and completion rate are not shown yet."
          title="Providers"
        >
          <DataTable
            columns={[
              { key: "provider", label: "Provider" },
              { key: "calls", label: "Calls", align: "right" },
              { key: "offers", label: "Offers", align: "right" },
              { key: "awards", label: "Awards", align: "right" },
              { key: "users", label: "Users paid", align: "right" },
              { key: "issued", label: "Points issued", align: "right" },
              { key: "reversals", label: "Reversals", align: "right" },
              { key: "reversed", label: "Points reversed", align: "right" },
            ]}
            empty="No survey activity in the last 30 days."
            rows={rows.map((row) => ({
              key: row.provider,
              cells: {
                provider: label(row),
                calls: number(row.calls),
                offers: number(row.offers),
                awards: number(row.awards),
                users: number(row.users),
                issued: number(row.pointsIssued),
                reversals: number(row.reversals),
                reversed: number(row.pointsReversed),
              },
            }))}
          />
        </Panel>
      </div>
    </PageFrame>
  );
}
