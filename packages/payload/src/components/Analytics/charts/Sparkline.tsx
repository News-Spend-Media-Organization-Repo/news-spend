"use client";

import { defineChart, lineY } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { useMemo } from "react";

const HEIGHT = 24;
const INITIAL_WIDTH = 160;

/**
 * A line with no axes, grid or tooltip: the shape of a series beside a figure.
 * Takes plain numbers because a chart definition holds functions and cannot be
 * passed from a server component.
 */
export function Sparkline({
  values,
  ariaLabel,
}: {
  values: number[];
  ariaLabel: string;
}) {
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          lineY(
            values.map((value, index) => ({ index, value })),
            {
              x: "index",
              y: "value",
              stroke: "var(--ana-accent)",
              strokeWidth: 1.75,
            }
          ),
        ],
        scales: {
          x: { scale: scaleLinear, axis: false },
          y: { scale: scaleLinear, nice: true, axis: false },
        },
      }),
    [values]
  );

  return (
    <Chart
      ariaLabel={ariaLabel}
      definition={definition}
      height={HEIGHT}
      initialWidth={INITIAL_WIDTH}
    />
  );
}
