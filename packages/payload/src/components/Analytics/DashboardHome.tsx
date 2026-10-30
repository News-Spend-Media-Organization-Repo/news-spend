import type { DashboardViewServerProps } from "@payloadcms/next/views";
import { DefaultDashboard } from "@payloadcms/next/views";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { ADMIN_PATH, scopeOfRequest } from "./access";

/**
 * The admin home page.
 *
 * A partner has one screen worth opening, their own Performance tab, so signing
 * in lands them there instead of on a dashboard they must click through. A
 * partner with no company assigned has no scope and no Performance tab, so
 * they keep the ordinary page rather than being sent to an address that refuses
 * them. Everyone else gets Payload's dashboard, unchanged.
 */
export function DashboardHome(props: DashboardViewServerProps): ReactNode {
  const scope = scopeOfRequest(props.initPageResult.req);
  if (scope?.kind === "partner") {
    redirect(
      `${ADMIN_PATH}/collections/partners/${scope.partnerId}/performance`
    );
  }
  return <DefaultDashboard {...props} />;
}
