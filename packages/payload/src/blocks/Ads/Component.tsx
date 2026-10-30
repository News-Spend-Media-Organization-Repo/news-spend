"use client";

import type { LexicalBlockClientProps } from "@payloadcms/richtext-lexical";
import { BlockCollapsible } from "@payloadcms/richtext-lexical/client";
import { useFormFields } from "@payloadcms/ui";

const AD_PREVIEW_SIZES = {
  BANNER: { label: "Banner", width: 320, height: 50 },
  LARGE_BANNER: { label: "Large Banner", width: 320, height: 100 },
  FULL_BANNER: { label: "Full Banner", width: 468, height: 60 },
  MEDIUM_RECTANGLE: { label: "Medium Rectangle", width: 300, height: 250 },
} as const;

type AdType = keyof typeof AD_PREVIEW_SIZES;

const isAdType = (value: unknown): value is AdType =>
  typeof value === "string" && value in AD_PREVIEW_SIZES;

export const AdsBlockComponent: React.FC<LexicalBlockClientProps> = () => {
  const typeField = useFormFields(([fields]) => fields.type);
  const type = isAdType(typeField?.value) ? typeField.value : "LARGE_BANNER";
  const { label, width, height } = AD_PREVIEW_SIZES[type];

  return (
    <BlockCollapsible removeButton>
      <div style={{ display: "flex", justifyContent: "center", padding: 8 }}>
        <div
          aria-label={`Ad preview, ${label}`}
          role="img"
          style={{
            width,
            maxWidth: "100%",
            height,
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 10px",
            position: "relative",
            overflow: "hidden",
            borderRadius: 4,
            border: "1px solid var(--theme-elevation-150)",
            background: "var(--theme-elevation-50)",
          }}
        >
          <div
            style={{
              flex: "none",
              width: Math.min(height - 16, 64),
              height: Math.min(height - 16, 64),
              borderRadius: 6,
              background: "var(--theme-elevation-150)",
            }}
          />
          <div style={{ minWidth: 0, lineHeight: 1.3 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Test Ad</div>
            <div
              style={{
                fontSize: 11,
                color: "var(--theme-elevation-500)",
              }}
            >
              Your ad appears here
            </div>
          </div>
          <span
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              padding: "1px 5px",
              fontSize: 9,
              fontWeight: 700,
              background: "#fbbc04",
              color: "#202124",
              borderBottomLeftRadius: 4,
            }}
          >
            Ad
          </span>
        </div>
      </div>
      <div
        style={{
          textAlign: "center",
          fontSize: 11,
          color: "var(--theme-elevation-500)",
        }}
      >
        {label} · {width}×{height}
      </div>
    </BlockCollapsible>
  );
};
