"use client";

import type { LexicalBlockClientProps } from "@payloadcms/richtext-lexical";
import { BlockCollapsible } from "@payloadcms/richtext-lexical/client";
import { useFormFields } from "@payloadcms/ui";
import { useEffect, useState } from "react";

const relationId = (value: unknown): string | undefined => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (value && typeof value === "object" && "id" in value) {
    return String(value.id);
  }
  return;
};

export const ReadAlsoBlockComponent: React.FC<LexicalBlockClientProps> = () => {
  const newsField = useFormFields(([fields]) => fields.news);
  const id = relationId(newsField?.value);
  const [loaded, setLoaded] = useState<{ id: string; title: string }>();

  useEffect(() => {
    if (!id) {
      return;
    }
    const controller = new AbortController();
    const load = async () => {
      try {
        const res = await fetch(`/api/news/${id}?depth=0&select[title]=true`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          return;
        }
        const doc: { title?: string } = await res.json();
        if (doc.title) {
          setLoaded({ id, title: doc.title });
        }
      } catch {
        // Aborted or offline: the placeholder below stays up
      }
    };
    load();
    return () => controller.abort();
  }, [id]);

  const title = loaded && loaded.id === id ? loaded.title : undefined;

  return (
    <BlockCollapsible removeButton>
      <div
        style={{
          borderLeft: "2px solid var(--theme-success-500)",
          background: "var(--theme-elevation-50)",
          borderRadius: "0 6px 6px 0",
          padding: "8px 12px",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--theme-elevation-500)",
            marginBottom: 2,
          }}
        >
          Read Also
        </div>
        <div
          style={{
            fontWeight: 600,
            fontSize: 16,
            color: title ? undefined : "var(--theme-elevation-500)",
          }}
        >
          {title ?? (id ? "Loading…" : "Pick an article to link")}
        </div>
      </div>
    </BlockCollapsible>
  );
};
