import { scopeFor } from "@news-spend-media/analytics";
import type { ServerProps } from "payload";
import type { ReactNode } from "react";

import { ADMIN_PATH } from "./access";

/**
 * A link to the full analytics page, in the sidebar. Staff get the news
 * dashboard; a partner gets their own Performance tab.
 */
export function AnalyticsNavLink({ user }: ServerProps): ReactNode {
  const scope = scopeFor(user);
  if (!scope) {
    return null;
  }
  const href =
    scope.kind === "partner"
      ? `${ADMIN_PATH}/collections/partners/${scope.partnerId}/performance`
      : `${ADMIN_PATH}/analytics`;
  return (
    <a className="nav__link" href={href}>
      <span className="nav__link-label">
        {scope.kind === "partner" ? "Performance" : "Analytics"}
      </span>
    </a>
  );
}

/** A link to the survey provider page, for staff only. */
export function SurveyNavLink({ user }: ServerProps): ReactNode {
  if (scopeFor(user)?.kind !== "staff") {
    return null;
  }
  return (
    <a className="nav__link" href={`${ADMIN_PATH}/survey-performance`}>
      <span className="nav__link-label">Survey performance</span>
    </a>
  );
}
