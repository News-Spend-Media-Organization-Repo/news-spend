import { scopeFor } from "@news-spend-media/analytics";
import type { ServerProps } from "payload";
import type { ReactNode } from "react";

import { ADMIN_PATH } from "../Analytics/access";
import { latestEntry } from "./entries";
import { NewMarker } from "./NewMarker";

/** A link to What's new, in the sidebar, for staff only. */
export function WhatsNewNavLink({ user }: ServerProps): ReactNode {
  if (scopeFor(user)?.kind !== "staff") {
    return null;
  }

  const newest = latestEntry();

  return (
    <a className="nav__link" href={`${ADMIN_PATH}/whats-new`}>
      <span className="nav__link-label">What&apos;s new</span>
      {newest ? (
        <NewMarker newestDate={newest.date} userId={String(user?.id ?? "")} />
      ) : null}
    </a>
  );
}
