import type { GlobalConfig } from "payload";

import { hasInternalsRole, isStaff } from "../../access/adminRoles";
import { DEFAULT_SHARE_MESSAGE, SHARE_LINK_TOKEN } from "../../lib/appSettings";

/**
 * Copy shown in the app that staff can change without a release.
 *
 * Every field has a code-level default in `lib/appSettings`, so an unsaved
 * global behaves as before. Changing it is limited to the roles trusted with
 * the panel's internals, because it reaches every user who shares the app.
 */
const AppSettings: GlobalConfig = {
  slug: "app-settings",
  label: "App Settings",
  admin: {
    group: "Settings",
  },
  access: {
    read: isStaff,
    update: hasInternalsRole,
  },
  fields: [
    {
      name: "shareMessage",
      label: "Share App message",
      type: "textarea",
      maxLength: 800,
      defaultValue: DEFAULT_SHARE_MESSAGE,
      admin: {
        rows: 6,
        description: `The invitation people send when they share the app by SMS, email, WhatsApp and the rest. Write ${SHARE_LINK_TOKEN} where the download link should go; if you leave it out, the link is added at the end. Leave the box empty to use the built-in message.`,
      },
    },
  ],
};

export default AppSettings;
