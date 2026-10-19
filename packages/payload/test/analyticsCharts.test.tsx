import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { hasData, trendRows } from "../src/components/Analytics/charts/rows";
import { DayChart, SERIES_COLORS } from "../src/components/Analytics/ui";

const html = (node: unknown) => renderToStaticMarkup(node as never);

const SERIES = [
  { key: "views", label: "Views", color: SERIES_COLORS.deep },
  { key: "reads", label: "Reads", color: SERIES_COLORS.gold },
];

const days = (n: number, value = (i: number) => i + 1) =>
  Array.from({ length: n }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, "0")}`,
    views: value(i),
    reads: Math.floor(value(i) / 2),
  }));

describe("trendRows", () => {
  it("gives one row per day and series, in day order", () => {
    const rows = trendRows(days(3), SERIES);

    expect(rows).toHaveLength(6);
    expect(rows.map((r) => `${r.date}:${r.series}`)).toEqual([
      "2026-10-01:views",
      "2026-10-01:reads",
      "2026-10-02:views",
      "2026-10-02:reads",
      "2026-10-03:views",
      "2026-10-03:reads",
    ]);
  });

  it("treats a missing, NaN or non-numeric value as zero", () => {
    const rows = trendRows(
      [
        { date: "2026-10-01", views: Number.NaN },
        { date: "2026-10-02", views: "lots", reads: "7" },
      ],
      SERIES
    );

    expect(rows.map((r) => r.value)).toEqual([0, 0, 0, 7]);
  });
});

describe("hasData", () => {
  it("is false for nothing and for all zeros", () => {
    expect(hasData([])).toBe(false);
    expect(hasData([{ value: 0 }, { value: 0 }])).toBe(false);
    expect(hasData([{ value: 0 }, { value: 3 }])).toBe(true);
  });
});

describe("DayChart", () => {
  it("draws an accessible SVG chart with a legend, not CSS bars", () => {
    const out = html(<DayChart days={days(14)} series={SERIES} />);

    expect(out).toContain("<svg");
    expect(out).toContain('role="img"');
    expect(out).toContain("Daily activity chart");
    expect(out).toContain("Views");
    expect(out).toContain("Reads");
    expect(out.match(/<rect/g)?.length ?? 0).toBeGreaterThanOrEqual(14);
    expect(out).not.toContain("ana-day");
    expect(out).not.toContain("<script");
  });

  it("uses the label it is given", () => {
    const out = html(
      <DayChart days={days(7)} label="Tickets by day" series={SERIES} />
    );

    expect(out).toContain("Tickets by day");
  });

  it("says nothing was recorded, rather than drawing an empty chart", () => {
    const out = html(<DayChart days={days(7, () => 0)} series={SERIES} />);

    expect(out).toContain("Nothing recorded in this period.");
    expect(out).not.toContain("<svg");
  });

  it("still draws something for a one-day period", () => {
    const out = html(<DayChart days={days(1, () => 5)} series={SERIES} />);

    expect(out).toContain("<svg");
    expect(out).toMatch(/<rect|<path/);
  });

  it("draws line and area kinds", () => {
    for (const kind of ["line", "area"] as const) {
      const out = html(
        <DayChart days={days(10)} kind={kind} series={SERIES} />
      );

      expect(out).toContain("<svg");
      expect(out).toContain("<path");
    }
  });
});
