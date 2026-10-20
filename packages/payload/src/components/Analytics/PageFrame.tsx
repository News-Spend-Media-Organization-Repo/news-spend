import { DefaultTemplate } from "@payloadcms/next/templates";
import type { AdminViewServerProps } from "payload";
import type { ReactNode } from "react";

/**
 * The admin chrome for a custom root view.
 *
 * Payload renders a custom root view with no template unless the view wraps
 * itself, so without this the analytics pages have no sidebar or header.
 * Document views (the Stats tabs) already sit inside a document template and
 * must not use this.
 */
export function PageFrame({
  view,
  children,
}: {
  view: AdminViewServerProps;
  children: ReactNode;
}): ReactNode {
  const { initPageResult, params, searchParams } = view;
  const { req } = initPageResult;

  return (
    <DefaultTemplate
      className="analytics"
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={req.payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={req.user || undefined}
      // A fresh plain object, not the read-only one Payload handed us: React
      // 19 throws "Cannot assign to read only property" otherwise.
      visibleEntities={{
        collections: initPageResult.visibleEntities?.collections,
        globals: initPageResult.visibleEntities?.globals,
      }}
    >
      {children}
    </DefaultTemplate>
  );
}
