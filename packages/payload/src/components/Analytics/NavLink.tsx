import { scopeFor } from "@news-spend-media/analytics";
import type { ServerProps } from "payload";
import type { ReactNode } from "react";

import { ADMIN_PATH } from "./access";

/** A link to the full analytics page, in the sidebar, for staff only. */
export function AnalyticsNavLink({ user }: ServerProps): ReactNode {
  if (scopeFor(user)?.kind !== "staff") {
    return null;
  }
  return (
    <a className="nav__link" href={`${ADMIN_PATH}/analytics`}>
      <span className="nav__link-label">Analytics</span>
    </a>
  );
}
