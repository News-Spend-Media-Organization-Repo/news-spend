import { Text } from "react-native";

import type { RenderMark } from "./types";

export const defaultRenderMark: RenderMark = (mark) => {
  // Inline code — explicit color is intentional for distinct UI
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
      <Text className="text-xs" selectable style={buildTextStyle(mark)}>
        {mark.text}
      </Text>
    );
  }

  // Superscript
  if (mark.superscript) {
    return (
      <Text className="text-xs" selectable style={buildTextStyle(mark)}>
        {mark.text}
      </Text>
    );
  }

  const style = buildTextStyle(mark);
  const hasStyle = Object.keys(style).length > 0;

  if (!hasStyle) {
    return <Text selectable>{mark.text}</Text>;
  }

  return (
    <Text selectable style={style}>
      {mark.text}
    </Text>
  );
};

function buildTextStyle(mark: Parameters<RenderMark>[0]): Record<string, any> {
  const style: Record<string, any> = {};

  if (mark.bold && mark.italic) {
    style.fontFamily = "Inter-BoldItalic";
  } else if (mark.bold) {
    style.fontFamily = "Inter-Bold";
  } else if (mark.italic) {
    style.fontFamily = "Inter-MediumItalic";
  }

  if (mark.underline && mark.strikethrough) {
    style.textDecorationLine = "underline line-through";
  } else if (mark.underline) {
    style.textDecorationLine = "underline";
  } else if (mark.strikethrough) {
    style.textDecorationLine = "line-through";
  }

  return style;
}
