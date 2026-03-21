import { Text, type TextProps } from "tamagui";

import type { RenderMark } from "./types";

export const defaultRenderMark: RenderMark = (mark) => {
  const props: TextProps = {};

  if (mark.bold) {
    props.fontWeight = "700";
  }

  if (mark.italic) {
    props.fontStyle = "italic";
    // @ts-expect-error
    props.fontFamily = "Inter-Medium";
  }

  if (mark.underline) {
    props.textDecorationLine = "underline";
  }

  if (mark.strikethrough) {
    props.textDecorationLine = "line-through";
  }

  if (mark.code) {
    return (
      <Text {...props} bg="$gray10" ff="monospace" p={4}>
        {mark.text}
      </Text>
    );
  }

  if (mark.highlight) {
    return (
      <Text {...props} bg="#ffeb3b">
        {mark.text}
      </Text>
    );
  }

  if (mark.subscript) {
    return (
      <Text {...props} fos="$3" lh="$4">
        {mark.text}
      </Text>
    );
  }

  if (mark.superscript) {
    return (
      <Text {...props} fos="$3" lh="$4">
        {mark.text}
      </Text>
    );
  }

  if (Object.keys(props).length === 0) {
    return <Text>{mark.text}</Text>;
  }

  return <Text {...props}>{mark.text}</Text>;
};
