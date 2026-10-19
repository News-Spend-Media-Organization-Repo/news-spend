"use client";

import { areaY, barY, defineChart, group, lineY } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { useMemo } from "react";

import { formatCount, formatDay } from "../format";
import type { Series } from "../ui";
import type { TrendRow } from "./rows";

export type TrendKind = "bar" | "line" | "area";

const HEIGHT = 150;
const INITIAL_WIDTH = 600;

/**
 * Daily activity, one series per colour. Rendered to SVG on the server and
 * adopted by the browser, which adds the tooltip and keyboard focus.
 *
 * Takes plain rows because a chart definition holds functions and cannot be
 * passed from a server component; it is built here instead.
 */
export function TrendChart({
  rows,
  series,
  kind = "bar",
  ariaLabel,
}: {
  rows: TrendRow[];
  series: Series[];
  kind?: TrendKind;
  ariaLabel: string;
}) {
  const definition = useMemo(() => {
    const color = new Map(series.map((s) => [s.key, s.color]));
    const label = new Map(series.map((s) => [s.key, s.label]));
    const paint = (row: TrendRow) => color.get(row.series) ?? "currentColor";
    const channels = { x: "date", y: "value", z: "series" } as const;

    const mark =
      kind === "line"
        ? lineY(rows, { ...channels, stroke: paint })
        : kind === "area"
          ? areaY(rows, { ...channels, fill: paint, fillOpacity: 0.35 })
          : barY(rows, {
              ...channels,
              fill: paint,
              layout: group({ padding: 0.1 }),
            });

    return defineChart({
      marks: [mark],
      scales: {
        x: {
          scale: () => scaleBand<string>().padding(0.15),
          axis: { ticks: { format: (value: string) => formatDay(value) } },
        },
        y: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          axis: { ticks: { format: (value: number) => formatCount(value) } },
        },
      },
      tooltip: {
        use: tooltip,
        formatGroup: (points) =>
          [
            formatDay(String(points[0]?.xValue ?? "")),
            ...points.map(
              (point) =>
                `${label.get(point.datum.series) ?? point.datum.series}: ${formatCount(point.datum.value)}`
            ),
          ].join("\n"),
      },
    });
  }, [rows, series, kind]);

  return (
    <Chart
      ariaLabel={ariaLabel}
      definition={definition}
      height={HEIGHT}
      initialWidth={INITIAL_WIDTH}
    />
  );
}
