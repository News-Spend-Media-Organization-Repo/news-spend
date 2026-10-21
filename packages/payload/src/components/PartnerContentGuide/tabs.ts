import type { DocumentTabConfig } from "payload";

import { isStaff } from "../../access/adminRoles";

const PATH = "@news-spend-media/payload/components/PartnerContentGuide";

/** The Guide tab on a partner-content item. Staff only: partners never see it. */
export const partnerContentGuideView = {
  Component: `${PATH}#PartnerContentGuideView`,
  path: "/guide" as const,
  tab: {
    label: "Guide",
    href: "/guide",
    condition: ({ req }) => isStaff({ req }),
  } satisfies DocumentTabConfig,
};
