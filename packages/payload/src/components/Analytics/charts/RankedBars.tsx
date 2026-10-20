"use client";

import { barX, defineChart, text } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { useMemo } from "react";

import { formatCount } from "../chartFormat";

export type RankedRow = { label: string; value: number; display?: string };

const ROW_HEIGHT = 28;
const INITIAL_WIDTH = 300;
const LABEL_LIMIT = 26;

const shorten = (label: string): string =>
  label.length > LABEL_LIMIT ? `${label.slice(0, LABEL_LIMIT - 1)}…` : label;

/**
 * Horizontal bars, largest first as given. Labels are shortened in the plot and
 * shown whole in the tooltip. Takes plain rows because a chart definition
 * holds functions and cannot be passed from a server component.
 */
export function RankedBars({
  rows,
  ariaLabel,
}: {
  rows: RankedRow[];
  ariaLabel: string;
}) {
  const definition = useMemo(() => {
    const shown = (row: RankedRow) => row.display ?? formatCount(row.value);
    // Each row gets its own slot, so rows that share a label stay separate
    // bars instead of stacking into one.
    const slots = rows.map((row, slot) => ({ ...row, slot: String(slot) }));

    return defineChart({
      marks: [
        barX(slots, {
          x: "value",
          y: "slot",
          fill: "var(--ana-accent)",
          radius: 3,
        }),
        text(slots, {
          x: "value",
          y: "slot",
          text: shown,
          anchor: "start",
          dx: 6,
        }),
      ],
      scales: {
        y: {
          scale: () => scaleBand<string>().padding(0.35),
          axis: {
            ticks: {
              format: (value: string) =>
                shorten(rows[Number(value)]?.label ?? ""),
            },
          },
        },
        x: { scale: scaleLinear, nice: true, axis: false },
      },
      tooltip: {
        use: tooltip,
        format: (point) => `${point.datum.label}: ${shown(point.datum)}`,
      },
    });
  }, [rows]);

  return (
    <Chart
      ariaLabel={ariaLabel}
      definition={definition}
      height={Math.max(ROW_HEIGHT, ROW_HEIGHT * rows.length)}
      initialWidth={INITIAL_WIDTH}
    />
  );
}
