import React, { Suspense } from "react";

import type { PayloadLexicalReactRendererContent } from "./types";

const LexicalRenderer = React.lazy(() =>
  import("./payload-lexical-react-renderer").then((m) => ({
    default: m.PayloadLexicalReactRenderer,
  })),
);

export function RichTextCaption({ content }: { content: PayloadLexicalReactRendererContent }) {
  return (
    <Suspense fallback={null}>
      <LexicalRenderer content={content} />
    </Suspense>
  );
}
