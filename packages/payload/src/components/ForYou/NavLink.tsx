import { scopeFor } from "@news-spend-media/analytics";
import type { ServerProps } from "payload";
import type { ReactNode } from "react";

export function ForYouMonitoringNavLink({ user }: ServerProps): ReactNode {
  if (scopeFor(user)?.kind !== "staff") {
    return null;
  }

  return (
    <a className="nav__link" href="/admin/for-you">
      <span className="nav__link-label">For You monitoring</span>
    </a>
  );
}
