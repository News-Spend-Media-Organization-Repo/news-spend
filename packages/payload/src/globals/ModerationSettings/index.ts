import type { GlobalConfig } from "payload";

import {
  DEFAULT_AUTO_HIDE_THRESHOLD,
  REASON_OPTIONS,
} from "../../lib/moderationLabels";

/**
 * Central configuration for user-generated content moderation.
 *
 * Everything here has a code-level default, so an unconfigured install still
 * behaves correctly; the global raises the ceiling rather than being a
 * prerequisite. Leaving a field empty means "use the default"; see
 * lib/moderationSettings for how each one resolves.
 */
const ModerationSettings: GlobalConfig = {
  slug: "moderation-settings",
  admin: {
    group: "User Management",
  },
  access: {
    read: ({ req: { user } }) => user?.collection === "admins",
    update: ({ req: { user } }) => user?.collection === "admins",
  },
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Alert Recipients",
          description:
            "Who receives moderation email. An individual admin can still override this for themselves via the Moderation Alerts field on their own record.",
          fields: [
            {
              name: "alertRoles",
              type: "select",
              hasMany: true,
              options: [
                { label: "Super Admin", value: "super-admin" },
                { label: "Content Manager", value: "content-manager" },
                { label: "Editor", value: "editor" },
                { label: "Viewer", value: "viewer" },
              ],
              admin: {
                description:
                  "Roles that receive moderation email by default. Leave empty to use the built-in default (Super Admin and Content Manager). Partners never receive moderation email and cannot be added here.",
              },
            },
            {
              name: "additionalRecipients",
              type: "array",
              labels: { singular: "Address", plural: "Addresses" },
              fields: [
                {
                  name: "email",
                  type: "email",
                  required: true,
                },
                {
                  name: "tier",
                  type: "select",
                  defaultValue: "all",
                  options: [
                    { label: "All moderation email", value: "all" },
                    { label: "Urgent reports only", value: "urgent" },
                    { label: "Daily digest only", value: "digest" },
                  ],
                },
              ],
              admin: {
                description:
                  "Extra addresses that are not admin accounts, such as shared inboxes, on-call rotations, or outsourced moderators. Merged with anything in the MODERATION_ALERT_EMAILS env var.",
              },
            },
          ],
        },
        {
          label: "Automatic Actions",
          description:
            "How aggressively reported content is taken down before a human reviews it.",
          fields: [
            {
              name: "autoHideThreshold",
              type: "number",
              min: 1,
              max: 50,
              admin: {
                placeholder: String(DEFAULT_AUTO_HIDE_THRESHOLD),
                description: `Distinct reporters required before a comment is hidden pending review. Counts distinct people, so one user cannot bury a comment alone. Leave empty for the default (${DEFAULT_AUTO_HIDE_THRESHOLD}).`,
              },
            },
            {
              name: "hideOnFirstReportReasons",
              type: "select",
              hasMany: true,
              options: REASON_OPTIONS,
              admin: {
                description:
                  "Reasons that hide content immediately on a single report, bypassing the threshold above. Powerful: one report takes content down, so keep this to categories where waiting is indefensible. Leave empty for the default (Illegal Activity, Hate Speech, Explicit or Inappropriate Content).",
              },
            },
          ],
        },
        {
          label: "Urgent Alerts",
          description:
            "Which reports bypass the nightly digest and email moderators immediately.",
          fields: [
            {
              name: "urgentReasons",
              type: "select",
              hasMany: true,
              options: REASON_OPTIONS,
              admin: {
                description:
                  "Reasons that trigger an immediate alert instead of waiting for the nightly digest. Leave empty for the default (Illegal Activity, Hate Speech, Harassment, Explicit or Inappropriate Content).",
              },
            },
          ],
        },
      ],
    },
  ],
};

export default ModerationSettings;
