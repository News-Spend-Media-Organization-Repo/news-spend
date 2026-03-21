import { tokens as allTokens } from "@tamagui/themes";
import { createTokens } from "tamagui";

export const color = {
  p50: "#F8F9FA",
  p75: "#96aebf",
  p100: "#6b8ca5",
  p200: "#2b5b7e",
  p300: "#003964",
  p400: "#002846",
  p500: "#00223d",
  s50: "#fff",
  s75: "#F7E0C0",
  s100: "#F4D3A6",
  s200: "#EFC07F",
  s300: "#ECB365",
  s400: "#A57D47",
  s500: "#906D3E",
  "gray.50": "#737373",
};

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
  "10.5": 44,
  11: 46,
  12: 60,
  13: 72,
  14: 96,
  15: 128,
};

export const tokens = createTokens({
  ...allTokens,
  // size: {
  //   ...size,
  // },
  color,
});
