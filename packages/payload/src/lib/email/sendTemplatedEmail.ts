import logger from "@news-spend-media/logger";
import { DEFAULT_FROM_EMAIL, resend } from "@news-spend-media/mail";
import type { Payload } from "payload";

import { injectMacros } from "./macros";
import { renderEmailTemplate } from "./renderEmailTemplate";

export type { TemplateUser } from "./templateVariables";
export { resolveUserVariables } from "./templateVariables";

export class TemplateNotFoundError extends Error {
  slug: string;

  constructor(slug: string) {
    super(`Email template not found: ${slug}`);
    this.name = "TemplateNotFoundError";
    this.slug = slug;
  }
}

/**
 * Render a CMS email template by slug and send it through Resend.
 * Throws TemplateNotFoundError when no published template has the slug,
 * so callers can fall back to a code template.
 */
export async function sendTemplatedEmail(
  payload: Payload,
  args: {
    slug: string;
    to: string;
    variables: Record<string, unknown>;
  }
): Promise<{ id: string | null }> {
  const found = await payload.find({
    collection: "email-templates",
    depth: 0,
    limit: 1,
    pagination: false,
    where: {
      and: [
        { slug: { equals: args.slug } },
        { _status: { equals: "published" } },
      ],
    },
  });
  const doc = found.docs[0] as
    | {
        subject?: string | null;
        previewText?: string | null;
        html?: string | null;
      }
    | undefined;

  if (!doc?.html) {
    throw new TemplateNotFoundError(args.slug);
  }

  const { html, text } = await renderEmailTemplate(
    {
      html: doc.html,
      previewText: doc.previewText,
      subject: doc.subject,
    },
    { variables: args.variables }
  );
  const subject = injectMacros(doc.subject ?? "News Spend Media", {
    variables: args.variables,
  });

  const { data, error } = await resend.emails.send({
    from: DEFAULT_FROM_EMAIL,
    html,
    subject,
    text,
    to: args.to,
  });

  if (error) {
    logger.error(
      { error, slug: args.slug, to: args.to },
      "Templated email failed to send"
    );
    throw new Error(error.message ?? "Templated email failed to send");
  }

  logger.info(
    { id: data?.id, slug: args.slug, to: args.to },
    "Templated email sent"
  );
  return { id: data?.id ?? null };
}
