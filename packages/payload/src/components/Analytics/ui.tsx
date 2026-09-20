import type { ReactNode } from "react";

import type { Change } from "./format";
import { formatCount, formatDay } from "./format";

/**
 * Presentation for the analytics screens. Server-rendered, no client code: the
 * charts are plain markup, so nothing here needs a script and nothing can go
 * out of step with the data it was rendered from.
 *
 * Colours come from Payload's theme variables so light and dark both work; the
 * two accents are fixed because they read on either.
 */

const NAVY = "#5E7FB3";
const DEEP = "#10264A";
const GOLD = "#D9A23B";

const CSS = `
.ana{display:flex;flex-direction:column;gap:16px;font-size:14px;color:var(--theme-text)}
.ana *{box-sizing:border-box}
.ana-page{padding:0 var(--gutter-h,48px) 48px}
.ana-head{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:flex-end}
.ana-head h2{margin:0 0 4px;font-size:22px}
.ana-muted{color:var(--theme-elevation-600);font-size:13px}
.ana-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ana-seg{display:flex;gap:2px;padding:3px;border:1px solid var(--theme-elevation-150);border-radius:9px;background:var(--theme-elevation-0)}
.ana-seg a{padding:5px 11px;border-radius:7px;color:var(--theme-text);text-decoration:none;font-size:13px}
.ana-seg a[aria-current=true]{background:${DEEP};color:#fff}
.ana-grid{display:grid;gap:16px}
.ana-kpis{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.ana-two{grid-template-columns:2fr 1fr}
.ana-even{grid-template-columns:1fr 1fr}
@media(max-width:900px){.ana-two,.ana-even{grid-template-columns:1fr}}
.ana-card{border:1px solid var(--theme-elevation-150);border-radius:12px;background:var(--theme-elevation-0);padding:18px;display:flex;flex-direction:column;gap:12px;min-width:0}
.ana-card h3{margin:0;font-size:15px}
.ana-cardhead{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
.ana-tag{font-size:11px;font-weight:500;border-radius:999px;padding:2px 8px;white-space:nowrap}
.ana-tag[data-kind=observed]{background:rgba(21,127,59,.15);color:#3ea262}
.ana-tag[data-kind=reported]{background:rgba(94,127,179,.2);color:${NAVY}}
.ana-kpi-value{font-size:28px;font-weight:700;line-height:1.1}
.ana-delta{font-size:13px;font-weight:600}
.ana-delta[data-tone=up]{color:#3ea262}
.ana-delta[data-tone=down]{color:#d0473c}
.ana-delta[data-tone=flat]{color:var(--theme-elevation-500)}
.ana-chart{display:flex;align-items:flex-end;gap:3px;height:150px}
.ana-day{flex:1;display:flex;align-items:flex-end;justify-content:center;gap:1px;height:100%;min-width:0}
.ana-day span{flex:1;border-radius:2px 2px 0 0;min-height:0}
.ana-axis{display:flex;justify-content:space-between;color:var(--theme-elevation-500);font-size:11px}
.ana-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--theme-elevation-600)}
.ana-dot{display:inline-block;width:8px;height:8px;border-radius:999px;margin-right:5px}
.ana-bar{display:flex;flex-direction:column;gap:4px}
.ana-bar-top{display:flex;justify-content:space-between;gap:8px}
.ana-track{height:7px;border-radius:999px;background:var(--theme-elevation-100);overflow:hidden}
.ana-fill{height:100%;background:${NAVY}}
.ana-table{width:100%;border-collapse:collapse}
.ana-table th{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--theme-elevation-500);text-align:left;padding:0 8px 8px 0}
.ana-table td{padding:8px 8px 8px 0;border-top:1px solid var(--theme-elevation-100);vertical-align:top}
.ana-table [data-align=right]{text-align:right}
.ana-table a{color:inherit;text-decoration:none;font-weight:500}
.ana-table a:hover{text-decoration:underline}
.ana-sub{color:var(--theme-elevation-500);font-size:12px}
.ana-notice{border:1px solid rgba(217,162,59,.5);background:rgba(217,162,59,.12);border-radius:10px;padding:10px 14px;font-size:13px}
.ana-pill{display:inline-block;border-radius:999px;padding:2px 9px;font-size:12px;font-weight:500;background:var(--theme-elevation-100)}
.ana-pill[data-tone=ok]{background:rgba(21,127,59,.15);color:#3ea262}
.ana-pill[data-tone=warn]{background:rgba(217,162,59,.2);color:#c58a1c}
.ana-pill[data-tone=bad]{background:rgba(208,71,60,.15);color:#d0473c}
.ana-empty{color:var(--theme-elevation-500);padding:14px 0;text-align:center}
`;

export function Styles(): ReactNode {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant stylesheet defined in this file.
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}

export function Panel({
  title,
  hint,
  tag,
  children,
}: {
  title: string;
  hint?: string;
  tag?: "observed" | "reported";
  children: ReactNode;
}): ReactNode {
  return (
    <section className="ana-card">
      <div className="ana-cardhead">
        <div>
          <h3>{title}</h3>
          {hint ? <div className="ana-muted">{hint}</div> : null}
        </div>
        {tag ? <TrustTag kind={tag} /> : null}
      </div>
      {children}
    </section>
  );
}

export function TrustTag({
  kind,
}: {
  kind: "observed" | "reported";
}): ReactNode {
  return (
    <span className="ana-tag" data-kind={kind}>
      {kind === "observed" ? "Observed" : "Reported"}
    </span>
  );
}

export function Kpi({
  label,
  value,
  change,
  note,
  tag,
}: {
  label: string;
  value: string;
  change?: Change;
  note?: string;
  tag?: "observed" | "reported";
}): ReactNode {
  return (
    <div className="ana-card">
      <div className="ana-cardhead">
        <span className="ana-muted">{label}</span>
        {tag ? <TrustTag kind={tag} /> : null}
      </div>
      <div className="ana-kpi-value">{value}</div>
      <div>
        {change ? (
          <span className="ana-delta" data-tone={change.tone}>
            {change.text}{" "}
          </span>
        ) : null}
        {note ? <span className="ana-sub">{note}</span> : null}
      </div>
    </div>
  );
}

export type Series = { key: string; label: string; color: string };

export const SERIES_COLORS = { pale: "#B9C7E0", deep: DEEP, gold: GOLD };

/** Bars per day, one per series, scaled together so they compare honestly. */
export function DayChart({
  days,
  series,
}: {
  days: ({ date: string } & Record<string, number | string>)[];
  series: Series[];
}): ReactNode {
  const max = Math.max(
    1,
    ...days.flatMap((d) => series.map((s) => Number(d[s.key] ?? 0)))
  );
  const first = days[0]?.date;
  const last = days.at(-1)?.date;

  return (
    <div>
      <div className="ana-legend">
        {series.map((s) => (
          <span key={s.key}>
            <i className="ana-dot" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div aria-label="Daily activity chart" className="ana-chart" role="img">
        {days.map((d) => (
          <div
            className="ana-day"
            key={d.date}
            title={`${formatDay(d.date)}: ${series
              .map((s) => `${s.label} ${formatCount(Number(d[s.key] ?? 0))}`)
              .join(", ")}`}
          >
            {series.map((s) => {
              const value = Number(d[s.key] ?? 0);
              return (
                <span
                  key={s.key}
                  style={{
                    height: `${value === 0 ? 0 : Math.max((value / max) * 100, 2)}%`,
                    background: s.color,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="ana-axis">
        <span>{first ? formatDay(first) : ""}</span>
        <span>{last ? formatDay(last) : ""}</span>
      </div>
    </div>
  );
}

/** Labelled horizontal bars, each as a share of the largest. */
export function Bars({
  rows,
  empty = "Nothing recorded in this period.",
}: {
  rows: { label: string; value: number; display?: string }[];
  empty?: string;
}): ReactNode {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.every((r) => r.value === 0)) {
    return <div className="ana-empty">{empty}</div>;
  }
  return (
    <>
      {rows.map((r) => (
        <div className="ana-bar" key={r.label}>
          <div className="ana-bar-top">
            <span>{r.label}</span>
            <span className="ana-muted">
              {r.display ?? formatCount(r.value)}
            </span>
          </div>
          <div className="ana-track">
            <div
              className="ana-fill"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </>
  );
}

export type Column = { key: string; label: string; align?: "right" };

export function DataTable({
  columns,
  rows,
  empty,
}: {
  columns: Column[];
  rows: { key: string; cells: Record<string, ReactNode> }[];
  empty: string;
}): ReactNode {
  if (rows.length === 0) {
    return <div className="ana-empty">{empty}</div>;
  }
  return (
    <table className="ana-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th data-align={c.align} key={c.key}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            {columns.map((c) => (
              <td data-align={c.align} key={c.key}>
                {r.cells[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Notices({
  notices,
}: {
  notices: { id: string; message: string }[];
}): ReactNode {
  return (
    <>
      {notices.map((n) => (
        <div className="ana-notice" key={n.id}>
          {n.message}
        </div>
      ))}
    </>
  );
}

type Link = { label: string; href: string; current: boolean };

/** A row of links that behaves like a toggle, so the choice lives in the URL. */
export function Segmented({ links }: { links: Link[] }): ReactNode {
  return (
    <nav className="ana-seg">
      {links.map((l) => (
        <a aria-current={l.current} href={l.href} key={l.label}>
          {l.label}
        </a>
      ))}
    </nav>
  );
}

/** Shown in place of a report the viewer may not see. */
export function Denied(): ReactNode {
  return (
    <>
      <Styles />
      <div className="ana">
        <Panel
          hint="This report is not available to your account."
          title="No access"
        >
          <div className="ana-empty">
            Ask a super admin if you think you should be able to see it.
          </div>
        </Panel>
      </div>
    </>
  );
}

/** Shown when a request was refused as malformed, such as a bad id in a URL. */
export function Problem({ message }: { message: string }): ReactNode {
  return (
    <>
      <Styles />
      <div className="ana">
        <Panel hint={message} title="Can't show this report">
          <div className="ana-empty">Check the address and try again.</div>
        </Panel>
      </div>
    </>
  );
}
