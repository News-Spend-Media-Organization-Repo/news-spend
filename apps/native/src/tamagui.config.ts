import { shorthands } from "@tamagui/shorthands";
import { createFont, createTamagui } from "tamagui";

import { animations } from "./constants/animations";
import { themes } from "./constants/themes";
import { tokens } from "./constants/tokens";

const size = {
  true: 16,
  0: 0,
  1: 8,
  2: 10,
  3: 12,
  4: 15,
  5: 16,
  6: 19,
  7: 23,
  8: 29,
  9: 30,
  10: 37,
  11: 46,
  12: 60,
  13: 72,
  14: 96,
  15: 128,
};

const headingFont = createFont({
  family: "System",
  size: {
    ...size,
  },
  transform: {
    6: "uppercase",
    7: "none",
    true: "lowercase",
  },
  weight: {
    4: "400",
    5: "500",
    6: "600",
    7: "700",
    true: "400",
  },
  color: {
    6: "black",
    7: "$color",
    true: "black",
  },
  face: {
    100: { normal: "Inter-Thin", italic: "Inter-ThinItalic" },
    200: { normal: "Inter-ExtraLight", italic: "Inter-ExtraLightItalic" },
    300: { normal: "Inter-Light", italic: "Inter-LightItalic" },
    400: { normal: "Inter-Regular", italic: "Inter-Italic" },
    500: { normal: "Inter-Medium", italic: "Inter-MediumItalic" },
    600: { normal: "Inter-SemiBold", italic: "Inter-SemiBoldItalic" },
    700: { normal: "Inter-Bold", italic: "Inter-BoldItalic" },
    800: { normal: "Inter-ExtraBold", italic: "Inter-ExtraBoldItalic" },
    900: { normal: "Inter-Black", italic: "Inter-BlackItalic" },
  },
});

const bodyFont = createFont({
  size: {
    ...size,
  },
  face: headingFont.face,
  weight: headingFont.weight,
});

const config = createTamagui({
  animations,
  defaultTheme: "light",
  defaultFont: "body",
  shorthands,
  fonts: {
    heading: headingFont,
    body: bodyFont,
  },
  themes,
  tokens,
  media: {
    sm: { maxWidth: 860 },
    gtSm: { minWidth: 860 + 1 },
    short: { maxHeight: 820 },
    hoverNone: { hover: "none" },
    pointerCoarse: { pointer: "coarse" },
  },
});

export type AppConfig = typeof config;

declare module "tamagui" {
  interface TamaguiCustomConfig extends AppConfig {}
}

export default config;
