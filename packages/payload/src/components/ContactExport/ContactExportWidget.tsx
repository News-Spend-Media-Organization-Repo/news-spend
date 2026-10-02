import { scopeFor } from "@news-spend-media/analytics";
import type { ServerProps, WidgetServerProps } from "payload";
import type { ReactNode } from "react";
import { countContacts } from "../../lib/users/contactExport";
import { scopeOfRequest } from "../Analytics/access";
import { Denied } from "../Analytics/ui";
import { ContactExportCard, type ContactExportTile } from "./ContactExportCard";

const WINDOWS = [30, 60, 90] as const;

async function renderCard(payload: ServerProps["payload"]): Promise<ReactNode> {
  const { total, inactive } = await countContacts(payload.db.drizzle, WINDOWS);

  const tiles: ContactExportTile[] = [
    { key: "all", label: "Everyone", count: total, days: 0 },
    ...WINDOWS.map((days) => ({
      key: String(days),
      label: `Not seen for ${days}+ days`,
      count: inactive[days] ?? 0,
      days,
    })),
  ];

  return <ContactExportCard tiles={tiles} total={total} />;
}

/**
 * Dashboard widget. Staff only: the list is personal data, and the endpoint
 * behind the links checks the role again, so a widget added by hand to
 * someone else's dashboard shows nothing and downloads nothing.
 */
export async function ContactExportWidget(
  props: WidgetServerProps
): Promise<ReactNode> {
  if (scopeOfRequest(props.req)?.kind !== "staff") {
    return <Denied />;
  }
  return renderCard(props.req.payload);
}

/**
 * The same card above the Users list. Unlike the widget it renders nothing for
 * anyone who is not staff, rather than a "no access" box on a page they are
 * otherwise allowed to use.
 */
export async function ContactExportPanel(
  props: ServerProps
): Promise<ReactNode> {
  if (scopeFor(props.user)?.kind !== "staff") {
    return null;
  }
  return (
    <div style={{ marginBottom: 16 }}>{await renderCard(props.payload)}</div>
  );
}
