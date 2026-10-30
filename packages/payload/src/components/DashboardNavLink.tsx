import { scopeFor } from "@news-spend-media/analytics";
import type { ServerProps } from "payload";
import type { ReactNode } from "react";

import { ADMIN_PATH } from "./Analytics/access";

/**
 * The admin home page, in the sidebar.
 *
 * The logo in the header is only a link when the page sets a breadcrumb, and
 * custom pages do not, so this is the one way back from every screen. A partner's home is their
 * Performance tab, which has its own link, so they are not shown this one.
 */
export function DashboardNavLink({ user }: ServerProps): ReactNode {
  if (!user || scopeFor(user)?.kind === "partner") {
    return null;
  }
  return (
    <a className="nav__link" href={ADMIN_PATH}>
      <span className="nav__link-label">Dashboard</span>
    </a>
  );
}
