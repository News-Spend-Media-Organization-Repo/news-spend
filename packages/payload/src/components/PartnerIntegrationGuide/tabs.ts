import type { DocumentTabConfig } from "payload";

import { scopeOfRequest } from "../Analytics/access";

const PATH = "@news-spend-media/payload/components/PartnerIntegrationGuide";

/** The Integration Guide tab on a partner. Staff see any partner's; a partner their own. */
export const partnerIntegrationGuideView = {
  Component: `${PATH}#PartnerIntegrationGuideView`,
  path: "/integration-guide" as const,
  tab: {
    label: "Integration Guide",
    href: "/integration-guide",
    condition: ({ req }) => scopeOfRequest(req) !== null,
  } satisfies DocumentTabConfig,
};
