import { Text } from "react-native";

import type { RenderMark } from "./types";

export const defaultRenderMark: RenderMark = (mark) => {
  // Inline code — needs a View wrapper for background
  if (mark.code) {
    return (
      <Text
        className="rounded bg-foreground/10 px-1 font-mono text-foreground text-sm"
        selectable
        style={{ fontFamily: "monospace" }}
      >
        {mark.text}
      </Text>
    );
  }

  // Highlight
  if (mark.highlight) {
    return (
      <Text
        className="bg-yellow-300 text-foreground dark:bg-yellow-500/50"
        selectable
        style={buildTextStyle(mark)}
      >
        {mark.text}
      </Text>
    );
  }

  // Subscript
  if (mark.subscript) {
    return (
      <Text
        className="text-foreground text-xs"
        selectable
        style={[buildTextStyle(mark), { lineHeight: 14 }]}
      >
        {mark.text}
      </Text>
    );
  }

  // Superscript
  if (mark.superscript) {
    return (
      <Text
        className="text-foreground text-xs"
        selectable
        style={[buildTextStyle(mark), { lineHeight: 14 }]}
      >
        {mark.text}
      </Text>
    );
  }

  const style = buildTextStyle(mark);
  const hasStyle = Object.keys(style).length > 0;

  if (!hasStyle) {
    return (
      <Text className="text-foreground" selectable>
        {mark.text}
      </Text>
    );
  }

  return (
    <Text className="text-foreground" selectable style={style}>
      {mark.text}
    </Text>
  );
};

function buildTextStyle(mark: Parameters<RenderMark>[0]): Record<string, any> {
  const style: Record<string, any> = {};

  if (mark.bold) {
    style.fontWeight = "700";
    style.fontFamily = "Inter-Bold";
  }

  if (mark.italic) {
    style.fontStyle = "italic";
    style.fontFamily = mark.bold ? "Inter-BoldItalic" : "Inter-MediumItalic";
  }

  if (mark.underline && mark.strikethrough) {
    // React Native only supports one textDecorationLine value at a time
    // underline takes precedence; strikethrough handled visually if needed
    style.textDecorationLine = "underline";
  } else if (mark.underline) {
    style.textDecorationLine = "underline";
  } else if (mark.strikethrough) {
    style.textDecorationLine = "line-through";
  }

  return style;
}
