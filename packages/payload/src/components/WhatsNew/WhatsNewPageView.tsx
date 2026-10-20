import { scopeFor } from "@news-spend-media/analytics";
import type { AdminViewServerProps } from "payload";
import type { ReactNode } from "react";
import { PageFrame } from "../Analytics/PageFrame";
import { Denied, Panel, Styles } from "../Analytics/ui";
import { entries as allEntries, latestEntry } from "./entries";
import { RecordVisit } from "./RecordVisit";
import type { Entry } from "./types";

const formatDate = (date: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

function EntryDetails({ entry, open }: { entry: Entry; open: boolean }) {
  const meta = [
    formatDate(entry.date),
    entry.version ? `v${entry.version}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <details className="ana-card" open={open}>
      <summary>
        <span className="ana-muted">{meta}</span> <strong>{entry.title}</strong>
      </summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {entry.sections.map((section) => (
          <Panel key={section.heading} title={section.heading}>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {section.items.map((item, index) => (
                <li
                  key={`${section.heading}-${index}`}
                  style={{ marginTop: 4 }}
                >
                  {item}
                </li>
              ))}
            </ul>
          </Panel>
        ))}
        {entry.link ? <a href={entry.link.href}>{entry.link.label}</a> : null}
      </div>
    </details>
  );
}

/** The list itself, separated so the empty and long-list cases are testable. */
export function WhatsNewBody({ entries }: { entries: Entry[] }): ReactNode {
  if (entries.length === 0) {
    return <div className="ana-empty">Nothing new yet.</div>;
  }

  const years = [
    ...new Set(entries.map((entry) => entry.date.slice(0, 4))),
  ].sort((a, b) => b.localeCompare(a));
  const [newestYear, ...olderYears] = years;
  const current = entries.filter((entry) =>
    entry.date.startsWith(newestYear ?? "")
  );

  return (
    <>
      {current.map((entry, index) => (
        <EntryDetails entry={entry} key={entry.id} open={index < 5} />
      ))}
      {olderYears.map((year) => (
        <details className="ana-card" key={year}>
          <summary>
            <strong>{year}</strong>
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {entries
              .filter((entry) => entry.date.startsWith(year))
              .map((entry) => (
                <EntryDetails entry={entry} key={entry.id} open={false} />
              ))}
          </div>
        </details>
      ))}
    </>
  );
}

/** The staff-only What's new page, at /admin/whats-new. */
export function WhatsNewPageView(props: AdminViewServerProps): ReactNode {
  const { req } = props.initPageResult;

  if (scopeFor(req.user)?.kind !== "staff") {
    return (
      <PageFrame view={props}>
        <Denied />
      </PageFrame>
    );
  }

  const newest = latestEntry();

  return (
    <PageFrame view={props}>
      <Styles />
      <div className="ana ana-page">
        {newest ? (
          <RecordVisit
            newestDate={newest.date}
            userId={String(req.user?.id ?? "")}
          />
        ) : null}
        <div className="ana-head">
          <div>
            <h2>What&apos;s new</h2>
            <div className="ana-muted">Changes staff should know about.</div>
          </div>
        </div>
        <WhatsNewBody entries={allEntries} />
      </div>
    </PageFrame>
  );
}
