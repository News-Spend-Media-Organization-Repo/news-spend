import type { DocumentTabConfig } from "payload";

import { scopeOfRequest } from "../Analytics/access";

const PATH = "@news-spend-media/payload/components/GiveawaySetupGuide";

/**
 * The Setup Guide tab on a giveaway. Visible to staff, beside the form it
 * explains, so an operator setting up their first giveaway meets the
 * instructions at the moment they need them rather than in a video
 * somewhere else. The view checks again, because a tab that is not shown
 * is still reachable by its address.
 */
export const giveawaySetupGuideView = {
  Component: `${PATH}#GiveawaySetupGuideView`,
  path: "/setup-guide" as const,
  tab: {
    label: "Setup Guide",
    href: "/setup-guide",
    condition: ({ req }) => scopeOfRequest(req)?.kind === "staff",
  } satisfies DocumentTabConfig,
};
