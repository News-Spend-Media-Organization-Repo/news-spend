import type { Access, CollectionConfig, Field } from "payload";
import { adminOnly } from "../access/hasRole";
import { guardReferencedDelete } from "../hooks/guardReferencedDelete";
import { canonicalize, duplicateIdentity } from "../opportunities/engine";

const staffAccess = {
  create: adminOnly,
  read: adminOnly,
  update: adminOnly,
  delete: adminOnly,
};
const ownerRead: Access = ({ req }) => {
  if (req.user?.collection === "admins" && req.user.role === "super-admin") {
    return true;
  }
  return req.user ? { user: { equals: req.user.id } } : false;
};
const privateAccess = { ...staffAccess, read: ownerRead };
const userField: Field = {
  name: "user",
  type: "relationship",
  relationTo: "users",
  required: true,
  index: true,
};
const opportunityField: Field = {
  name: "opportunity",
  type: "relationship",
  relationTo: "opportunities",
  required: true,
  index: true,
};
const group = "For You";

export const opportunityCollections: CollectionConfig[] = [
  {
    slug: "opportunity-interests",
    admin: { group, useAsTitle: "label" },
    access: staffAccess,
    fields: [
      { name: "key", type: "text", required: true, unique: true },
      { name: "label", type: "text", required: true },
      { name: "preferences", type: "json", required: true, defaultValue: [] },
      { name: "active", type: "checkbox", defaultValue: true, required: true },
    ],
  },
  {
    slug: "opportunity-sources",
    hooks: { beforeDelete: [guardReferencedDelete("opportunity_sources")] },
    admin: {
      group,
      useAsTitle: "title",
      defaultColumns: [
        "title",
        "status",
        "trust",
        "lastFetchedAt",
        "lastError",
      ],
    },
    access: staffAccess,
    fields: [
      { name: "title", type: "text", required: true },
      {
        name: "feedUrl",
        type: "text",
        required: true,
        unique: true,
        validate: (value: unknown) => {
          try {
            canonicalize(String(value));
            return true;
          } catch {
            return "Enter an HTTPS feed URL without credentials";
          }
        },
      },
      {
        name: "status",
        type: "select",
        options: ["pending", "approved", "rejected", "paused"],
        defaultValue: "pending",
        required: true,
      },
      {
        name: "trust",
        type: "select",
        options: ["official", "verified", "unverified"],
        defaultValue: "unverified",
        required: true,
      },
      { name: "category", type: "text", required: true },
      {
        name: "qualityOverride",
        type: "number",
        min: 0,
        max: 100,
        admin: {
          description:
            "Optional staff override. Ingestion never changes this value.",
        },
      },
      {
        name: "ownershipReview",
        type: "select",
        options: [
          "unreviewed",
          "official-domain",
          "publisher-confirmed",
          "rejected",
        ],
        defaultValue: "unreviewed",
        required: true,
        admin: {
          description:
            "Record the ownership assessment before assigning an official or verified label.",
        },
      },
      { name: "reviewNotes", type: "textarea" },
      {
        name: "qualityScore",
        type: "number",
        min: 0,
        max: 100,
        admin: {
          readOnly: true,
          description:
            "Feed quality signal, not proof of ownership. Official/verified source labels require staff review.",
        },
      },
      { name: "lastValidatedAt", type: "date", admin: { readOnly: true } },
      { name: "lastFetchedAt", type: "date", admin: { readOnly: true } },
      { name: "lastError", type: "text", admin: { readOnly: true } },
      {
        name: "itemsImported",
        type: "number",
        defaultValue: 0,
        admin: { readOnly: true },
      },
    ],
  },
  {
    slug: "opportunities",
    hooks: {
      beforeDelete: [guardReferencedDelete("opportunities")],
      beforeValidate: [
        ({ data, originalDoc }) => {
          if (!data) {
            return data;
          }
          const merged = { ...originalDoc, ...data };
          const categoryKeys = [
            ...new Set(
              [
                merged.category,
                ...(Array.isArray(merged.categories)
                  ? merged.categories.filter(
                      (key: unknown): key is string => typeof key === "string"
                    )
                  : []),
              ].filter(
                (key): key is string =>
                  typeof key === "string" && key.length > 0
              )
            ),
          ];
          return {
            ...data,
            categoryKeys: `|${categoryKeys.join("|")}|`,
            duplicateKey: duplicateIdentity({
              title: String(merged.title ?? ""),
              category: String(merged.category ?? ""),
              location: String(merged.location ?? ""),
              deadline: merged.deadline ?? null,
            }),
          };
        },
      ],
    },
    admin: {
      group,
      useAsTitle: "title",
      defaultColumns: ["title", "category", "status", "deadline", "source"],
    },
    access: staffAccess,
    fields: [
      { name: "title", type: "text", required: true },
      {
        name: "canonicalUrl",
        type: "text",
        required: true,
        unique: true,
        hooks: {
          beforeValidate: [
            ({ value }) => (value ? canonicalize(String(value)) : value),
          ],
        },
      },
      { name: "summary", type: "textarea", required: true },
      { name: "category", type: "text", required: true, index: true },
      {
        name: "categoryKeys",
        type: "text",
        index: true,
        admin: {
          readOnly: true,
          description:
            "Search index for the primary and additional categories.",
        },
      },
      {
        name: "categories",
        type: "json",
        defaultValue: [],
        admin: {
          description:
            "Additional automatically detected categories; the primary category remains above.",
        },
      },
      {
        name: "duplicateKey",
        type: "text",
        index: true,
        admin: { readOnly: true },
      },
      {
        name: "kind",
        type: "select",
        options: ["opportunity", "news"],
        defaultValue: "opportunity",
        required: true,
      },
      {
        name: "status",
        type: "select",
        options: ["draft", "published", "expired"],
        defaultValue: "draft",
        required: true,
        index: true,
      },
      {
        name: "source",
        type: "relationship",
        relationTo: "opportunity-sources",
        required: true,
      },
      { name: "provider", type: "text", required: true },
      { name: "location", type: "text", defaultValue: "" },
      { name: "preferences", type: "json", defaultValue: [] },
      { name: "details", type: "json", defaultValue: {} },
      { name: "deadline", type: "date", index: true },
      { name: "publishedAt", type: "date", required: true, index: true },
      { name: "popularity", type: "number", defaultValue: 0 },
      { name: "featured", type: "checkbox", defaultValue: false },
    ],
  },
  {
    slug: "opportunity-profiles",
    admin: { group, useAsTitle: "user" },
    access: privateAccess,
    fields: [
      { ...userField, unique: true },
      { name: "preferences", type: "json", required: true },
      {
        name: "lastNotifiedAt",
        type: "date",
        index: true,
        admin: { readOnly: true },
      },
    ],
  },
  {
    slug: "opportunity-events",
    admin: { group, useAsTitle: "action" },
    access: privateAccess,
    fields: [
      userField,
      opportunityField,
      { name: "category", type: "text", required: true },
      {
        name: "action",
        type: "select",
        options: ["open", "read", "save", "share", "more", "less", "dismiss"],
        required: true,
      },
      { name: "eventKey", type: "text", required: true, unique: true },
    ],
  },
  {
    slug: "saved-opportunities",
    admin: { group, useAsTitle: "user" },
    access: privateAccess,
    fields: [
      userField,
      opportunityField,
      { name: "saveKey", type: "text", required: true, unique: true },
      {
        name: "status",
        type: "select",
        options: [
          "Interested",
          "Planning to Apply",
          "In Progress",
          "Submitted",
          "Closed",
        ],
        required: true,
        defaultValue: "Interested",
      },
      { name: "reminderAt", type: "date", index: true },
      { name: "reminderSentAt", type: "date" },
    ],
  },
  {
    slug: "opportunity-reports",
    admin: { group, useAsTitle: "reason" },
    access: privateAccess,
    fields: [
      userField,
      opportunityField,
      {
        name: "reason",
        type: "select",
        options: [
          "Expired opportunity",
          "Incorrect information",
          "Suspicious or misleading content",
          "Broken link",
          "Duplicate content",
          "Other",
        ],
        required: true,
      },
      { name: "details", type: "textarea" },
      {
        name: "status",
        type: "select",
        options: ["pending", "reviewed", "resolved"],
        defaultValue: "pending",
        required: true,
      },
    ],
  },
];
