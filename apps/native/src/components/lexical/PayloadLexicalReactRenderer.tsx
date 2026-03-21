import * as Sentry from "@sentry/react-native";
import React from "react";

import { defaultBlockRenders } from "./defaultBlockRenderers";
import { defaultElementRenderers } from "./defaultElementRenderers";
import { defaultRenderMark } from "./defaultRenderMark";
import type { Node, PayloadLexicalReactRendererProps, TextNode } from "./types";

// This copy-and-pasted from somewhere in lexical here: https://github.com/facebook/lexical/blob/c2ceee223f46543d12c574e62155e619f9a18a5d/packages/lexical/src/LexicalConstants.ts
const IS_BOLD = 1;
const IS_ITALIC = 1 << 1;
const IS_STRIKETHROUGH = 1 << 2;
const IS_UNDERLINE = 1 << 3;
const IS_CODE = 1 << 4;
const IS_SUBSCRIPT = 1 << 5;
const IS_SUPERSCRIPT = 1 << 6;
const IS_HIGHLIGHT = 1 << 7;

export function PayloadLexicalReactRenderer<
  Blocks extends { [key: string]: any },
>({
  content,
  elementRenderers = defaultElementRenderers,
  renderMark = defaultRenderMark,
  blockRenderers = defaultBlockRenders,
}: PayloadLexicalReactRendererProps<Blocks>) {
  const renderElement = React.useCallback(
    (node: Node, children?: React.ReactNode) => {
      if (!elementRenderers) {
        throw new Error("'elementRenderers' prop not provided.");
      }

      if (node.type === "link" && node.fields) {
        return elementRenderers.link({
          ...node,
          children,
        });
      }

      if (node.type === "autolink" && node.fields) {
        return elementRenderers.autolink({
          ...node,
          children,
        });
      }

      if (node.type === "heading") {
        return elementRenderers.heading({
          ...node,
          children,
        });
      }

      if (node.type === "paragraph") {
        return elementRenderers.paragraph({
          ...node,
          children,
        });
      }

      if (node.type === "list") {
        return elementRenderers.list({
          ...node,
          children,
        });
      }

      if (node.type === "listitem") {
        return elementRenderers.listItem({
          ...node,
          children,
        });
      }

      if (node.type === "quote") {
        return elementRenderers.quote({
          ...node,
          children,
        });
      }

      if (node.type === "linebreak") {
        return elementRenderers.linebreak();
      }

      if (node.type === "tab") {
        return elementRenderers.tab();
      }

      if (node.type === "upload") {
        return elementRenderers.upload(node);
      }

      if (node.type === "horizontalrule") {
        return elementRenderers.horizontalrule();
      }

      throw new Error(`Missing element renderer for node type '${node.type}'`);
    },
    [elementRenderers]
  );

  const renderText = React.useCallback(
    (node: TextNode): React.ReactNode | null => {
      if (!renderMark) {
        throw new Error("'renderMark' prop not provided.");
      }

      if (!node.format) {
        return renderMark({
          text: node.text,
        });
      }

      return renderMark({
        text: node.text,
        bold: (node.format & IS_BOLD) > 0,
        italic: (node.format & IS_ITALIC) > 0,
        underline: (node.format & IS_UNDERLINE) > 0,
        strikethrough: (node.format & IS_STRIKETHROUGH) > 0,
        code: (node.format & IS_CODE) > 0,
        subscript: (node.format & IS_SUBSCRIPT) > 0,
        superscript: (node.format & IS_SUPERSCRIPT) > 0,
        highlight: (node.format & IS_HIGHLIGHT) > 0,
      });
    },
    [renderMark]
  );

  const serialize = React.useCallback(
    (children: Node[]): React.ReactNode[] | null =>
      children?.map((node, index) => {
        if (node.type === "text") {
          return (
            <React.Fragment key={index}>{renderText(node)}</React.Fragment>
          );
        }

        if (node.type === "block") {
          const renderer = blockRenderers[node.fields.blockType] as (
            props: unknown
          ) => React.ReactNode;

          if (typeof renderer !== "function") {
            console.log(
              `Missing block renderer for block type '${node.fields.blockType}'`
            );
            Sentry.captureException(
              new Error(
                `Missing block renderer for block type '${node.fields.blockType}'`
              )
            );
            return null;
          }

          return <React.Fragment key={index}>{renderer(node)}</React.Fragment>;
        }

        if (
          node.type === "linebreak" ||
          node.type === "tab" ||
          node.type === "upload" ||
          node.type === "horizontalrule"
        ) {
          return (
            <React.Fragment key={index}>{renderElement(node)}</React.Fragment>
          );
        }

        return (
          <React.Fragment key={index}>
            {renderElement(node, serialize(node.children))}
          </React.Fragment>
        );
      }),
    [renderElement, renderText, blockRenderers, content]
  );

  return <>{serialize(content?.root?.children)}</>;
}
