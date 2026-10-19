import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { hasData, trendRows } from "../src/components/Analytics/charts/rows";
import { Bars, DayChart, SERIES_COLORS } from "../src/components/Analytics/ui";

const SHAPE = /<rect|<path/;
const HEIGHT = /height:(\d+)px/;
const TEXT = /<text[^>]*>([^<]*)<\/text>/g;

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
    expect(out).toMatch(SHAPE);
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

describe("Bars", () => {
  const rows = [
    { label: "Energy", value: 120 },
    { label: "Sports", value: 80, display: "80 views" },
    { label: "Politics", value: 5 },
  ];
  const heightOf = (out: string) => Number(out.match(HEIGHT)?.[1] ?? 0);

  it("draws an accessible SVG bar chart with every label, not CSS tracks", () => {
    const out = html(<Bars label="Views by category" rows={rows} />);

    expect(out).toContain("<svg");
    expect(out).toContain('role="img"');
    expect(out).toContain("Views by category");
    for (const r of rows) {
      expect(out).toContain(r.label);
    }
    expect(out).not.toContain("ana-track");
    expect(out).not.toContain("<script");
  });

  it("shows the display text beside a bar when it has one, and the count when not", () => {
    const out = html(<Bars rows={rows} />);

    expect(out).toContain("80 views");
    expect(out).toContain(">120<");
  });

  it("says nothing was recorded, rather than drawing empty bars", () => {
    const out = html(
      <Bars empty="Nothing here." rows={[{ label: "Energy", value: 0 }]} />
    );

    expect(out).toContain("Nothing here.");
    expect(out).not.toContain("<svg");
  });

  it("grows with the number of rows", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      label: `Row ${i}`,
      value: 50 - i,
    }));

    const small = heightOf(html(<Bars rows={many.slice(0, 5)} />));
    const large = heightOf(html(<Bars rows={many} />));

    expect(small).toBeGreaterThan(0);
    expect(large).toBeGreaterThan(small * 5);
  });

  it("shortens a very long label in the plot", () => {
    const long = "A".repeat(120);

    const out = html(<Bars rows={[{ label: long, value: 3 }]} />);
    const visible = [...out.matchAll(TEXT)].map((m) => m[1] ?? "");

    expect(out).toContain("<svg");
    expect(visible.some((t) => t.endsWith("…"))).toBe(true);
    expect(visible.every((t) => t.length <= 30)).toBe(true);
  });
});
