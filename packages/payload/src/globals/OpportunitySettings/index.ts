import type { GlobalConfig } from "payload";
import { adminOnly } from "../../access/hasRole";
import { canonicalize } from "../../opportunities/engine";

export const OpportunitySettings: GlobalConfig = {
  slug: "opportunity-settings",
  label: "For You Settings",
  admin: { group: "For You" },
  access: { read: adminOnly, update: adminOnly },
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Recommendations",
          fields: [
            {
              name: "personalizedShare",
              type: "number",
              defaultValue: 80,
              min: 0,
              max: 100,
              required: true,
              admin: {
                description:
                  "Target percentage over time; the remainder is discovery, not a fixed card sequence.",
              },
            },
            {
              name: "featuredBoost",
              type: "number",
              defaultValue: 8,
              min: 0,
              max: 30,
              required: true,
            },
            {
              name: "candidateLimit",
              type: "number",
              defaultValue: 1000,
              min: 100,
              max: 5000,
              required: true,
              admin: {
                description:
                  "Bounded ranking pool; use indexed category filters for larger catalogs.",
              },
            },
          ],
        },
        {
          label: "Sources and alerts",
          fields: [
            {
              name: "sourceDiscoveryEnabled",
              type: "checkbox",
              defaultValue: true,
            },
            {
              name: "minimumSourceQuality",
              type: "number",
              defaultValue: 60,
              min: 0,
              max: 100,
              required: true,
              admin: {
                description:
                  "Minimum feed-quality score for discovered sources. New domains still require staff ownership/trust review.",
              },
            },
            {
              name: "dailyDigestEnabled",
              type: "checkbox",
              defaultValue: true,
            },
            {
              name: "digestIntervalHours",
              type: "number",
              defaultValue: 24,
              min: 1,
              max: 168,
              required: true,
            },
          ],
        },
        {
          label: "Live",
          fields: [
            { name: "liveEnabled", type: "checkbox", defaultValue: false },
            {
              name: "liveTitle",
              type: "text",
              defaultValue: "NewsSpend Live",
              required: true,
            },
            { name: "liveDescription", type: "textarea" },
            {
              name: "liveStreamUrl",
              type: "text",
              admin: {
                description:
                  "An authorized public HTTPS HLS or video URL. No stream is fabricated when empty.",
              },
              validate: (value: unknown) => {
                if (!value) {
                  return true;
                }
                try {
                  canonicalize(String(value));
                  return true;
                } catch {
                  return "Enter a public HTTPS stream URL without credentials";
                }
              },
            },
          ],
        },
      ],
    },
  ],
};
