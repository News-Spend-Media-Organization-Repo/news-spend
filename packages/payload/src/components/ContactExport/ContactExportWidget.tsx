import type { WidgetServerProps } from "payload";
import type { ReactNode } from "react";

import { countContacts } from "../../lib/users/contactExport";
import { scopeOfRequest } from "../Analytics/access";
import { formatCount } from "../Analytics/format";
import { Denied, Panel, Styles } from "../Analytics/ui";

const WINDOWS = [30, 60, 90] as const;

const downloadHref = (days: number) =>
  days > 0
    ? `/api/users/export-contacts?inactiveDays=${days}`
    : "/api/users/export-contacts";

/**
 * Dashboard widget: how many registered users could be emailed, how many of
 * them have gone quiet, and a CSV download for each cut.
 *
 * Staff only. The list is personal data, and the endpoint behind the links
 * checks the role again, so a widget added by hand to someone else's dashboard
 * shows nothing and downloads nothing.
 */
export async function ContactExportWidget(
  props: WidgetServerProps
): Promise<ReactNode> {
  if (scopeOfRequest(props.req)?.kind !== "staff") {
    return <Denied />;
  }

  const { total, inactive } = await countContacts(
    props.req.payload.db.drizzle,
    WINDOWS
  );

  const rows: { label: string; count: number; days: number }[] = [
    { label: "Everyone with an email", count: total, days: 0 },
    ...WINDOWS.map((days) => ({
      label: `Not seen for ${days}+ days`,
      count: inactive[days] ?? 0,
      days,
    })),
  ];

  return (
    <>
      <Styles />
      <div className="ana">
        <Panel
          hint="Registered users only (guests have no address). Downloads names and emails as a CSV."
          title="Email list"
        >
          <table className="ana-table">
            <tbody>
              {rows.map((row) => (
                <tr key={row.days}>
                  <td>{row.label}</td>
                  <td data-align="right">{formatCount(row.count)}</td>
                  <td data-align="right">
                    <a download href={downloadHref(row.days)}>
                      Download CSV
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ana-sub" style={{ marginTop: 8 }}>
            "Seen" is the latest of the app's activity record, the newest login
            session and the sign-up date, so people who last used the app before
            activity was recorded are still placed correctly. The CSV says which
            one each date came from.
          </div>
        </Panel>
      </div>
    </>
  );
}
