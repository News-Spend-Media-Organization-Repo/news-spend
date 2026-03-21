import { cloneElement } from "react";
import { Linking, Text, View } from "react-native";
import { SizableText, Stack } from "tamagui";

import {
  IS_BOLD,
  IS_CODE,
  IS_ITALIC,
  IS_STRIKETHROUGH,
  IS_SUBSCRIPT,
  IS_SUPERSCRIPT,
  IS_UNDERLINE,
} from "./rich-text-node-format";
import type { SerializedLexicalNode } from "./types";

interface Props {
  nodes: SerializedLexicalNode[];
}

export function LexicalRenderer({ nodes }: Props): JSX.Element {
  return (
    <>
      {nodes?.map((node, index): JSX.Element | null => {
        if (node.type === "text") {
          let text = (
            <Text
              key={index}
              style={{ fontSize: 16, fontFamily: "Inter-Medium" }}
            >
              {node.text}
            </Text>
          );
          if (node.format & IS_BOLD) {
            text = cloneElement(text, {
              style: { fontFamily: "Inter-Bold", fontSize: 16 },
            });
          }
          if (node.format & IS_ITALIC) {
            text = cloneElement(text, {
              style: { fontFamily: "Inter-MediumItalic", fontSize: 16 },
            });
          }
          if (node.format & IS_STRIKETHROUGH) {
            text = cloneElement(text, {
              style: {
                textDecorationLine: "line-through",
                fontFamily: "Inter-Medium",
                fontSize: 16,
              },
            });
          }
          if (node.format & IS_UNDERLINE) {
            text = cloneElement(text, {
              style: {
                textDecorationLine: "underline",
                fontFamily: "Inter-Medium",
                fontSize: 16,
              },
            });
          }
          if (node.format & IS_CODE) {
            text = cloneElement(text, {
              style: {
                fontFamily: "monospace",
                fontSize: 16,
              },
            });
          }
          if (node.format & IS_SUBSCRIPT) {
            text = cloneElement(text, {
              style: { fontSize: 10, lineHeight: 0 },
            });
          }
          if (node.format & IS_SUPERSCRIPT) {
            text = cloneElement(text, {
              style: { fontSize: 10, lineHeight: 0 },
            });
          }

          return text;
        }

        if (node == null) {
          return null;
        }

        const serializedChildrenFn = (
          node: SerializedLexicalNode
        ): JSX.Element | null => {
          if (node.children == null) {
            return null;
          }
          if (node?.type === "list" && node?.listType === "check") {
            for (const item of node.children) {
              if (!item?.checked) {
                item.checked = false;
              }
            }
            return <LexicalRenderer nodes={node.children} />;
          }
          return <LexicalRenderer nodes={node.children} />;
        };

        const serializedChildren = serializedChildrenFn(node);

        switch (node.type) {
          case "linebreak": {
            return <Text key={index}>{"\n"}</Text>;
          }
          case "paragraph": {
            return <Text key={index}>{serializedChildren}</Text>;
          }
          case "heading": {
            const fontSize =
              { h1: 32, h2: 24, h3: 18, h4: 16, h5: 13 }[node.tag] || 32;

            return (
              <SizableText
                key={index}
                style={{ fontWeight: "700", marginVertical: 8 }}
              >
                {serializedChildren}
              </SizableText>
            );
          }
          case "list": {
            return (
              <View key={index} style={{ marginLeft: 20 }}>
                {serializedChildren}
              </View>
            );
          }
          case "listitem": {
            if (node?.checked != null) {
              return (
                <View
                  key={index}
                  style={{ flexDirection: "row", alignItems: "center" }}
                >
                  <Text>{node.checked ? "☑" : "☐"} </Text>
                  <Text>{serializedChildren}</Text>
                </View>
              );
            }
            return (
              <View key={index} style={{ flexDirection: "row" }}>
                <Text>• </Text>
                <Text>{serializedChildren}</Text>
              </View>
            );
          }
          case "quote": {
            console.log(
              "🚀 ~ file: serializer.tsx:172 ~ {nodes?.map ~ serializedChildren:",
              serializedChildren
            );
            return (
              <Stack
                key={index}
                style={{
                  borderLeftWidth: 2,
                  borderLeftColor: "gray",
                  paddingLeft: 10,
                  marginVertical: 10,
                }}
              >
                <Text
                  style={{ fontFamily: "Inter-MediumItalic", fontSize: 32 }}
                >
                  {serializedChildren}
                </Text>
              </Stack>
            );
          }
          case "link": {
            const attributes: {
              doc?: any;
              linkType?: "custom" | "internal";
              newTab?: boolean;
              nofollow?: boolean;
              rel?: string;
              sponsored?: boolean;
              url?: string;
            } = node.fields;
            if (attributes.linkType === "custom") {
              return (
                <SizableText
                  key={index}
                  onPress={() => {
                    /* Handle link press */
                    Linking.openURL(attributes.url);
                  }}
                  style={{ color: "blue", textDecorationLine: "underline" }}
                >
                  {serializedChildren}
                </SizableText>
              );
            }
            return <Text key={index}>Internal link coming soon</Text>;
          }
          case "inline-image": {
            return (
              <Text key={index} style={{ fontStyle: "italic" }}>
                {" "}
                (An inline image will appear here! Honest!){" "}
              </Text>
            );
          }
          default:
            return null;
        }
      })}
    </>
  );
}
