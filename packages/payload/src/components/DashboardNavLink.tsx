import type { ServerProps } from "payload";
import type { ReactNode } from "react";

import { ADMIN_PATH } from "./Analytics/access";

/**
 * The admin home page, in the sidebar.
 *
 * The logo in the header is only a link when the page sets a breadcrumb, and
 * custom pages do not, so this is the one way back from every screen.
 */
export function DashboardNavLink({ user }: ServerProps): ReactNode {
  if (!user) {
    return null;
  }
  return (
    <a className="nav__link" href={ADMIN_PATH}>
      <span className="nav__link-label">Dashboard</span>
    </a>
  );
}
