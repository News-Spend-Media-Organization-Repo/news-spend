"use client";

import { useFormFields } from "@payloadcms/ui";
import { useMemo } from "react";

import { injectMacros } from "../../lib/email/macros";
import { sampleVariables } from "../../lib/email/templateVariables";

/**
 * Live iframe preview for the `html` (visual) field.
 * Reads the sibling `html` and `variables` values from the form and
 * substitutes `{{variables}}` so the preview shows real values.
 */
export function EmailHtmlPreview({ path }: { path: string }) {
  const basePath = path.includes(".")
    ? path.split(".").slice(0, -1).join(".")
    : "";
  const htmlPath = basePath ? `${basePath}.html` : "html";

  const html = useFormFields(
    ([fields]) => fields[htmlPath]?.value as string | undefined
  );

  const srcDoc = useMemo(
    () => injectMacros(html ?? "", { variables: sampleVariables() }),
    [html]
  );

  if (!srcDoc) {
    return <p style={{ fontSize: "12px" }}>No HTML to preview yet.</p>;
  }

  return (
    <div
      style={{
        border: "1px solid var(--theme-elevation-150)",
        borderRadius: 6,
        overflow: "hidden",
        marginTop: 8,
      }}
    >
      <p
        style={{
          margin: 0,
          padding: "6px 12px",
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          borderBottom: "1px solid var(--theme-elevation-150)",
        }}
      >
        HTML preview
      </p>
      <iframe
        sandbox=""
        srcDoc={srcDoc}
        style={{ width: "100%", height: 480, border: "none" }}
        title="Email HTML preview"
      />
    </div>
  );
}
