import React, { Suspense } from "react";

import type { PayloadLexicalReactRendererContent } from "./types";

const LexicalRenderer = React.lazy(() =>
  import("./PayloadLexicalReactRenderer").then((m) => ({ default: m.PayloadLexicalReactRenderer })),
);

export function RichTextCaption({ content }: { content: PayloadLexicalReactRendererContent }) {
  return (
    <Suspense fallback={null}>
      <LexicalRenderer content={content} />
    </Suspense>
  );
}
