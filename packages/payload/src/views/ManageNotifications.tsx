import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import { redirect } from "next/navigation";
import type { AdminViewServerProps } from "payload";

import { NotificationDashboard } from "../components/NotificationDashboard";

export function ManageNotifications({
  initPageResult,
  params,
  searchParams,
}: AdminViewServerProps) {
  const {
    req: { user, payload },
  } = initPageResult;

  if (!user) {
    redirect("/admin/login?redirect=/admin/manage-notifications");
  }

  return (
    <DefaultTemplate
      i18n={initPageResult.req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={initPageResult.req.payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={initPageResult.req.user || undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter className="twp">
        <NotificationDashboard />
      </Gutter>
    </DefaultTemplate>
  );
}
