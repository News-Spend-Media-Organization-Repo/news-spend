import type { CollectionConfig } from "payload";
import { slugField } from "payload";

import { isStaff, isSuperAdmin } from "../access/adminRoles";
import { adminOnly } from "../access/hasRole";
import { injectMacros } from "../lib/email/macros";
import { renderEmailTemplate } from "../lib/email/renderEmailTemplate";
import {
  findUnknownVariables,
  sampleVariables,
  TEMPLATE_VARIABLES,
} from "../lib/email/templateVariables";

/**
 * Rejects invented `{{variables}}` at save time. Authors pick from the
 * registry; anything else would render blank in a real send.
 */
const validateNoUnknownVariables = (value: unknown): true | string => {
  if (typeof value !== "string" || value.length === 0) {
    return true;
  }
  const unknown = findUnknownVariables([value]);
  if (unknown.length === 0) {
    return true;
  }
  const allowed = TEMPLATE_VARIABLES.map(
    (variable) => `{{${variable.key}}}`
  ).join(", ");
  return `Unknown variable${unknown.length > 1 ? "s" : ""}: ${unknown
    .map((name) => `{{${name}}}`)
    .join(", ")}. Allowed: ${allowed}.`;
};

/**
 * Visual email templates, edited in the @react-email/editor studio.
 * Tab 1 (Settings) holds identity + variables; tab 2 (Design) holds the
 * studio canvas and its live preview.
 */
export const EmailTemplates: CollectionConfig = {
  slug: "email-templates",
  admin: {
    useAsTitle: "name",
    group: "Email",
  },
  versions: {
    drafts: true,
  },
  access: {
    read: isStaff,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Settings",
          fields: [
            {
              name: "name",
              type: "text",
              required: true,
              admin: {
                description: "Display name, e.g. Welcome.",
              },
            },
            slugField({
              useAsSlug: "name",
            }),
            {
              name: "subject",
              type: "text",
              required: true,
              validate: validateNoUnknownVariables,
              admin: {
                description:
                  "Supports {{variables}}, e.g. Welcome, {{username}}!",
              },
            },
            {
              name: "previewText",
              type: "text",
              validate: validateNoUnknownVariables,
              admin: {
                description: "Inbox preview line. Falls back to subject.",
              },
            },
          ],
        },
        {
          label: "Design",
          fields: [
            {
              name: "html",
              type: "code",
              required: true,
              validate: validateNoUnknownVariables,
              admin: {
                description:
                  "Edited in the studio below. Save HTML in the studio toolbar to store.",
                components: {
                  Field:
                    "@news-spend-media/payload/components/EmailEditor#EmailVisualEditor",
                },
              },
            },
            {
              name: "visualPreview",
              type: "ui",
              admin: {
                components: {
                  Field:
                    "@news-spend-media/payload/components/EmailEditor#EmailHtmlPreview",
                },
              },
            },
          ],
        },
        {
          label: "Guide",
          fields: [
            {
              name: "guide",
              type: "ui",
              admin: {
                components: {
                  Field:
                    "@news-spend-media/payload/components/EmailEditor#EmailGuide",
                },
              },
            },
          ],
        },
      ],
    },
  ],
  endpoints: [
    {
      path: "/:id/preview",
      method: "get",
      handler: async (req) => {
        if (!isSuperAdmin({ req })) {
          return new Response("Forbidden", { status: 403 });
        }
        const id = req.routeParams?.id;
        if (!id || typeof id !== "string") {
          return new Response("Missing id", { status: 400 });
        }
        const doc = await req.payload.findByID({
          collection: "email-templates",
          id,
        });
        if (!doc) {
          return new Response("Not found", { status: 404 });
        }
        const sampleVars = sampleVariables();
        const { html } = await renderEmailTemplate(
          {
            subject: typeof doc.subject === "string" ? doc.subject : undefined,
            previewText:
              typeof doc.previewText === "string" ? doc.previewText : undefined,
            html: typeof doc.html === "string" ? doc.html : undefined,
          },
          { variables: sampleVars }
        );
        return new Response(html, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
    },
    {
      path: "/:id/test-send",
      method: "post",
      handler: async (req) => {
        if (!isSuperAdmin({ req })) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        const id = req.routeParams?.id;
        if (!id || typeof id !== "string") {
          return Response.json({ error: "Missing id" }, { status: 400 });
        }
        let input: { to?: unknown; variables?: Record<string, unknown> } = {};
        try {
          const body = (req.json ? await req.json() : {}) as Partial<
            typeof input
          >;
          if (body && typeof body === "object") {
            input = body;
          }
        } catch {
          input = {};
        }
        const to = typeof input.to === "string" ? input.to.trim() : "";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
          return Response.json(
            { error: "A valid recipient email is required." },
            { status: 400 }
          );
        }
        const doc = await req.payload.findByID({
          collection: "email-templates",
          id,
        });
        if (!doc) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        const sampleVars = sampleVariables();
        // Only registry keys may be overridden; anything else is ignored.
        const overrides = Object.fromEntries(
          Object.entries(input.variables ?? {}).filter(
            ([key, value]) => key in sampleVars && typeof value === "string"
          )
        );
        const variables = { ...sampleVars, ...overrides };
        const { html, text } = await renderEmailTemplate(
          {
            subject: typeof doc.subject === "string" ? doc.subject : undefined,
            previewText:
              typeof doc.previewText === "string" ? doc.previewText : undefined,
            html: typeof doc.html === "string" ? doc.html : undefined,
          },
          { variables }
        );
        const subject =
          typeof doc.subject === "string" && doc.subject.length > 0
            ? injectMacros(doc.subject, { variables })
            : "Test email";
        await req.payload.sendEmail({ html, subject, text, to });
        return Response.json({ ok: true, to });
      },
    },
  ],
};
