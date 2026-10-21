import type {
  EventsDay,
  EventsOutlier,
  EventTotals,
  ItemSurfaceRow,
  PartnerEventsRow,
} from "@news-spend-media/analytics";
import type { ReactNode } from "react";

import { describeChange, formatCount } from "./format";
import { DataTable, DayChart, Kpi, Panel, SERIES_COLORS } from "./ui";

/** Presentation of the partner impressions and taps reports. No queries here. */

const NO_RATE = "—";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const REPORTED_NOTE =
  "Reported by the app. The related-news card, banners inside articles and Discover lists are not counted yet; taps are counted everywhere.";

export const CLICKS_DIFFER_NOTE =
  "These taps differ from 'clicks sent to the partner' above because they include guests and ad surfaces.";

const rate = (value: number | null): string =>
  value === null ? NO_RATE : `${value}%`;

/** The `content` search param, or undefined when it is missing or not a uuid. */
export function parseContentParam(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && UUID.test(raw) ? raw : undefined;
}

/** The `surface` search param, only if it is one of the surfaces on screen. */
export function parseSurfaceParam(
  value: unknown,
  surfaces: string[]
): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && surfaces.includes(raw) ? raw : undefined;
}

export function PartnerEventsKpis({
  current,
  previous,
  daily,
}: {
  current: EventTotals;
  previous: EventTotals;
  daily?: EventsDay[];
}): ReactNode {
  const versus = "vs previous period";
  const perDay = (pick: (day: EventsDay) => number): number[] => {
    const byDate = new Map<string, number>();
    for (const day of daily ?? []) {
      byDate.set(day.date, (byDate.get(day.date) ?? 0) + pick(day));
    }
    return [...byDate.entries()].sort().map(([, value]) => value);
  };
  return (
    <div className="ana-grid ana-kpis">
      <Kpi
        change={describeChange(current.impressions, previous.impressions)}
        label="Impressions"
        note={versus}
        tag="reported"
        trend={perDay((d) => d.impressions)}
        value={formatCount(current.impressions)}
      />
      <Kpi
        change={describeChange(current.taps, previous.taps)}
        label="Taps"
        note={versus}
        tag="reported"
        trend={perDay((d) => d.taps)}
        value={formatCount(current.taps)}
      />
      <Kpi
        label="Tap-through"
        note={
          previous.tapThrough === null
            ? "sessions that tapped, of those that saw it"
            : `${rate(previous.tapThrough)} previous period`
        }
        tag="reported"
        value={rate(current.tapThrough)}
      />
    </div>
  );
}

export function PartnerEventsItemsPanel({
  rows,
  basePath,
  days,
  surface,
  contentId,
}: {
  rows: ItemSurfaceRow[];
  basePath: string;
  days: number;
  /** Already validated against the surfaces in `rows`. */
  surface?: string;
  contentId?: string;
}): ReactNode {
  const surfaces = [...new Set(rows.map((r) => r.surface))].sort();
  const href = (next: { surface?: string; content?: string }): string => {
    const query = new URLSearchParams({ days: String(days) });
    if (next.surface) {
      query.set("surface", next.surface);
    }
    if (next.content) {
      query.set("content", next.content);
    }
    return `${basePath}?${query}`;
  };
  const shown = surface ? rows.filter((r) => r.surface === surface) : rows;

  return (
    <Panel
      hint="Each item on each surface. Tap-through is sessions that tapped, of sessions that saw it."
      tag="reported"
      title="By item and surface"
    >
      {surfaces.length > 1 ? (
        <nav className="ana-seg">
          <a
            aria-current={surface === undefined}
            href={href({ content: contentId })}
          >
            All surfaces
          </a>
          {surfaces.map((s) => (
            <a
              aria-current={surface === s}
              href={href({ surface: s, content: contentId })}
              key={s}
            >
              {s}
            </a>
          ))}
        </nav>
      ) : null}
      {contentId ? (
        <div className="ana-muted">
          Showing one item. <a href={href({ surface })}>Show all items</a>
        </div>
      ) : null}
      <DataTable
        columns={[
          { key: "item", label: "Item" },
          { key: "surface", label: "Surface" },
          { key: "impressions", label: "Impressions", align: "right" },
          { key: "taps", label: "Taps", align: "right" },
          { key: "rate", label: "Tap-through", align: "right" },
        ]}
        empty="No impressions or taps in this period."
        rows={shown.map((r) => ({
          key: `${r.contentId}|${r.surface}`,
          cells: {
            item: (
              <a href={href({ surface, content: r.contentId })}>
                {r.title ?? "Untitled item"}
              </a>
            ),
            surface: r.surface,
            impressions: formatCount(r.impressions),
            taps: formatCount(r.taps),
            rate: rate(r.tapThrough),
          },
        }))}
      />
    </Panel>
  );
}

const colorAt = (index: number): string =>
  [SERIES_COLORS.deep, SERIES_COLORS.gold, SERIES_COLORS.pale][index % 3] ??
  SERIES_COLORS.deep;

/** One row per date, one numeric column per surface. */
function pivot(
  days: EventsDay[],
  pick: (day: EventsDay) => number
): ({ date: string } & Record<string, number | string>)[] {
  const byDate = new Map<
    string,
    { date: string } & Record<string, number | string>
  >();
  for (const day of days) {
    const row: { date: string } & Record<string, number | string> = byDate.get(
      day.date
    ) ?? { date: day.date };
    row[`s:${day.surface}`] = pick(day);
    byDate.set(day.date, row);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Two charts, because the chart draws one set of series: impressions, then taps. */
export function PartnerEventsDailyPanel({
  days,
}: {
  days: EventsDay[];
}): ReactNode {
  const surfaces = [...new Set(days.map((d) => d.surface))].sort();
  const series = surfaces.map((s, i) => ({
    key: `s:${s}`,
    label: s,
    color: colorAt(i),
  }));
  return (
    <Panel
      hint="One line per surface, on the day it happened"
      tag="reported"
      title="Impressions and taps by day"
    >
      <h4>Impressions</h4>
      <DayChart
        days={pivot(days, (d) => d.impressions)}
        label="Impressions by surface"
        series={series}
      />
      <h4>Taps</h4>
      <DayChart
        days={pivot(days, (d) => d.taps)}
        label="Taps by surface"
        series={series}
      />
    </Panel>
  );
}

export function PartnerEventsNotes(): ReactNode {
  return (
    <>
      <p className="ana-muted">{REPORTED_NOTE}</p>
      <p className="ana-muted">{CLICKS_DIFFER_NOTE}</p>
    </>
  );
}

/** Staff only. Items whose tap-through looks too good to be true. */
export function PartnerEventsOutliersPanel({
  rows,
}: {
  rows: EventsOutlier[];
}): ReactNode {
  return (
    <Panel
      hint="Tap-through above 50% over at least 50 sessions that saw the item. Worth a look for automated or accidental taps."
      tag="reported"
      title="Unusually high tap-through"
    >
      <DataTable
        columns={[
          { key: "item", label: "Item" },
          { key: "surface", label: "Surface" },
          { key: "sessions", label: "Sessions seen", align: "right" },
          { key: "rate", label: "Tap-through", align: "right" },
        ]}
        empty="No items are above the threshold in this period."
        rows={rows.map((r) => ({
          key: `${r.contentId}|${r.surface}`,
          cells: {
            item: r.title ?? "Untitled item",
            surface: r.surface,
            sessions: formatCount(r.sessionsSeen),
            rate: rate(r.tapThrough),
          },
        }))}
      />
    </Panel>
  );
}

/** Staff only. Every partner's totals. */
export function PartnerEventsByPartnerPanel({
  rows,
}: {
  rows: PartnerEventsRow[];
}): ReactNode {
  return (
    <Panel
      hint="Totals for the period, most seen first"
      tag="reported"
      title="Partners"
    >
      <DataTable
        columns={[
          { key: "partner", label: "Partner" },
          { key: "impressions", label: "Impressions", align: "right" },
          { key: "taps", label: "Taps", align: "right" },
          { key: "rate", label: "Tap-through", align: "right" },
        ]}
        empty="No impressions or taps in this period."
        rows={rows.map((r) => ({
          key: r.partnerId,
          cells: {
            partner: r.companyName ?? "Unnamed partner",
            impressions: formatCount(r.impressions),
            taps: formatCount(r.taps),
            rate: rate(r.tapThrough),
          },
        }))}
      />
    </Panel>
  );
}
