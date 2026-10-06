import { injectMacros, type MacroContext } from "./macros";

export type EmailTemplateDoc = {
  subject?: string | null;
  previewText?: string | null;
  html?: string | null;
};

/**
 * Render a CMS email template to HTML + plain text.
 * The studio stores ready-to-send HTML; rendering only injects
 * `{{variables}}` from the macro context.
 */
export async function renderEmailTemplate(
  doc: EmailTemplateDoc,
  context: MacroContext = {}
): Promise<{ html: string; text: string }> {
  const html = injectMacros(doc.html ?? "", { ...context, escapeHtml: true });
  return { html, text: toPlainText(html) };
}

export function toPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|h1|h2|h3|li|tr|section)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
