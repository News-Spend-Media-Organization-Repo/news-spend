import { randomUUID } from "node:crypto";

import { type CollectionConfig, slugField } from "payload";
import {
  hasInternalsRole,
  isStaff,
  readOwnPartnerOrStaff,
} from "../access/adminRoles";
import { partnerPerformanceView } from "../components/Analytics/tabs";
import { partnerIntegrationGuideView } from "../components/PartnerIntegrationGuide/tabs";
import { IMAGE_ONLY } from "../fields/uploadMimeFilters";
import { urlField } from "../fields/urlField";

export const Partners: CollectionConfig = {
  slug: "partners",
  // A partner signs in to the admin panel and may see their own company
  // record, never another partner's or any edit to it.
  access: {
    read: readOwnPartnerOrStaff("id"),
    // A partner's integration setup decides how points are credited, so only
    // the roles trusted with the panel's internals may change it.
    create: hasInternalsRole,
    update: hasInternalsRole,
    delete: hasInternalsRole,
  },
  admin: {
    group: "Partners",
    useAsTitle: "companyName",
    defaultColumns: [
      "companyName",
      "status",
      "integrationMethod",
      "category",
      "contractSigned",
    ],
    components: {
      views: {
        edit: {
          performance: partnerPerformanceView,
          integrationGuide: partnerIntegrationGuideView,
        },
      },
    },
  },
  fields: [
    {
      name: "companyName",
      type: "text",
      required: true,
    },
    slugField({
      useAsSlug: "companyName",
      position: "sidebar",
      overrides(field) {
        return {
          ...field,
          admin: {
            ...field.admin,
            condition: () => process.env.NODE_ENV === "development",
          },
        };
      },
    }),
    {
      name: "description",
      type: "textarea",
    },
    urlField({
      name: "websiteUrl",
      required: true,
    }),
    {
      name: "status",
      type: "select",
      options: [
        { label: "Prospective", value: "prospective" },
        { label: "Active", value: "active" },
        { label: "Inactive", value: "inactive" },
      ],
      defaultValue: "prospective",
    },
    {
      name: "contractSigned",
      type: "checkbox",
      defaultValue: false,
    },
    {
      name: "inShopTab",
      type: "checkbox",
      defaultValue: true,
    },
    {
      name: "cashBack",
      type: "number",
      defaultValue: 0,
      admin: {
        description:
          "💡 Cashback is in percentage. For example, if the cashback is 5%, enter 5.",
        condition: (data) => data.inShopTab,
      },
    },
    {
      name: "popularityScore",
      type: "number",
      defaultValue: 0,
      index: true,
      admin: {
        description:
          "Auto-calculated popularity score based on views and clicks for the shop tab.",
        readOnly: true,
        position: "sidebar",
        condition: (data) => data.inShopTab,
      },
    },
    {
      name: "category",
      type: "select",
      options: [
        { label: "Books & Publishing", value: "books" },
        { label: "E-commerce", value: "ecommerce" },
        { label: "Education", value: "education" },
        { label: "Food & Delivery", value: "food" },
        { label: "Digital Services", value: "digital" },
        { label: "Business Services", value: "business" },
        { label: "Other", value: "other" },
      ],
    },
    {
      name: "logo",
      type: "upload",
      relationTo: "media",
      filterOptions: IMAGE_ONLY,
    },
    {
      name: "contactInfo",
      type: "group",
      fields: [
        {
          name: "contactPerson",
          type: "text",
        },
        {
          name: "email",
          type: "email",
        },
        {
          name: "phone",
          type: "text",
        },
      ],
    },
    {
      type: "collapsible",
      label: "CPA Integration",
      admin: {
        description: "Settings for CPA (Cost Per Action) tracking",
      },
      fields: [
        {
          name: "integrationMethod",
          type: "select",
          required: true,
          defaultValue: "manual",
          options: [
            { label: "📧 Manual (Email/Spreadsheet)", value: "manual" },
            { label: "🔗 Webhook / Postback URL", value: "webhook" },
            { label: "📁 CSV Upload", value: "csv" },
          ],
          admin: {
            description: "How will this partner send conversion data?",
          },
        },
        {
          name: "webhookUrl",
          type: "text",
          admin: {
            readOnly: true,
            description: "Share this URL with technical partners",
            condition: (data) =>
              data.integrationMethod === "webhook" ||
              data.integrationMethod === "postback",
          },
        },
        {
          name: "webhookSecret",
          type: "text",
          // Credentials, so staff only: a partner reading their own record
          // must not be handed the key that authenticates postbacks.
          access: { read: isStaff },
          admin: {
            description: "Secret key for webhook verification",
            condition: (data) =>
              data.integrationMethod === "webhook" ||
              data.integrationMethod === "postback",
          },
        },
        {
          name: "confirmationDays",
          type: "number",
          // Our own reconciliation setting; the partner is shown the postback
          // URL and method, not how long we wait on them.
          access: { read: isStaff },
          min: 1,
          max: 60,
          defaultValue: 7,
          admin: {
            description:
              "Days a conversion may stay unconfirmed before it is treated as stale",
          },
        },
        {
          name: "awardOnClick",
          label: "Count a click as a completed conversion",
          type: "checkbox",
          defaultValue: false,
          index: true,
          // An internal risk switch: staff only, so a partner cannot see that
          // their offers are being credited without a confirmed conversion.
          access: { read: isStaff },
          admin: {
            description:
              "ONLY for a partner that cannot post back yet. Points are credited and the Featured Offer counted the moment the link is opened, with nothing to confirm the user did anything. Turn it off the day their postback works. While it is on, this partner's offers are effectively free to complete.",
          },
        },
      ],
    },
  ],
  hooks: {
    beforeChange: [
      ({ data }) => {
        // Auto-generate webhook secret for webhook/postback partners
        if (
          (data.integrationMethod === "webhook" ||
            data.integrationMethod === "postback") &&
          !data.webhookSecret
        ) {
          data.webhookSecret = randomUUID().replace(/-/g, "");
        }

        // Auto-generate webhook URL.
        //
        // No partner-id segment: the mounted route is just
        // `/partner-conversions/webhook` (see partner-conversions.ts), and the
        // handler resolves which partner a postback belongs to from the
        // clickId in its body, not from the URL. An id segment here doesn't
        // exist as a real path and 404s if a partner posts to it literally.
        if (
          (data.integrationMethod === "webhook" ||
            data.integrationMethod === "postback") &&
          !data.webhookUrl
        ) {
          const baseUrl =
            process.env.NEXT_PUBLIC_API_URL || "https://api.newsspend.com";
          data.webhookUrl = `${baseUrl}/api/partner-conversions/webhook`;
        }

        return data;
      },
    ],
  },
};
