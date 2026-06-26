import { Galeria } from "@nandorojo/galeria";
import { Separator } from "heroui-native";
import { Linking, View } from "react-native";
import { Image } from "#/components/ui";
import { getImageData } from "#/utils/getImageData";
import { Text } from "../heroui/text";
import { RichTextCaption } from "./RichTextCaption";
import type {
  AbstractElementNode,
  ElementRenderers,
  PayloadLexicalReactRendererContent,
} from "./types";

function getTextAlign(
  format: AbstractElementNode<string>["format"],
): "left" | "right" | "center" | "justify" | undefined {
  if (format === "right") {
    return "right";
  }
  if (format === "center") {
    return "center";
  }
  if (format === "justify") {
    return "justify";
  }
  return;
}

function getIndentStyle(indent: number): { marginLeft?: number } {
  return indent > 0 ? { marginLeft: indent * 20 } : {};
}

export const defaultElementRenderers: ElementRenderers = {
  heading: (element) => {
    const textAlign = getTextAlign(element.format);
    const indentStyle = getIndentStyle(element.indent);

    const classMap: Record<string, string> = {
      h1: "text-3xl font-bold text-foreground mt-4 mb-2",
      h2: "text-2xl font-bold text-foreground mt-3 mb-2",
      h3: "text-xl font-semibold text-foreground mt-3 mb-1",
      h4: "text-lg font-semibold text-foreground mt-2 mb-1",
      h5: "text-base font-semibold text-foreground mt-2 mb-1",
      h6: "text-sm font-semibold text-foreground mt-2 mb-1",
    };

    const className = classMap[element.tag] ?? "text-2xl font-bold text-foreground mt-3 mb-2";

    return (
      <Text
        className={className}
        selectable
        style={[indentStyle, textAlign ? { textAlign } : undefined]}
      >
        {element.children}
      </Text>
    );
  },

  paragraph: (element) => {
    const textAlign = getTextAlign(element.format);
    const indentStyle = getIndentStyle(element.indent);

    return (
      <Text
        className="py-1 text-base text-foreground leading-relaxed"
        selectable
        style={[indentStyle, textAlign ? { textAlign } : undefined]}
      >
        {element.children}
      </Text>
    );
  },

  list: (element) => {
    const indentStyle = getIndentStyle(element.indent);
    return (
      <View className="my-1" style={indentStyle}>
        {element.children}
      </View>
    );
  },

  listItem: (element) => {
    const indentStyle = getIndentStyle(element.indent);

    // Checklist item
    if (element.checked != null) {
      return (
        <View className="my-0.5 flex-row items-center" style={indentStyle}>
          <Text className="mr-2 text-base text-foreground">{element.checked ? "☑" : "☐"}</Text>
          <View className="flex-1">{element.children}</View>
        </View>
      );
    }

    // Ordered list
    if (element.listType === "number") {
      return (
        <View className="my-0.5 flex-row" style={indentStyle}>
          <Text className="w-6 text-base text-foreground">{element.value}.</Text>
          <View className="flex-1">{element.children}</View>
        </View>
      );
    }

    // Bullet list
    return (
      <View className="my-0.5 flex-row" style={indentStyle}>
        <Text className="mr-2 text-base text-foreground">•</Text>
        <View className="flex-1">{element.children}</View>
      </View>
    );
  },

  quote: (element) => {
    const indentStyle = getIndentStyle(element.indent);
    return (
      <View
        className="my-3 rounded-r-md border-foreground/30 border-l-2 bg-foreground/5 py-2 pl-3"
        style={indentStyle}
      >
        <View>{element.children}</View>
      </View>
    );
  },

  link: (element) => {
    const url = element.fields?.url;

    const handlePress = () => {
      if (url) {
        Linking.openURL(url).catch(console.warn);
      }
    };

    return (
      <Text
        accessibilityLabel={url}
        accessibilityRole="link"
        className="text-blue-600 underline"
        onPress={handlePress}
        selectable
      >
        {element.children}
      </Text>
    );
  },

  autolink: (element) => {
    const handlePress = () => {
      if (element.fields.url) {
        Linking.openURL(element.fields.url).catch(console.warn);
      }
    };

    return (
      <Text
        accessibilityRole="link"
        className="text-primary underline"
        onPress={handlePress}
        selectable
      >
        {element.children}
      </Text>
    );
  },

  linebreak: () => <Text>{"\n"}</Text>,

  tab: () => <Text>{"    "}</Text>,

  horizontalrule: () => <Separator className="my-4" />,

  upload: (element) => {
    // Guard: value may be an unpopulated ID (number) if depth was too low
    if (typeof element.value === "number") {
      return null;
    }

    if (element.value.mimeType?.includes("image")) {
      const { url, blurhash } = getImageData(element.value);

      if (!url) {
        return null;
      }

      const urls = [url];
      const aspectRatio =
        element.value.width && element.value.height
          ? element.value.width / element.value.height
          : 16 / 9;

      return (
        <View className="my-3">
          <Galeria urls={urls}>
            <Galeria.Image>
              <Image
                contentFit="contain"
                placeholder={{ blurhash }}
                placeholderContentFit="cover"
                source={{ uri: urls[0] }}
                style={{ width: "100%", aspectRatio }}
              />
            </Galeria.Image>
          </Galeria>
          {element.value.caption && (
            <RichTextCaption
              content={element.value.caption as PayloadLexicalReactRendererContent}
            />
          )}
        </View>
      );
    }

    return null;
  },
};
