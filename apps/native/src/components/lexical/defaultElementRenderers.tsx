import { Galeria } from "@nandorojo/galeria";
import React from "react";
import { Dimensions, Text as RNText } from "react-native";
import { H1, H2, H3, H4, H5, H6, Stack, type TextProps, type ViewProps } from "tamagui";

import { Image, Text } from "#/components/ui";
import { getImageData } from "#/utils/getImageData";

import { RichTextCaption } from "./RichTextCaption";
import type {
  AbstractElementNode,
  ElementRenderers,
  PayloadLexicalReactRendererContent,
} from "./types";

function getElementStyle<Type extends string>({ indent, format }: AbstractElementNode<Type>): any {
  const props: TextProps = {};

  if (indent > 0) {
    props.marginLeft = indent * 20;
  }

  if (format === "right" || format === "center" || format === "justify") {
    props.textAlign = format;
  }

  return props;
}

export const defaultElementRenderers: ElementRenderers = {
  heading: (element) => {
    // console.log(element);
    switch (element.tag) {
      case "h1": {
        const val = React.createElement(
          H1,
          {
            // ...getElementStyle<"heading">(element),
          },
          element.children,
        );
        return val;
      }
      case "h2": {
        const value = React.createElement(
          H2,
          {
            ...getElementStyle<"heading">(element),
          },
          element.children,
        );

        // console.log(value);
        return value;
      }
      case "h3":
        return React.createElement(
          H3,
          {
            ...getElementStyle<"heading">(element),
          },
          element.children,
        );
      case "h4":
        return React.createElement(
          H4,
          {
            ...getElementStyle<"heading">(element),
          },
          element.children,
        );
      case "h5":
        return React.createElement(
          H5,
          {
            ...getElementStyle<"heading">(element),
          },
          element.children,
        );
      case "h6":
        return React.createElement(
          H6,
          {
            ...getElementStyle<"heading">(element),
          },
          element.children,
        );
      default:
        return React.createElement(
          Text,
          {
            ...(getElementStyle<"heading">(element) as TextProps),
          },
          element.children,
        );
    }
  },
  list: (element) =>
    React.createElement(
      Stack,
      {
        ...(getElementStyle<"list">(element) as ViewProps),
      },
      element.children,
    ),
  listItem: (element) => {
    return (
      // <Paragraph {...getElementStyle<"listitem">(element)}>
      //   {element.children}
      // </Paragraph>
      element?.checked != null ? (
        <Stack
          {...(getElementStyle<"listitem">(element) as ViewProps)}
          style={{ flexDirection: "row", alignItems: "center" }}
        >
          <Text>{element?.checked ? "☑" : "☐"} </Text>
          <Text>{element.children}</Text>
        </Stack>
      ) : (
        <Stack
          {...(getElementStyle<"listitem">(element) as ViewProps)}
          style={{ flexDirection: "row" }}
        >
          <Text>• </Text>
          <Text>{element.children}</Text>
        </Stack>
      )
    );
  },
  paragraph: (element) => (
    <Text {...getElementStyle<"paragraph">(element)} py="$1">
      {element.children}
    </Text>
  ),
  link: (element) => {
    // console.log(
    //   <RNText style={{ color: "blue", textDecorationLine: "underline" }}>{element.children}</RNText>
    // );
    //FIXME: children not inheriting styles. this link should be blue
    return (
      <RNText
        // href={element.fields.url}
        // textDecorationLine="underline"
        // color="blue"
        style={{ color: "blue", textDecorationLine: "underline" }}
        {...getElementStyle<"link">(element)}
      >
        {element.children}
      </RNText>
    );
  },
  autolink: (element) => (
    <Text
      {...getElementStyle<"autolink">(element)}
      // href={element.fields.url}
      color="blue"
      // textDecorationLine="underline"
    >
      {element.children}
    </Text>
  ),
  quote: (element) => (
    <Stack
      {...(getElementStyle<"quote">(element) as ViewProps)}
      borderLeftWidth={2}
      my="$2"
      paddingLeft={10}
    >
      <Text>{element.children}</Text>
    </Stack>
  ),
  linebreak: () => <Text>{"\n"}</Text>,
  tab: () => <Text>{"\t"}</Text>,
  horizontalrule: () => <Stack borderBottomWidth={1} />,
  upload: (element) => {
    const { width, height } = Dimensions.get("window");
    if (typeof element.value !== "number" && element.value.mimeType?.includes("image")) {
      const { url, blurhash } = getImageData(element.value);
      // console.log(url);
      const urls = [url ?? ""];
      return (
        <Stack my="$2">
          <Galeria urls={urls}>
            <Galeria.Image>
              <Image
                height={height * 0.3}
                objectFit="contain"
                placeholder={{ blurhash }}
                placeholderContentFit="cover"
                source={{ uri: urls[0] }}
              />
            </Galeria.Image>
          </Galeria>
          <RichTextCaption content={element.value.caption as PayloadLexicalReactRendererContent} />
        </Stack>
      );
    }

    return null;
  },
};
